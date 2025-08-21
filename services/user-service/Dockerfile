FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY services/user-service/package.json ./services/user-service/
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm --filter @services/user-service build

FROM node:20-alpine AS production
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY services/user-service/package.json ./services/user-service/

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/*/dist ./packages/*/dist
COPY --from=build /app/services/user-service/dist ./services/user-service/dist

RUN addgroup -g 1001 -S nodejs
RUN adduser -S userservice -u 1001

USER userservice

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

CMD ["node", "services/user-service/dist/index.js"]