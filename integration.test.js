import { assert } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import init, { verify_deck, load_verifier_from_bytes } from './rust/circuit/pkg/halo_circuit.js';
import { buildTree, getPath, verifyPath } from './merkle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_URL = 'http://127.0.0.1:8080';
const API_KEY = process.env.API_KEY ?? 'your_secret_key';


function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function rootFromBundle(bundle) {
  let n = 0n;
  for (let i = 31; i >= 0; i--) {
    n = (n << 8n) | BigInt(bundle[i]);
  }
  return n.toString();
}

async function requestShuffle() {
  const res = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Backend ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json();
}


let shuffle;
let bundle;
let merkleRoot;
let tree;

before(async function () {
  this.timeout(300_000);

  const [wasmBytes, paramsBytes, vkBytes] = await Promise.all([
    readFile(join(__dirname, 'rust/circuit/pkg/halo_circuit_bg.wasm')),
    readFile(join(__dirname, 'rust/circuit/pkg/params.bin')),
    readFile(join(__dirname, 'rust/circuit/pkg/vk.bin')),
  ]);
  await init({ module_or_path: wasmBytes });
  load_verifier_from_bytes(paramsBytes, vkBytes);

  shuffle = await requestShuffle();
  bundle = hexToBytes(shuffle.proofHex);
  merkleRoot = rootFromBundle(bundle);
  tree = await buildTree(shuffle.cards, shuffle.salts);
});

describe('Shuffle endpoint', function () {
  this.timeout(10_000);

  it('Returns 401 when x-api-key is missing', async () => {
    const res = await fetch(BACKEND_URL, { method: 'POST' });
    assert.equal(res.status, 401);
  });

  it('Returns 401 for a wrong API key', async () => {
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'x-api-key': 'wrong-key' },
    });
    assert.equal(res.status, 401);
  });

  it('cards is an array of 52 distinct integers 0–51', () => {
    const sorted = [...shuffle.cards].sort((a, b) => a - b);
    assert.deepEqual(sorted, Array.from({ length: 52 }, (_, i) => i));
  });

  it('salts is an array of 52 non-empty decimal strings', () => {
    assert.equal(shuffle.salts.length, 52);
    for (const s of shuffle.salts) {
      assert.isString(s);
      assert.match(s, /^\d+$/, `salt "${s}" is not a decimal string`);
    }
  });

  it('merklePaths has 52 paths, each with 6 steps of {sibling, direction}', () => {
    assert.equal(shuffle.merklePaths.length, 52);
    for (let i = 0; i < 52; i++) {
      const path = shuffle.merklePaths[i];
      assert.equal(path.length, 6, `path ${i} should have 6 steps`);
      for (const step of path) {
        assert.match(step.sibling, /^\d+$/, 'sibling must be a decimal string');
        assert.oneOf(step.direction, [0, 1]);
      }
    }
  });

  it('proofHex is a non-empty lowercase hex string', () => {
    assert.isString(shuffle.proofHex);
    assert.isAbove(shuffle.proofHex.length, 64, 'bundle must be longer than 32 bytes');
    assert.match(shuffle.proofHex, /^[0-9a-f]+$/, 'proofHex must be hex');
    assert.equal(shuffle.proofHex.length % 2, 0, 'proofHex must have even length');
  });
});


describe('Halo2 proof verification', function () {
  this.timeout(120_000);

  it('verify_deck accepts the proof bundle and returns true', () => {
    assert.isTrue(verify_deck(bundle), 'proof bundle should verify');
  });

  it('Proof bundle root (bytes 0–31, LE) is a valid decimal string', () => {
    assert.isString(merkleRoot);
    assert.match(merkleRoot, /^\d+$/, 'root extracted from bundle must be a decimal string');
    assert.isAbove(merkleRoot.length, 0);
  });

  it('Flipping a byte in the root section fails verification', () => {
    const tampered = new Uint8Array(bundle);
    tampered[0] ^= 0xff;
    assert.isFalse(verify_deck(tampered));
  });

  it('Flipping the last proof byte fails verification', () => {
    const tampered = new Uint8Array(bundle);
    tampered[tampered.length - 1] ^= 0xff;
    assert.isFalse(verify_deck(tampered));
  });

  it('Flipping a middle proof byte fails verification', () => {
    const tampered = new Uint8Array(bundle);
    tampered[Math.floor(tampered.length / 2)] ^= 0xff;
    assert.isFalse(verify_deck(tampered));
  });

  it('Empty bundle fails verification', () => {
    assert.isFalse(verify_deck(new Uint8Array(0)));
  });

  it('All-zeros bundle fails verification', () => {
    assert.isFalse(verify_deck(new Uint8Array(bundle.length)));
  });
});


