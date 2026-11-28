FROM node:24-slim
RUN apt-get update && apt-get install --yes --no-install-recommends universal-ctags jq && rm -rf /var/lib/apt/lists/*
RUN npm install --global --no-audit --no-fund @ast-grep/cli@0.51.3
WORKDIR /bullet
COPY . ./
CMD ["./run.sh"]
