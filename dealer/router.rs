use axum::{Json, Router, extract::State, http::{HeaderMap, StatusCode}, routing::post};
use std::sync::Arc;

use crate::kms_client::{KmsSigner, shuffle_digest};
use crate::services::{ShuffleResult, generate_shuffle};

#[derive(Clone)]
struct AppState {
    api_key: String,
    signer: Arc<KmsSigner>,
}

pub fn app() -> Router {
    let api_key = std::env::var("API_KEY").unwrap_or_default();
    
    assert!(
        !api_key.is_empty(),
        "API_KEY must be set to a non-empty value (an empty key disables authentication)"
    );
    let signer = Arc::new(KmsSigner::from_env());
    Router::new()
        .route("/", post(produce_shuffle))
        .with_state(AppState { api_key, signer })
}

async fn produce_shuffle(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ShuffleResult>, (StatusCode, Json<serde_json::Value>)> {
    let provided = headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if provided != state.api_key {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "invalid or missing api key" })),
        ));
    }

    
    let unsigned = tokio::task::spawn_blocking(generate_shuffle)
        .await
        .map_err(|_| (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "prover task panicked" })),
        ))?
        .map_err(|e| (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        ))?;

    
    let digest = shuffle_digest(&unsigned.bundle, unsigned.timestamp);
    let ml_dsa_signature = state.signer.sign_digest(&digest).await.map_err(|e| (
        StatusCode::BAD_GATEWAY,
        Json(serde_json::json!({ "error": format!("signing failed.") })),
    ))?;

    Ok(Json(ShuffleResult {
        cards: unsigned.cards,
        salts: unsigned.salts,
        merkle_paths: unsigned.merkle_paths,
        proof_hex: unsigned.proof_hex,
        timestamp: unsigned.timestamp,
        ml_dsa_signature,
    }))
}
