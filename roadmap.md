# Sober AI Roadmap

## Vision

Deliver a privacy-safe, tenant-isolated recovery accountability platform that replaces paper attendance and manual follow-up with verifiable digital workflows. Prioritize iOS-first field workflows while preserving supervisor controls, auditability, and secure defaults.

## Slice Status

- Slice A: DONE
- Slice B: DONE
- Slice C: DONE
- Slice D: IN PROGRESS

## Release v0.9.4 (Meetings Liftoff)

- Geo distance reliability: normalized meeting coordinates, shared haversine utility, and cached location service for on-device distance rendering in meeting + home-group lists.
- Permission UX: explicit `While Using App` and `Always (recommended)` location actions with in-app denied-state guidance and settings deep links.
- Attend + signature flow: in-progress meetings now actionable with `Happening now` treatment, strict signature-before-end behavior, and one-time chair-signature prompt per attendance instance.
- Export hardening: replaced brittle export path with multi-page AA/NA Attendance Slip PDF generation and share flow.
- Calendar integration: attend flow now prompts `Add to calendar`, creates meeting event metadata, and stores `calendarEventId` on attendance records to prevent duplicates.

## Release v0.9.5 (iOS Device Location Restore)

- iOS native permission config hardened for dev/client and production parity (`NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationAlwaysUsageDescription`, and `UIBackgroundModes`).
- Device location fetch made deterministic with explicit service checks (`hasServicesEnabledAsync`), robust foreground permission handling, timeout behavior, and last-known location fallback.
- Meetings refresh now re-checks permission and current location on app focus/return, restoring distance rendering after Settings changes without reinstall.
- Location-state UX now differentiates denied permission vs. disabled Location Services vs. missing meeting coordinates, preventing false generic `Location unavailable` states.

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
- Sober house foundation starts with persisted data models, a settings system of record, configurable rule storage, and field-level audit logging before any enforcement engines ship.
- Sober house resident layer now adds onboarding/editable resident housing profiles, resident requirement branching, house assignment, inheritance-ready defaults, and consent acknowledgment capture with stored signature references.
- Sober house compliance engine v1 now evaluates curfew, near-miss windows, chores, work/job-search status, and weekly meeting quotas using resident overrides, house rules, current location, persisted resident inputs, and the existing attendance source of truth.
- Sober house intervention layer now persists deduped violations, corrective actions, evidence linkage, and manager resolution workflow on top of compliance outputs with audit-safe history.
- Structured internal chat foundation now persists direct sober-house manager/resident threads, structured message types, violation-linked thread reuse, unread/read receipts, acknowledgment-required notices, and auditable message history.
- Sober house monthly reporting now stores immutable resident and house report snapshots with monthly KPI summaries, wins/streak summaries, report history, and in-app detail views.
- Sober house report output workflow now adds review states, locked final manager summaries, version-safe regeneration, resident/house PDF export from stored snapshots, export history, and distribution-ready metadata without delivery automation.
- Recovery UX v2: setup wizard flow, dashboard-first home experience, purple liquid-glass cards, and local recovery analytics (days sober, 90-day progress, sponsor adherence).
- Tools (Recovery mode): AM routine checklist, nightly inventory CRUD, local routines analytics, sponsor SMS share, and routine PDF exports.
- Dashboard: evolve the existing direct-message foundation into broader recovery/service/probation chat flows after sober-house direct messaging proves out.
- Dashboard: Wisdom tile uses server-driven daily rotation (`/api/wisdom/daily`) with one quote per day, pronoun normalization (`I/you -> we`), plus local cache and deterministic fallback.
- Mobile dev correctness: API URL alignment (`localhost:3031`), no hardcoded SF map origin defaults, nearby-meetings request diagnostics, and map search-origin visibility.
- Build readiness: Development Build workflow implemented (EAS `development` / `preview` / `production` profiles, environment-driven bundle identifiers, stable deep-link scheme, and dev-client runbook in `docs/DEV_BUILD.md`).
- Preview pipeline: internal preview build profile + TestFlight-ready store preview profile documented and validated in `docs/PREVIEW_BUILD.md`.
- API dev tooling: DEV-auth-gated meeting ingest trigger (`POST /v1/dev/meetings/refresh`) with cooldown guard for local workflows.
- API endpoints: `GET /v1/me/sponsor`, `PUT /v1/me/sponsor`, `POST /v1/dev/meetings/refresh`.
- Data tables: `sponsor_config`.

## Futures / Backlog

- [ ] Sober house follow-on slices: alert delivery automation, distribution workflows, and dashboards on top of the settings foundation, compliance/intervention layers, chat foundation, and monthly report exports.
- [ ] Auto-request location permission on first launch; if denied, show Settings deep-link CTA.
- [ ] Import AA/NA meetings feeds (Meeting Guide spec) and return meetings within 20-mile radius when location is available.
- [ ] Meeting Guide distributed feed ingest + tenant-scoped `/v1/meetings/nearby` search (20-mile default) with map/list toggle UX.
- [ ] Dashboard + Setup Wizard + upcoming-meetings logic hardening across timezones and tenant policy controls.
- [ ] Tools: AM routine + Nightly inventory + insights (local-first storage, optional API sync later).
- [ ] Expand the structured chat foundation to provider-backed invites, push notifications, deep links, group chat, and moderation controls.
