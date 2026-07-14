use base64::{engine::general_purpose::STANDARD as B64, Engine};
use sha2::{Digest, Sha256};


///



const DOMAIN_TAG: &[u8] = b"skullcard-shuffle-v1";


///


pub fn shuffle_digest(proof_bundle: &[u8], timestamp: u64) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(DOMAIN_TAG);
    hasher.update(proof_bundle);
    hasher.update(timestamp.to_le_bytes());
    let mut digest = [0u8; 32];
    digest.copy_from_slice(hasher.finalize().as_slice());
    digest
}



#[derive(Clone)]
pub struct KmsSigner {
    client: reqwest::Client,
    sign_url: String,
    api_key: String,
}

impl KmsSigner {
    
    pub fn from_env() -> Self {
        let base = std::env::var("KMS_URL").unwrap_or_else(|_| "http://kms:8080".to_string());
        let api_key = std::env::var("KMS_API_KEY").unwrap_or_default();
        // Empty key would be rejected by the kms (401 on every sign); fail fast here instead.
        assert!(
            !api_key.is_empty(),
            "KMS_API_KEY must be set to a non-empty value (used to authenticate to the kms /sign endpoint)"
        );
        let sign_url = format!("{}/sign", base.trim_end_matches('/'));
        Self { client: reqwest::Client::new(), sign_url, api_key }
    }

    
    pub async fn sign_digest(&self, digest: &[u8; 32]) -> Result<String, String> {
        let resp = self
            .client
            .post(&self.sign_url)
            .header("x-api-key", &self.api_key)
            .json(&serde_json::json!({ "digest": B64.encode(digest) }))
            .send()
            .await
            .map_err(|e| format!("kms request failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("kms returned status {}", resp.status()));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("invalid kms response: {e}"))?;

        body.get("signature")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "kms response missing 'signature'".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TIMESTAMP: u64 = 1_700_000_000;
    const BUNDLE: &[u8] = b"fake proof bundle bytes for testing";

    #[test]
    fn shuffle_digest_is_deterministic_and_32_bytes() {
        let d1 = shuffle_digest(BUNDLE, TIMESTAMP);
        let d2 = shuffle_digest(BUNDLE, TIMESTAMP);
        assert_eq!(d1, d2, "digest must be deterministic");
        assert_eq!(d1.len(), 32);
        assert_ne!(d1, shuffle_digest(BUNDLE, TIMESTAMP + 1));
        assert_ne!(d1, shuffle_digest(b"other bundle", TIMESTAMP));
    }

    #[test]
    fn digest_folds_in_the_domain_tag() {
        let with_tag = shuffle_digest(BUNDLE, TIMESTAMP);

        let mut hasher = Sha256::new();
        hasher.update(BUNDLE);
        hasher.update(TIMESTAMP.to_le_bytes());
        let mut without_tag = [0u8; 32];
        without_tag.copy_from_slice(hasher.finalize().as_slice());

        assert_ne!(with_tag, without_tag, "domain tag must be part of the hashed preimage");
    }
}
