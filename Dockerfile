# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN npm install --global pnpm@11.18.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/test-utils/package.json packages/test-utils/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
  && pnpm --filter @thingcost/api deploy --prod --legacy /opt/chronicle-api \
  && pnpm --filter @thingcost/worker deploy --prod --legacy /opt/chronicle-worker

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV WEB_DIST_DIR=/app/web
ENV MIGRATIONS_DIR=/app/migrations

WORKDIR /app

COPY --from=build --chown=node:node /opt/chronicle-api ./api
COPY --from=build --chown=node:node /opt/chronicle-worker ./worker
COPY --from=build --chown=node:node /workspace/apps/web/dist ./web
COPY --from=build --chown=node:node /workspace/packages/database/migrations ./migrations

RUN mkdir -p /data/attachments /data/exports \
  && chown -R node:node /data

USER node
EXPOSE 3000

CMD ["node", "api/dist/server.js"]
