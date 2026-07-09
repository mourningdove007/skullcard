# Shuffle service

Axum HTTP service that generates a random 52-card shuffle, computes a BN256 Poseidon Merkle tree, produces a Halo2 KZG zero-knowledge proof that the deck is a valid permutation, and signs the proof bundle with an ML-DSA-65 post-quantum signature so clients can verify the response originated from this service.


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


## ML-DSA Signature Verification

The `mlDsaSignature` field in every response is an ML-DSA-65 signature over `proofHex_bytes || timestamp_u64_le` with context string `skullcard-shuffle-v1`. Clients can verify it against the public verification key below.

**ML-DSA-65 Verification Key (Base64)**

```
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
4GZ27TFkq+rHBx4QW3X3ub0=
```

See [ML-DSA-KEYS.md](../ML-DSA-KEYS.md) for full key management details and multi-language verification examples.

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

### Using an env file

Instead of repeating `-e` flags, keep the variables in a `.env` file and pass it with `--env-file`. Copy the checked-in template and fill in real values:

```bash
cp .env.example .env
# edit .env with your API_KEY and ML-DSA keys

docker build -t zk .
docker run -p 8080:8080 --env-file .env zk
```

`.env` uses **dotenv** format (`KEY=value`, one per line, no quotes) and is gitignored — only `.env.example` is committed. Note this is a different format from Cloud Run's `--env-vars-file .env.yaml`, which is YAML (`KEY: value`); the two files are not interchangeable.

## Deploy (Cloud Run)

```bash
gcloud run deploy shuffle \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --env-vars-file .env.yaml \
  --port 8080 \
  --memory 4Gi \
  --cpu 4 \
  --concurrency 1 \
  --timeout 120
```

`--allow-unauthenticated` lets Cloud Run accept public traffic; auth is enforced by the `x-api-key` header. `--timeout 120` covers proof generation time.
