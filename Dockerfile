FROM node:24-alpine AS build

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM build AS development

EXPOSE 5173
CMD ["pnpm", "--filter", "@4ecb/web", "dev", "--host", "0.0.0.0"]

FROM build AS web-build

RUN pnpm --filter @4ecb/web build

FROM nginxinc/nginx-unprivileged:1.29-alpine

LABEL org.opencontainers.image.title="4E Character Builder" \
  org.opencontainers.image.description="Unofficial offline-first 4E character builder; no official rules corpus included"

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-build /workspace/apps/web/dist /app/static
COPY apps/web/public/runtime-config.json /app/runtime-config.json
COPY NOTICE.md /app/NOTICE.md

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/healthz || exit 1
