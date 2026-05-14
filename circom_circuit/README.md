# Shuffle Circuit (Deprecated)

> **This Circom/Groth16 implementation has been superseded by the Halo2 KZG circuit in [`skullcard/rust/circuit/`](../rust/circuit/).** The Halo2 circuit uses the same permutation and Merkle commitment logic but runs over the BN256 scalar field, uses Poseidon with BN256-compatible round constants, and produces a KZG/SHPLONK proof verified entirely in Rust/WASM. This directory is kept for reference.

---

# Shuffle Circuit

The circuit (`shuffle.circom`) is instantiated as `ShuffleCircuit(52, 64)` and takes two private inputs and produces a single public output: the Merkle root of the committed deck.

## Tests

Install and run the tests.

```
npm install
npm test
```

## Motivation

The circuit must prove two things about the input without revealing the deck order or card values:

1. The card array is a permutation of `{0, 1, ..., 51}`.
2. The Merkle root is derived from that specific deck and salt pairing.

## Permutation Check

The circuit constructs an `n × n` binary matrix `M` where entry `M[v][i] = 1` if `cards[i] == v`, and `0` otherwise. The constraint

```
sum over i of M[v][i] == 1   for all v in {0, ..., n-1}
```

holds if and only if the input is a permutation of `{0, ..., n-1}`. Each row having exactly one nonzero entry means every value appears exactly once. This requires `n² = 2,704` `IsEqual` constraints for `n = 52`.

## Merkle Commitment

Each card is hashed with its corresponding salt to form a leaf:

```
leaf[i] = Poseidon(cards[i], salts[i])
```

The 52 card leaves are padded to 64 leaves (the smallest power of two ≥ 52) using `Poseidon(0, 0)`. The leaves are then paired level by level into a binary Merkle tree. The root at `upperHashes[62]` is the circuit's public output and serves as a commitment to the deck.

## Files

| File | Description |
|------|-------------|
| `shuffle.circom` | Circuit source |
| `shuffle_final.zkey` | Proving key from trusted setup |
| `verification_key.json` | Verification key for client-side proof checking |
| `circuit.test.js` | Proof generation tests |
| `verification.test.js` | Proof verification tests |
| `verify.py` | Manual Groth16 verification using `py_ecc` |

## Further Reading

See `../report/` for the full whitepaper, including the formal proof of the permutation constraint and a walkthrough of Groth16 verification.
