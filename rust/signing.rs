use libcrux_ml_dsa::ml_dsa_65::{self, MLDSA65Signature, MLDSA65SigningKey, MLDSA65VerificationKey};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::{RngCore, rngs::OsRng};

pub struct ShuffleSigner {
    signing_key: MLDSA65SigningKey,
    pub verification_key_b64: String,
}

impl ShuffleSigner {
    pub fn from_env() -> Self {
        let sk_b64 = std::env::var("ML_DSA_SIGNING_KEY")
            .expect("ML_DSA_SIGNING_KEY not set");
        let vk_b64 = std::env::var("ML_DSA_VERIFICATION_KEY")
            .expect("ML_DSA_VERIFICATION_KEY not set");

        let sk_bytes = B64.decode(&sk_b64).expect("invalid base64 signing key");
        let signing_key = MLDSA65SigningKey::new(
            sk_bytes.as_slice().try_into().expect("invalid ML-DSA-65 signing key bytes"),
        );

        Self { signing_key, verification_key_b64: vk_b64 }
    }

    #[cfg(test)]
    pub fn for_test() -> (Self, Vec<u8>) {
        let mut randomness = [0u8; 32];
        OsRng.fill_bytes(&mut randomness);
        let keypair = ml_dsa_65::generate_key_pair(randomness);

        let vk_bytes = keypair.verification_key.as_slice().to_vec();
        let vk_b64 = B64.encode(&vk_bytes);
        (Self { signing_key: keypair.signing_key, verification_key_b64: vk_b64 }, vk_bytes)
    }

    
    pub fn sign_shuffle(&self, proof_bundle: &[u8], timestamp: u64) -> String {
        let mut payload = proof_bundle.to_vec();
        payload.extend_from_slice(&timestamp.to_le_bytes());

        let mut randomness = [0u8; 32];
        OsRng.fill_bytes(&mut randomness);

        let context = b"skullcard-shuffle-v1";
        B64.encode(
            ml_dsa_65::sign(&self.signing_key, &payload, context, randomness)
                .expect("ML-DSA signing failed")
                .as_slice(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TIMESTAMP: u64 = 1_700_000_000;
    const BUNDLE: &[u8] = b"fake proof bundle bytes for testing";
    const CONTEXT: &[u8] = b"skullcard-shuffle-v1";

    fn build_payload(bundle: &[u8], timestamp: u64) -> Vec<u8> {
        let mut p = bundle.to_vec();
        p.extend_from_slice(&timestamp.to_le_bytes());
        p
    }

    fn decode_sig(sig_b64: &str) -> MLDSA65Signature {
        let bytes = B64.decode(sig_b64).expect("signature is not valid base64");
        MLDSA65Signature::new(bytes.as_slice().try_into().expect("unexpected signature byte length"))
    }

    fn decode_vk(vk_bytes: &[u8]) -> MLDSA65VerificationKey {
        MLDSA65VerificationKey::new(vk_bytes.try_into().expect("unexpected verification key byte length"))
    }

    #[test]
    fn sign_shuffle_produces_valid_base64() {
        let (signer, _) = ShuffleSigner::for_test();
        let sig = signer.sign_shuffle(BUNDLE, TIMESTAMP);
        assert!(!sig.is_empty());
        assert!(B64.decode(&sig).is_ok());
    }

    #[test]
    fn signature_decodes_to_ml_dsa_65_byte_length() {
        let (signer, _) = ShuffleSigner::for_test();
        let sig = signer.sign_shuffle(BUNDLE, TIMESTAMP);
        let bytes = B64.decode(&sig).unwrap();
        assert_eq!(bytes.len(), 3309);
    }

    #[test]
    fn signature_verifies_against_correct_payload() {
        let (signer, vk_bytes) = ShuffleSigner::for_test();
        let sig_b64 = signer.sign_shuffle(BUNDLE, TIMESTAMP);

        let payload = build_payload(BUNDLE, TIMESTAMP);
        let result = ml_dsa_65::verify(&decode_vk(&vk_bytes), &payload, CONTEXT, &decode_sig(&sig_b64));
        assert!(result.is_ok(), "valid payload should verify");
    }

    #[test]
    fn tampered_bundle_fails_verification() {
        let (signer, vk_bytes) = ShuffleSigner::for_test();
        let sig_b64 = signer.sign_shuffle(BUNDLE, TIMESTAMP);

        let tampered = build_payload(b"tampered proof bytes", TIMESTAMP);
        let result = ml_dsa_65::verify(&decode_vk(&vk_bytes), &tampered, CONTEXT, &decode_sig(&sig_b64));
        assert!(result.is_err(), "tampered bundle should fail verification");
    }

    #[test]
    fn tampered_timestamp_fails_verification() {
        let (signer, vk_bytes) = ShuffleSigner::for_test();
        let sig_b64 = signer.sign_shuffle(BUNDLE, TIMESTAMP);

        let tampered = build_payload(BUNDLE, TIMESTAMP + 1);
        let result = ml_dsa_65::verify(&decode_vk(&vk_bytes), &tampered, CONTEXT, &decode_sig(&sig_b64));
        assert!(result.is_err(), "tampered timestamp should fail verification");
    }

    #[test]
    fn wrong_context_fails_verification() {
        let (signer, vk_bytes) = ShuffleSigner::for_test();
        let sig_b64 = signer.sign_shuffle(BUNDLE, TIMESTAMP);

        let payload = build_payload(BUNDLE, TIMESTAMP);
        let result = ml_dsa_65::verify(&decode_vk(&vk_bytes), &payload, b"skullcard-shuffle-v2", &decode_sig(&sig_b64));
        assert!(result.is_err(), "wrong context string should fail verification");
    }
}
