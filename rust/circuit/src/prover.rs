use std::{io::Cursor, sync::OnceLock};

use ff::{Field, PrimeField};
use halo2_proofs::{
    plonk::{create_proof, keygen_pk, keygen_vk, verify_proof, VerifyingKey},
    poly::{
        commitment::ParamsProver,
        kzg::{
            commitment::{KZGCommitmentScheme, ParamsKZG},
            multiopen::{ProverSHPLONK, VerifierSHPLONK},
            strategy::AccumulatorStrategy,
        },
        VerificationStrategy,
    },
    transcript::{
        Blake2bRead, Blake2bWrite, Challenge255, TranscriptReadBuffer, TranscriptWriterBuffer,
    },
    SerdeFormat,
};
use halo2curves::bn256::{Bn256, Fr as Fp, G1Affine};
use num_bigint::BigUint;
use rand::rngs::{OsRng, StdRng};
use rand::SeedableRng;

use crate::circuit::{DeckCircuit, N, N_LEAVES, TREE_DEPTH};
use crate::poseidon_bn256::bn256_poseidon2;

const K: u32 = 13;

/// Deterministic KZG setup seed shared by the native prover and the WASM verifier.
const KZG_SETUP_SEED: [u8; 32] = *b"skullcard-kzg-v1-fixed-000000000";

// Cached once per process/WASM session — both are pure functions of fixed inputs.
static CACHED_PARAMS: OnceLock<ParamsKZG<Bn256>> = OnceLock::new();
static CACHED_VK: OnceLock<VerifyingKey<G1Affine>> = OnceLock::new();

fn get_params() -> &'static ParamsKZG<Bn256> {
    CACHED_PARAMS.get_or_init(|| {
        ParamsKZG::<Bn256>::setup(K, StdRng::from_seed(KZG_SETUP_SEED))
    })
}

fn get_vk() -> &'static VerifyingKey<G1Affine> {
    let params = get_params();
    CACHED_VK.get_or_init(|| {
        let dummy = DeckCircuit { cards: [0u64; N], salts: [Fp::ZERO; N] };
        keygen_vk(params, &dummy).expect("keygen_vk failed")
    })
}

fn bn256_hash(a: Fp, b: Fp) -> Fp {
    bn256_poseidon2(a, b)
}

fn fp_to_decimal(f: Fp) -> String {
    BigUint::from_bytes_le(f.to_repr().as_ref()).to_string()
}

fn parse_decimal_salts(salts: &[String]) -> Result<Vec<Fp>, String> {
    salts
        .iter()
        .enumerate()
        .map(|(i, s)| {
            Fp::from_str_vartime(s)
                .ok_or_else(|| format!("salt at index {i} is not a valid BN256 field element"))
        })
        .collect()
}

fn build_bn256_tree(cards: &[u64; N], salts: &[Fp; N]) -> Vec<Vec<Fp>> {
    let leaves: Vec<Fp> = (0..N_LEAVES)
        .map(|i| {
            let (c, s) = if i < N {
                (Fp::from(cards[i]), salts[i])
            } else {
                (Fp::ZERO, Fp::ZERO)
            };
            bn256_hash(c, s)
        })
        .collect();

    let mut levels = vec![leaves];
    for _ in 0..TREE_DEPTH {
        let next: Vec<Fp> = {
            let current = levels.last().unwrap();
            current
                .chunks(2)
                .map(|p| bn256_hash(p[0], p[1]))
                .collect()
        };
        levels.push(next);
    }
    levels
}

fn merkle_root(cards: &[u64; N], salts: &[Fp; N]) -> Fp {
    *build_bn256_tree(cards, salts).last().unwrap().first().unwrap()
}

pub fn load_from_bytes(params_bytes: &[u8], vk_bytes: &[u8]) -> Result<(), String> {
    if CACHED_PARAMS.get().is_none() {
        let params = ParamsKZG::<Bn256>::read_custom(
            &mut Cursor::new(params_bytes),
            SerdeFormat::RawBytes,
        )
        .map_err(|e| format!("params deserialization failed: {e}"))?;
        let _ = CACHED_PARAMS.set(params);
    }

    if CACHED_VK.get().is_none() {
        let vk = VerifyingKey::<G1Affine>::read::<_, DeckCircuit>(
            &mut Cursor::new(vk_bytes),
            SerdeFormat::RawBytes,
        )
        .map_err(|e| format!("vk deserialization failed: {e}"))?;
        let _ = CACHED_VK.set(vk);
    }

    Ok(())
}

