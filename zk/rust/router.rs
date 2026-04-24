use axum::{Json, Router, extract::State, http::{HeaderMap, StatusCode}, routing::post};

use crate::services::{ShuffleResult, generate_shuffle};

#[derive(Clone)]
struct AppState {
    api_key: String,
}

pub fn app() -> Router {
    let api_key = std::env::var("API_KEY")
        .expect("API_KEY environment variable must be set");
    Router::new()
        .route("/", post(produce_shuffle))
        .with_state(AppState { api_key })
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

    generate_shuffle().map(Json).map_err(|e| (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({ "error": e })),
    ))
}
