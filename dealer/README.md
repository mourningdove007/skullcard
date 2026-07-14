# dealer: shuffle service

Axum HTTP service that generates a random 52-card shuffle, computes a BN256 Poseidon Merkle tree,
and produces a Halo2 KZG zero-knowledge proof that the deck is a valid permutation. Each response
carries an ML-DSA-65 post-quantum signature so clients can verify it originated from this operator.

**The dealer does not hold a signing key.** It hashes each response locally into a 32-byte digest
and sends only that digest to the [`kms`](../kms/) service, which signs it and returns the
signature. The proof bundle never leaves this process and the private key never leaves the kms.

```
client ──POST /──► dealer ──shuffle+prove──► digest ──POST /sign──► kms ──► signature
                     ▲                                                         │
                     └───────────────── mlDsaSignature ◄──────────────────────┘
```

## Response

`POST /` returns six fields:

| Field | Type | Description |
|-------|------|-------------|
| `cards` | `number[52]` | Random permutation of `[0, 1, …, 51]`. Each integer encodes one card (suit × 13 + value). |
| `salts` | `string[52]` | One BN256 Fr scalar per card: 31 random bytes as a decimal string, always < the BN256 prime. |
| `merklePaths` | `{ sibling: string, direction: 0\|1 }[][52]` | One 6-step Merkle path per card position. The client extracts the Merkle root from `proofHex` and uses `(card, salt, merklePath, root)` to verify each card belongs to the committed shuffle. |
| `proofHex` | `string` | Hex-encoded proof bundle: first 32 bytes are the Merkle root (little-endian BN256 Fr), remainder is the KZG/SHPLONK transcript. The root is never sent as a separate field; the client extracts it from here. |
| `timestamp` | `number` | Unix timestamp (seconds) at the moment the shuffle was generated. Included in the signed payload. |
| `mlDsaSignature` | `string` | Base64-encoded ML-DSA-65 signature over `SHA256("skullcard-shuffle-v1" \|\| proofHex_bytes \|\| timestamp_u64_le)`. The domain-tagged payload is hashed first, then the 32-byte digest is signed (by the kms service) with the **empty** ML-DSA context. See [ML-DSA-KEYS.md](../ML-DSA-KEYS.md). |

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


## ML-DSA signature: hash then sign

The dealer **hashes the payload, then has the digest signed**; it never signs the raw response
bytes, and never signs anything itself. Producing the `mlDsaSignature` field:

1. Build the payload `"skullcard-shuffle-v1" || proofHex_bytes || timestamp_u64_le`: the domain tag `skullcard-shuffle-v1` (ASCII), then the proof bundle, then the 8-byte little-endian timestamp.
2. Compute `digest = SHA-256(payload)` (32 bytes).
3. Send `digest` to the kms service (`POST /sign`), which returns an ML-DSA-65 signature over it with the **empty** context.

To verify, a client repeats steps 1-2 to recompute the digest, then checks the signature **against
that digest** (not the raw payload), using the **empty** context and the public verification key
from the kms service's [`GET /public-key`](../kms/README.md#get-public-key).

> The domain tag `skullcard-shuffle-v1` is folded into the hashed payload rather than passed as the
> ML-DSA context. This keeps the kms service a generic digest signer (empty context); all
> domain separation lives in the preimage the dealer controls.

**Why hash then sign?** It decouples the multi-kilobyte proof bundle from the signing operation;
only a fixed 32-byte digest ever crosses the wire to the kms. The proof bundle never leaves the
dealer process, and the signing key never leaves the kms.

> Note: SHA-256 gives 128-bit collision resistance. That is fine for this use, but is below
> ML-DSA-65's ~192-bit target; bump to SHA-384/512 if you want the pre-hash to match the
> signature's security level (this changes the wire format and all verifiers).

The verification key clients need is published by the kms service, not the dealer. See
[`kms/README.md`](../kms/README.md) and [ML-DSA-KEYS.md](../ML-DSA-KEYS.md) for key management.

## Auth

Every request must carry `x-api-key: <key>` matching the `API_KEY` environment variable. Missing or
wrong key → `401 Unauthorized`.

To reach the kms service the dealer also needs:

