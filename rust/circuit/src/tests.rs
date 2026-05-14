use ff::Field;
use halo2_proofs::{
    circuit::Value,
    dev::MockProver,
    plonk::{Circuit, ConstraintSystem},
};
use halo2curves::bn256::Fr as Fp;
use rand::seq::SliceRandom;

use crate::circuit::{DeckCircuit, N, N_LEAVES, TREE_DEPTH};
use crate::poseidon_bn256::bn256_poseidon2;
use crate::poseidon_hash::PoseidonHashCircuit;


#[test]
fn test_poseidon_primitive_hash() {
    let h1 = bn256_poseidon2(Fp::from(1u64), Fp::from(2u64));
    let h2 = bn256_poseidon2(Fp::from(1u64), Fp::from(2u64));
    assert_eq!(h1, h2, "same input must produce same hash");

    let other = bn256_poseidon2(Fp::from(3u64), Fp::from(4u64));
    assert_ne!(h1, other, "different inputs must produce different hashes");
}

#[test]
fn test_poseidon_circuit_hash() {
    let message = [Fp::from(1u64), Fp::from(2u64)];
    let output = bn256_poseidon2(message[0], message[1]);
    let circuit = PoseidonHashCircuit { message: Value::known(message), output: Value::known(output) };
    let prover = MockProver::run(6, &circuit, vec![]).unwrap();
    assert_eq!(prover.verify(), Ok(()));
}


fn merkle_root(cards: &[u64; N], salts: &[Fp; N]) -> Fp {
    let mut level: Vec<Fp> = (0..N_LEAVES)
        .map(|i| {
            let (c, s) = if i < N {
                (Fp::from(cards[i]), salts[i])
            } else {
                (Fp::ZERO, Fp::ZERO)
            };
            bn256_poseidon2(c, s)
        })
        .collect();
    for _ in 0..TREE_DEPTH {
        level = level
            .chunks(2)
            .map(|p| bn256_poseidon2(p[0], p[1]))
            .collect();
    }
    level[0]
}

fn run_deck(
    cards: [u64; N],
    salts: [Fp; N],
) -> Result<(), Vec<halo2_proofs::dev::VerifyFailure>> {
    let root = merkle_root(&cards, &salts);
    let circuit = DeckCircuit { cards, salts };
    MockProver::run(13, &circuit, vec![vec![root]])
        .expect("MockProver::run failed")
        .verify()
}

#[test]
fn test_identity_permutation() {
    let cards: [u64; N] = std::array::from_fn(|i| i as u64);
    assert!(run_deck(cards, [Fp::ZERO; N]).is_ok());
}

#[test]
fn test_shuffled_permutation() {
    let mut deck: Vec<u64> = (0..N as u64).collect();
    deck.shuffle(&mut rand::thread_rng());
    assert!(run_deck(deck.try_into().unwrap(), [Fp::ZERO; N]).is_ok());
}

#[test]
fn test_duplicate_card() {
    let mut cards: [u64; N] = std::array::from_fn(|i| i as u64);
    cards[0] = cards[1];
    assert!(run_deck(cards, [Fp::ZERO; N]).is_err());
}

#[test]
fn test_out_of_range_card() {
    let mut cards: [u64; N] = std::array::from_fn(|i| i as u64);
    cards[3] = 52;
    assert!(run_deck(cards, [Fp::ZERO; N]).is_err());
}

#[test]
fn test_wrong_root_rejected() {
    let cards: [u64; N] = std::array::from_fn(|i| i as u64);
    let circuit = DeckCircuit { cards, salts: [Fp::ZERO; N] };
    let result = MockProver::run(13, &circuit, vec![vec![Fp::from(999u64)]])
        .expect("MockProver::run failed")
        .verify();
    assert!(result.is_err());
}

#[test]
fn test_circuit_dimensions() {
    let mut cs = ConstraintSystem::<Fp>::default();
    DeckCircuit::configure(&mut cs);
    assert_eq!(cs.num_advice_columns(), 112);
}
