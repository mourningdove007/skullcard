use rand::{RngCore, seq::SliceRandom, thread_rng};
use num_bigint::BigUint;
use serde::Serialize;
use halo_circuit::prover::{tree_from_decimal_salts, prove_from_decimal_salts};
use crate::signing::ShuffleSigner;

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
    pub merkle_paths: Vec<Vec<MerklePathStep>>,
    pub proof_hex: String,
    pub timestamp: u64,
    pub ml_dsa_signature: String,
}


fn shuffle_and_tree() -> Result<(Vec<u64>, Vec<String>, String, Vec<Vec<MerklePathStep>>), String> {
    let mut rng = thread_rng();

    let mut cards: Vec<u64> = (0..52).collect();
    cards.shuffle(&mut rng);

    let salts: Vec<String> = (0..52)
        .map(|_| {
            let mut bytes = [0u8; 31];
            rng.fill_bytes(&mut bytes);
            BigUint::from_bytes_be(&bytes).to_string()
        })
        .collect();

    let (root, raw_paths) = tree_from_decimal_salts(&cards, &salts)?;
    let merkle_paths = raw_paths
        .into_iter()
        .map(|path| {
            path.into_iter()
                .map(|(sibling, direction)| MerklePathStep { sibling, direction })
                .collect()
        })
        .collect();

    Ok((cards, salts, root, merkle_paths))
}

pub fn generate_shuffle(signer: &ShuffleSigner) -> Result<ShuffleResult, String> {
    let (cards, salts, _tree_root, merkle_paths) = shuffle_and_tree()?;

    let bundle = prove_from_decimal_salts(&cards, &salts)?;
    let proof_hex: String = bundle.iter().map(|b| format!("{b:02x}")).collect();

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock before epoch")
        .as_secs();

    let ml_dsa_signature = signer.sign_shuffle(&bundle, timestamp);

    Ok(ShuffleResult { cards, salts, merkle_paths, proof_hex, timestamp, ml_dsa_signature })
}

#[cfg(test)]
mod tests {
    use super::*;

    const BN128_PRIME: &str =
        "21888242871839275222246405745257275088548364400416034343698204186575808495617";

    fn bn128_prime() -> BigUint {
        BN128_PRIME.parse().unwrap()
    }

    /// Fast shuffle: cards + salts + Pallas tree, no proof.
    fn fast_shuffle() -> (Vec<u64>, Vec<String>, String, Vec<Vec<MerklePathStep>>) {
        shuffle_and_tree().expect("shuffle_and_tree failed")
    }

    #[test]
    fn cards_length_is_52() {
        let (cards, _, _, _) = fast_shuffle();
        assert_eq!(cards.len(), 52);
    }

    #[test]
    fn cards_are_valid_permutation_of_0_to_51() {
        let (mut cards, _, _, _) = fast_shuffle();
        cards.sort_unstable();
        let expected: Vec<u64> = (0..52).collect();
        assert_eq!(cards, expected);
    }

    #[test]
    fn salts_length_is_52() {
        let (_, salts, _, _) = fast_shuffle();
        assert_eq!(salts.len(), 52);
    }

    #[test]
    fn salts_are_non_empty_decimal_strings() {
        let (_, salts, _, _) = fast_shuffle();
        for salt in &salts {
            assert!(!salt.is_empty());
            assert!(salt.chars().all(|c| c.is_ascii_digit()), "non-digit in salt: {salt}");
        }
    }

    #[test]
    fn salts_are_below_bn128_prime() {
        let prime = bn128_prime();
        let (_, salts, _, _) = fast_shuffle();
        for salt in &salts {
            let val: BigUint = salt.parse().unwrap();
            assert!(val < prime, "salt exceeds BN128 prime: {salt}");
        }
    }

    #[test]
    fn salts_are_nonzero() {
        let zero = BigUint::from(0u32);
        let (_, salts, _, _) = fast_shuffle();
        for salt in &salts {
            assert_ne!(salt.parse::<BigUint>().unwrap(), zero);
        }
    }

    #[test]
    fn two_shuffles_produce_different_card_orders() {
        let (cards1, _, _, _) = fast_shuffle();
        let (cards2, _, _, _) = fast_shuffle();
        assert_ne!(cards1, cards2);
    }

    #[test]
    fn two_shuffles_produce_different_salts() {
        let (_, salts1, _, _) = fast_shuffle();
        let (_, salts2, _, _) = fast_shuffle();
        assert_ne!(salts1, salts2);
    }

    #[test]
    fn cards_and_salts_have_matching_length() {
        let (cards, salts, _, _) = fast_shuffle();
        assert_eq!(cards.len(), salts.len());
    }

    #[test]
    fn merkle_root_is_decimal_string() {
        let (_, _, root, _) = fast_shuffle();
        assert!(!root.is_empty());
        assert!(root.chars().all(|c| c.is_ascii_digit()), "root not decimal: {root}");
    }

