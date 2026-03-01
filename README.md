# Sober AI App

Day-1 monorepo scaffold for a secure, scalable Sober AI platform.

## Prerequisites

- Node.js 20+
- pnpm 10+

## Install

```bash
pnpm install
```

## Run development (one command)

```bash
pnpm dev
```

This starts:

- API (`apps/api`) on `http://localhost:3031`
- Dashboard (`apps/dashboard`) on `http://localhost:3000`
- Worker (`apps/worker`)

## Run apps individually

```bash
pnpm --filter @recovery/api dev
pnpm --filter @recovery/dashboard dev
pnpm --filter @recovery/mobile dev
pnpm --filter @recovery/worker dev
```

## Mobile development build workflow (recommended)

- Daily mobile development now targets Expo Development Build:

```bash
pnpm --filter @recovery/mobile start:dev-client
```

- Temporary Expo Go fallback during migration:

```bash
pnpm --filter @recovery/mobile start:go
```

- Full setup, build, and tester install steps:
  - [`docs/DEV_BUILD.md`](docs/DEV_BUILD.md)
  - [`docs/PREVIEW_BUILD.md`](docs/PREVIEW_BUILD.md)

## Local Dev

### Required stack (API + Mobile)

```bash
pnpm dev:stack
```

### Full stack (API + Mobile + Dashboard + Worker)

```bash
pnpm dev:all
```

### Mobile cache clear (after native module changes)

```bash
pnpm dev:mobile:clear
```

### Port collision helper

```bash
pnpm dev:ports:kill
```

### AA aliases (run from any directory)

Add to `~/.zshrc`:

```bash
alias AA='cd "$HOME/Documents/Recovery app/Recovery-App" && pnpm dev:stack'
alias AAA='cd "$HOME/Documents/Recovery app/Recovery-App" && pnpm dev:all'
```

Reload:

```bash
source ~/.zshrc
```

## API development

```bash
pnpm --filter @recovery/api dev
```

API default URL: `http://localhost:3031`

### API migrations

```bash
pnpm db:migrate
```

or directly:

```bash
pnpm --filter @recovery/api db:migrate
```

Migrations live in `/apps/api/migrations`.

### Dev auth placeholder (MVP only)

- Header format: `Authorization: Bearer DEV_<userId>`
- Example: `Authorization: Bearer DEV_admin-a`
- Endpoint: `GET /v1/me`
- This is a temporary dev-only auth path and must be replaced with real OIDC/JWT auth before production.

### Supervisor access guardrail

- Supervisors can only read users explicitly assigned to them (via `supervisor_assignments`).
- Admins bypass assignment checks inside their own tenant.
- Non-supervisor/non-admin roles are denied for supervisor-assignment-protected routes.

### Tenant repository facade

- API handlers use `createTenantRepositories(...)` from `apps/api/src/db/tenantRepositories.ts`.
- Facade methods accept `actor` and derive tenant scope from `actor.tenantId` so handlers do not pass raw `tenantId`.
- This reduces accidental cross-tenant access in route-level code.

### MVP Slice A (Meetings + Attendance + Signature)

- New API endpoints:
  - `POST /v1/meetings`
  - `GET /v1/meetings`
  - `POST /v1/attendance/check-in`
  - `POST /v1/attendance/check-out`
  - `POST /v1/attendance/:attendanceId/sign`
  - `GET /v1/supervisor/attendance`
- Supervisor list rule: supervisors only see assigned users; filtering on an unassigned `userId` is denied.
- Mobile dev wiring uses `apps/mobile/app.json`:
  - environment-aware config in `apps/mobile/app.config.ts`
  - `expo.extra.devAuthUserId`
  - `expo.extra.apiUrl`
  - `EXPO_PUBLIC_API_URL` (preferred override for local/preview/prod API URL)
  - TODO: replace this DEV auth wiring with real auth.

- Dashboard API wiring:
  - `NEXT_PUBLIC_API_URL` (set this to your Render API URL in hosted dashboard environments)

### MVP Slice C (iOS-first realtime supervision)

- New API endpoints:
  - `POST /v1/location/ping` (END_USER)
  - `GET /v1/supervisor/live` (SUPERVISOR/ADMIN)
  - `GET /v1/me/zones` (END_USER)
  - `PUT /v1/users/:userId/supervision` (SUPERVISOR/ADMIN with assignment guardrails)
- Live-view rule:
  - Supervisors only see assigned users.
  - Admins can view all users inside their tenant.
- Ping behavior:
  - Every ping upserts `last_known_locations`.
  - Zone evaluation runs on ping with a default warning distance of 200ft.
  - Warnings create `WARNING` incidents with no notification fanout.
  - Violations create `VIOLATION` incidents and queue `notification_events` when a tenant recipient is configured (`default_supervisor_email`).
- Mobile supervision wiring (`apps/mobile/app.json`):
  - `expo.extra.supervisionEnabled`
  - `expo.extra.fallbackLat`
  - `expo.extra.fallbackLng`
  - The app uses DEV auth and a minimal iOS permission flow stub; replace with real auth + true background location APIs before production.

### Meeting Guide ingest + nearby (20 miles)

- Configure feeds with `MEETING_GUIDE_FEEDS_JSON` (see `/apps/api/.env.example` and `/docs/MEETING_GUIDE.md`).
- Dev fallback feed available: `builtin://billings-test` (non-production).
- Manual refresh:
  - `POST /v1/admin/meetings/refresh`
  - `POST /v1/dev/meetings/refresh` (DEV auth + non-production)
- Nearby search:
  - `GET /v1/meetings/nearby?lat=45.7833&lng=-108.5007&radiusMiles=20`

## CI checks

```bash
pnpm ci
```

## Workspace scripts

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
pnpm db:migrate
pnpm db:seed
```

## Guardrails and planning

- Guardrails: `AGENTS.md`
- Planning format: `docs/PLANS.md`
- Architecture decisions: `docs/adr/README.md`
