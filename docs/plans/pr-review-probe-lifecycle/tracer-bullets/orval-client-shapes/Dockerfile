FROM node:24-slim
WORKDIR /bullet
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . ./
CMD ["./run.sh"]
