# kms — ML-DSA-65 signing service

A small Axum microservice that holds the ML-DSA-65 keypair and signs 32-byte digests on behalf
of the [`dealer`](../dealer/) service. It is the **only** component that touches the private
signing key. The dealer never sees the key; it hashes each shuffle response locally and sends
only the resulting digest here to be signed.

```
 dealer                          kms
 ──────                          ───
 digest = SHA-256(              POST /sign  { digest }   ┌─────────────────────┐
   "skullcard-shuffle-v1"  ───────────────────────────► │ ML-DSA-65 sign      │
   || proof_bundle              x-api-key: <KMS_API_KEY> │ (empty context)     │
   || timestamp_le)                                      └─────────────────────┘
                          ◄─────────────────────────────  { signature }
```

## Why a separate service

Isolating the private key in its own process (and, in production, its own network/security
boundary) means a compromise of the proof-generating dealer does not expose the signing key.
The dealer can only ask the kms to sign digests; it can never read or exfiltrate the key.

## Configuration

All configuration is via environment variables (see [`.env.example`](.env.example)):

| Variable | Secret? | Description |
|----------|---------|-------------|
| `API_KEY` | Yes | Required as `x-api-key` on `POST /sign`. Share it only with the dealer service. |
| `ML_DSA_SIGNING_KEY` | **Yes** | Base64 ML-DSA-65 signing key. Never commit; inject as a runtime secret. |
| `ML_DSA_VERIFICATION_KEY` | No | Base64 ML-DSA-65 verification key. Public — served by `GET /public-key`. |
| `PORT` | — | Listen port. Defaults to `8080`. |

Generate a keypair with the bundled binary (run offline, once):

```bash
cargo run --bin keygen
```

See [../ML-DSA-KEYS.md](../ML-DSA-KEYS.md) for key management and rotation policy.

## HTTP API

### `POST /sign`

Signs a single 32-byte digest. **Requires** `x-api-key: <API_KEY>`.

**Request**

```json
{ "digest": "<base64-encoded 32-byte digest>" }
```

**200 OK**

```json
{ "algorithm": "ML-DSA-65", "signature": "<base64 ML-DSA-65 signature>" }
```

The signature is produced with the **empty** ML-DSA context over the exact 32 bytes provided.
Domain separation is the caller's responsibility — the dealer folds its domain tag into the
digest preimage before hashing, so this service stays a generic digest signer.

**Errors**: `401` bad/missing key · `400` digest is not base64 or does not decode to exactly 32 bytes.

```bash
curl -sS -X POST http://127.0.0.1:8081/sign \
  -H "x-api-key: your_kms_secret_key" \
  -H "content-type: application/json" \
  -d '{"digest":"'"$(head -c 32 /dev/urandom | base64)"'"}'
```

### `GET /public-key`

Returns the current ML-DSA-65 verification key. **No API key required** — the verification key
is public and clients use it to check the `mlDsaSignature` on shuffle responses.

**200 OK**

```json
{
  "algorithm": "ML-DSA-65",
  "keyFormat": "raw",
  "verificationKey": "base64..."
}
```

`keyFormat: "raw"` means `verificationKey` is the base64 of the raw ML-DSA-65 public key bytes
(directly usable by `@noble/post-quantum`).

```bash
curl -sS http://127.0.0.1:8081/public-key
```

## Run locally

```bash
API_KEY=your_kms_secret_key \
ML_DSA_SIGNING_KEY=<base64> \
ML_DSA_VERIFICATION_KEY=<base64> \
cargo run --bin kms
```

Listens on `0.0.0.0:8080` (override with `PORT`). In docker-compose it is published on host port
`8081` and reached by the dealer at `http://kms:8080`.

## Tests

```bash
cargo test
```

Unit tests cover round-trip signing/verification, digest-length rejection, and that a non-empty
context fails to verify (the KMS-compatible empty-context invariant).

## Docker

```bash
docker build -t skullcard-kms .
docker run -p 8081:8080 --env-file .env skullcard-kms
```

Usually you run this via the top-level [`docker-compose.yml`](../docker-compose.yml) alongside the
dealer, which wires `KMS_URL` and the shared `KMS_API_KEY` automatically.
