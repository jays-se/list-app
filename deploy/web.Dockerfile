# syntax=docker/dockerfile:1
# Web image: the static build served by Caddy (build context: repo root).
FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build && node scripts/check-bundle.mjs

FROM caddy:2
COPY deploy/Caddyfile.prod /etc/caddy/Caddyfile
COPY --from=build /src/apps/web/dist /srv
