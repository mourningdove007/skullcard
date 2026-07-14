use axum::{Json, Router, extract::State, http::{HeaderMap, Method, StatusCode}, routing::{get, post}};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Deserialize;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use crate::signing::Signer;

#[derive(Clone)]
struct AppState {
    api_key: String,
    signer: Arc<Signer>,
}

pub fn app() -> Router {
    let api_key = std::env::var("API_KEY").unwrap_or_default();
    assert!(
        !api_key.is_empty(),
        "API_KEY must be set to a non-empty value (an empty key disables authentication)"
    );
    let signer = Arc::new(Signer::from_env());

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET]);

    Router::new()
        .route("/sign", post(sign))
        .route("/public-key", get(public_key))
        .with_state(AppState { api_key, signer })
        .layer(cors)
}

#[derive(Deserialize)]
struct SignRequest {
    digest: String,
}

async fn sign(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<SignRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let provided = headers.get("x-api-key").and_then(|v| v.to_str().ok()).unwrap_or("");
    if provided != state.api_key {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "invalid or missing api key" })),
        ));
    }

    let bytes = B64.decode(req.digest.as_bytes()).map_err(|_| (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": "digest must be base64" })),
    ))?;

    let digest: [u8; 32] = bytes.as_slice().try_into().map_err(|_| (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": "digest must decode to exactly 32 bytes" })),
    ))?;

    let signature = state.signer.sign_digest(&digest);
    Ok(Json(serde_json::json!({
        "algorithm": "ML-DSA-65",
        "signature": signature,
    })))
}

async fn public_key(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "algorithm": "ML-DSA-65",
        "keyFormat": "raw",
        "verificationKey": state.signer.verification_key_b64(),
    }))
}
