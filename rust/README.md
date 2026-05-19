# Shuffle service

Axum HTTP service that generates a random 52-card shuffle, computes a BN256 Poseidon Merkle tree, and produces a Halo2 KZG zero-knowledge proof that the deck is a valid permutation. 


## Response

`POST /` returns six fields:

| Field | Type | Description |
|-------|------|-------------|
| `cards` | `number[52]` | Random permutation of `[0, 1, …, 51]`. Each integer encodes one card (suit × 13 + value). |
| `salts` | `string[52]` | One BN256 Fr scalar per card: 31 random bytes as a decimal string, always < the BN256 prime. |
| `merklePaths` | `{ sibling: string, direction: 0\|1 }[][52]` | One 6-step Merkle path per card position. The client extracts the Merkle root from `proofHex` and uses `(card, salt, merklePath, root)` to verify each card belongs to the committed shuffle. |
| `proofHex` | `string` | Hex-encoded proof bundle: first 32 bytes are the Merkle root (little-endian BN256 Fr), remainder is the KZG/SHPLONK transcript. The root is never sent as a separate field; the client extracts it from here. |
| `timestamp` | `number` | Unix timestamp (seconds) at the moment the shuffle was generated. Included in the signed payload. |
| `mlDsaSignature` | `string` | Base64-encoded ML-DSA-65 signature over `proofHex_bytes \|\| timestamp_u64_le` with context `skullcard-shuffle-v1`. See [ML-DSA-KEYS.md](../ML-DSA-KEYS.md) for verification instructions and key management. |

### Proof bundle layout

```
bytes  0..31  : Merkle root, 32-byte little-endian BN256 Fr
bytes 32..end : Halo2 KZG/SHPLONK transcript (Blake2b, k=13)
```

Client-side root extraction:
```js
BigInt('0x' + proofHex.slice(0, 64).match(/../g).reverse().join('')).toString()
```

### Merkle tree

- **Hash**: Poseidon (R_F=8, R_P=56, x^5 S-box) over BN256 Fr, identical to the circuit's internal hash.
- **Leaves**: 64 (pad 52 cards to next power of 2). Positions 52-63 are `poseidon(0, 0)`.
- **Depth**: 6 levels; each path has exactly 6 steps.
- **`direction`**: `0` = our node is the left child; `1` = right child.


## Auth

Every request must carry `x-api-key: <key>` matching the `API_KEY` environment variable. Missing or wrong key → `401 Unauthorized`.

## Run locally

```bash
API_KEY=your_secret_key cargo run
```

Listens on `0.0.0.0:8080`. Override with `PORT=<n>`. Must be run from `zk/rust/` so the relative paths to `circuit/pkg/params.bin` and `circuit/pkg/vk.bin` resolve correctly. Override paths explicitly if needed:

```bash
PARAMS_PATH=/absolute/path/to/params.bin \
VK_PATH=/absolute/path/to/vk.bin \
API_KEY=your_secret_key cargo run
```


## HTTP API

### `POST /`

No request body required.

**200 OK**

```json
{
  "cards": [23, 7, 51, 0, 14, "..."],
  "salts": ["8312749182374918237491823749182374918237491823749182374918", "..."],
  "merklePaths": [
    [{ "sibling": "1234567890...", "direction": 0 }, { "sibling": "9876543210...", "direction": 1 }, "..."],
    "..."
  ],
  "proofHex": "a3f1c2...0e4d",
  "timestamp": 1700000000,
  "mlDsaSignature": "base64..."
}
```

**Errors**: `401` bad/missing key · `500` proof generation failed.

```bash
curl -sS -X POST http://127.0.0.1:8080/ -H "x-api-key: your_secret_key"
```

## Implementation notes

### Why `spawn_blocking` for proof generation

`generate_shuffle` is called inside `tokio::task::spawn_blocking` in `router.rs`. The distinction matters:

- **`spawn`** runs a future on Tokio's async worker threads. Those threads cooperatively yield at `.await` points. A CPU-bound task with no `.await` would pin the thread and starve other requests.
- **`spawn_blocking`** offloads synchronous, blocking work to a separate thread pool that Tokio manages specifically for this purpose. `generate_shuffle` is pure synchronous computation with no async I/O, so it belongs here.

The proof generation would block one of the async executor threads for its entire duration if run with `spawn`. Using `spawn_blocking` keeps the async runtime responsive. Both return a `JoinHandle` you can `.await`; the difference is which pool the work runs on.

Note: Tokio's blocking thread pool has a large default limit (~512 threads). For CPU-bound work at scale, a semaphore should be used to cap concurrency; unbounded parallel proof generation would exhaust system resources.

## Tests

### Rust unit tests (fast, no proof)

```bash
cargo test
```

Most tests call `shuffle_and_tree()` directly (shuffle + Merkle tree, no proof) and run in milliseconds. One proof-generation test is slow and `#[ignore]` by default:

```bash
cargo test proof_root_matches_tree_root -- --ignored
```

## Docker

Build and run from `rust/`. `params.bin` and `vk.bin` are copied into the image at `/app/` during the build; `PARAMS_PATH` and `VK_PATH` are set automatically.

```bash
docker build -t zk .

docker run -p 8080:8080 \
  -e API_KEY=your_secret_key \
  -e ML_DSA_SIGNING_KEY=<base64-signing-key> \
  -e ML_DSA_VERIFICATION_KEY=<base64-verification-key> \
  zk
```

## Deploy (Cloud Run)

```bash
gcloud run deploy shuffle \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars API_KEY=your_secret_key \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --concurrency 1 \
  --timeout 120
```

`--allow-unauthenticated` lets Cloud Run accept public traffic; auth is enforced by the `x-api-key` header. `--timeout 120` covers proof generation time.
