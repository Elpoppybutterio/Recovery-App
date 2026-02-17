# ADR-0001: Day-1 Stack Decisions for Monorepo Scaffold

## Status

Accepted

## Context

The project requires a fast, secure MVP scaffold for a multi-surface platform (API, dashboard, mobile, worker) with shared policy/types logic and CI quality gates. The repository currently contains a TypeScript monorepo scaffold and basic platform primitives.

## Decision

Adopt the following stack and tooling (as currently implemented):

1. Monorepo orchestration

- `pnpm` workspaces (`apps/*`, `packages/*`)
- Turborepo task orchestration via `turbo.json`

2. Applications

- API: Node.js + TypeScript + Fastify (`apps/api`)
- Dashboard: Next.js + TypeScript (`apps/dashboard`)
- Mobile: Expo + React Native + TypeScript (`apps/mobile`)
- Worker: Node.js + TypeScript background process (`apps/worker`)

3. Shared packages

- `@recovery/shared-types`
- `@recovery/shared-utils`
- `@recovery/policy-rbac`
- `@recovery/geo`

4. Quality/tooling

- TypeScript base config in `configs/tsconfig/base.json`
- ESLint (flat config, `@typescript-eslint`) at repo root
- Prettier config at repo root
- Vitest for unit tests
- Husky + lint-staged pre-commit formatting

5. CI

- GitHub Actions workflow at `.github/workflows/ci.yml`
- Runs on push to `main` and pull requests
- Executes `pnpm install` then `pnpm ci` (`lint`, `typecheck`, `test`)

6. Database status and direction

- Current state: database is partially scaffolded in API with migration runner, SQL migration file(s), and a Postgres pool adapter.
- Explicit status: database integration is not fully wired end-to-end for production operations yet.
- Intended direction: continue toward Postgres with PostGIS for geospatial accuracy, consistent with project guardrails.

## Rationale

- `pnpm` + Turbo gives fast workspace installs and targeted task execution.
- Fastify/Next.js/Expo provides a pragmatic cross-surface TypeScript stack for rapid iteration.
- Shared packages centralize RBAC, type contracts, and geo primitives to reduce duplication and security drift.
- Root-level lint/typecheck/test gates enforce baseline quality early.

## Consequences

Positive:

- Fast incremental development across API, web, mobile, and worker.
- Consistent TypeScript, lint, and test experience across packages.
- CI catches integration regressions early.

Tradeoffs:

- Some app tests are placeholders and need deeper coverage.
- Database layer exists but requires further hardening, provisioning, and operationalization.
- Monorepo tooling adds initial setup complexity for contributors unfamiliar with Turbo/pnpm.

## Follow-ups

1. Finalize production-grade database wiring (connection management, migration workflow hardening, deployment path).
2. Implement PostGIS-backed geospatial queries for attendance/exclusion features.
3. Expand integration/e2e coverage for dashboard/mobile/API workflows.
4. Add explicit security controls roadmap items (MFA enforcement paths, retention automation, export controls).
