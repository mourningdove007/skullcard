use rand::{RngCore, seq::SliceRandom, thread_rng};
use num_bigint::BigUint;
use serde::Serialize;
use light_poseidon::{Poseidon, PoseidonHasher};
use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};

const N_CARDS: usize = 52;
const N_LEAVES: usize = 64; // next power of 2 >= 52, matches merkle.js

const BN128_PRIME: &str =
    "21888242871839275222246405745257275088548364400416034343698204186575808495617";

#[derive(Debug, Serialize)]
pub struct MerklePathStep {
    pub sibling: String,
    // 0 = we are the left child (sibling is right)
    // 1 = we are the right child (sibling is left)
    pub direction: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShuffleResult {
    pub cards: Vec<u64>,
    pub salts: Vec<String>,
    pub merkle_root: String,
    /// One 6-step path per card position (0-51), matching getPath() in merkle.js.
    pub merkle_paths: Vec<Vec<MerklePathStep>>,
}

pub fn generate_shuffle() -> Result<ShuffleResult, String> {
    let mut rng = thread_rng();

    let mut cards: Vec<u64> = (0u64..52).collect();
    cards.shuffle(&mut rng);

    // 31 random bytes per salt — 248 bits, always below the BN128 prime.
    // Decimal string matches JS: BigInt('0x' + randomBytes(31).toString('hex')).toString()
    let salts: Vec<String> = (0..52)
        .map(|_| {
            let mut bytes = [0u8; 31];
            rng.fill_bytes(&mut bytes);
            BigUint::from_bytes_be(&bytes).to_string()
        })
        .collect();

    let (merkle_root, merkle_paths) = build_merkle_tree(&cards, &salts)?;

    Ok(ShuffleResult { cards, salts, merkle_root, merkle_paths })
}

fn fr_to_decimal(f: Fr) -> String {
    let bytes = f.into_bigint().to_bytes_be();
    BigUint::from_bytes_be(&bytes).to_string()
}

fn salt_to_fr(s: &str, idx: usize) -> Result<Fr, String> {
    let bytes = s
        .parse::<BigUint>()
        .map_err(|_| format!("invalid salt at index {idx}"))?
        .to_bytes_be();
    Ok(Fr::from_be_bytes_mod_order(&bytes))
}

/// Builds the Poseidon Merkle tree identical to buildTree() + getPath() in merkle.js.
fn build_merkle_tree(
    cards: &[u64],
    salts: &[String],
) -> Result<(String, Vec<Vec<MerklePathStep>>), String> {
    let mut h = Poseidon::<Fr>::new_circom(2)
        .map_err(|e| format!("Poseidon init failed: {e}"))?;

    // Padding leaf: poseidon(0, 0) — matches JS `poseidon([0n, 0n])`
    let padding = h
        .hash(&[Fr::from(0u64), Fr::from(0u64)])
        .map_err(|e| format!("padding hash failed: {e}"))?;

    // Build the 64-leaf base level
    let mut leaves: Vec<Fr> = Vec::with_capacity(N_LEAVES);
    for i in 0..N_CARDS {
        let leaf = h
            .hash(&[Fr::from(cards[i]), salt_to_fr(&salts[i], i)?])
            .map_err(|e| format!("leaf hash failed at {i}: {e}"))?;
        leaves.push(leaf);
    }
    for _ in N_CARDS..N_LEAVES {
        leaves.push(padding);
    }

    // Build all levels bottom-up (7 total: leaf level + 6 internal)
    let mut levels: Vec<Vec<Fr>> = vec![leaves];
    loop {
        let current = levels.last().unwrap();
        if current.len() == 1 {
            break;
        }
        let next = current
            .chunks(2)
            .map(|pair| h.hash(&[pair[0], pair[1]]))
            .collect::<Result<Vec<Fr>, _>>()
            .map_err(|e| format!("tree level hash failed: {e}"))?;
        levels.push(next);
    }

    let root = fr_to_decimal(*levels.last().unwrap().first().unwrap());

    // Extract a 6-step path for each of the 52 card positions, matching getPath() in merkle.js
    let paths = (0..N_CARDS)
        .map(|leaf_idx| {
            let mut path = Vec::new();
            let mut index = leaf_idx;
            for level_idx in 0..levels.len() - 1 {
                let is_right = index % 2 == 1;
                let sibling_idx = if is_right { index - 1 } else { index + 1 };
                path.push(MerklePathStep {
                    sibling: fr_to_decimal(levels[level_idx][sibling_idx]),
                    direction: u8::from(is_right),
                });
                index /= 2;
            }
            path
        })
        .collect();

    Ok((root, paths))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bn128_prime() -> BigUint {
        BN128_PRIME.parse().unwrap()
    }

    fn shuffle() -> ShuffleResult {
        generate_shuffle().expect("generate_shuffle failed")
    }

    

    #[test]
    fn cards_length_is_52() {
        assert_eq!(shuffle().cards.len(), 52);
    }

    #[test]
    fn cards_are_valid_permutation_of_0_to_51() {
        let mut sorted = shuffle().cards;
        sorted.sort_unstable();
        let expected: Vec<u64> = (0..52).collect();
        assert_eq!(sorted, expected);
    }

    #[test]
    fn salts_length_is_52() {
        assert_eq!(shuffle().salts.len(), 52);
    }

    #[test]
    fn salts_are_non_empty_decimal_strings() {
        for salt in &shuffle().salts {
            assert!(!salt.is_empty());
            assert!(salt.chars().all(|c| c.is_ascii_digit()), "non-digit in salt: {salt}");
        }
    }

    #[test]
    fn salts_are_below_bn128_prime() {
        let prime = bn128_prime();
        for salt in &shuffle().salts {
            let val: BigUint = salt.parse().unwrap();
            assert!(val < prime, "salt exceeds BN128 prime: {salt}");
        }
    }

    #[test]
    fn salts_are_nonzero() {
        let zero = BigUint::from(0u32);
        for salt in &shuffle().salts {
            assert_ne!(salt.parse::<BigUint>().unwrap(), zero);
        }
    }

    #[test]
    fn two_shuffles_produce_different_card_orders() {
        assert_ne!(shuffle().cards, shuffle().cards);
    }

    #[test]
    fn two_shuffles_produce_different_salts() {
        assert_ne!(shuffle().salts, shuffle().salts);
    }

    #[test]
    fn cards_and_salts_have_matching_length() {
        let r = shuffle();
        assert_eq!(r.cards.len(), r.salts.len());
    }

    

    #[test]
    fn merkle_root_is_decimal_string() {
        let root = &shuffle().merkle_root;
        assert!(!root.is_empty());
        assert!(root.chars().all(|c| c.is_ascii_digit()), "root not decimal: {root}");
    }

    #[test]
    fn merkle_root_is_below_bn128_prime() {
        let prime = bn128_prime();
        let root: BigUint = shuffle().merkle_root.parse().unwrap();
        assert!(root < prime);
    }

    #[test]
    fn merkle_paths_count_is_52() {
        assert_eq!(shuffle().merkle_paths.len(), 52);
    }

    #[test]
    fn each_merkle_path_has_6_steps() {
        // Tree has 7 levels (64 leaves → 32 → 16 → 8 → 4 → 2 → 1 root), so 6 steps per path
        for (i, path) in shuffle().merkle_paths.iter().enumerate() {
            assert_eq!(path.len(), 6, "path for card {i} has wrong length");
        }
    }

    #[test]
    fn path_directions_are_zero_or_one() {
        for path in &shuffle().merkle_paths {
            for step in path {
                assert!(step.direction == 0 || step.direction == 1);
            }
        }
    }

    #[test]
    fn path_siblings_are_decimal_strings() {
        for path in &shuffle().merkle_paths {
            for step in path {
                assert!(!step.sibling.is_empty());
                assert!(step.sibling.chars().all(|c| c.is_ascii_digit()),
                    "sibling not decimal: {}", step.sibling);
            }
        }
    }

    #[test]
    fn path_siblings_are_below_bn128_prime() {
        let prime = bn128_prime();
        for path in &shuffle().merkle_paths {
            for step in path {
                let val: BigUint = step.sibling.parse().unwrap();
                assert!(val < prime);
            }
        }
    }

    #[test]
    fn two_shuffles_produce_different_roots() {
        assert_ne!(shuffle().merkle_root, shuffle().merkle_root);
    }

    #[test]
    fn same_inputs_produce_same_root() {
        let cards: Vec<u64> = (0..52).collect();
        let salts: Vec<String> = (0..52).map(|i: u64| (i * 1_000_000 + 999).to_string()).collect();
        let (root1, _) = build_merkle_tree(&cards, &salts).unwrap();
        let (root2, _) = build_merkle_tree(&cards, &salts).unwrap();
        assert_eq!(root1, root2);
    }

    

    /// Recomputes the root from a leaf and its path and checks it matches.
    /// This mirrors the client-side verification the JS/circom circuit performs.
    #[test]
    fn all_merkle_paths_lead_to_root() {
        let result = shuffle();
        let mut h = Poseidon::<Fr>::new_circom(2).unwrap();

        for idx in 0..N_CARDS {
            // Recompute the leaf
            let card_fr = Fr::from(result.cards[idx]);
            let salt_fr = salt_to_fr(&result.salts[idx], idx).unwrap();
            let mut node = h.hash(&[card_fr, salt_fr]).unwrap();

            // Walk the path toward the root
            for step in &result.merkle_paths[idx] {
                let sib_bytes: BigUint = step.sibling.parse().unwrap();
                let sib_fr = Fr::from_be_bytes_mod_order(&sib_bytes.to_bytes_be());
                node = if step.direction == 0 {
                    h.hash(&[node, sib_fr]).unwrap() // we are left
                } else {
                    h.hash(&[sib_fr, node]).unwrap() // we are right
                };
            }

            assert_eq!(
                fr_to_decimal(node),
                result.merkle_root,
                "path for card at position {idx} did not reconstruct the root"
            );
        }
    }
}
