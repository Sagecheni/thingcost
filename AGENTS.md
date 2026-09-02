# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm workspace using Node.js 22.12+ and ESM TypeScript. Runtime applications
live in `apps/`: `web` is the React/Vite client, `api` is the Fastify service, and
`worker` runs pg-boss background jobs. Shared code belongs in `packages/`: Zod API
contracts, domain calculations, Drizzle database access, runtime configuration, UI
utilities, and test helpers. Keep HTTP handlers in `apps/api/src/routes`, business
operations in `apps/api/src/services`, and reusable rules in `packages/domain`.

Tests are under each workspace's `tests/` directory, with small unit tests sometimes
beside their source (for example, `apps/web/src/lib/format.test.ts`). Static assets are
in `apps/web/public`; database migrations are in `packages/database/migrations`.
Architecture and deployment decisions are documented in `docs/`, while visual direction
lives in `design-system/` and `DESIGN.md`.

## Build, Test, and Development Commands

- `pnpm install` installs all workspace dependencies.
- `docker compose up -d postgres && pnpm db:migrate` starts and prepares PostgreSQL.
- `pnpm dev` watches the web, API, and worker applications concurrently.
- `pnpm build` builds every package that defines a build script.
- `pnpm check` runs formatting, linting, type checks, tests, and builds; run it before a PR.
- `pnpm tokens:check` validates theme token contrast and chart ramps (part of `pnpm check`).
- `pnpm --filter @thingcost/api test` runs one workspace's tests; replace the filter as
  needed.

Copy `.env.example` to `.env` for local development. The default web and API ports are
5173 and 3000.

## Coding Style & Naming Conventions

Prettier enforces single quotes, trailing commas, and a 90-character print width; use
`pnpm format` rather than hand-formatting. ESLint uses type-aware TypeScript rules and
requires type-only imports where appropriate. Keep strict types and avoid unchecked
casts. Use PascalCase for React components/pages, camelCase for functions and variables,
and kebab-case for service or route filenames. Export public package APIs through their
`src/index.ts` files.

## Testing Guidelines

Vitest is the test runner. Name unit tests `*.test.ts` and database-backed suites
`*.integration.test.ts`. Add focused tests with every behavior change; no coverage
threshold is currently configured. API and worker integration tests require a disposable
PostgreSQL database via `TEST_DATABASE_URL`.

## Commit & Pull Request Guidelines

Follow the existing Conventional Commit pattern: `feat(web): ...`, `fix(api): ...`,
`test: ...`, or `chore: ...`. Keep commits scoped and imperative. PRs should explain the
behavioral change, link relevant issues, call out migrations or configuration changes,
and include before/after screenshots for UI work. Confirm `pnpm check` passes. Never
commit `.env`, credentials, local attachments, or generated `dist/` output.
