# Recovery Accountability App Requirements Specification

## 1. Scope

This document defines Day-1 implementation requirements for the Recovery Accountability App platform (mobile app + supervisor dashboard), aligned to `AGENTS.md`.

## 2. Beta Pilot Target

- Pilot size: up to 50 end users in a controlled beta.
- Surfaces in pilot: mobile app for end users and web dashboard for supervisors/admin.
- Success baseline: onboarding, attendance logging, exclusion-zone alerts, reminders, and compliance visibility are operational for pilot participants.

## 3. Roles and Access Boundaries

1. End User

- Can record attendance events and receive reminders/geo alerts.

2. Sponsor

- Can receive approved reminder context and may verify attendance when enabled by policy.

3. Meeting Verifier

- Can attest attendance via allowed verification flow.

4. Supervisor

- Can view assigned users only; receives configured compliance alerts.

5. Admin/Owner

- Can manage tenant/org configuration, RBAC policy, retention, and exports.

Role constraints:

- Multi-tenant separation is mandatory.
- Supervisor access must be constrained to assigned users.
- Sensitive actions must be audit-logged.

## 4. Configuration Model (Tenant-Scoped)

1. Verification policy

- Dwell threshold minutes (default 60).
- Verification mode: signature-required vs dwell-only-allowed.

2. Geofence/exclusion policy

- Meeting geofence radius/polygon and confidence thresholds.
- Exclusion-zone definitions, warning buffer distance, violation rules.

3. Notification policy

- Recipient routing for supervisor alerts.
- Channel toggles (email/SMS) per tenant/user assignment.

4. Reminder policy

- Recurrence rules: daily/weekly/biweekly/monthly.
- Reminder types: sponsor call, probation/parole appointment, sponsee check-in (when enabled).

5. Data governance policy

- Location/history retention windows.
- Export permissions and access controls.

## 5. Functional Requirements

### FR-001 Authentication, RBAC, and Tenancy

- The system shall authenticate users and enforce role-based access per tenant.
  Acceptance criteria:
- Requests without auth context are rejected with `401`.
- Unauthorized role/permission access is rejected with `403`.
- Supervisor access to end-user data is limited to assigned users.

### FR-002 Attendance Recording and Verification

- The system shall support meeting check-in/check-out with dwell-time computation.
  Acceptance criteria:
- Attendance records include meeting id, user id, check-in/out timestamps, and status (`INCOMPLETE | PROVISIONAL | VERIFIED`).
- Default dwell threshold is 60 minutes unless tenant config overrides it.
- `VERIFIED` requires verifier signature or tenant-configured dwell-only policy.

### FR-003 Meeting Directory and Geofence Validation

- The system shall manage meeting locations with geofence metadata and verify on-site presence.
  Acceptance criteria:
- Meeting entries include name, address, geofence coordinates/shape, and optional schedule.
- Verification logic stores geofence confidence metadata.
- Geofence checks support server-side validation path.

### FR-004 Exclusion-Zone Compliance

- The system shall warn users near restricted zones and create violation events on entry.
  Acceptance criteria:
- Warning event is generated when entering configured buffer distance.
- Violation event is generated when entering zone boundary.
- Supervisors receive configured alert notifications.

### FR-005 Digital Verification Flow

- The system shall support attendance attestation by a meeting verifier.
  Acceptance criteria:
- Verification path supports digital signature or secure-link/QR pattern.
- Verification outcome is recorded with actor and timestamp.

### FR-006 Supervisor Dashboard

- The system shall provide compliance and verification visibility for assigned users.
  Acceptance criteria:
- Supervisors can filter assigned-user records.
- Verification details and incident timelines are visible for scoped users.
- Cross-tenant data access is blocked.

### FR-007 Reminders and Scheduling

- The system shall schedule and deliver accountability reminders.
  Acceptance criteria:
- Reminders support daily/weekly/biweekly/monthly recurrences.
- Sponsor call and probation/parole reminder types are available in MVP-1.
- Delivery degrades gracefully under OS/background constraints.

### FR-008 Audit Logging and Restricted Exports

- The system shall audit sensitive actions and restrict exports.
  Acceptance criteria:
- Sensitive reads/actions (location trace, photo view, export, config changes) create audit entries.
- Export actions require explicit authorized roles.
- Audit entries include actor, tenant, action, timestamp, and subject metadata.

### FR-009 AA Tradition and Privacy Guardrails

- The system shall preserve anonymity and avoid implied AA endorsement.
  Acceptance criteria:
- No feature exposes identities of other meeting attendees.
- Optional photo proof flow enforces selfie-oriented guidance and discourages crowd capture.
- Group phone lists are opt-in and group-managed only.

## 6. Non-Functional Requirements

1. Security

- Encrypt in transit and at rest.
- Enforce least-privilege RBAC and prevent IDOR.
- Require MFA for Admin/Supervisor accounts.

2. Privacy and governance

- Minimize and retain precise location history only as configured/necessary.
- Enforce tenant isolation in storage and query paths.
- Maintain complete audit trails for sensitive access.

3. Reliability

- Core flows must tolerate intermittent connectivity and retry safely.
- Reminder and alert pipelines must degrade gracefully under background limitations.

4. Performance and scale (beta)

- Support a 50-user pilot with responsive dashboard queries and timely alert delivery.

5. Observability

- Emit structured logs with trace/correlation context.
- Capture basic metrics for request outcomes and critical workflows.

6. Maintainability

- Type-safe APIs, validation on all external input paths, and documented config defaults.

## 7. Definition of Done (Per Feature)

A feature is complete only when all conditions are met:

1. Unit and integration tests cover acceptance criteria.
2. Security review is completed for location/photo/notification/export changes.
3. Manual QA includes background location, low battery, poor connectivity, and timezone edge cases.
4. Documentation is updated in `/docs` and applicable admin/config guidance.
5. Feature flags and role visibility are validated for relevant user types.

## 8. Out of Scope for MVP-1

- Mandatory photo proof.
- Auto-enrollment in group phone lists.
- Any workflow implying AA organizational endorsement.
