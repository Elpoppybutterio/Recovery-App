# ADR-0001: Stack Decisions for Current Repository

## Status

Accepted

## Context

The project needs an MVP-capable multi-app codebase with shared types/policies, strong quality gates, and a practical path from local testing to production infrastructure.

## Decision

Adopt and continue with the stack already implemented in this repository:

1. Monorepo and package management

- `pnpm` workspaces (`apps/*`, `packages/*`)
- Turborepo orchestration (`turbo.json`)

2. Application framework choices

- API: Fastify + TypeScript (`apps/api`)
- Dashboard: Next.js + TypeScript (`apps/dashboard`)
- Mobile: Expo/React Native + TypeScript (`apps/mobile`)
- Worker: Node.js + TypeScript (`apps/worker`)

3. Shared internal packages

- `@recovery/shared-types`
- `@recovery/shared-utils`
- `@recovery/policy-rbac`
- `@recovery/geo`

4. Testing and quality tooling

- TypeScript project references and base config (`configs/tsconfig/base.json`)
- ESLint (flat config) + Prettier
- Vitest for test execution
- Husky + lint-staged for pre-commit hygiene

5. Data and migrations

- SQL migrations in `apps/api/migrations`
- Migration runner in API scripts
- In-memory database adapter used for API integration tests
- Postgres adapter shape retained in runtime for production DB integration

6. CI workflow

- GitHub Actions in `.github/workflows/ci.yml`
- CI gates run lint, typecheck, and test tasks

## Rationale

- Keeps a cohesive TypeScript developer experience across API, web, mobile, and worker.
- Aligns to MVP speed while preserving guardrails (RBAC, tenant scoping, auditability).
- Uses simple SQL migration files and repository boundaries to keep data changes explicit.
- In-memory test DB keeps integration tests fast and deterministic in local/CI development.

## Consequences

Positive:

- Fast incremental development across all surfaces.
- Low-friction testing and CI signal for day-to-day changes.
- Clear migration history and tenant-safe repository patterns.

Tradeoffs:

- In-memory testing is not a replacement for production Postgres/PostGIS behavior.
- DEV auth is intentionally temporary and not production-safe.
- Some UI surfaces still use minimal scaffolding and limited automation coverage.

## Follow-ups

1. Move production runtime fully to managed Postgres + PostGIS, including operational migration workflow.
2. Replace DEV header auth with production auth (OIDC/JWT), session hardening, and MFA requirements for privileged roles.
3. Add production-grade DB integration tests in addition to in-memory tests.
4. Expand end-to-end coverage for dashboard/mobile attendance workflows.
