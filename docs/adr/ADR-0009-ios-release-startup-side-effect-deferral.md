# ADR-0009: Defer iOS Release Startup Side Effects

## Status

Accepted

## Context

Recent iPhone beta launches terminated during the first second after startup with only partial SpringBoard and system-service logs available. The common startup path included immediate location reads and location-scoped meeting refreshes before the app had fully stabilized.

The app already had a manual iOS safe-boot mode for compatibility recovery, but release/TestFlight boots still exercised the eager startup path by default.

## Decision

- Treat iOS release-style boots as startup-guarded by default.
- During guarded startup, load meetings without requesting or reading location automatically.
- Keep manual location requests and in-app recovery flows available after launch stabilization.
- Remove the unused iOS push entitlement until iOS push delivery is intentionally implemented.

## Consequences

- iPhone release builds prioritize launch stability over immediate location-personalized startup.
- Nearby distance and geofence-adjacent context become active after the user explicitly requests location or enters later flows that need it.
- Local iOS signing no longer fails on personal teams because of an unused push capability.

## Validation

- TestFlight/App Store iOS build `45` is the first confirmed-good Apple-distributed build after the startup hardening work.
- Build `45` launched successfully on physical iPhone and is the current known-good baseline for future iOS launch regression checks.
- Follow-up calendar hardening removed the native `expo-calendar` dependency and switched explicit add-to-calendar actions to `.ics` export/share flows so calendar is no longer linked into iOS startup.
