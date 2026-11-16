FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    ripgrep \
    tar \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g opencode-ai@dev @agentplugins/cli@0.6.1 --no-audit --no-fund \
  && mkdir -p /root/.config/opencode
