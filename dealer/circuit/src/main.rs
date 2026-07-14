use ff::Field;
use halo2curves::bn256::Fr as Fp;
use halo_circuit::{prover, N};
use rand::{rngs::OsRng, seq::SliceRandom};

fn main() {
    let mut deck: Vec<u64> = (0..N as u64).collect();
    deck.shuffle(&mut rand::thread_rng());
    let cards: [u64; N] = deck.try_into().unwrap();
    let salts: [Fp; N] = std::array::from_fn(|_| Fp::random(OsRng));

    println!("Deck: {:?}", cards);
    println!("Proving...");

    let bundle = prover::prove(cards, salts);
    println!("Proof bundle: {} bytes", bundle.len());

    let valid = prover::verify(&bundle);
    println!("{}", if valid { "Verified!" } else { "Proof FAILED" });
}
