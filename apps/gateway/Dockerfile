# Multi-stage build for production
FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

# Dependencies stage
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY apps/gateway/package.json ./apps/gateway/
RUN pnpm install --frozen-lockfile

# Build stage
FROM dependencies AS build
COPY . .
RUN pnpm --filter @apps/gateway build

# Production stage
FROM node:20-alpine AS production
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY apps/gateway/package.json ./apps/gateway/

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY --from=build /app/packages/*/dist ./packages/*/dist
COPY --from=build /app/apps/gateway/dist ./apps/gateway/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S gateway -u 1001

USER gateway

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "apps/gateway/dist/index.js"]