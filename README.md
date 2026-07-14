# SkullCard: Deck Shuffle/Deal with ZK proofs and PQ Signatures

Zero-knowledge and post-quantum signature components for the poker application SkullCard. The application is live on the web at [skullcard.com](https://skullcard.com/). The [`dealer/README.md`](dealer/README.md) contains schema information and detailed architecture of the API, and [`kms/README.md`](kms/README.md) documents the signing service.


This project migrated away from a Circom implementation to Halo 2. A [whitepaper Version 2](whitepaperV2.pdf) is in progress to explain this update in detail. [Version 1](whitepaperV1.pdf) of the whitepaper gives a conceptual overview of the motivation and implementation of zero-knowledge proofs in the SkullCard poker application.

## Overview

SkullCard uses a **Halo2 KZG** zero-knowledge proof to guarantee a the shuffle contains the expected cards and players received cards from this shuffle without requiring players to trust the server. As the server uses a RNG to shuffle the cards, users still have to trust that the server did not arrange the cards maliciously. Before any cards are dealt, the server:

1. Generates a cryptographically random permutation of 52 cards, each paired with a random 31-byte BN256 Fr salt.
2. Commits to the entire deck by building a depth-6 **Poseidon Merkle tree** (BN256 Fr, R_F=8 R_P=56 x^5 S-box) over 64 leaves (52 cards padded to the next power of two).
3. Proves in zero knowledge, using a **Halo2 KZG/SHPLONK circuit** over the BN256 curve, that all 52 card indices are distinct values in `[0, 51]` and that the Merkle root correctly commits to their leaf hashes.
4. Returns the proof bundle. The Merkle root is the **public input** to the proof: it is embedded in the first 32 bytes of the bundle and is never sent as a separate field.
5. Signs the response with an **ML-DSA-65** post-quantum signature, produced by a separate signing service (`kms/`) that holds the private key, so clients can verify the response originated from this operator.

## Subdirectories

| Path | Description |
|------|-------------|
| [`dealer/`](dealer/) | Axum HTTP service: shuffle, Merkle tree, Halo2 KZG prover, and REST endpoint. Hashes each response and asks the kms to sign the digest. See [`dealer/README.md`](dealer/README.md). |
| [`kms/`](kms/) | Axum signing microservice: holds the ML-DSA-65 keypair, signs digests for the dealer, and publishes the verification key. See [`kms/README.md`](kms/README.md). |
| [`dealer/circuit/`](dealer/circuit/) | Halo2 circuit crate: permutation proof, Poseidon Merkle commitment, KZG trusted setup, WASM verifier exports. See [`dealer/circuit/README.md`](dealer/circuit/README.md). |
| [`circom_circuit/`](circom_circuit/) | **Deprecated.** Original Circom/Groth16 implementation, superseded by the Halo2 KZG circuit. Kept for reference only. |


## Backend (two services)

The backend is split into two **Axum HTTP servers** written in Rust:

- **`dealer/`**: called once per round to generate the shuffle and produce the proof. It never holds a signing key; it hashes each response and sends only the digest to the kms.
- **`kms/`**: holds the ML-DSA-65 keypair, signs digests on the dealer's behalf, and serves the public verification key at `GET /public-key`.

They are wired together (and can be run locally) with the top-level [`docker-compose.yml`](docker-compose.yml). Full API documentation, deployment instructions, and Docker/Cloud Run examples are in [`dealer/README.md`](dealer/README.md) and [`kms/README.md`](kms/README.md).

## Client-side validation

A client validates a shuffle in three independent steps.

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

**Step 3: Verify the ML-DSA-65 signature.** The `mlDsaSignature` field proves the response came from the legitimate operator. The signature covers `SHA-256("skullcard-shuffle-v1" || proof_bytes || timestamp_u64_le)`. The domain-tagged payload is hashed first, and the 32-byte digest is signed with the **empty** ML-DSA context. Recompute that digest and verify against it (not the raw payload) using the [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum) library and the public verification key from the kms service's `GET /public-key` (see [`kms/README.md`](kms/README.md)). Full details in [ML-DSA-KEYS.md](ML-DSA-KEYS.md).


## Integration tests

Both backend services (`dealer` and `kms`) must be running for these integration tests
(`integration.test.js`). The easiest way is `docker compose up --build` from this directory. The
tests reach the dealer at `http://127.0.0.1:8080` and the kms at `http://127.0.0.1:8081` (override
with `BACKEND_URL` / `KMS_URL`).

```bash
npm install
npm test
```