    #[test]
    fn merkle_root_is_below_bn256_prime() {
        let prime = bn128_prime();
        let (_, _, root, _) = fast_shuffle();
        let val: BigUint = root.parse().unwrap();
        assert!(val < prime);
    }

    #[test]
    fn merkle_paths_count_is_52() {
        let (_, _, _, paths) = fast_shuffle();
        assert_eq!(paths.len(), 52);
    }

    #[test]
    fn each_merkle_path_has_6_steps() {
        let (_, _, _, paths) = fast_shuffle();
        for (i, path) in paths.iter().enumerate() {
            assert_eq!(path.len(), 6, "path for card {i} has wrong length");
        }
    }

    #[test]
    fn path_directions_are_zero_or_one() {
        let (_, _, _, paths) = fast_shuffle();
        for path in &paths {
            for step in path {
                assert!(step.direction == 0 || step.direction == 1);
            }
        }
    }

    #[test]
    fn path_siblings_are_decimal_strings() {
        let (_, _, _, paths) = fast_shuffle();
        for path in &paths {
            for step in path {
                assert!(!step.sibling.is_empty());
                assert!(
                    step.sibling.chars().all(|c| c.is_ascii_digit()),
                    "sibling not decimal: {}",
                    step.sibling
                );
            }
        }
    }

    #[test]
    fn path_siblings_are_below_bn256_prime() {
        let prime = bn128_prime();
        let (_, _, _, paths) = fast_shuffle();
        for path in &paths {
            for step in path {
                let val: BigUint = step.sibling.parse().unwrap();
                assert!(val < prime);
            }
        }
    }

    #[test]
    fn two_shuffles_produce_different_roots() {
        let (_, _, root1, _) = fast_shuffle();
        let (_, _, root2, _) = fast_shuffle();
        assert_ne!(root1, root2);
    }

    #[test]
    fn same_inputs_produce_same_root() {
        let cards: Vec<u64> = (0..52).collect();
        let salts: Vec<String> = (0..52).map(|i: u64| (i * 1_000_000 + 999).to_string()).collect();
        let (root1, _) = tree_from_decimal_salts(&cards, &salts).unwrap();
        let (root2, _) = tree_from_decimal_salts(&cards, &salts).unwrap();
        assert_eq!(root1, root2);
    }

    #[test]
    #[ignore = "slow: halo2 proof generation takes ~30s"]
    fn proof_root_matches_tree_root() {
        let signer = ShuffleSigner::from_env();
        let result = generate_shuffle(&signer).expect("generate_shuffle failed");
        let bundle: Vec<u8> = (0..result.proof_hex.len() / 2)
            .map(|i| u8::from_str_radix(&result.proof_hex[i * 2..i * 2 + 2], 16).unwrap())
            .collect();
        let bundle_root = BigUint::from_bytes_le(&bundle[..32]).to_string();
        let (tree_root, _) = tree_from_decimal_salts(&result.cards, &result.salts).unwrap();
        assert_eq!(bundle_root, tree_root);
    }

    #[test]
    #[ignore = "slow: halo2 proof generation takes ~30s"]
    fn shuffle_result_timestamp_is_recent() {
        let (signer, _) = ShuffleSigner::for_test();
        let before = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let result = generate_shuffle(&signer).expect("generate_shuffle failed");
        let after = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert!(result.timestamp >= before, "timestamp predates the shuffle call");
        assert!(result.timestamp <= after, "timestamp is in the future");
    }

    #[test]
    #[ignore = "slow: halo2 proof generation takes ~30s"]
    fn shuffle_result_signature_verifies() {
        use libcrux_ml_dsa::ml_dsa_65::{self as mldsa, MLDSA65Signature, MLDSA65VerificationKey};
        use base64::{engine::general_purpose::STANDARD as B64, Engine};

        let (signer, vk_bytes) = ShuffleSigner::for_test();
        let result = generate_shuffle(&signer).expect("generate_shuffle failed");

        let bundle: Vec<u8> = (0..result.proof_hex.len() / 2)
            .map(|i| u8::from_str_radix(&result.proof_hex[i * 2..i * 2 + 2], 16).unwrap())
            .collect();

        let mut payload = bundle.clone();
        payload.extend_from_slice(&result.timestamp.to_le_bytes());

        let vk = MLDSA65VerificationKey::new(vk_bytes.as_slice().try_into().unwrap());
        let sig_bytes = B64.decode(&result.ml_dsa_signature).unwrap();
        let signature = MLDSA65Signature::new(sig_bytes.as_slice().try_into().unwrap());

        assert!(
            mldsa::verify(&vk, &payload, b"skullcard-shuffle-v1", &signature).is_ok(),
            "shuffle result signature failed verification"
        );
    }
}
