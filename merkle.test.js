import { assert } from 'chai';
import { buildTree, getPath, verifyPath } from './merkle.js';

// Salts as small integers — valid in both BN128 and Pallas fields.
const CARDS = Array.from({ length: 52 }, (_, i) => i);
const SALTS = Array.from({ length: 52 }, (_, i) => BigInt(i + 1000));

describe('Merkle Tree Module', function () {
  this.timeout(120000);

  let tree;
  let root;

  before(async () => {
    tree = await buildTree(CARDS, SALTS);
    root = tree.levels[tree.levels.length - 1][0];
  });

  it('Root is a non-empty decimal string', () => {
    assert.isString(root);
    assert.match(root, /^\d+$/, 'root must be a decimal string');
  });

  it('Returns true for valid card / salt / path / root', async () => {
    const path = getPath(tree, 0);
    const ok = await verifyPath(CARDS[0], SALTS[0], path, root);
    assert.isTrue(ok);
  });

  it('Returns false for tampered card', async () => {
    const path = getPath(tree, 0);
    const ok = await verifyPath(1, SALTS[0], path, root);
    assert.isFalse(ok);
  });

  it('Returns false for tampered salt', async () => {
    const path = getPath(tree, 0);
    const ok = await verifyPath(CARDS[0], SALTS[0] + 1n, path, root);
    assert.isFalse(ok);
  });

  it('Returns false for tampered path sibling', async () => {
    const path = getPath(tree, 0);
    const tampered = path.map((step, i) =>
      i === 0 ? { ...step, sibling: '0' } : step
    );
    const ok = await verifyPath(CARDS[0], SALTS[0], tampered, root);
    assert.isFalse(ok);
  });

  it('Returns false for wrong root', async () => {
    const path = getPath(tree, 0);
    const ok = await verifyPath(CARDS[0], SALTS[0], path, '0');
    assert.isFalse(ok);
  });

  it('All 52 card positions verify correctly', async () => {
    for (let i = 0; i < 52; i++) {
      const path = getPath(tree, i);
      const ok = await verifyPath(CARDS[i], SALTS[i], path, root);
      assert.isTrue(ok, `Position ${i} should verify`);
    }
  });

  it('Deal 5 cards to each of 2 players. All paths verify against committed root', async () => {
    const player1 = [0, 1, 2, 3, 4];
    const player2 = [5, 6, 7, 8, 9];

    for (const position of [...player1, ...player2]) {
      const path = getPath(tree, position);
      const ok = await verifyPath(CARDS[position], SALTS[position], path, root);
      assert.isTrue(ok, `Position ${position} should verify`);
    }

    const hand1 = player1.map((i) => CARDS[i]);
    const hand2 = player2.map((i) => CARDS[i]);
    assert.equal(new Set([...hand1, ...hand2]).size, 10, 'All 10 dealt cards are distinct');

    const stolenPath = getPath(tree, player2[0]);
    const cheating = await verifyPath(CARDS[player1[0]], SALTS[player1[0]], stolenPath, root);
    assert.isFalse(cheating, "Player 1's card must not verify against player 2's path");
  });

  it('Tree has 7 levels (64 leaves → root)', () => {
    assert.equal(tree.levels.length, 7);
    assert.equal(tree.levels[0].length, 64);
    assert.equal(tree.levels[6].length, 1);
  });

  it('Padding leaves (positions 52–63) are all the same hash', () => {
    const paddingHash = tree.levels[0][52];
    for (let i = 53; i < 64; i++) {
      assert.equal(tree.levels[0][i], paddingHash);
    }
  });

  it('Same inputs produce the same root', async () => {
    const tree2 = await buildTree(CARDS, SALTS);
    const root2 = tree2.levels[tree2.levels.length - 1][0];
    assert.equal(root, root2);
  });

  it('Different salts produce different root', async () => {
    const altSalts = SALTS.map((s) => s + 1n);
    const altTree = await buildTree(CARDS, altSalts);
    const altRoot = altTree.levels[altTree.levels.length - 1][0];
    assert.notEqual(root, altRoot);
  });

  it('getPath returns 6 steps per leaf', () => {
    for (let i = 0; i < 52; i++) {
      const path = getPath(tree, i);
      assert.equal(path.length, 6, `leaf ${i} should have 6 path steps`);
    }
  });

  it('Path siblings are decimal strings', () => {
    const path = getPath(tree, 0);
    for (const { sibling } of path) {
      assert.isString(sibling);
      assert.match(sibling, /^\d+$/, 'sibling must be a decimal string');
    }
  });
});
