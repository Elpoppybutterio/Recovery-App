# Recovery Accountability App Requirements

## Scope

This document defines product and platform requirements for MVP delivery across API, dashboard, and mobile surfaces.

## Roles

- `END_USER`
- `SPONSOR`
- `MEETING_VERIFIER`
- `SUPERVISOR`
- `ADMIN`

Role guardrails:

- All role actions are tenant-scoped.
- Supervisors are restricted to assigned users.
- Sensitive actions must be audit-logged.

## Configurability

Tenant-scoped configuration must support:

- Offender flags and related supervision markers.
- Exclusion zones (radius/polygon), warning buffers, and violation rules.
- Sponsor call reminders.
- Appointment reminders (probation/parole/court or tenant-defined).
- Meeting verification policy (signature-required and future dwell-only policy controls).

## Functional Requirements

### FR-001 Meetings

The system shall support a tenant-scoped meeting directory.

Acceptance criteria:

- Authorized roles can create meetings with `name`, `address`, `lat`, `lng`, `radius`.
- Allowed roles can list meetings in their tenant only.
- Cross-tenant meeting reads/writes are blocked.

### FR-002 Attendance

The system shall record check-in/check-out attendance events.

Acceptance criteria:

- Check-in creates an attendance record with `INCOMPLETE` status.
- Check-out computes `dwell_seconds` from server time.
- Status transitions:
  - `< 3600` seconds => `INCOMPLETE`
  - `>= 3600` seconds => `PROVISIONAL`
- End users can only check out their own attendance records.

### FR-003 Signatures

The system shall support meeting verifier signatures on attendance records.

Acceptance criteria:

- `MEETING_VERIFIER` or `ADMIN` can sign attendance in-tenant.
- Signing updates attendance status to `VERIFIED`.
- Re-sign requests are safe (idempotent or duplicate-safe behavior).
- Signing fails for missing or cross-tenant attendance records.

### FR-004 Supervisor Dashboard Data

The system shall provide attendance listing for supervisors/admin.

Acceptance criteria:

- Supervisor list view returns only assigned users' attendance.
- Admin list view may return all tenant attendance.
- Supervisor filter by unassigned user is denied.
- Returned fields include status, meeting name, user id, check-in/out timestamps, dwell seconds.

### FR-005 Incidents and Alerts

The system shall support exclusion-zone incident workflows and supervisor alerting.

Acceptance criteria:

- Warning and violation events are representable as tenant-scoped records.
- Supervisor alert routing supports tenant/user recipient configuration.
- Incident resolution state is trackable and auditable.

### FR-006 Notifications

The system shall support notification delivery for compliance workflows.

Acceptance criteria:

- Notification channels are configurable (email/SMS, provider-dependent).
- Failures are observable and retry strategy is documented.
- Notifications do not leak cross-tenant data.

### FR-007 Reminders

The system shall support recurring reminders (sponsor calls, appointments, recovery tasks).

Acceptance criteria:

- Recurrence supports daily/weekly/biweekly/monthly.
- Reminder schedule is tenant/user configurable.
- Background delivery degrades gracefully under OS constraints.

## Non-Functional Requirements

### Security

- Encrypt data in transit and at rest.
- Enforce least-privilege RBAC and tenant boundaries on all sensitive operations.
- Admin/supervisor MFA support is part of production auth hardening.

### Privacy

- Minimize personal and location data collection/retention.
- Avoid disclosure patterns that could identify meeting participants.
- Respect tenant privacy and least-necessary data exposure.

### Auditability

- Sensitive reads/writes generate audit records with actor, tenant, action, subject, and timestamp.
- Audit logs are exportable only with explicit authorized permissions.

### Availability

- Core attendance workflows must remain resilient under transient network failures.
- API and job execution should degrade gracefully when dependencies are unavailable.

### Scalability

- Architecture should support pilot scale immediately and expansion by tenant without redesign.
- Query patterns must remain tenant-index-friendly.

### 12 Traditions Constraints

- No public member-list disclosure.
- No workflows that imply AA organizational endorsement.
- Optional photo evidence must be self-only guidance and avoid bystander capture.

## Definition of Done

A feature is complete only when all are true:

- Unit/integration tests pass for acceptance criteria.
- `pnpm lint` and `pnpm typecheck` pass.
- Security checks are completed for auth, data access, and sensitive endpoints.
- Required audit logging exists for sensitive reads/writes.
- Tenant isolation is verified for repository and route boundaries.
