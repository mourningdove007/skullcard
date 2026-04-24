mod router;
mod services;

// 8080 when PORT is unset; Cloud Run also defaults to 8080 and then sets PORT at runtime.
const DEFAULT_PORT: &str = "8080";

#[tokio::main]
async fn main() {
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
