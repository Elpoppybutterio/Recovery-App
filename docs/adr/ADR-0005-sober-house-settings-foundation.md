# ADR-0005: Sober House Settings Foundation

## Status

Accepted

## Context

Task 1 for sober-house support needs persisted settings, stable domain boundaries, and auditability before any compliance engines or onboarding logic exist. The repo does not yet have a sober-house backend slice, but the mobile app already uses typed local persistence for recovery features.

Some product inputs were intentionally broad:

- House "type" includes categories that can overlap in practice (`women`, `MAT-friendly`, `reentry`).
- Alert preferences need recipient and delivery settings, but downstream notification engines are out of scope.
- Rule configuration must be stored now without turning into runtime enforcement behavior.

## Decision

For this slice:

1. Sober-house configuration is stored in a dedicated mobile domain under `apps/mobile/lib/soberHouse/`.
2. Persistence uses a versioned AsyncStorage store keyed by user id, making the settings screen the current system of record until an API slice is introduced.
3. `House.houseTypes` is stored as an array instead of a single enum so combinations such as `women + MAT-friendly` do not force a schema redesign later.
4. `HouseRuleSet` is stored per house, not globally, so multi-house operators can diverge rules without cloning organizations.
5. `AlertPreference` is modeled as a saved routing record with organization or house scope, recipient identity fields, and delivery method, but no sending behavior.
6. Every saved edit creates field-level audit log entries with actor, timestamp, entity type/id, old value, and new value.

## Consequences

- The sober-house settings surface is isolated from recovery mode logic and can later be lifted into API-backed models with minimal schema churn.
- Local persistence is real persistence for this slice, but it is intentionally scoped to the mobile app until server endpoints are introduced.
- Later enforcement, reporting, and onboarding flows can consume saved configuration without changing the underlying data model.
