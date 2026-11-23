FROM node:24.22.0-bookworm-slim
WORKDIR /bullet
COPY package.json tsconfig.json orval.config.ts ./
RUN npm install --no-audit --no-fund
COPY spec ./spec
COPY src ./src
CMD ["npm", "test"]
