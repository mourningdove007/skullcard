mod router;
mod services;

// 8080 when PORT is unset; Cloud Run also defaults to 8080 and then sets PORT at runtime.
const DEFAULT_PORT: &str = "8080";

// Defaults match the output path of `cargo run --bin gen_verifier_assets`.
const DEFAULT_PARAMS_PATH: &str = "circuit/pkg/params.bin";
const DEFAULT_VK_PATH: &str = "circuit/pkg/vk.bin";

#[tokio::main]
async fn main() {
    let params_path = std::env::var("PARAMS_PATH").unwrap_or_else(|_| DEFAULT_PARAMS_PATH.to_string());
    let vk_path = std::env::var("VK_PATH").unwrap_or_else(|_| DEFAULT_VK_PATH.to_string());

    let params_bytes = std::fs::read(&params_path)
        .unwrap_or_else(|e| panic!("failed to read {params_path}: {e}"));
    let vk_bytes = std::fs::read(&vk_path)
        .unwrap_or_else(|e| panic!("failed to read {vk_path}: {e}"));

    halo_circuit::prover::load_from_bytes(&params_bytes, &vk_bytes)
        .unwrap_or_else(|e| panic!("failed to load verifier assets: {e}"));

    eprintln!("KZG params and VK loaded from {params_path} + {vk_path}");

    let port = std::env::var("PORT").unwrap_or_else(|_| DEFAULT_PORT.to_string());
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("failed to bind {addr}: {e}"));
    eprintln!("listening on http://{addr}");
    axum::serve(listener, router::app())
        .await
        .expect("server error");
}
