# Recovery Accountability Roadmap

## Vision

Deliver a privacy-safe, tenant-isolated recovery accountability platform that replaces paper attendance and manual follow-up with verifiable digital workflows. Prioritize iOS-first field workflows while preserving supervisor controls, auditability, and secure defaults.

## Slice Status

- Slice A: DONE
- Slice B: DONE
- Slice C: DONE
- Slice D: IN PROGRESS

## Slice A (DONE)

- User features: meetings directory, attendance check-in/check-out, verifier signature, supervisor attendance list.
- API endpoints: `POST /v1/meetings`, `GET /v1/meetings`, `POST /v1/attendance/check-in`, `POST /v1/attendance/check-out`, `POST /v1/attendance/:attendanceId/sign`, `GET /v1/supervisor/attendance`.
- Data tables: `meetings`, `attendance`, `verifier_signatures`.

## Slice B (DONE)

- User features: exclusion zones, assigned zone rules, incident reporting, supervisor incident list, notification event queueing.
- API endpoints: `POST /v1/zones`, `GET /v1/zones`, `POST /v1/users/:userId/zones`, `POST /v1/incidents/report`, `GET /v1/supervisor/incidents`.
- Data tables: `exclusion_zones`, `user_zone_rules`, `incidents`, `notification_events`.

## Slice C (DONE)

- User features: supervision mode pings, live supervisor map feed, user supervision controls, compliance events.
- API endpoints: `POST /v1/location/ping`, `GET /v1/supervisor/live`, `GET /v1/me/zones`, `PUT /v1/users/:userId/supervision`.
- Data tables: `last_known_locations`, `compliance_events`, `users.supervision_enabled`, `users.supervision_end_date`.

## Slice D (IN PROGRESS)

- User features: sponsor contact config, sponsor enable toggle + reminder toggle restructuring, single-source sponsor status hygiene, simulator-safe call-now handling, reliable location enable messaging, and meeting drive reminder planning.
- API endpoints: `GET /v1/me/sponsor`, `PUT /v1/me/sponsor`.
- Data tables: `sponsor_config`.

## Futures / Backlog

- [ ] Auto-request location permission on first launch; if denied, show Settings deep-link CTA.
- [ ] Import AA/NA meetings feeds (Meeting Guide spec) and return meetings within 20-mile radius when location is available.
- [ ] Meeting Guide distributed feed ingest + tenant-scoped `/v1/meetings/nearby` search (20-mile default) with map/list toggle UX.
