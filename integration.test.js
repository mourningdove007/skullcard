import { assert } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import init, { verify_deck, load_verifier_from_bytes } from './rust/circuit/pkg/halo_circuit.js';
import { buildTree, getPath, verifyPath } from './merkle.js';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_URL = 'http://127.0.0.1:8080';
const API_KEY = process.env.API_KEY ?? 'your_secret_key';
const ML_DSA_VK_DEFAULT = "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";
const ML_DSA_VK_B64 = process.env.ML_DSA_VERIFICATION_KEY ?? ML_DSA_VK_DEFAULT;
const ML_DSA_CONTEXT = new TextEncoder().encode('skullcard-shuffle-v1');

function timestampToLE(ts) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const big = BigInt(ts);
  view.setUint32(0, Number(big & 0xffffffffn), true);
  view.setUint32(4, Number((big >> 32n) & 0xffffffffn), true);
  return new Uint8Array(buf);
}


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


describe('ML-DSA-65 signature', function () {
  this.timeout(10_000);

  let verificationKey;

  before(function () {
    verificationKey = Buffer.from(ML_DSA_VK_B64, 'base64');
  });

  it('mlDsaSignature field is a non-empty base64 string', () => {
    assert.isString(shuffle.mlDsaSignature);
    assert.isAbove(shuffle.mlDsaSignature.length, 0);
    assert.match(shuffle.mlDsaSignature, /^[A-Za-z0-9+/]+=*$/, 'must be valid base64');
  });

  it('decoded signature is 3309 bytes (ML-DSA-65)', () => {
    assert.equal(Buffer.from(shuffle.mlDsaSignature, 'base64').length, 3309);
  });

  it('signature verifies against proof bundle and timestamp', () => {
    const sig = Buffer.from(shuffle.mlDsaSignature, 'base64');
    const payload = new Uint8Array([...bundle, ...timestampToLE(shuffle.timestamp)]);
    assert.isTrue(
      ml_dsa65.verify(sig, payload, verificationKey, { context: ML_DSA_CONTEXT }),
      'valid shuffle signature must verify',
    );
  });

  it('fails when proof bundle byte is tampered', () => {
    const sig = Buffer.from(shuffle.mlDsaSignature, 'base64');
    const tampered = new Uint8Array(bundle);
    tampered[0] ^= 0xff;
    const payload = new Uint8Array([...tampered, ...timestampToLE(shuffle.timestamp)]);
    assert.isFalse(ml_dsa65.verify(sig, payload, verificationKey, { context: ML_DSA_CONTEXT }));
  });

  it('fails when timestamp is tampered', () => {
    const sig = Buffer.from(shuffle.mlDsaSignature, 'base64');
    const payload = new Uint8Array([...bundle, ...timestampToLE(shuffle.timestamp + 1)]);
    assert.isFalse(ml_dsa65.verify(sig, payload, verificationKey, { context: ML_DSA_CONTEXT }));
  });

  it('fails with wrong context string', () => {
    const sig = Buffer.from(shuffle.mlDsaSignature, 'base64');
    const payload = new Uint8Array([...bundle, ...timestampToLE(shuffle.timestamp)]);
    const wrongCtx = new TextEncoder().encode('skullcard-shuffle-v2');
    assert.isFalse(ml_dsa65.verify(sig, payload, verificationKey, { context: wrongCtx }));
  });
});
