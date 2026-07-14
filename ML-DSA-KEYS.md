# ML-DSA-65 Signing Keys

This document covers the one-time key generation, storage, and rotation policy for the ML-DSA-65 keypair used to sign every shuffle proof bundle. The keypair lives **only** in the [`kms`](kms/) signing service; the `dealer` service never holds it. It sends digests to the kms to be signed.

---

## What the signature covers

Every `/` (shuffle) response includes `mlDsaSignature`, `proofHex`, and `timestamp`. The service **hashes the payload and signs the digest**; it does not sign the raw bytes. The payload that gets hashed is:

```
"skullcard-shuffle-v1"  ||  proof_bundle_bytes  ||  timestamp_u64_le
```

where `"skullcard-shuffle-v1"` is the ASCII domain tag, `proof_bundle_bytes` is the raw bytes behind `proofHex` (the first 32 bytes of the bundle are the merkle root), and `timestamp_u64_le` is the Unix timestamp in seconds as an 8-byte little-endian integer. The dealer computes `SHA-256(payload)` (32 bytes) and the kms signs that digest with the **empty** ML-DSA context.

**Cards and salts are intentionally excluded.** Players verify the shuffle is valid by checking the proof and merkle root without needing to know the deck order.

**To verify client-side:**
1. Hex-decode `proofHex` to get `proof_bytes`
2. Encode `timestamp` as a little-endian u64 to get `ts_bytes` (8 bytes)
3. Concatenate: `payload = "skullcard-shuffle-v1" || proof_bytes || ts_bytes` (domain tag first)
4. Compute `digest = SHA-256(payload)` (32 bytes)
5. Verify `mlDsaSignature` (base64-decode first) against `digest`, **not** the raw `payload`, using the published verification key and the **empty** context

The domain tag `skullcard-shuffle-v1` lives inside the hashed payload (not the ML-DSA context) so the kms service stays a generic digest signer (empty context). All domain separation is in the preimage the dealer controls. If the bundle format ever changes incompatibly, bump the tag to `skullcard-shuffle-v2` (and rotate the key if needed, see below).

---

## Key types

| Key | Size | Secret? | Purpose |
|-----|------|---------|---------|
| Signing key (`ML_DSA_SIGNING_KEY`) | ~4 KB, base64 | Yes (never share) | Server signs proof bundles at runtime |
| Verification key (`ML_DSA_VERIFICATION_KEY`) | ~2 KB, base64 | No (publish it) | Clients verify the signature |

---

## One-time key generation (offline)

Generate the keypair **once**, on an air-gapped or trusted machine, using the `keygen` binary in the kms crate. Do **not** run this on the server or in CI.

```sh
# Build and run the keygen binary
cd kms
cargo run --bin keygen
```

This prints two lines:

```
ML_DSA_SIGNING_KEY=<base64>
ML_DSA_VERIFICATION_KEY=<base64>
```

Store them immediately:

- `ML_DSA_SIGNING_KEY`: inject as a secret environment variable into Cloud Run (or your secret manager). Never commit it to the repo.
- `ML_DSA_VERIFICATION_KEY`: store alongside the signing key, and also publish it wherever clients will retrieve it (e.g. a public endpoint, a hardcoded value in the frontend, or the whitepaper).

---

## Service startup

The **kms** service reads both variables at startup via `Signer::from_env()`. If either is missing or malformed, the process panics immediately. This is intentional: the signing service must not start without a valid keypair. (The dealer service never reads these variables.)

Required environment variables:

```
ML_DSA_SIGNING_KEY=<base64-encoded signing key>
ML_DSA_VERIFICATION_KEY=<base64-encoded verification key>
```

---

## When to rotate the keys

Rotate (generate a new keypair and redeploy) in any of these situations:

1. **Key compromise**: the signing key was exposed in logs, a config file, version control, or to an untrusted party.
2. **Domain tag bump**: if `skullcard-shuffle-v1` in `dealer/kms_client.rs` is changed to a new version due to a breaking bundle format change, issue a new keypair to make the version boundary unambiguous.
3. **Algorithm deprecation**: if ML-DSA-65 is deprecated or a vulnerability is found in the `libcrux-ml-dsa` implementation.
4. **Scheduled rotation policy**: follow your organisation's key rotation schedule (e.g. annually).

Routine server deployments, code changes unrelated to signing, and dependency bumps do **not** require key rotation.

### Rotation procedure

1. Run `cargo run --bin keygen` offline to produce a new keypair.
2. Update the secret manager / environment variable with the new `ML_DSA_SIGNING_KEY` and `ML_DSA_VERIFICATION_KEY`.
3. Publish the new verification key to any clients that hard-code it.
4. Redeploy the server with the new secrets.
5. Securely delete the old signing key from wherever it was stored.


