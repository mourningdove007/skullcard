mod router;
mod signing;


const DEFAULT_PORT: &str = "8080";

#[tokio::main]
async fn main() {
    
    
    let app = router::app();

    let port = std::env::var("PORT").unwrap_or_else(|_| DEFAULT_PORT.to_string());
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("failed to bind {addr}: {e}"));
    eprintln!("kms listening on http://{addr}");
    axum::serve(listener, app)
        .await
        .expect("server error");
}
