FROM rust:1 as builder
WORKDIR /usr/src/app

# Copy manifest first for caching
COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src
RUN echo "fn main() { println!(\"dummy\"); }" > src/main.rs
RUN cargo build --release || true

# Copy source and build for release
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/app/target/release/rust_backend /usr/local/bin/rust_backend
ENV RUST_LOG=info
EXPOSE 8000
CMD ["/usr/local/bin/rust_backend"]
