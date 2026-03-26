FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/build ./build

EXPOSE 3000

USER node

# Default to stdio transport; set TRANSPORT=http for HTTP mode
ENV TRANSPORT=stdio

ENTRYPOINT ["sh", "-c", "if [ \"$TRANSPORT\" = \"http\" ]; then exec node build/http.js; else exec node build/index.js; fi"]
