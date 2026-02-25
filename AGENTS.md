# Sober AI App — Codex Guardrails (AGENTS.md)

## Mission

Build a configurable mobile + web dashboard system that:

- Replaces paper recovery/AA accountability sheets with GPS-based attendance verification + verifier signature.
- Supports exclusion-zone compliance (e.g., schools/parks) with end-user warnings and supervisor alerts.
- Provides reminders (sponsor calls, probation/parole appointments, sponsee check-ins).
- Respects AA anonymity and the 12 Traditions.

## Operating Mode (Non-interactive, high velocity)

- Act as Chief Solutions Architect + Lead Engineer.
- Default to making safe assumptions and shipping working increments.
- If a decision is ambiguous, pick the safest default, implement, and write an ADR in `/docs/adr/`.
- Do not ask questions unless it blocks correctness, security, or legal compliance.

## Repo-first behavior

- Before adding new patterns, inspect the existing repo for established conventions.
- Prefer minimal diffs. Avoid broad refactors unless required for MVP speed or security.
- Keep changes PR-sized; if too large, split into sequential commits.

## Hard Constraints (Non-negotiable)

### Privacy / AA Traditions

- Never capture or expose other attendees’ identities.
- Photo proof is optional and must be designed for selfie-only guidance (no crowd shots).
- Group phone lists are opt-in and group-managed; app owner/admin is never auto-enrolled.
- Do not present features as AA-endorsed; avoid branding or implied affiliation.

### Data governance

- All sensitive actions must be audit-logged (view location trace, view photo, export data, config changes).
- Role-based access: Supervisor sees only assigned End Users. Enforce tenant isolation.

### Security baseline

- Encrypt in transit + at rest.
- Least-privilege RBAC with explicit permissions.
- MFA required for Admin/Supervisor accounts.
- Validate all inputs; avoid unsafe deserialization; prevent IDOR.
- Prefer Postgres + PostGIS for geospatial accuracy; keep location history retention configurable.

## Build Order (MVP-first)

### MVP-1 (court pilot ready)

1. Auth + RBAC + tenant model
2. Meetings: directory + geofence + dwell-time (default threshold 60 min)
3. Verification: digital signature (touch or secure link/QR)
4. Exclusion zones: proximity warning + violation event + notifications (email/SMS)
5. Supervisor dashboard: filters + verification detail + incident timeline
6. Reminders: sponsor calls + probation/parole appointments
7. Audit logging + restricted exports

### MVP-2

- Optional selfie proof with anonymity protections
- Sponsee recurring check-ins
- Group phone lists (opt-in)

## Definition of Done (per feature)

- Unit + integration tests for acceptance criteria.
- Security review for any location/photo/notification/export change.
- Manual QA checklist run for: background location, poor connectivity, timezone edges.
- Docs updated, including admin configuration notes.
- Feature flags verified for all relevant user profiles.

## Execution Discipline

- Always add scripts to run: lint, typecheck, test, and db migrations.
- Always provide a short "How to run" section in README when introducing new tooling.
- If CI is missing, add GitHub Actions early (lint/test/typecheck on PR).
