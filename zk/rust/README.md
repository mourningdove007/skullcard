# Shuffle service (`zk/rust`)

Axum HTTP service that generates a **cryptographically random shuffle** of a 52-card deck, matching **BN128-safe salts**, and a **Poseidon Merkle tree** over the shuffle. The Firebase `autoDeal` function calls this service at deal time so the randomness source is the Rust/OS CSPRNG rather than `Math.random()`, and the Merkle tree is ready to send directly to each player.

## What it produces

| Field | Type | Description |
|-------|------|-------------|
| `cards` | `number[52]` | A random permutation of `[0, 1, …, 51]` — each integer maps to one card (suit × 13 + value). |
| `salts` | `string[52]` | One BN128 scalar per card: 31 random bytes (248 bits) as a decimal string, always < the BN128 prime. Matches the JS `generateSalt()` format. |
| `merkleRoot` | `string` | Poseidon root of the 64-leaf commitment tree (decimal string). Equivalent to `buildTree()` → `levels[last][0]` in `merkle.js`. |
| `merklePaths` | `{ sibling: string, direction: 0\|1 }[][52]` | One 6-step Merkle path per card position. Equivalent to `getPath(tree, i)` for `i` in `0..51`. The client uses `(card, salt, merklePath, merkleRoot)` to verify their card belongs to the committed shuffle. |

### Merkle tree details

- **Hash function**: Poseidon (BN254 scalar field), compatible with `circomlibjs` — the same parameters used in `merkle.js` and the Circom circuit.
- **Leaves**: 64 (next power of 2 ≥ 52). Positions 0–51 are `poseidon(cardIndex, salt)`; positions 52–63 are `poseidon(0, 0)`.
- **Depth**: 6 levels above the leaf layer, so each path has exactly 6 steps.
- **`direction`**: `0` = our node is the left child (sibling is right); `1` = our node is the right child (sibling is left).

## Run locally

The server requires an `API_KEY` environment variable. Every request must carry the same value in an `x-api-key` header or it will receive `401 Unauthorized`.

```bash
cd zk/rust
API_KEY=your_secret_key cargo run
```

Listens on `0.0.0.0:8080`. Override with `PORT=<n>`.

## HTTP API

### `POST /`

No request body required.

**Response — 200 OK**

```json
{
  "cards": [23, 7, 51, 0, 14, "..."],
  "salts": [
    "8312749182374918237491823749182374918237491823749182374918",
    "..."
  ],
  "merkleRoot": "2365104944340454206097250202502901940622728556308771457953022163328474818711",
  "merklePaths": [
    [
      { "sibling": "1234567890...", "direction": 0 },
      { "sibling": "9876543210...", "direction": 1 },
      "..."
    ],
    "..."
  ]
}
```

**Auth**: `401 Unauthorized` if the `x-api-key` header is missing or does not match the server's `API_KEY`.

**Errors**: `500` if Poseidon initialization fails (should not occur in normal operation).

**Example**

```bash
curl -sS -X POST http://127.0.0.1:8080/ -H "x-api-key: your_secret_key"
```

## Tests

### Rust unit tests

Run without the server — all pure Rust:

```bash
cd zk/rust
cargo test
```

