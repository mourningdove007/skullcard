use std::{fs, path::Path};

use ff::{Field, PrimeField};
use halo2curves::bn256::Fr as Fp;
use halo_circuit::{circuit::N, prover};
use rand::{rngs::OsRng, seq::SliceRandom};

fn main() {
    let mut deck: Vec<u64> = (0..N as u64).collect();
    deck.shuffle(&mut rand::thread_rng());
    let cards: [u64; N] = deck.try_into().unwrap();

    let salts: [Fp; N] = std::array::from_fn(|_| Fp::random(OsRng));

    println!("Proving shuffled deck (native speed)...");
    let bundle = prover::prove(cards, salts);
    println!("Bundle: {} bytes", bundle.len());

    let out = Path::new("web/fixtures");
    fs::create_dir_all(out).unwrap();

    let cards_bytes: Vec<u8> = cards.iter().map(|&c| c as u8).collect();
    fs::write(out.join("cards.bin"), &cards_bytes).unwrap();

    let mut salts_bytes = Vec::with_capacity(N * 32);
    for salt in &salts {
        salts_bytes.extend_from_slice(salt.to_repr().as_ref());
    }
    fs::write(out.join("salts.bin"), &salts_bytes).unwrap();

    fs::write(out.join("bundle.bin"), &bundle).unwrap();

    println!("Fixtures written to web/fixtures/");
    println!("  cards.bin  {} bytes", cards_bytes.len());
    println!("  salts.bin  {} bytes", salts_bytes.len());
    println!("  bundle.bin {} bytes", bundle.len());
}
