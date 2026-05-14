use std::{fs, path::Path};

use ff::Field;
use halo2_proofs::{plonk::keygen_vk, poly::kzg::commitment::ParamsKZG, SerdeFormat};
use halo2curves::bn256::{Bn256, Fr as Fp};
use halo_circuit::circuit::{DeckCircuit, N};
use rand::SeedableRng;
use rand::rngs::StdRng;

const K: u32 = 13;
const KZG_SETUP_SEED: [u8; 32] = *b"TRUSTED_SEED";

fn main() {
    let out_dir = std::env::args().nth(1).unwrap_or_else(|| "pkg".to_string());
    let out = Path::new(&out_dir);
    fs::create_dir_all(out).expect("failed to create output dir");

    println!("Generating KZG params (K={K}) from deterministic seed...");
    let params = ParamsKZG::<Bn256>::setup(K, StdRng::from_seed(KZG_SETUP_SEED));

    println!("Deriving verifying key...");
    let dummy = DeckCircuit { cards: [0u64; N], salts: [Fp::ZERO; N] };
    let vk = keygen_vk(&params, &dummy).expect("keygen_vk failed");

    let mut params_bytes = Vec::new();
    params
        .write_custom(&mut params_bytes, SerdeFormat::RawBytes)
        .expect("params serialization failed");
    let params_path = out.join("params.bin");
    fs::write(&params_path, &params_bytes).expect("failed to write params.bin");
    println!("params.bin: {} bytes ({:.1} KB)", params_bytes.len(), params_bytes.len() as f64 / 1024.0);

    let mut vk_bytes = Vec::new();
    vk.write(&mut vk_bytes, SerdeFormat::RawBytes)
        .expect("vk serialization failed");
    let vk_path = out.join("vk.bin");
    fs::write(&vk_path, &vk_bytes).expect("failed to write vk.bin");
    println!("vk.bin: {} bytes ({:.1} KB)", vk_bytes.len(), vk_bytes.len() as f64 / 1024.0);

    println!("\nDone. Assets written to {}/", out.display());
    println!("Place these alongside the WASM package for the verifier worker to fetch.");
}
