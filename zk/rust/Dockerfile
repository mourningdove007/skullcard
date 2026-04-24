# Build and run from zk/rust/:
#   docker build -t shuffle-service .
#   docker run -p 8080:8080 -e API_KEY=your_secret_key shuffle-service
#
# API_KEY is required at runtime. Do not hardcode it here.
# In Cloud Run, supply it via --set-secrets (see README).

FROM rust:1-bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY main.rs router.rs services.rs ./

RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/backend /usr/local/bin/backend

ENV PORT=8080
EXPOSE 8080

CMD ["backend"]
