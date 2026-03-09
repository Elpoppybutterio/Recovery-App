# ADR-0006: Sober House Compliance Engine v1

## Status

Accepted - March 8, 2026

## Context

Task 3 requires enforceable sober-house compliance evaluation on top of the settings foundation and resident onboarding layer. Two gaps existed in the current mobile implementation:

1. House records had a geofence radius, but no persisted geofence center coordinates.
2. Meeting attendance remained stored in the existing recovery attendance storage, outside the sober-house settings store.

The compliance slice also needed real persisted resident-side inputs for chores, job-search progress, and work verification without overbuilding downstream workflows such as evidence lockers, corrective actions, or notifications.

## Decision

- Extend `House` with optional persisted `geofenceCenterLat` and `geofenceCenterLng` values.
- Keep compliance outputs derived, not permanently snapshotted, and normalize them through a shared evaluation model.
- Add small persisted compliance input records inside the sober-house store:
  - `ChoreCompletionRecord`
  - `JobApplicationRecord`
  - `WorkVerificationRecord`
- Reuse the existing meeting-attendance storage as the meeting source of truth for weekly quota evaluation instead of copying attendance data into the sober-house store.
- Keep organization-level defaults as a future extension point in the resolver chain while implementing resident override -> house rule resolution now.

## Consequences

- Curfew evaluation can return `incomplete_setup` when a house geofence center has not been configured instead of faking location compliance.
- Resident and manager sober-house compliance views can operate on real persisted inputs immediately.
- Meeting quota evaluation stays aligned with the existing attendance engine and avoids split-brain data.
- Future alerting, corrective actions, and reporting can consume the same normalized compliance evaluation model without redesigning the underlying input records.
