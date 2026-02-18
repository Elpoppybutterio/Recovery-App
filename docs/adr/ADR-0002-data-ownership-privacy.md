# ADR-0002: Data Ownership and Privacy Guardrails

## Status

Accepted

## Context

The platform processes sensitive recovery/compliance data (attendance, locations, reminders, signatures, supervisor access). The product must align to AA privacy expectations and the guardrails in `AGENTS.md`.

## Decision

1. Data ownership

- Tenant/app owner is the data owner for operational data under their organization boundary.
- Access is role-based and tenant-scoped; no cross-tenant reads/writes.

2. Privacy and AA traditions

- No public disclosure of member lists or attendance rosters.
- Product behavior must avoid outing participants in UI, notifications, exports, and logs.
- Any photo-based proof flow must default to self-only guidance and discourage capturing others.
- Data collection must follow minimization: capture only what is needed for compliance/accountability workflows.

3. Audit and access controls

- Sensitive reads/writes must generate audit entries with actor, tenant, subject, action, and timestamp.
- Role + assignment restrictions are mandatory for supervisor views.
- Export and sensitive data surfaces must remain permission-gated and auditable.

## Rationale

- Preserves participant safety and anonymity in recovery contexts.
- Reduces legal/compliance risk from unnecessary data exposure.
- Supports defensible access governance for court/probation accountability workflows.

## Consequences

Positive:

- Stronger privacy posture and clearer governance expectations.
- Consistent guardrails for API, dashboard, and mobile features.

Tradeoffs:

- Additional implementation overhead for audit coverage and access checks.
- Some convenience workflows are intentionally constrained to avoid privacy violations.

## Follow-ups

1. Define explicit retention windows per data class (location, attendance artifacts, exports).
2. Add periodic audits of sensitive endpoint coverage.
3. Document incident response flow for privacy/access violations.
