# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

Thingcost / Chronicle is a self-hosted personal asset-lifecycle and cost-management application. It is a pnpm monorepo using Node.js 22.12+, TypeScript in strict ESM mode, PostgreSQL, and Docker Compose. The product is currently a usable asset-cost insights application with orders, attachments, reminders/notifications, wishlists, subscriptions/digital licenses, portable export/import, and personal API tokens.

The main product and implementation references are:

- `README.md`: current feature status, local setup, and top-level commands.
- `docs/product-spec.md`: product scope and behavioral rules.
- `docs/architecture.md`: authoritative system and data-model architecture.
- `docs/deployment.md`: Docker, persistence, backup, upgrade, and troubleshooting procedures.
- `design-system/pawnshop.md`: current visual direction and token/component constraints. `DESIGN.md` documents the previous v1 direction and historical rationale.
- `AGENTS.md`: repository organization, style, testing, and PR conventions.

## Common commands

Run commands from the repository root with pnpm 11.18.0:

```bash
pnpm install

# Start PostgreSQL, apply migrations, then run web/API/worker in watch mode
 docker compose up -d postgres
pnpm db:migrate
pnpm dev

# Quality and build checks
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check                 # theme tokens + format + lint + types + tests + build
pnpm tokens:check

# Database helpers
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

`pnpm dev` loads `.env` and starts `@thingcost/web`, `@thingcost/api`, and `@thingcost/worker` concurrently. The web dev server is normally at `http://localhost:5173`; the API is at `http://localhost:3000`. API health endpoints are `/health/live` and `/health/ready`.

For Docker-based development or a production-like run:

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f app worker
```

API integration tests need a disposable PostgreSQL database and `TEST_DATABASE_URL`:

```bash
TEST_DATABASE_URL=postgres://chronicle:password@localhost:5432/chronicle \
  pnpm --filter @thingcost/api test
```

Run a single workspace or test file without running the whole monorepo:

```bash
pnpm --filter @thingcost/api test -- tests/notification-delivery.test.ts
pnpm --filter @thingcost/web test -- src/lib/format.test.ts
pnpm --filter @thingcost/domain test -- src/asset-metrics.test.ts
```

Vitest accepts its normal filters as well, for example `pnpm --filter @thingcost/api test -- -t "delivery"`. Most packages have `typecheck` and `test`; API and worker additionally have `build`, while the web build runs TypeScript checking followed by Vite.

## Architecture

The runtime consists of three processes and PostgreSQL:

```text
Browser
  -> apps/web React/Vite SPA
  -> apps/api Fastify REST/OpenAPI service
       -> PostgreSQL (Drizzle schema and migrations)