pub fn prove(cards: [u64; N], salts: [Fp; N]) -> Vec<u8> {
    let root = merkle_root(&cards, &salts);
    let params = get_params();
    let circuit = DeckCircuit { cards, salts };

    // Clone the cached VK — keygen_pk takes it by value, but the cache holds it for verify.
    let vk = get_vk().clone();
    let pk = keygen_pk(params, vk, &circuit).expect("keygen_pk failed");

    let mut transcript = Blake2bWrite::<_, G1Affine, Challenge255<_>>::init(vec![]);
    create_proof::<KZGCommitmentScheme<Bn256>, ProverSHPLONK<Bn256>, _, _, _, _>(
        params,
        &pk,
        &[circuit],
        &[&[&[root]]],
        OsRng,
        &mut transcript,
    )
    .expect("create_proof failed");
    let proof = transcript.finalize();

    let mut bundle = Vec::new();
    bundle.extend_from_slice(root.to_repr().as_ref());
    bundle.extend_from_slice(&proof);
    bundle
}

pub fn prove_from_decimal_salts(cards: &[u64], salts: &[String]) -> Result<Vec<u8>, String> {
    if cards.len() != N || salts.len() != N {
        return Err(format!(
            "expected {N} cards and {N} salts, got {} and {}",
            cards.len(),
            salts.len()
        ));
    }
    let cards_arr: [u64; N] = cards
        .try_into()
        .map_err(|_| "cards array conversion failed".to_string())?;
    let salts_arr: [Fp; N] = parse_decimal_salts(salts)?
        .try_into()
        .map_err(|_| "salts array conversion failed".to_string())?;
    Ok(prove(cards_arr, salts_arr))
}

pub fn tree_from_decimal_salts(
    cards: &[u64],
    salts: &[String],
) -> Result<(String, Vec<Vec<(String, u8)>>), String> {
    if cards.len() != N || salts.len() != N {
        return Err(format!(
            "expected {N} cards and {N} salts, got {} and {}",
            cards.len(),
            salts.len()
        ));
    }
    let cards_arr: [u64; N] = cards
        .try_into()
        .map_err(|_| "cards array conversion failed".to_string())?;
    let salts_arr: [Fp; N] = parse_decimal_salts(salts)?
        .try_into()
        .map_err(|_| "salts array conversion failed".to_string())?;

    let levels = build_bn256_tree(&cards_arr, &salts_arr);
    let root = fp_to_decimal(*levels.last().unwrap().first().unwrap());

    let paths = (0..N)
        .map(|leaf_idx| {
            let mut path = Vec::new();
            let mut index = leaf_idx;
            for level_idx in 0..TREE_DEPTH {
                let is_right = index % 2 == 1;
                let sibling_idx = if is_right { index - 1 } else { index + 1 };
                path.push((fp_to_decimal(levels[level_idx][sibling_idx]), u8::from(is_right)));
                index /= 2;
            }
            path
        })
        .collect();

    Ok((root, paths))
}

pub fn verify(bundle: &[u8]) -> bool {
    if bundle.len() < 32 {
        return false;
    }

    let mut root_repr = <Fp as PrimeField>::Repr::default();
    root_repr.as_mut().copy_from_slice(&bundle[0..32]);
    let root = match Option::from(Fp::from_repr(root_repr)) {
        Some(r) => r,
        None => return false,
    };
    let proof_bytes = &bundle[32..];

    let params = get_params();
    let verifier_params = params.verifier_params();
    let vk = get_vk();

    let strategy = AccumulatorStrategy::new(verifier_params);
    let mut transcript = Blake2bRead::<_, G1Affine, Challenge255<_>>::init(proof_bytes);

    match verify_proof::<KZGCommitmentScheme<Bn256>, VerifierSHPLONK<Bn256>, _, _, _>(
        verifier_params,
        vk,
        strategy,
        &[&[&[root]]],
        &mut transcript,
    ) {
        Ok(strategy) => VerificationStrategy::<_, VerifierSHPLONK<Bn256>>::finalize(strategy),
        Err(_) => false,
    }
}
