# ADR-0003: iOS Background Execution and Notification Constraints

## Status

Accepted

## Context

Slice D needs reliable sponsor reminders and supervision freshness signals on iOS, where background execution is constrained and not fully app-controlled.

## Decision

1. iOS background realities

- Continuous background execution is limited by iOS policy and power management.
- Background location updates can continue only with approved location modes and user-granted permissions.
- Background fetch is opportunistic and not time-precise; it cannot guarantee exact reminder timing.
- Push notifications can wake user attention, but silent/background pushes are not guaranteed to run every time.

2. Sponsor reminders approach (MVP)

- Use on-device local notifications scheduled from known reminder rules (daily/weekly/biweekly/monthly).
- Keep reminder schedules synced from server when app is opened/resumed, and rehydrate local schedules.
- Treat local notifications as primary for user-visible sponsor reminders.

3. App-killed behavior

- If the app is force-quit by the user, app-managed background work is largely suspended until relaunch.
- Local notifications already scheduled by the OS may still fire.
- New schedule changes from server will not apply until next app open (or successful background wake path).

4. "Uninstall detection" feasibility

- iOS does not provide a direct uninstall webhook to the app backend.
- Use missed-heartbeat inference: if expected mobile heartbeats stop beyond threshold, mark as `STALE`/`MISSING` and alert supervisor workflows.
- Keep this as probabilistic inference, not proof of uninstall (could also be dead battery, no signal, or permissions revoked).

## MVP Court Pilot Checklist

- Use local notifications for sponsor reminders; do not depend on background fetch timing.
- Require explicit user permission flows for notifications and background location, with clear copy.
- Persist last successful heartbeat timestamp server-side per user.
- Add supervisor-facing stale-heartbeat threshold and alert rules.
- Log reminder schedule sync attempts and heartbeat misses for auditability.
- Document user guidance: force-quit and revoked permissions can reduce reminder/compliance reliability.
