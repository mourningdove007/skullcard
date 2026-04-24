import { assert } from 'chai';
import { buildTree, getPath, verifyPath } from '../merkle.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:8080';
const API_KEY = process.env.API_KEY || 'REPLACE_WITH_YOUR_API_KEY';


async function fetchShuffle() {
  let res;
  try {
    res = await fetch(`${API_URL}/`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY },
    });
  } catch (err) {
    throw new Error(
      `Could not reach Rust server at ${API_URL}. Is it running?\n` +
      `  API_KEY=your_key cargo run\n\n${err.message}`
    );
  }
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  return res.json();
}

function toJsPath(rustPath) {
  return rustPath.map(({ sibling, direction }) => ({
    sibling: BigInt(sibling),
    direction,
  }));
}


describe('Rust shuffle API — response shape', function () {
  let data;
  before(async () => { data = await fetchShuffle(); });

  it('returns 52 cards', () =>
    assert.lengthOf(data.cards, 52));

  it('cards are a valid permutation of 0–51', () => {
    const sorted = [...data.cards].sort((a, b) => a - b);
    assert.deepEqual(sorted, Array.from({ length: 52 }, (_, i) => i));
  });

  it('returns 52 salts as decimal strings', () => {
    assert.lengthOf(data.salts, 52);
    for (const s of data.salts)
      assert.match(s, /^\d+$/, `"${s}" is not a decimal string`);
  });

  it('merkleRoot is a non-empty decimal string', () =>
    assert.match(data.merkleRoot, /^\d+$/));

  it('merklePaths has 52 entries each with exactly 6 steps', () => {
    assert.lengthOf(data.merklePaths, 52);
    for (const [i, path] of data.merklePaths.entries())
      assert.lengthOf(path, 6, `path ${i} has wrong length`);
  });

  it('all path directions are 0 or 1', () => {
    for (const path of data.merklePaths)
      for (const { direction } of path)
        assert.include([0, 1], direction);
  });

  it('all sibling hashes are decimal strings', () => {
    for (const path of data.merklePaths)
      for (const { sibling } of path)
        assert.match(sibling, /^\d+$/, `"${sibling}" is not a decimal string`);
  });

  it('two calls produce different cards, salts, and roots', async () => {
    const second = await fetchShuffle();
    assert.notDeepEqual(data.cards,      second.cards,      'cards should differ');
    assert.notDeepEqual(data.salts,      second.salts,      'salts should differ');
    assert.notEqual(    data.merkleRoot, second.merkleRoot, 'roots should differ');
  });
});


describe('Rust shuffle API — circomlibjs Poseidon compatibility', function () {
  let data;
  before(async () => { data = await fetchShuffle(); });

  it('JS verifyPath validates every Rust-generated Merkle path', async () => {
    const { cards, salts, merkleRoot, merklePaths } = data;
    for (let i = 0; i < 52; i++) {
      const ok = await verifyPath(
        cards[i],
        BigInt(salts[i]),
        toJsPath(merklePaths[i]),
        merkleRoot
      );
      assert.isTrue(ok, `verifyPath failed for card at position ${i} (card index ${cards[i]})`);
    }
  });

  it('JS buildTree produces the same merkleRoot as the Rust API', async () => {
    const { cards, salts, merkleRoot } = data;
    const tree = await buildTree(cards, salts);
    const jsRoot = tree.levels[tree.levels.length - 1][0].toString();
    assert.equal(jsRoot, merkleRoot, 'JS and Rust Poseidon roots must match');
  });

  it('JS getPath on a JS-built tree matches every Rust merkle path step-for-step', async () => {
    const { cards, salts, merklePaths } = data;
    const tree = await buildTree(cards, salts);
    for (let i = 0; i < 52; i++) {
      const jsPath   = getPath(tree, i);
      const rustPath = merklePaths[i];
      for (let s = 0; s < jsPath.length; s++) {
        assert.equal(
          jsPath[s].sibling.toString(), rustPath[s].sibling,
          `sibling mismatch at position ${i}, step ${s}`
        );
        assert.equal(
          jsPath[s].direction, rustPath[s].direction,
          `direction mismatch at position ${i}, step ${s}`
        );
      }
    }
  });
});


describe('Rust shuffle API — game deal integrity', function () {
  let data;
  before(async () => { data = await fetchShuffle(); });

  it('deals 5 cards to each of 2 players; all paths verify', async () => {
    const { cards, salts, merkleRoot, merklePaths } = data;
    const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const pos of positions) {
      const ok = await verifyPath(
        cards[pos], BigInt(salts[pos]), toJsPath(merklePaths[pos]), merkleRoot
      );
      assert.isTrue(ok, `position ${pos} (card ${cards[pos]}) failed`);
    }
    const dealt = positions.map(i => cards[i]);
    assert.equal(new Set(dealt).size, 10, 'all 10 dealt cards must be distinct');
  });

  it("player 1's card does not verify against player 2's path", async () => {
    const { cards, salts, merkleRoot, merklePaths } = data;
    const ok = await verifyPath(
      cards[0], BigInt(salts[0]), toJsPath(merklePaths[5]), merkleRoot
    );
    assert.isFalse(ok);
  });

  it('tampered card index does not verify', async () => {
    const { cards, salts, merkleRoot, merklePaths } = data;
    const ok = await verifyPath(
      (cards[0] + 1) % 52, BigInt(salts[0]), toJsPath(merklePaths[0]), merkleRoot
    );
    assert.isFalse(ok);
  });

  it('tampered salt does not verify', async () => {
    const { cards, salts, merkleRoot, merklePaths } = data;
    const ok = await verifyPath(
      cards[0], BigInt(salts[0]) + 1n, toJsPath(merklePaths[0]), merkleRoot
    );
    assert.isFalse(ok);
  });

  it('tampered sibling hash does not verify', async () => {
    const { cards, salts, merkleRoot, merklePaths } = data;
    const path = toJsPath(merklePaths[0]);
    path[0] = { ...path[0], sibling: 0n };
    const ok = await verifyPath(cards[0], BigInt(salts[0]), path, merkleRoot);
    assert.isFalse(ok);
  });

  it('tampered root does not verify', async () => {
    const { cards, salts, merklePaths } = data;
    const ok = await verifyPath(
      cards[0], BigInt(salts[0]), toJsPath(merklePaths[0]), '0'
    );
    assert.isFalse(ok);
  });
});
