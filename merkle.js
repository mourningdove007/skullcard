// Pallas-curve Poseidon (P128Pow5T3) via the halo2 circuit WASM module.
// This matches the field used by the Rust backend and the halo2 proof's public signal.
import init, { poseidon2 } from './rust/circuit/pkg/halo_circuit.js';

const N_CARDS = 52;
const N_LEAVES = 64;

let _wasmReady = null;

async function getWasm() {
  if (!_wasmReady) _wasmReady = init();
  return _wasmReady;
}

function decimalToLE(decimal) {
  let n = BigInt(decimal);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

function leToDecimal(bytes) {
  let n = 0n;
  for (let i = 31; i >= 0; i--) {
    n = (n << 8n) | BigInt(bytes[i]);
  }
  return n.toString();
}

function hashToDecimal(aDecimal, bDecimal) {
  return leToDecimal(poseidon2(decimalToLE(aDecimal), decimalToLE(bDecimal)));
}


export async function buildTree(cards, salts) {
  await getWasm();

  const padding = hashToDecimal('0', '0');

  const leaves = [];
  for (let i = 0; i < N_CARDS; i++) {
    leaves.push(hashToDecimal(String(cards[i]), String(salts[i])));
  }
  for (let i = N_CARDS; i < N_LEAVES; i++) {
    leaves.push(padding);
  }

  const levels = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(hashToDecimal(current[i], current[i + 1]));
    }
    levels.push(next);
    current = next;
  }

  return { levels };
}

export function getPath(tree, leafIndex) {
  const path = [];
  let index = leafIndex;

  for (let level = 0; level < tree.levels.length - 1; level++) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    path.push({
      sibling: tree.levels[level][siblingIndex],
      direction: isRight ? 1 : 0,
    });
    index = Math.floor(index / 2);
  }

  return path;
}

export async function verifyPath(card, salt, path, root) {
  await getWasm();

  let current = hashToDecimal(String(card), String(salt));

  for (const { sibling, direction } of path) {
    current = direction === 0
      ? hashToDecimal(current, String(sibling))   // we are left, sibling is right
      : hashToDecimal(String(sibling), current);  // sibling is left, we are right
  }

  return current === root.toString();
}
