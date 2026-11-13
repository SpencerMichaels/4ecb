FROM node:24-alpine AS build

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages
# The shared 4e-kit submodule (`@kit`); check it out first
# (git submodule update --init vendor/4e-kit).
COPY vendor/4e-kit ./vendor/4e-kit
RUN pnpm install --frozen-lockfile

FROM build AS development

EXPOSE 5173
CMD ["pnpm", "--filter", "@4ecb/web", "dev", "--host", "0.0.0.0"]

FROM build AS web-build

# The build context has no .git, so the commit shown in the app comes in here.
ARG FOURECB_COMMIT=unknown
ENV FOURECB_COMMIT=$FOURECB_COMMIT
RUN pnpm --filter @4ecb/web build

# The character-share relay (apps/share-relay) as one dependency-free file.
FROM build AS share-relay-build
RUN pnpm --filter @4ecb/share-relay build

FROM nginxinc/nginx-unprivileged:1.29-alpine

LABEL org.opencontainers.image.title="4E Character Builder" \
  org.opencontainers.image.description="Unofficial offline-first 4E character builder; no official rules corpus included"

# Node runs the share relay next to nginx (docker/entrypoint.sh); its binary
# needs the C++ runtime.
USER root
RUN apk add --no-cache libstdc++
USER 101
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=share-relay-build /workspace/apps/share-relay/dist/server.mjs /app/share-relay/server.mjs

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY docker/share-enabled.conf.template /etc/nginx/share-enabled.conf.template
COPY docker/share-disabled.conf /etc/nginx/share-disabled.conf
COPY docker/entrypoint.sh /app/entrypoint.sh
COPY --from=web-build /workspace/apps/web/dist /app/static
COPY apps/web/public/runtime-config.json /app/runtime-config.json
COPY NOTICE.md /app/NOTICE.md

EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
CMD []
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/healthz || exit 1
