# SkullCard Zero-Knowledge Proofs

Zero-knowledge components for the poker application SkullCard. The application is live on the web at [skullcard.com](https://skullcard.com/).


This project migrated away from a Circom implementation to Halo 2. A [whitepaper Version 2](whitepaperV2.pdf) is in progress to explain this update in detail. [Version 1](whitepaperV1.pdf) of the whitepaper gives a conceptual overview of the motivation and implementation of zero-knowledge proofs in the SkullCard poker application.

## Overview

SkullCard uses a **Halo2 KZG** zero-knowledge proof to guarantee a the shuffle contains the expected cards and players received cards from this shuffle without requiring players to trust the server. As the server uses a RNG to shuffle the cards, users still have to trust that the server did not arrange the cards maliciously. Before any cards are dealt, the server:

1. Generates a cryptographically random permutation of 52 cards, each paired with a random 31-byte BN256 Fr salt.
2. Commits to the entire deck by building a depth-6 **Poseidon Merkle tree** (BN256 Fr, R_F=8 R_P=56 x^5 S-box) over 64 leaves (52 cards padded to the next power of two).
3. Proves in zero knowledge, using a **Halo2 KZG/SHPLONK circuit** over the BN256 curve, that all 52 card indices are distinct values in `[0, 51]` and that the Merkle root correctly commits to their (card, salt) leaf hashes.
4. Returns the proof bundle. The Merkle root is the **public input** to the proof: it is embedded in the first 32 bytes of the bundle (little-endian BN256 Fr scalar) and is never sent as a separate field.

## Client-side validation

A client validates a shuffle in two independent steps.

**Step 1: Verify the proof.** Pass the raw proof bundle to `verify_deck`. This checks the KZG/SHPLONK transcript and confirms the embedded Merkle root is the one the prover actually used. No trust in the server is required.

```js
const valid = verify_deck(bundleBytes); // true if the permutation proof is sound
```

**Step 2: Verify dealt cards against the committed root.** Each dealt card comes with a Merkle path (a sequence of sibling hashes and directions). The client:

1. Computes the leaf hash for the card: `poseidon(card_index, salt)`.
2. Walks the path, hashing the current node with each sibling in order.
3. Compares the resulting root against the one extracted from the proof bundle.

If the roots match, the card was provably included in the committed shuffle. The server cannot substitute a card that was not part of the original permutation without invalidating either the proof or the path check.

```js
// Extract root from bundle (bytes 0-31, little-endian)
let root = 0n;
for (let i = 31; i >= 0; i--) root = (root << 8n) | BigInt(bundle[i]);

// Verify a single card's path
let current = poseidon(card_index, salt);
for (const { sibling, direction } of merklePath) {
  current = direction === 0
    ? poseidon(current, sibling)   // current is left child
    : poseidon(sibling, current);  // current is right child
}
const cardValid = current === root;
```

See [`integration.test.js`](integration.test.js) for the full test suite covering both steps, including tamper-detection cases.

## Backend (shuffle service)

The shuffle service is an **Axum HTTP server** (`rust/`) written in Rust. It is called once per round to generate the shuffle and produce the proof.

- Proof generation runs in a dedicated `spawn_blocking` thread pool (Halo2 proving takes ~11 s of CPU).
- Every request requires an `x-api-key` header; missing or wrong key returns `401`.
- The KZG trusted setup assets (`params.bin`, `vk.bin`) are pre-loaded at startup and also bundled into the WASM pkg for client verification.

Full API documentation, deployment instructions, and Docker/Cloud Run examples are in [`rust/README.md`](rust/README.md).

## Subdirectories

| Path | Description |
|------|-------------|
| [`rust/`](rust/) | Axum HTTP service: shuffle, Merkle tree, Halo2 KZG prover, and REST endpoint. See [`rust/README.md`](rust/README.md). |
| [`rust/circuit/`](rust/circuit/) | Halo2 circuit crate: permutation proof, Poseidon Merkle commitment, KZG trusted setup, WASM verifier exports. See [`rust/circuit/README.md`](rust/circuit/README.md). |
| [`circom_circuit/`](circom_circuit/) | **Deprecated.** Original Circom/Groth16 implementation, superseded by the Halo2 KZG circuit. Kept for reference only. |

## Shared utilities

**`merkle.js`**: Merkle tree construction and path verification using the same BN256 Poseidon hash as the Halo2 circuit, computed via WASM. Exposes `buildTree`, `getPath`, and `verifyPath`. Used by the integration tests.

## Integration tests

Tests require the shuffle service to be running locally and the WASM pkg to be built.

```bash
cd zk
npm install
npm test
```

Coverage:
- Endpoint response shape (`cards`, `salts`, `merklePaths`, `proofHex`)
- Halo2 proof verification via `verify_deck` (WASM, pre-loaded with `params.bin` + `vk.bin`)
- Merkle root extracted client-side from the proof bundle
- Merkle path verification for all 52 card positions
- Tamper detection: corrupted proof bytes, wrong root, mutated cards/salts, cross-player path swap
