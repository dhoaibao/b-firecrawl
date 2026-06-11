# Stage 1: Build admin UI
FROM node:22-alpine AS admin-builder

WORKDIR /app/admin-ui
COPY admin-ui/package*.json ./
RUN npm ci

COPY admin-ui/ ./
RUN npm run build

# Stage 2: Build gateway
FROM node:22-alpine AS gateway-builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 3: Runtime
FROM node:22-alpine

WORKDIR /app

# Copy gateway package files and install production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built gateway
COPY --from=gateway-builder /app/dist/ ./dist/
COPY --from=gateway-builder /app/src/db/schema.sql ./dist/db/schema.sql

# Copy built admin UI
COPY --from=admin-builder /app/admin-ui/dist/ ./admin-ui/dist/

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/server.js"]