| Variable | Description |
|----------|-------------|
| `KMS_URL` | Base URL of the kms service. Defaults to `http://kms:8080` (the compose service name). |
| `KMS_API_KEY` | Sent as `x-api-key` to the kms `/sign` endpoint; must match the kms's `API_KEY`. |

## Run locally

The dealer needs a running kms service to sign responses. Start the kms first (see
[`kms/README.md`](../kms/README.md)), then:

```bash
API_KEY=your_secret_key \
KMS_URL=http://127.0.0.1:8081 \
KMS_API_KEY=your_kms_secret_key \
cargo run
```

Listens on `0.0.0.0:8080`. Override with `PORT=<n>`. Must be run from `dealer/` so the relative
paths to `circuit/pkg/params.bin` and `circuit/pkg/vk.bin` resolve correctly. Override paths
explicitly if needed:

```bash
PARAMS_PATH=/absolute/path/to/params.bin \
VK_PATH=/absolute/path/to/vk.bin \
API_KEY=your_secret_key KMS_API_KEY=your_kms_secret_key cargo run
```

Running both services together is easiest with the top-level
[`docker-compose.yml`](../docker-compose.yml).


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

**Errors**: `401` bad/missing key · `500` proof generation failed · `502` the kms service was
unreachable or refused to sign.

```bash
curl -sS -X POST http://127.0.0.1:8080/ -H "x-api-key: your_secret_key"
```

> The public verification key is served by the **kms** service at `GET /public-key`, not by the
> dealer. See [`kms/README.md`](../kms/README.md#get-public-key).

## Implementation notes

### Why `spawn_blocking` for proof generation

`generate_shuffle` is called inside `tokio::task::spawn_blocking` in `router.rs`. The distinction matters:

- **`spawn`** runs a future on Tokio's async worker threads. Those threads cooperatively yield at `.await` points. A CPU-bound task with no `.await` would pin the thread and starve other requests.
- **`spawn_blocking`** offloads synchronous, blocking work to a separate thread pool that Tokio manages specifically for this purpose. `generate_shuffle` is pure synchronous computation with no async I/O, so it belongs here.

The proof generation would block one of the async executor threads for its entire duration if run
with `spawn`. Using `spawn_blocking` keeps the async runtime responsive. Once the (blocking) proof
is done, the router computes the digest and `await`s the async HTTP call to the kms to sign it.

Note: Tokio's blocking thread pool has a large default limit (~512 threads). For CPU-bound work at
scale, a semaphore should be used to cap concurrency; unbounded parallel proof generation would
exhaust system resources.

## Tests

### Rust unit tests (fast, no proof)

```bash
cargo test
```

Most tests call `shuffle_and_tree()` directly (shuffle + Merkle tree, no proof) and run in
milliseconds. `kms_client` tests cover the domain-tagged digest. One proof-generation test is slow
and `#[ignore]` by default:

```bash
cargo test proof_root_matches_tree_root -- --ignored
```

The end-to-end signature check spans both services and lives in the JS integration suite
(`../integration.test.js`).

## Docker

Build and run both services together with the top-level [`docker-compose.yml`](../docker-compose.yml):

```bash
cd ..
cp .env.example .env
docker compose up --build
```

This starts `kms` (published on host `8081`) and `dealer` (host `8080`), wiring `KMS_URL` and the
shared `KMS_API_KEY` automatically. To build just the dealer image:

```bash
docker build -t dealer .
```

`params.bin` and `vk.bin` are copied into the image at `/app/` during the build; `PARAMS_PATH` and
`VK_PATH` are set automatically.

## Deploy (Cloud Run)

Deploy the dealer and kms as **two** Cloud Run services. The dealer's `KMS_URL` points at the kms
service's URL, and both share `KMS_API_KEY`.

```bash
gcloud run deploy dealer \
  --source ./dealer \
  --region us-central1 \
  --allow-unauthenticated \
  --env-vars-file .env.yaml \
  --port 8080 \
  --memory 4Gi \
  --cpu 4 \
  --concurrency 1 \
  --timeout 120
```

`--allow-unauthenticated` lets Cloud Run accept public traffic; auth is enforced by the `x-api-key`
header. `--timeout 120` covers proof generation time. Deploy the kms similarly (see
[`kms/README.md`](../kms/README.md)); it can be locked down so only the dealer may reach `/sign`.
