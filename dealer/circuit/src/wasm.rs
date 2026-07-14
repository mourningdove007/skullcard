use ff::{Field, PrimeField};
use halo2curves::bn256::Fr as Fp;
use rand::rngs::OsRng;
use wasm_bindgen::prelude::*;

use crate::{circuit::N, poseidon_bn256::bn256_poseidon2, prover};

#[wasm_bindgen]
pub fn prove_deck(cards: &[u8]) -> Vec<u8> {
    assert_eq!(cards.len(), N, "expected {N} card values");
    let cards_arr: [u64; N] = std::array::from_fn(|i| cards[i] as u64);
    let salts: [Fp; N] = std::array::from_fn(|_| Fp::random(OsRng));
    prover::prove(cards_arr, salts)
}

#[wasm_bindgen]
pub fn prove_deck_with_salts(cards: &[u8], salts: &[u8]) -> Vec<u8> {
    assert_eq!(cards.len(), N, "expected {N} card values");
    assert_eq!(salts.len(), N * 32, "expected {N}×32 salt bytes");
    let cards_arr: [u64; N] = std::array::from_fn(|i| cards[i] as u64);
    let salts_arr: [Fp; N] = std::array::from_fn(|i| {
        let mut repr = <Fp as PrimeField>::Repr::default();
        repr.as_mut().copy_from_slice(&salts[i * 32..(i + 1) * 32]);
        Fp::from_repr(repr).expect("invalid salt field element")
    });
    prover::prove(cards_arr, salts_arr)
}

#[wasm_bindgen]
pub fn verify_deck(bundle: &[u8]) -> bool {
    prover::verify(bundle)
}

/// Pre-load verifier params and VK from binary assets fetched by the worker,
/// so that verify_deck() needs no expensive recomputation on first call.
#[wasm_bindgen]
pub fn load_verifier_from_bytes(params_bytes: &[u8], vk_bytes: &[u8]) -> Result<(), JsValue> {
    prover::load_from_bytes(params_bytes, vk_bytes)
        .map_err(|e| JsValue::from_str(&e))
}


#[wasm_bindgen]
pub fn poseidon2(a: &[u8], b: &[u8]) -> Vec<u8> {
    assert_eq!(a.len(), 32, "a must be 32 bytes");
    assert_eq!(b.len(), 32, "b must be 32 bytes");

    let mut ra = <Fp as PrimeField>::Repr::default();
    ra.as_mut().copy_from_slice(a);
    let fa = Fp::from_repr(ra).expect("invalid field element a");

    let mut rb = <Fp as PrimeField>::Repr::default();
    rb.as_mut().copy_from_slice(b);
    let fb = Fp::from_repr(rb).expect("invalid field element b");

    let output = bn256_poseidon2(fa, fb);
    output.to_repr().as_ref().to_vec()
}
