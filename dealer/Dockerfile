
FROM rust:1-bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY main.rs router.rs services.rs kms_client.rs ./
COPY circuit ./circuit

RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/dealer /usr/local/bin/dealer
COPY --from=builder /app/circuit/pkg/params.bin /app/params.bin
COPY --from=builder /app/circuit/pkg/vk.bin /app/vk.bin

ENV PORT=8080
ENV PARAMS_PATH=/app/params.bin
ENV VK_PATH=/app/vk.bin
EXPOSE 8080

CMD ["dealer"]
