FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY services/inventory-service/package.json ./services/inventory-service/
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm --filter @services/inventory-service build

FROM node:20-alpine AS production
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY services/inventory-service/package.json ./services/inventory-service/

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/*/dist ./packages/*/dist
COPY --from=build /app/services/inventory-service/dist ./services/inventory-service/dist

RUN addgroup -g 1001 -S nodejs
RUN adduser -S inventoryservice -u 1001

USER inventoryservice

EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3006/health || exit 1

CMD ["node", "services/inventory-service/dist/index.js"]