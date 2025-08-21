FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY services/product-service/package.json ./services/product-service/
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm --filter @services/product-service build

FROM node:20-alpine AS production
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY services/product-service/package.json ./services/product-service/

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/*/dist ./packages/*/dist
COPY --from=build /app/services/product-service/dist ./services/product-service/dist

RUN addgroup -g 1001 -S nodejs
RUN adduser -S productservice -u 1001

USER productservice

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3003/health || exit 1

CMD ["node", "services/product-service/dist/index.js"]