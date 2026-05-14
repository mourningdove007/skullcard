# Halo2 Circuit (`zk/rust/circuit`)

Separate Rust crate (`halo-circuit`) containing the Halo2 KZG permutation-and-commitment circuit. Used in two ways:

- **Native** - by the shuffle service (`zk/rust/`) via `prove_from_decimal_salts` and `tree_from_decimal_salts` in `services.rs`.
- **WASM** - compiled with `wasm-pack` for in-browser verification. Exports `verify_deck`, `poseidon2`, and `load_verifier_from_bytes`.

## Circuit design

### What it proves

Given private inputs `cards: [u64; 52]` and `salts: [Fr; 52]`, the circuit proves two statements simultaneously:

1. `cards` is a permutation of `{0, 1, …, 51}` - no duplicates, no gaps.
2. The Poseidon Merkle root of `{poseidon(cards[i], salts[i])}` equals a publicly committed value.

### Columns

| Name | Type | Count | Contents |
|------|------|-------|----------|
| `w_fixed` | Advice | 1 | `cards[v]` at row `v` - canonical witness; all card column copies are tied back here via permutation argument |
| `v_col` | Fixed | 1 | Row index: cell at row `v` holds constant `v` |
| `card_col[j]` | Advice | 52 | `card_col[j]` holds `cards[j]` on every row |
| `eq_col[j]` | Advice | 52 | `1` if `cards[j] == v` at row `v`, else `0` |
| `sum_col` | Advice | 1 | Sum of all `eq_col[j]` at each row; constrained to equal `1` |

**Total**: 106 advice + 1 fixed columns, 52 active rows, `K = 13` (up to 8192 constraint rows).

### Permutation check

The circuit implicitly builds a `52 × 52` presence matrix. Constraining every row sum to 1 proves each value `0..51` appears in exactly one column - i.e., the cards array is a permutation. This requires 52 × 52 = 2,704 equality checks encoded as advice constraints.

### Merkle commitment

Leaf hashes: `poseidon(cards[i], salts[i])` for positions 0–51; positions 52–63 are `poseidon(0, 0)` (padding to the next power of 2). The 64 leaves are hashed pairwise up 6 levels to produce the root. The circuit constrains this computed root to equal the **public instance column value**.

The instance is the only public value in the proof. It is what binds the proof to a specific deck - a proof generated for deck A cannot verify deck B.

**Why the root must be supplied externally (not emitted as a circuit output)**

Without a public instance, `verify_proof` can only confirm "this is a valid proof that the circuit is satisfiable by *some* witness." It has no mechanism to confirm *which* witness. The proof floats free - proving "I know a valid deck" but not "I know the deck corresponding to root R."

This opens a concrete attack: the dealer pre-generates a valid proof for any deck, then sends players entirely different cards and salts. Players compute their root from the cards they received and call verify - but since the proof isn't bound to their root, nothing mismatches and verification passes. The instance constraint is what makes this impossible.

**Player verification flow**

The client performs three steps that together link a player's hand to the proof without trusting any server-supplied value:

1. **ZK proof verification (worker)** - The proof bundle is passed to the WASM verifier. The verifier extracts the committed root from bytes 0–31 and checks the proof against it. This confirms the server ran a valid shuffle circuit.
2. **Root extraction (main thread)** - The client independently decodes the same first 32 bytes as a little-endian BN256 Fr element. The server never supplies this value; it is read directly from the proof bundle.
3. **Card path verification (main thread)** - For each card, the client computes `poseidon(cardIndex, salt)` to get the leaf, walks the Merkle path using the server-supplied sibling hashes, and checks the result matches the root from step 2.

If the server sent the correct deck → the path recomputation arrives at the committed root → all checks pass. If the server sent different cards or salts → the recomputed root won't match → verification fails.

**Difference from Circom/Groth16**

In the old Circom pipeline the Merkle root was a *public output* - the circuit computed it internally and emitted it automatically. It fell out of proof generation and lived inside the proof artifact.

In halo2/KZG there are no circuit outputs. Instance columns are *externally supplied values*: the prover computes the root outside the circuit, passes it in as an instance, and the circuit proves "this value is consistent with my private witness." The root flows *in* rather than *out*. That is why in `prover.rs` the root is computed separately, prepended to the proof bytes by hand, and must be extracted by the client rather than read from a proof field.

### Hash function

Poseidon (R_F=8, R_P=56, x^5 S-box) over the BN256 scalar field (`halo2curves::bn256::Fr`). Round constants generated via Grain LFSR for the BN256 prime. The same constants are used client-side via the `poseidon2` WASM export and in `merkle.js`.

> **Compatibility note**: these constants differ from circomlibjs and Tornado Cash. Always use `poseidon2` from this WASM module to reproduce hashes.

## KZG trusted setup

### What the SRS is

KZG requires a **structured reference string (SRS)**: `[G, τG, τ²G, ..., τ^(2^K − 1)G]` where `τ` is a secret scalar ("toxic waste"). Anyone who knows `τ` can forge proofs, so `τ` is destroyed after generation. Here a deterministic seed (`KZG_SETUP_SEED`) is used rather than a multi-party ceremony - appropriate for a card game, not high-value financial applications.

