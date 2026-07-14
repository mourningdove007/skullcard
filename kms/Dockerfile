FROM rust:1-bookworm AS builder
WORKDIR /app

COPY Cargo.toml ./
COPY main.rs router.rs signing.rs ./
COPY bin ./bin

RUN cargo build --release --bin kms

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/kms /usr/local/bin/kms

ENV PORT=8080
EXPOSE 8080

CMD ["kms"]
