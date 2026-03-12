# ADR-0008: Monthly Report Snapshots Stay Immutable

## Status

Accepted

## Context

Sober-house monthly reports summarize settings, compliance, interventions, and structured communication over time. If reports are rendered only from live data, later rule or status changes can retroactively alter prior monthly outputs, which breaks operator trust and weakens auditability.

## Decision

- Monthly reports are stored as persisted `MonthlyReport` records.
- Each generated report stores a `summaryPayload` snapshot with the KPI, wins, and summary data needed for later in-app review or export rendering.
- Regeneration creates a new report record instead of mutating prior generated snapshots in place.
- Future export workflows should render from the stored snapshot rather than recomputing directly from live operational records.

## Consequences

- Past monthly reports remain stable even if house rules or resident requirements change later.
- Report history can show multiple generated snapshots for the same reporting month when managers regenerate intentionally.
- Export and audit workflows can rely on a frozen reporting payload instead of ad hoc recomputation.