The verifying key (`vk`) is derived from the SRS and the circuit's fixed column structure.

### One-time generation

```bash
cd zk/rust/circuit
cargo run --release --bin gen_verifier_assets -- pkg
```

`gen_verifier_assets.rs` does four things:
1. `ParamsKZG::<Bn256>::setup(K, StdRng::from_seed(KZG_SETUP_SEED))` - deterministic from the seed
2. Derives the verifying key using a dummy zero-witness circuit instance
3. Serializes both with `SerdeFormat::RawBytes`
4. Writes `pkg/params.bin` (~1 MB) and `pkg/vk.bin` (~8.6 KB)

Commit both files. They are reproducible from the seed and do not need to be kept secret.

### When to regenerate

| Change | Regenerate? |
|--------|--------------------|
| Circuit gates, constraints, layout | Yes |
| `N` (deck size) or `K` (circuit size) | Yes |
| Poseidon round constants or spec | Yes |
| Shuffle randomness, salts, card values | No |
| Frontend, routing, application code | No |

After regenerating assets, rebuild the WASM so it picks up the new circuit structure:

```bash
wasm-pack build --target web --out-dir pkg --features wasm
```

### Loading at runtime

**Backend** (`main.rs`) reads both files at startup before binding the socket, calling `load_from_bytes` to pre-populate `OnceLock<ParamsKZG>` and `OnceLock<VerifyingKey>`. After that, `get_params()` and `get_vk()` return from cache immediately - no disk access, no regeneration.

**Browser worker** (`verifier.worker.js`) fetches both files over HTTP at worker init time and calls the WASM-exported `load_verifier_from_bytes`. The worker pre-warms on component mount so by the time the ~30–45 s proof generation completes, verification is instant.

**Integration tests** (`integration.test.js`) read both files from disk and call `load_verifier_from_bytes` in the `before` block - same pattern as the worker.

## `create_proof` primitives

```rust
create_proof::<KZGCommitmentScheme<Bn256>, ProverSHPLONK<Bn256>, _, _, _, _>(
    params, &pk, &[circuit], &[&[&[root]]], OsRng, &mut transcript,
)
```

| Parameter | What it is |
|-----------|-----------|
| `KZGCommitmentScheme<Bn256>` | Polynomial commitment scheme. KZG commits a polynomial to a single G1 curve point using the SRS. BN256 is pairing-friendly, enabling the bilinear opening check. |
| `ProverSHPLONK<Bn256>` | Multi-open protocol. Batches all polynomial openings into one aggregated proof rather than one proof per polynomial per point. `VerifierSHPLONK` is the counterpart. |
| `Blake2bWrite<_, G1Affine, Challenge255<_>>` | Fiat-Shamir transcript. Prover messages are absorbed into Blake2b; challenges are squeezed as 255-bit scalars fitting the BN256 field. Verifier uses `Blake2bRead` and replays the same hash chain. |
| `G1Affine` | Affine BN256 G1 curve points. Compact for serialization; used in KZG commitments and opening proofs. |
| `OsRng` | OS CSPRNG (`/dev/urandom`) for blinding factors. Required so the proof reveals nothing about the private witness. |
| `&[&[&[root]]]` | Public instance - one batch, one circuit, one instance column containing the Merkle root. |

The finalized proof is returned as bytes, then the root is prepended by hand to form the bundle:

```rust
bundle.extend_from_slice(root.to_repr().as_ref()); // bytes 0–31: LE BN256 Fr root
bundle.extend_from_slice(&proof);                  // bytes 32–end: SHPLONK proof
```

The root is prepended rather than emitted by the circuit because halo2 has no circuit outputs - see the Public instance section above.

## WASM build

```bash
cd zk/rust/circuit
wasm-pack build --target web --out-dir pkg --features wasm
```

Exports (defined in `src/wasm.rs`):

| Function | Signature | Used by | Description |
|----------|-----------|---------|-------------|
| `verify_deck` | `(bundle: Uint8Array) → bool` | Browser, tests | Verify a proof bundle (extracts root from bytes 0–31 internally) |
| `poseidon2` | `(a: Uint8Array, b: Uint8Array) → Uint8Array` | Browser, `merkle.js` | Hash two 32-byte BN256 Fr field elements |
| `load_verifier_from_bytes` | `(params: Uint8Array, vk: Uint8Array) → Result` | Worker, tests | Pre-load params and VK; must be called before `verify_deck` |
| `prove_deck` | `(cards: Uint8Array) → Uint8Array` | Demo / backend | Prove 52 cards with internally generated random salts |
| `prove_deck_with_salts` | `(cards: Uint8Array, salts: Uint8Array) → Uint8Array` | Backend | Prove with caller-supplied salts (52 × 32 bytes, LE BN256 Fr) |

## Tests

### Rust unit tests

```bash
cd zk/rust/circuit
cargo test
```

Fast - uses `MockProver` internally. For active development, use `cargo-watch`:

```bash
cargo install cargo-watch
cargo watch -c -q -x check -x "test -- --nocapture"
```

- **`-c`** clears the terminal on each save so you only see current output.
- **`-q`** suppresses Cargo build noise.
- **`--nocapture`** shows `println!` output from failing tests immediately.