| Test | What it checks |
|------|----------------|
| `cards_length_is_52` | Output always contains exactly 52 cards |
| `cards_are_valid_permutation_of_0_to_51` | Sorted output equals `[0..51]` — no duplicates, no gaps |
| `salts_length_is_52` | Output always contains exactly 52 salts |
| `salts_are_non_empty_decimal_strings` | Each salt is a non-empty all-digit string |
| `salts_are_below_bn128_prime` | Every salt < BN128 prime |
| `salts_are_nonzero` | No salt is zero |
| `cards_and_salts_have_matching_length` | `cards.len() == salts.len()` |
| `two_shuffles_produce_different_card_orders` | RNG produces distinct permutations across calls |
| `two_shuffles_produce_different_salts` | RNG produces distinct salt sets across calls |
| `merkle_root_is_decimal_string` | Root is a non-empty all-digit string |
| `merkle_root_is_below_bn128_prime` | Root < BN128 prime (valid field element) |
| `merkle_paths_count_is_52` | Exactly one path per card |
| `each_merkle_path_has_6_steps` | Every path has exactly 6 steps (tree depth = log₂64) |
| `path_directions_are_zero_or_one` | All direction values are 0 or 1 |
| `path_siblings_are_decimal_strings` | All sibling hashes are non-empty decimal strings |
| `path_siblings_are_below_bn128_prime` | All sibling hashes are valid field elements |
| `two_shuffles_produce_different_roots` | RNG produces distinct roots across calls |
| `same_inputs_produce_same_root` | Tree construction is deterministic |
| `all_merkle_paths_lead_to_root` | Re-hashing each leaf up its full path reconstructs `merkleRoot` (end-to-end correctness) |

### JavaScript integration tests (cross-language compatibility)

These tests live in `zk/rust/api.test.js` and call the **live Rust server**, verifying every path and root it returns using the JS `circomlibjs` Poseidon from `zk/merkle.js` — the same library the client and Circom circuit use. A passing run guarantees the two Poseidon implementations are byte-identical.

**Requires Node 18+** (built-in `fetch`). Both commands run from `zk/rust/`.

The tests send `x-api-key` with every request. The key is read from the `API_KEY` environment variable, which must match the key the server was started with. Edit the `API_KEY` constant at the top of `api.test.js` or supply it inline.

```bash
# Terminal 1 — start the server
cd zk/rust
API_KEY=your_secret_key cargo run

# Terminal 2 — install deps (first time only), then run the JS tests
cd zk/rust
npm install
API_KEY=your_secret_key npm test
```

Override the server address with `API_URL`:

```bash
cd zk/rust
API_KEY=your_secret_key API_URL=http://0.0.0.0:9000 npm test
```

| Suite | Test | What it checks |
|-------|------|----------------|
| Response shape | `returns 52 cards` | HTTP 200 and correct array length |
| Response shape | `cards are a valid permutation of 0–51` | Sorted cards equal `[0..51]` |
| Response shape | `returns 52 salts as decimal strings` | Salts are non-empty digit-only strings |
| Response shape | `merkleRoot is a non-empty decimal string` | Root field present and numeric |
| Response shape | `merklePaths has 52 entries each with exactly 6 steps` | Correct tree depth |
| Response shape | `all path directions are 0 or 1` | Direction field is a valid bit |
| Response shape | `all sibling hashes are decimal strings` | Siblings are numeric strings |
| Response shape | `two calls produce different cards, salts, and roots` | RNG is live, not cached |
| circomlibjs compat | `JS verifyPath validates every Rust-generated Merkle path` | All 52 paths pass the JS verifier |
| circomlibjs compat | `JS buildTree produces the same merkleRoot as the Rust API` | Roots match across implementations |
| circomlibjs compat | `JS getPath on JS-built tree matches Rust merklePaths for every position` | Sibling and direction identical at every step |
| Game deal integrity | `deals 5 cards to each of 2 players; all paths verify` | Realistic deal scenario passes |
| Game deal integrity | `player 1's card does not verify against player 2's path` | Cross-deal cheating is rejected |
| Game deal integrity | `tampered card index does not verify` | Mutation of card is caught |
| Game deal integrity | `tampered salt does not verify` | Mutation of salt is caught |
| Game deal integrity | `tampered sibling hash does not verify` | Mutation of path step is caught |
| Game deal integrity | `tampered root does not verify` | Wrong root is caught |

## Docker

Build and run from `zk/rust/`. Pass `API_KEY` at runtime — never bake it into the image.

```bash
cd zk/rust
docker build -t shuffle-service .
docker run -p 8080:8080 -e API_KEY=your_secret_key shuffle-service
```
