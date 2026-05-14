
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import init, { verify_deck, poseidon2 } from "../../pkg/halo_circuit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));


const N = 52;
const N_LEAVES = 64;
const TREE_DEPTH = 6;



beforeAll(async () => {
  const wasmBytes = await readFile(join(__dirname, "../../pkg/halo_circuit_bg.wasm"));
  await init({ module_or_path: wasmBytes });
});



let cards;
let salts;
let bundle;

beforeAll(async () => {
  const dir = join(__dirname, "../fixtures");
  [cards, salts, bundle] = await Promise.all([
    readFile(join(dir, "cards.bin")).then((b) => new Uint8Array(b)),
    readFile(join(dir, "salts.bin")).then((b) => new Uint8Array(b)),
    readFile(join(dir, "bundle.bin")).then((b) => new Uint8Array(b)),
  ]);
});



function fp(n) {
  const bytes = new Uint8Array(32);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(n), true);
  return bytes;
}

function saltAt(i) {
  return salts.slice(i * 32, (i + 1) * 32);
}


function jsComputeMerkleRoot() {
  let level = [];
  for (let i = 0; i < N_LEAVES; i++) {
    const a = i < N ? fp(cards[i]) : fp(0);
    const b = i < N ? saltAt(i) : fp(0);
    level.push(poseidon2(a, b));
  }
  for (let d = 0; d < TREE_DEPTH; d++) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(poseidon2(level[i], level[i + 1]));
    }
    level = next;
  }
  return level[0];
}

function bytesEqual(a, b) {
  return Buffer.from(a).equals(Buffer.from(b));
}



describe("verify_deck — fixture bundle", () => {
  test("known-good bundle verifies", () => {
    expect(verify_deck(bundle)).toBe(true);
  });

  test("bundle is longer than 32 bytes (has proof data beyond the root)", () => {
    expect(bundle.length).toBeGreaterThan(32);
  });
});



describe("verify_deck — tampered bundles", () => {
  test("root bytes corrupted fails", () => {
    const t = new Uint8Array(bundle);
    t[0] ^= 0xff;
    expect(verify_deck(t)).toBe(false);
  });

  test("last proof byte flipped fails", () => {
    const t = new Uint8Array(bundle);
    t[t.length - 1] ^= 0xff;
    expect(verify_deck(t)).toBe(false);
  });

  test("middle proof byte flipped fails", () => {
    const t = new Uint8Array(bundle);
    t[Math.floor(t.length / 2)] ^= 0xff;
    expect(verify_deck(t)).toBe(false);
  });

  test("empty buffer fails", () => {
    expect(verify_deck(new Uint8Array(0))).toBe(false);
  });

  test("truncated to 10 bytes fails", () => {
    expect(verify_deck(bundle.slice(0, 10))).toBe(false);
  });

  test("all-zeros buffer fails", () => {
    expect(verify_deck(new Uint8Array(bundle.length))).toBe(false);
  });
});



describe("Merkle root — JS poseidon2 matches circuit", () => {
  test("JS-computed root equals root embedded in bundle", () => {
    const embeddedRoot = bundle.slice(0, 32);
    const jsRoot = jsComputeMerkleRoot();
    expect(bytesEqual(jsRoot, embeddedRoot)).toBe(true);
  });

  test("embedded root is a non-zero field element", () => {
    expect(bundle.slice(0, 32).some((b) => b !== 0)).toBe(true);
  });

  test("flipping one card changes the JS-computed root", () => {
    const originalRoot = jsComputeMerkleRoot();


    const savedA = cards[0];
    const savedB = cards[1];
    cards[0] = savedB;
    cards[1] = savedA;
    const altRoot = jsComputeMerkleRoot();
    cards[0] = savedA;
    cards[1] = savedB;

    expect(bytesEqual(originalRoot, altRoot)).toBe(false);
  });

  test("flipping one salt changes the JS-computed root", () => {
    const originalRoot = jsComputeMerkleRoot();


    const saved = salts[0];
    salts[0] ^= 0xff;
    const altRoot = jsComputeMerkleRoot();
    salts[0] = saved;

    expect(bytesEqual(originalRoot, altRoot)).toBe(false);
  });
});
