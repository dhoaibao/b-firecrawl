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
RUN npm prune --omit=dev

# Stage 3: Runtime
FROM node:22-alpine

WORKDIR /app

# Create a non-root user to run the gateway
RUN addgroup -g 1001 -S gateway && adduser -S gateway -u 1001

# Copy built gateway and production dependencies from the builder stage
COPY --from=gateway-builder --chown=gateway:gateway /app/node_modules ./node_modules
COPY --from=gateway-builder --chown=gateway:gateway /app/package*.json ./
COPY --from=gateway-builder --chown=gateway:gateway /app/dist/ ./dist/
COPY --from=gateway-builder --chown=gateway:gateway /app/src/db/schema.sql ./dist/db/schema.sql

# Copy built admin UI
COPY --from=admin-builder --chown=gateway:gateway /app/admin-ui/dist/ ./admin-ui/dist/

COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
