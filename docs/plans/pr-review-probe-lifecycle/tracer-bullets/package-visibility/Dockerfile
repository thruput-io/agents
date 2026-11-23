FROM node:24.22.0-bookworm-slim
WORKDIR /bullet
COPY package.json tsconfig.json knip.json ./
COPY packages ./packages
RUN npm install --no-audit --no-fund
CMD ["npm", "test"]