apps/worker -> PostgreSQL-backed scheduled jobs and notification delivery
```

In production, the API process also serves the built web assets. Docker Compose runs `postgres`, an idempotent `migrate` job, `app`, and `worker`; no Redis is used. PostgreSQL provides persistence, queue state, uniqueness/idempotency, and retry state.

### Workspace responsibilities

- `apps/web`: React SPA, TanStack Router/Query, forms, page-level workflows, responsive UI, theme/style switching, and API client calls. Routes/pages live under `src/pages`; reusable visual pieces are under `src/components`; formatting and browser-side helpers are under `src/lib`.
- `apps/api`: Fastify application and production server. `src/routes` defines HTTP/OpenAPI boundaries and request parsing; `src/services` contains authorized business operations and provider/storage orchestration; `src/lib` contains HTTP/auth/support utilities. Keep business rules out of route handlers.
- `apps/worker`: background entrypoint and workers for reminder expansion, notification delivery/retry, exchange-rate/valuation jobs, and attachment cleanup. Workers coordinate through PostgreSQL and must preserve stable idempotency keys and bounded retries.
- `packages/contracts`: Zod request/response schemas and shared API/domain contracts. Treat these as the API boundary used by both server and client.
- `packages/database`: Drizzle PostgreSQL schema, migrations, database construction, and defaults. Schema changes require generated migrations and migration-aware tests where behavior changes.
- `packages/domain`: pure, I/O-free calculations and lifecycle rules such as asset metrics, portfolio totals, order allocation, reminder schedules, subscription metrics, and valuation analytics. Pass timezone/calculation context explicitly; do not use database or network access here.
- `packages/config`: typed environment/runtime configuration and secret handling.
- `packages/test-utils`: factories and helpers shared by integration tests.
- `packages/ui`: shared UI exports/utilities; app-specific composition remains in `apps/web`.

### API and data-flow conventions

The stable API prefix is `/api/v1`; OpenAPI UI is `/api/docs` and the machine-readable contract is `/api/v1/openapi.json`. Protected writes enforce authorization and domain validation in services, not just in the browser. Authentication accepts an administrator session cookie or a scoped personal access token where allowed.

The data model preserves authoritative facts as events and maintains current projections for fast reads:

- `assets` is the editable current projection.
- Lifecycle, financial, condition, loan, and repair history are event records.
- Financial corrections preserve the original record and correction relationship; submitted orders are historical and are not directly overwritten.
- Soft deletion uses `deleted_at` and scheduled cleanup; recycle-bin cleanup must protect attachment references.
- Order totals and per-item allocations are exact integer minor-unit arithmetic using deterministic largest-remainder allocation.
- Money stores signed integer minor units, ISO currency, and locked base-currency conversion data. Never use JavaScript floating point for ledger calculations.
- Calendar facts use PostgreSQL `date`; timestamps use UTC `timestamptz`; natural-day calculations require an explicit IANA timezone.
- Wishlist prices are snapshots, not direct mutable current-price fields; conversion to an asset is one transaction and preserves price history.
- Subscriptions/digital licenses are separate from physical `assets`, with independent price changes, charges, tags, attachments, and reminders.

External services are behind provider interfaces (exchange rates and notification channels). Provider failure must not break core local CRUD/statistics. Secrets are configured through environment or encrypted database settings and must not enter logs, exports, or error responses. Attachments use random storage keys, authenticated object-level reads, content sniffing, size/type checks, and generated WebP thumbnails; the attachment volume is not a public static directory.

## Frontend/design constraints

The current visual direction is the pawn-ticket / pawnshop ledger metaphor described in `design-system/pawnshop.md`. Follow the existing CSS token layer and `data-style`/`data-theme` system rather than introducing one-off colors or a second chart palette. `pnpm tokens:check` validates theme contrast and chart ramps. The app supports light, dark, and system themes and must remain responsive on mobile.

Keep unknown values visibly unknown (do not display missing cost as zero). Color must not be the only status signal; preserve text, labels, legends, and accessible semantics. Use local/offline-bundled assets only—no public CDN dependency or external web fonts. Respect reduced-motion; the signature seal animation is the only prominent global feedback animation. Do not reintroduce the historical v1 ledger styling or forbidden pawnshop clichés documented in the design-system rules, and never describe calculated cost as a market/pawnshop valuation.

## CI and deployment facts

CI uses PostgreSQL 17, Node 24, pnpm 11.18.0, runs migrations, `pnpm check`, and a Docker image build. Local development requires PostgreSQL 16+ according to the README. Before changing schema/config/deployment behavior, read `docs/deployment.md`; Compose persistent volumes include PostgreSQL data, attachments, and exports. Do not use `docker compose down -v` for an instance whose data should be retained.

## Other agent configuration

A user-level Codex configuration exists at `~/.codex/`. It was not imported or read while creating this file. To scan and list importable MCP servers, slash commands, subagents, skills, or instructions, reply `/import`; to apply the listed user-level items, use `/import --yes=<digest>` with the digest produced by that scan. No Gemini, Cursor, or Copilot instruction files were found in this repository.