describe('Merkle tree consistency', function () {
  this.timeout(120_000);

  it('buildTree produces the same root as the proof bundle root', () => {
    const jsRoot = tree.levels[tree.levels.length - 1][0];
    assert.equal(jsRoot, merkleRoot,
      'JS BN256 tree root must match root extracted from proof bundle');
  });

  it('Tree has 7 levels (64 leaves → root)', () => {
    assert.equal(tree.levels.length, 7);
    assert.equal(tree.levels[0].length, 64);
    assert.equal(tree.levels[6].length, 1);
  });

  it('Padding leaves 52–63 are all the same hash', () => {
    const padHash = tree.levels[0][52];
    for (let i = 53; i < 64; i++) {
      assert.equal(tree.levels[0][i], padHash);
    }
  });

  it('merklePaths siblings match the JS-computed tree', () => {
    for (let i = 0; i < 52; i++) {
      const jsPath = getPath(tree, i);
      const serverPath = shuffle.merklePaths[i];
      for (let step = 0; step < 6; step++) {
        assert.equal(jsPath[step].sibling, serverPath[step].sibling,
          `card ${i} step ${step}: sibling mismatch`);
        assert.equal(jsPath[step].direction, serverPath[step].direction,
          `card ${i} step ${step}: direction mismatch`);
      }
    }
  });

  it('All 52 server merklePaths verify against merkleRoot', async () => {
    const results = await Promise.all(
      shuffle.cards.map((card, i) =>
        verifyPath(card, shuffle.salts[i], shuffle.merklePaths[i], merkleRoot)
      )
    );
    results.forEach((ok, i) =>
      assert.isTrue(ok, `position ${i} (card ${shuffle.cards[i]}) failed verifyPath`)
    );
  });

  it('Tampered card fails verifyPath', async () => {
    const path = shuffle.merklePaths[0];
    const ok = await verifyPath(
      (shuffle.cards[0] + 1) % 52,
      shuffle.salts[0],
      path,
      merkleRoot
    );
    assert.isFalse(ok);
  });

  it('Tampered salt fails verifyPath', async () => {
    const path = shuffle.merklePaths[0];
    const tamperedSalt = (BigInt(shuffle.salts[0]) + 1n).toString();
    const ok = await verifyPath(shuffle.cards[0], tamperedSalt, path, merkleRoot);
    assert.isFalse(ok);
  });

  it('Wrong path (path for position 1 used for card at position 0) fails verifyPath', async () => {
    const ok = await verifyPath(
      shuffle.cards[0],
      shuffle.salts[0],
      shuffle.merklePaths[1],
      merkleRoot
    );
    assert.isFalse(ok);
  });
});


describe('Game lifecycle: shuffle → deal → verify', function () {
  this.timeout(120_000);

  it('Server deals 5 cards to each of 2 players; all paths verify', async () => {
    const player1 = [0, 1, 2, 3, 4];
    const player2 = [5, 6, 7, 8, 9];

    function serverDeal(position) {
      return {
        card: shuffle.cards[position],
        salt: shuffle.salts[position],
        path: shuffle.merklePaths[position],
      };
    }

    const allDealt = [...player1, ...player2].map(serverDeal);

    // Each client independently verifies their dealt cards against the committed root.
    const verifications = await Promise.all(
      allDealt.map(({ card, salt, path }) =>
        verifyPath(card, salt, path, merkleRoot)
      )
    );
    verifications.forEach((ok, i) =>
      assert.isTrue(ok, `dealt card at slot ${i} failed path verification`)
    );

    // 10 distinct cards were dealt
    const dealtValues = allDealt.map((d) => d.card);
    assert.equal(new Set(dealtValues).size, 10, '10 dealt cards must all be distinct');
  });

  it("Player 1's card does not verify against player 2's Merkle path", async () => {
    const p1 = { card: shuffle.cards[0], salt: shuffle.salts[0] };
    const p2Path = shuffle.merklePaths[5]; // path belonging to position 5 (player 2)
    const cheating = await verifyPath(p1.card, p1.salt, p2Path, merkleRoot);
    assert.isFalse(cheating, "cross-player path swap must be rejected");
  });

  it('Tampered root string fails all verifyPath calls', async () => {
    const tamperedRoot = (BigInt(merkleRoot) + 1n).toString();
    const ok = await verifyPath(
      shuffle.cards[0], shuffle.salts[0], shuffle.merklePaths[0], tamperedRoot
    );
    assert.isFalse(ok);
  });
});


describe('Shuffle randomness', function () {
  this.timeout(300_000);

  it('Two independent shuffles produce different Merkle roots', async () => {
    const second = await requestShuffle();
    const secondRoot = rootFromBundle(hexToBytes(second.proofHex));
    assert.notEqual(secondRoot, merkleRoot, 'consecutive shuffles should have different roots');
  });

  it('Two independent shuffles produce cards in different orders', async () => {
    const second = await requestShuffle();
    assert.notDeepEqual(second.cards, shuffle.cards);
  });
});
