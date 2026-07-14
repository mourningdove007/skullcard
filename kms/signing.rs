use libcrux_ml_dsa::ml_dsa_65::{self, MLDSA65SigningKey};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::{RngCore, rngs::OsRng};


const EMPTY_CONTEXT: &[u8] = b"";

pub struct Signer {
    signing_key: MLDSA65SigningKey,
    
    verification_key: String,
}

impl Signer {
    
    pub fn from_env() -> Self {
        let sk_b64 = std::env::var("ML_DSA_SIGNING_KEY").expect("ML_DSA_SIGNING_KEY not set");
        let vk_b64 = std::env::var("ML_DSA_VERIFICATION_KEY").expect("ML_DSA_VERIFICATION_KEY not set");

        let sk_bytes = B64.decode(&sk_b64).expect("invalid base64 signing key");
        let signing_key = MLDSA65SigningKey::new(
            sk_bytes.as_slice().try_into().expect("invalid ML-DSA-65 signing key bytes"),
        );

        Self { signing_key, verification_key: vk_b64 }
    }

    #[cfg(test)]
    pub fn for_test() -> (Self, Vec<u8>) {
        let mut randomness = [0u8; 32];
        OsRng.fill_bytes(&mut randomness);
        let keypair = ml_dsa_65::generate_key_pair(randomness);

        let vk_bytes = keypair.verification_key.as_slice().to_vec();
        let vk_b64 = B64.encode(&vk_bytes);
        (Self { signing_key: keypair.signing_key, verification_key: vk_b64 }, vk_bytes)
    }

    pub fn verification_key_b64(&self) -> &str {
        &self.verification_key
    }

    
    pub fn sign_digest(&self, digest: &[u8; 32]) -> String {
        let mut randomness = [0u8; 32];
        OsRng.fill_bytes(&mut randomness);

        B64.encode(
            ml_dsa_65::sign(&self.signing_key, digest, EMPTY_CONTEXT, randomness)
                .expect("ML-DSA signing failed")
                .as_slice(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use libcrux_ml_dsa::ml_dsa_65::{MLDSA65Signature, MLDSA65VerificationKey};

    const DIGEST: [u8; 32] = [7u8; 32];

    fn decode_sig(sig_b64: &str) -> MLDSA65Signature {
        let bytes = B64.decode(sig_b64).expect("signature is not valid base64");
        MLDSA65Signature::new(bytes.as_slice().try_into().expect("unexpected signature byte length"))
    }

    fn decode_vk(vk_bytes: &[u8]) -> MLDSA65VerificationKey {
        MLDSA65VerificationKey::new(vk_bytes.try_into().expect("unexpected verification key byte length"))
    }

    #[test]
    fn sign_digest_produces_valid_base64() {
        let (signer, _) = Signer::for_test();
        let sig = signer.sign_digest(&DIGEST);
        assert!(!sig.is_empty());
        assert!(B64.decode(&sig).is_ok());
    }

    #[test]
    fn signature_decodes_to_ml_dsa_65_byte_length() {
        let (signer, _) = Signer::for_test();
        let sig = signer.sign_digest(&DIGEST);
        assert_eq!(B64.decode(&sig).unwrap().len(), 3309);
    }

    #[test]
    fn signature_verifies_against_the_digest() {
        let (signer, vk_bytes) = Signer::for_test();
        let sig = signer.sign_digest(&DIGEST);
        let result = ml_dsa_65::verify(&decode_vk(&vk_bytes), &DIGEST, EMPTY_CONTEXT, &decode_sig(&sig));
        assert!(result.is_ok(), "signature must verify against the signed digest");
    }

    #[test]
    fn signature_fails_against_a_different_digest() {
        let (signer, vk_bytes) = Signer::for_test();
        let sig = signer.sign_digest(&DIGEST);
        let other = [9u8; 32];
        let result = ml_dsa_65::verify(&decode_vk(&vk_bytes), &other, EMPTY_CONTEXT, &decode_sig(&sig));
        assert!(result.is_err(), "signature must not verify against a different digest");
    }

    #[test]
    fn nonempty_context_fails_verification() {
        let (signer, vk_bytes) = Signer::for_test();
        let sig = signer.sign_digest(&DIGEST);
        let result = ml_dsa_65::verify(&decode_vk(&vk_bytes), &DIGEST, b"nonempty", &decode_sig(&sig));
        assert!(result.is_err(), "a non-empty context must fail verification");
    }
}
