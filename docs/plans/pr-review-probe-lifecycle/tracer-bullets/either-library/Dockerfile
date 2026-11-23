FROM node:24.22.0-bookworm-slim
WORKDIR /bullet
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
CMD ["npm", "test"]
