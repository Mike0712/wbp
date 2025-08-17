FROM node:20-bookworm-slim

# тулчейн для сборки mediasoup worker
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

EXPOSE 8080