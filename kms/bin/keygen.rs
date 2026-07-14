use libcrux_ml_dsa::ml_dsa_65;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::{RngCore, rngs::OsRng};

fn main() {
    let mut randomness = [0u8; 32];
    OsRng.fill_bytes(&mut randomness);
    let keypair = ml_dsa_65::generate_key_pair(randomness);
    println!("ML_DSA_SIGNING_KEY={}", B64.encode(keypair.signing_key.as_slice()));
    println!("ML_DSA_VERIFICATION_KEY={}", B64.encode(keypair.verification_key.as_slice()));
}
