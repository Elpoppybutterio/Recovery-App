"use client";

import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { buildEnforcementRecordDraftFromRecommendation } from "../../../mobile/lib/soberHouse/enforcement";
import {
  acknowledgeEnforcementRecord,
  addProofReviewNote,
  addEnforcementRecordNote,
  assignEnforcementRecord,
  createProofReviewRecord,
  createEnforcementRecord,
  escalateEnforcementRecord,
  linkEnforcementRecordToViolation,
  reviewProofRecord,
  resolveEnforcementRecord,
  upsertViolation,
} from "../../../mobile/lib/soberHouse/mutations";
import type { EnforcementLevel } from "../../../mobile/lib/soberHouse/types";
import { buildProofReviewRecordDraftFromQueueItem } from "../../../mobile/lib/soberHouse/proofReview";
import {
  buildOperatorReportCsv,
  buildSoberHouseOperatorReportDocument,
} from "../../../mobile/lib/soberHouse/reportingExports";
import {
  buildDevOperatorAuthHeader,
  loadOperatorLiveSnapshot,
  persistOperatorLiveSnapshot,
  resolveDashboardApiUrl,
  type OperatorLiveSession,
} from "../lib/operatorLiveData";
import { reviewOperatorSoberHouseProof } from "../lib/operatorProofReviews";
import { buildPrintableOperatorReportHtml } from "../lib/reportPrint";
import {
  buildOperatorWebViewModel,
  type OperatorEnforcementQueueFilters,
  type OperatorNavSection,
  type OperatorProofQueueFilters,
  type OperatorWebRole,
  type OperatorControlPlaneDataSource,
  type ResidentLookupFilters,
} from "../lib/soberHouseControlPlane";

type ReportType =
  | "ORGANIZATION_ROLLUP_REPORT"
  | "HOUSE_COMPLIANCE_REPORT"
  | "RESIDENT_COMPLIANCE_SUMMARY"
  | "VIOLATIONS_INCIDENTS_EXPORT"
  | "OVERDUE_MISSING_PROOF_REPORT";

const NAV_ITEMS: Array<{ id: OperatorNavSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "actions", label: "Action Queue" },
  { id: "proof", label: "Proof Review" },
  { id: "houses", label: "Houses" },
  { id: "residents", label: "Residents" },
  { id: "staff", label: "Staff" },
  { id: "rules", label: "Rules" },
  { id: "reports", label: "Reports" },
  { id: "summaries", label: "Summaries" },
];

const REPORT_TYPE_OPTIONS: Array<{ id: ReportType; label: string }> = [
  { id: "ORGANIZATION_ROLLUP_REPORT", label: "Organization" },
  { id: "HOUSE_COMPLIANCE_REPORT", label: "House" },
  { id: "RESIDENT_COMPLIANCE_SUMMARY", label: "Resident" },
  { id: "VIOLATIONS_INCIDENTS_EXPORT", label: "Violations" },
  { id: "OVERDUE_MISSING_PROOF_REPORT", label: "Missing proof" },
];

function formatPercent(value: number | null): string {
  return value === null ? "Not tracked" : `${Math.round(value)}%`;
}

function formatDashboardDate(value: string | null): string {
  if (!value) {
    return "Not scheduled";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLiveObligationTypeLabel(value: "HOUSE_MEETING" | "ONE_ON_ONE" | "CHORE"): string {
  switch (value) {
    case "ONE_ON_ONE":
      return "One-on-one";
    case "HOUSE_MEETING":
      return "House meeting";
    case "CHORE":
    default:
      return "Chore";
  }
}

function downloadTextFile(fileName: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(href);
}

function printableTitle(reportType: ReportType): string {
  switch (reportType) {
    case "ORGANIZATION_ROLLUP_REPORT":
      return "Organization Rollup Report";
    case "HOUSE_COMPLIANCE_REPORT":
      return "House Compliance Report";
    case "RESIDENT_COMPLIANCE_SUMMARY":
      return "Resident Compliance Summary";
    case "VIOLATIONS_INCIDENTS_EXPORT":
      return "Violations / Incidents Export";
    case "OVERDUE_MISSING_PROOF_REPORT":
      return "Overdue / Missing Proof Report";
    default:
      return reportType;
  }
}

const ACTOR = { id: "web-operator", name: "Web Operator" };
const DEV_OPERATOR_ID_STORAGE_KEY = "sober2.operator.devUserId";
const OPERATOR_ORG_ID_STORAGE_KEY = "sober2.operator.organizationId";

function nextLevel(level: EnforcementLevel): EnforcementLevel {
  switch (level) {
    case "REMINDER":
      return "WARNING";
    case "WARNING":
      return "STAFF_REVIEW";
    case "STAFF_REVIEW":
      return "INCIDENT";
    case "INCIDENT":
    case "DISCHARGE_REVIEW":
    default:
      return "DISCHARGE_REVIEW";
  }
}

function toViolationRuleType(
  sourceRuleType: string,
): "curfew" | "chores" | "work" | "jobSearch" | "meetings" | "sponsorContact" | "other" {
  if (sourceRuleType === "curfew" || sourceRuleType === "chores" || sourceRuleType === "work") {
    return sourceRuleType;
  }
  if (
    sourceRuleType === "jobSearch" ||
    sourceRuleType === "meetings" ||
    sourceRuleType === "sponsorContact"
  ) {
    return sourceRuleType;
  }
  return "other";
}

export function OperatorDashboardClient(): JSX.Element {
  const [devUserId, setDevUserId] = useState("");
  const [requestedDevUserId, setRequestedDevUserId] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [sessionStore, setSessionStore] = useState<OperatorControlPlaneDataSource | null>(null);
  const [liveSession, setLiveSession] = useState<OperatorLiveSession | null>(null);
  const [loadState, setLoadState] = useState<
    "booting" | "loading" | "ready" | "unauthenticated" | "forbidden" | "error"
  >("booting");
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [loadRequestKey, setLoadRequestKey] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [liveReviewState, setLiveReviewState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [liveReviewMessage, setLiveReviewMessage] = useState<string | null>(null);
  const [activeLiveReviewId, setActiveLiveReviewId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<OperatorNavSection>("overview");
  const [role, setRole] = useState<OperatorWebRole>("ORG_ADMIN");
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(null);
  const [selectedResidentId, setSelectedResidentId] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [selectedProofItemId, setSelectedProofItemId] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>("ORGANIZATION_ROLLUP_REPORT");
  const [residentFilters, setResidentFilters] = useState<ResidentLookupFilters>({
    search: "",
    houseId: null,
    complianceBand: "all",
    overdueOnly: false,
    highRiskOnly: false,
    openViolationsOnly: false,
  });
  const [enforcementFilters, setEnforcementFilters] = useState<OperatorEnforcementQueueFilters>({
    houseId: null,
    residentId: null,
    level: "all",
    status: "all",
    urgentOnly: false,
    highRiskOnly: false,
    category: "all",
  });
  const [proofFilters, setProofFilters] = useState<OperatorProofQueueFilters>({
    houseId: null,
    residentId: null,
    category: "all",
    status: "all",
    proofRequiredOnly: false,
    pendingOnly: false,
    rejectedOnly: false,
    missingOnly: false,
    highRiskOnly: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedDevUserId = window.localStorage.getItem(DEV_OPERATOR_ID_STORAGE_KEY) ?? "";
    const storedOrganizationId = window.localStorage.getItem(OPERATOR_ORG_ID_STORAGE_KEY);
    setDevUserId(storedDevUserId);
    setRequestedDevUserId(storedDevUserId);
    setSelectedOrganizationId(
      storedOrganizationId && storedOrganizationId.length > 0 ? storedOrganizationId : null,
    );
    setLoadState(storedDevUserId.trim().length > 0 ? "loading" : "unauthenticated");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (requestedDevUserId.trim().length > 0) {
      window.localStorage.setItem(DEV_OPERATOR_ID_STORAGE_KEY, requestedDevUserId.trim());
    } else {
      window.localStorage.removeItem(DEV_OPERATOR_ID_STORAGE_KEY);
    }
  }, [requestedDevUserId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (selectedOrganizationId && selectedOrganizationId.length > 0) {
      window.localStorage.setItem(OPERATOR_ORG_ID_STORAGE_KEY, selectedOrganizationId);
    } else {
      window.localStorage.removeItem(OPERATOR_ORG_ID_STORAGE_KEY);
    }
  }, [selectedOrganizationId]);

  useEffect(() => {
    const normalizedDevUserId = requestedDevUserId.trim();
    if (normalizedDevUserId.length === 0) {
      setSessionStore(null);
      setLiveSession(null);
      setLoadState("unauthenticated");
      setLoadMessage("Enter a DEV operator user id to load the sober-housing control plane.");
      return;
    }

    let disposed = false;
    setLoadState("loading");
    setLoadMessage(null);

    void loadOperatorLiveSnapshot({
      apiUrl: resolveDashboardApiUrl(),
      devUserId: normalizedDevUserId,
      organizationId: selectedOrganizationId,
    }).then((result) => {
      if (disposed) {
        return;
      }

      if (result.status !== "ready") {
        setSessionStore(null);
        setLiveSession(null);
        setLoadState(result.status);
        setLoadMessage(result.message);
        return;
      }

      setSessionStore(result.snapshot.data);
      setLiveSession(result.snapshot.session);
      setRole(result.snapshot.session.operatorRole);
      setSelectedHouseId(null);
      setSelectedResidentId(null);
      setSelectedActionId(null);
      setLoadState("ready");
      setLoadMessage(null);
      setSaveState("idle");
      setSaveMessage(null);
    });

    return () => {
      disposed = true;
    };
  }, [loadRequestKey, requestedDevUserId, selectedOrganizationId]);

  const clearOperatorSession = (message: string) => {
    setDevUserId("");
    setRequestedDevUserId("");
    setSelectedOrganizationId(null);
    setSessionStore(null);
    setLiveSession(null);
    setLoadState("unauthenticated");
    setLoadMessage(message);
    setSaveState("idle");
    setSaveMessage(null);
    setLiveReviewState("idle");
    setLiveReviewMessage(null);
    setActiveLiveReviewId(null);
    setActiveSection("overview");
    setRole("ORG_ADMIN");
    setSelectedHouseId(null);
    setSelectedResidentId(null);
    setSelectedActionId(null);
    setSelectedProofItemId(null);
  };

  const applyStoreUpdate = async (nextStore: OperatorControlPlaneDataSource["store"]) => {
    if (!sessionStore) {
      return;
    }

    const optimisticData: OperatorControlPlaneDataSource = {
      ...sessionStore,
      store: nextStore,
    };
    setSessionStore(optimisticData);

    if (!liveSession) {
      return;
    }

    setSaveState("saving");
    setSaveMessage(null);
    try {
      const persisted = await persistOperatorLiveSnapshot({
        apiUrl: resolveDashboardApiUrl(),
        devUserId: requestedDevUserId.trim(),
        organizationId: liveSession.organizationId,
        store: nextStore,
      });
      setSessionStore(persisted.data);
      setLiveSession(persisted.session);
      setSaveState("saved");
      setSaveMessage(`Saved ${new Date(persisted.generatedAt).toLocaleTimeString()}`);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Unable to save operator changes.");
    }
  };

  const viewModel = useMemo(
    () =>
      buildOperatorWebViewModel({
        storeOverride: sessionStore ?? undefined,
        role,
        selectedHouseId,
        selectedResidentId,
        selectedActionId,
        selectedProofItemId,
        residentFilters,
        enforcementFilters,
        proofFilters,
        reportType,
        reportHouseId: residentFilters.houseId,
        reportResidentId: selectedResidentId,
      }),
    [
      enforcementFilters,
      proofFilters,
      reportType,
      residentFilters,
      role,
      selectedActionId,
      selectedHouseId,
      selectedProofItemId,
      selectedResidentId,
      sessionStore,
    ],
  );

  const reportPreview = useMemo(
    () =>
      buildSoberHouseOperatorReportDocument({
        store: viewModel.store,
        nowIso: viewModel.nowIso,
        filters: {
          startDate: viewModel.reportPreview.periodStart,
          endDate: viewModel.reportPreview.periodEnd,
          organizationId: viewModel.store.organization?.id ?? null,
          houseId: residentFilters.houseId,
          residentId: selectedResidentId,
          complianceBand:
            residentFilters.complianceBand === "all" ? "ALL" : residentFilters.complianceBand,
          onlyOpenViolations: residentFilters.openViolationsOnly,
          onlyMissingProof: reportType === "OVERDUE_MISSING_PROOF_REPORT",
          onlyOverdue: residentFilters.overdueOnly,
          highRiskOnly: residentFilters.highRiskOnly,
        },
        reportType,
      }),
    [
      reportType,
      residentFilters.complianceBand,
      residentFilters.highRiskOnly,
      residentFilters.houseId,
      residentFilters.openViolationsOnly,
      residentFilters.overdueOnly,
      selectedResidentId,
      viewModel.nowIso,
      viewModel.reportPreview.periodEnd,
      viewModel.reportPreview.periodStart,
      viewModel.store,
    ],
  );

  const openPrintableReport = () => {
    const nextWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!nextWindow) {
      return;
    }
    nextWindow.document.open();
    nextWindow.document.write(buildPrintableOperatorReportHtml(reportPreview));
    nextWindow.document.close();
  };

  const selectedReportHouseId = residentFilters.houseId ?? viewModel.selectedHouse?.houseId ?? null;

  const ensureActionRecord = (actionId: string) => {
    if (!sessionStore) {
      return null;
    }
    const queueItem = viewModel.enforcementQueue.find((item) => item.id === actionId);
    if (!queueItem) {
      return null;
    }
    if (queueItem.sourceKind === "record") {
      return { store: sessionStore.store, recordId: queueItem.id };
    }

    const created = createEnforcementRecord(
      sessionStore.store,
      ACTOR,
      {
        ...buildEnforcementRecordDraftFromRecommendation(queueItem),
        organizationId: viewModel.store.organization?.id ?? null,
      },
      new Date().toISOString(),
    ).store;
    const recordId = created.enforcementRecords[0]?.id ?? null;
    if (!recordId) {
      return null;
    }
    void applyStoreUpdate(created);
    setSelectedActionId(recordId);
    return { store: created, recordId };
  };

  const resolveDefaultAssigneeId = (actionId: string): string | null => {
    const queueItem = viewModel.enforcementQueue.find((item) => item.id === actionId);
    if (!queueItem?.houseId) {
      return null;
    }
    return (
      viewModel.staff.find(
        (assignment) =>
          assignment.assignedHouseIds.includes(queueItem.houseId!) &&
          assignment.role === "HOUSE_MANAGER",
      )?.id ??
      viewModel.staff.find((assignment) => assignment.assignedHouseIds.includes(queueItem.houseId!))
        ?.id ??
      null
    );
  };

  const ensureProofRecord = (proofItemId: string) => {
    if (!sessionStore) {
      return null;
    }
    const queueItem = viewModel.proofQueue.find((item) => item.id === proofItemId);
    if (!queueItem) {
      return null;
    }
    if (queueItem.proofReviewRecordId) {
      return {
        store: sessionStore.store,
        recordId: queueItem.proofReviewRecordId,
      };
    }
    const created = createProofReviewRecord(
      sessionStore.store,
      ACTOR,
      {
        ...buildProofReviewRecordDraftFromQueueItem(queueItem),
        organizationId: viewModel.store.organization?.id ?? null,
      },
      new Date().toISOString(),
    ).store;
    const recordId = created.proofReviewRecords[0]?.id ?? null;
    if (!recordId) {
      return null;
    }
    void applyStoreUpdate(created);
    setSelectedProofItemId(recordId);
    return {
      store: created,
      recordId,
    };
  };

  const handleAcknowledgeAction = (actionId: string) => {
    const ensured = ensureActionRecord(actionId);
    if (!ensured) {
      return;
    }
    const nextStore = acknowledgeEnforcementRecord(
      ensured.store,
      ACTOR,
      ensured.recordId,
      new Date().toISOString(),
      "Acknowledged from the operator queue.",
    ).store;
    void applyStoreUpdate(nextStore);
  };

  const handleAddNote = (actionId: string) => {
    const note = window.prompt("Add operator note");
    if (!note || note.trim().length === 0) {
      return;
    }
    const ensured = ensureActionRecord(actionId);
    if (!ensured) {
      return;
    }
    const nextStore = addEnforcementRecordNote(
      ensured.store,
      ACTOR,
      ensured.recordId,
      note.trim(),
      new Date().toISOString(),
    ).store;
    void applyStoreUpdate(nextStore);
  };

  const handleResolveAction = (actionId: string) => {
    const ensured = ensureActionRecord(actionId);
    if (!ensured) {
      return;
    }
    const nextStore = resolveEnforcementRecord(
      ensured.store,
      ACTOR,
      ensured.recordId,
      new Date().toISOString(),
      "Resolved from the operator queue.",
    ).store;
    void applyStoreUpdate(nextStore);
  };

  const handleEscalateAction = (actionId: string) => {
    const action = viewModel.enforcementQueue.find((item) => item.id === actionId);
    const ensured = ensureActionRecord(actionId);
    if (!ensured || !action) {
      return;
    }
    const nextStore = escalateEnforcementRecord(
      ensured.store,
      ACTOR,
      ensured.recordId,
      nextLevel(action.level),
      new Date().toISOString(),
      "Escalated from the operator queue.",
    ).store;
    void applyStoreUpdate(nextStore);
  };

  const handleAssignAction = (actionId: string) => {
    const assigneeId = resolveDefaultAssigneeId(actionId);
    if (!assigneeId) {
      return;
    }
    const ensured = ensureActionRecord(actionId);
    if (!ensured) {
      return;
    }
    const nextStore = assignEnforcementRecord(
      ensured.store,
      ACTOR,
      ensured.recordId,
      assigneeId,
      new Date().toISOString(),
      "Assigned from the operator queue.",
    ).store;
    void applyStoreUpdate(nextStore);
  };

  const handleLinkIncident = (actionId: string) => {
    const action = viewModel.enforcementQueue.find((item) => item.id === actionId);
    const ensured = ensureActionRecord(actionId);
    if (!ensured || !action) {
      return;
    }
    const storeWithViolation = action.linkedViolationId
      ? ensured.store
      : upsertViolation(
          ensured.store,
          ACTOR,
          {
            residentId: action.residentId,
            linkedUserId: action.linkedUserId ?? action.residentId,
            houseId: action.houseId,
            organizationId: viewModel.store.organization?.id ?? null,
            ruleType: toViolationRuleType(action.sourceRuleType),
            sourceEvaluationReference: null,
            sourceEvaluationSnapshot: null,
            complianceWindowKey: `${action.residentId}:${action.category}:${new Date().toISOString().slice(0, 10)}`,
            triggeredAt: new Date().toISOString(),
            effectiveAt: new Date().toISOString(),
            dueAt: action.dueAt,
            gracePeriodMinutesUsed: null,
            status: "OPEN",
            severity:
              action.level === "INCIDENT" || action.level === "DISCHARGE_REVIEW"
                ? "CRITICAL"
                : "WARNING",
            reasonSummary: action.reasonSummary,
            managerNotes: "Incident linked from operator enforcement queue.",
            resolutionNotes: "",
            createdBy: "MANUAL",
            reviewedBy: null,
            reviewedAt: null,
            resolvedBy: null,
            resolvedAt: null,
            correctiveActionIds: [],
            evidenceItemIds: [],
          },
          new Date().toISOString(),
        ).store;
    const violationId = action.linkedViolationId ?? storeWithViolation.violations[0]?.id ?? null;
    if (!violationId) {
      return;
    }
    const nextStore = linkEnforcementRecordToViolation(
      storeWithViolation,
      ACTOR,
      ensured.recordId,
      violationId,
      new Date().toISOString(),
      "Incident linked from the operator queue.",
    ).store;
    void applyStoreUpdate(nextStore);
  };

  const handleSetProofStatus = (
    proofItemId: string,
    status: "APPROVED" | "REJECTED" | "PENDING" | "FOLLOW_UP_REQUIRED",
  ) => {
    const ensured = ensureProofRecord(proofItemId);
    if (!ensured) {
      return;
    }
    const nextStore = reviewProofRecord(
      ensured.store,
      ACTOR,
      ensured.recordId,
      status,
      new Date().toISOString(),
      status === "APPROVED"
        ? "Approved in proof review."
        : status === "REJECTED"
          ? "Rejected in proof review."
          : status === "FOLLOW_UP_REQUIRED"
            ? "Operator follow-up requested."
            : "Returned to pending review.",
    ).store;
    void applyStoreUpdate(nextStore);
  };

  const handleAddProofNote = (proofItemId: string) => {
    const note = window.prompt("Add proof review note");
    if (!note || note.trim().length === 0) {
      return;
    }
    const ensured = ensureProofRecord(proofItemId);
    if (!ensured) {
      return;
    }
    const nextStore = addProofReviewNote(
      ensured.store,
      ACTOR,
      ensured.recordId,
      note.trim(),
      new Date().toISOString(),
    ).store;
    void applyStoreUpdate(nextStore);
  };

  const reloadLiveSnapshot = async () => {
    const result = await loadOperatorLiveSnapshot({
      apiUrl: resolveDashboardApiUrl(),
      devUserId: requestedDevUserId.trim(),
      organizationId: selectedOrganizationId,
    });
    if (result.status !== "ready") {
      throw new Error(result.message);
    }
    setSessionStore(result.snapshot.data);
    setLiveSession(result.snapshot.session);
    setRole(result.snapshot.session.operatorRole);
  };

  const handleReviewLiveProof = async (
    reviewId: string,
    reviewOutcome: "APPROVED" | "REJECTED",
  ) => {
    const authHeader = buildDevOperatorAuthHeader(requestedDevUserId.trim()).Authorization;
    const notePrompt =
      reviewOutcome === "REJECTED" ? window.prompt("Add a short rejection note (optional)") : "";
    if (reviewOutcome === "REJECTED" && notePrompt === null) {
      return;
    }

    setActiveLiveReviewId(reviewId);
    setLiveReviewState("saving");
    setLiveReviewMessage(null);

    try {
      await reviewOperatorSoberHouseProof({
        reviewId,
        authHeader,
        payload: {
          reviewOutcome,
          reviewedAt: new Date().toISOString(),
          note: notePrompt?.trim() || undefined,
        },
      });
      await reloadLiveSnapshot();
      setLiveReviewState("saved");
      setLiveReviewMessage(
        reviewOutcome === "APPROVED" ? "Live proof approved." : "Live proof rejected.",
      );
    } catch (error) {
      setLiveReviewState("error");
      setLiveReviewMessage(
        error instanceof Error ? error.message : "Unable to update live proof review.",
      );
    } finally {
      setActiveLiveReviewId(null);
    }
  };

  if (loadState !== "ready" || !sessionStore || !liveSession) {
    return (
      <main className="operator-auth-shell">
        <section className="operator-auth-card">
          <p className="eyebrow">Authenticated dashboard session</p>
          <h1>Sober² Housing Control Plane</h1>
          <p className="muted-copy">
            Load the live sober-housing organization dashboard with your DEV user id.
          </p>
          <label className="control-label">
            DEV user id
            <input
              className="control-input"
              value={devUserId}
              onChange={(event) => setDevUserId(event.target.value)}
              placeholder="enduser-a1"
            />
          </label>
          <div className="action-row">
            <button
              className="action-button primary"
              onClick={() => {
                setRequestedDevUserId(devUserId.trim());
                setSelectedOrganizationId(null);
                setLoadState("loading");
                setLoadRequestKey((current) => current + 1);
              }}
            >
              Open dashboard
            </button>
            {requestedDevUserId ? (
              <button
                className="action-button secondary"
                onClick={() => clearOperatorSession("Signed out of the operator control plane.")}
              >
                Clear session
              </button>
            ) : null}
          </div>
          {loadState === "loading" ? (
            <p className="muted-copy">Loading live organization data...</p>
          ) : null}
          {loadMessage ? <p className="error-copy">{loadMessage}</p> : null}
          <div className="subpanel">
            <h4>What this loads</h4>
            <ul className="bullet-list">
              <li>Organization, houses, residents, and staff in your org scope</li>
              <li>Rules, reports, summaries, and exports from persisted sober-house data</li>
              <li>Live enforcement queue and intervention history where available</li>
            </ul>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="operator-shell">
      <aside className="operator-sidebar">
        <div className="operator-brand">
          <p className="eyebrow">Authenticated operator session</p>
          <h1>Sober² Housing</h1>
          <p className="sidebar-copy">
            Desktop control plane for hierarchy, rules, resident risk, reporting, and snapshots.
          </p>
          <p className="sidebar-copy subtle">
            {liveSession.operatorDisplayName} • {liveSession.organizationName}
          </p>
        </div>

        <div className="sidebar-block">
          <p className="sidebar-label">Organization</p>
          <select
            className="control-input"
            value={selectedOrganizationId ?? liveSession.organizationId}
            onChange={(event) => {
              setSelectedOrganizationId(event.target.value || null);
              setLoadState("loading");
              setLoadRequestKey((current) => current + 1);
            }}
          >
            {liveSession.availableOrganizations.map((entry) => (
              <option key={entry.organizationId} value={entry.organizationId}>
                {entry.organizationName}
              </option>
            ))}
          </select>
        </div>

        <div className="sidebar-block">
          <p className="sidebar-label">Session</p>
          <p className="sidebar-copy subtle">DEV_{requestedDevUserId.trim()}</p>
          <div className="action-row">
            <button
              className="action-button secondary"
              onClick={() =>
                clearOperatorSession(
                  "Signed out of the operator control plane. Enter a different DEV user id to continue.",
                )
              }
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="sidebar-block">
          <p className="sidebar-label">Operator role</p>
          <div className="sidebar-chip-list">
            {liveSession.allowedRoles.map((entry) => (
              <button
                key={entry}
                className={`sidebar-chip ${role === entry ? "selected" : ""}`}
                onClick={() => setRole(entry)}
              >
                {entry === "ORG_ADMIN"
                  ? "Org admin"
                  : entry === "HOUSE_MANAGER"
                    ? "House manager"
                    : "Staff viewer"}
              </button>
            ))}
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activeSection === item.id ? "active" : ""}`}
              onClick={() => setActiveSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-label">Visible houses</p>
          {viewModel.houses.map((house) => (
            <button
              key={house.houseId}
              className={`sidebar-house-link ${selectedHouseId === house.houseId ? "selected" : ""}`}
              onClick={() => {
                setSelectedHouseId(house.houseId);
                setActiveSection("houses");
              }}
            >
              <span>{house.houseName}</span>
              <span>{formatPercent(house.compliancePercent)}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="operator-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Sober-housing operator dashboard</p>
            <h2>{viewModel.organization.organizationName}</h2>
            <p className="muted-copy">
              Org → house → resident oversight with explicit completion truth, rule hierarchy, and
              reporting access.
            </p>
            {saveMessage ? (
              <p className={saveState === "error" ? "error-copy" : "muted-copy"}>{saveMessage}</p>
            ) : null}
          </div>
          <div className="header-stats">
            <div className="stat-pill">
              <span className="stat-label">Houses</span>
              <strong>{viewModel.organization.totalHouses}</strong>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Residents</span>
              <strong>{viewModel.organization.totalResidents}</strong>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Open incidents</span>
              <strong>{viewModel.organization.openViolationsIncidents}</strong>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Session</span>
              <strong>
                {saveState === "saving" ? "Saving" : saveState === "error" ? "Error" : "Live"}
              </strong>
            </div>
            <div className="stat-pill">
              <span className="stat-label">Open actions</span>
              <strong>{viewModel.organizationEnforcement.openCount}</strong>
            </div>
          </div>
        </header>

        {activeSection === "overview" ? (
          <section className="section-stack">
            <div className="hero-grid">
              <article className="summary-card">
                <p className="section-label">Organization overview</p>
                <div className="metric-grid">
                  <div className="metric-card">
                    <span className="metric-label">Occupied beds</span>
                    <strong>{viewModel.organization.occupiedBeds}</strong>
                    <span className="metric-detail">Across all visible houses</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Compliance bands</span>
                    <strong>
                      {viewModel.organization.compliantResidentsCount}/
                      {viewModel.organization.warningResidentsCount}/
                      {viewModel.organization.noncompliantResidentsCount}/
                      {viewModel.organization.criticalResidentsCount}
                    </strong>
                    <span className="metric-detail">
                      Compliant / warning / noncompliant / critical
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">One-on-one completion</span>
                    <strong>
                      {formatPercent(viewModel.organization.oneOnOneCompletionPercent)}
                    </strong>
                    <span className="metric-detail">
                      {viewModel.organization.oneOnOneTracked
                        ? "Explicit sessions logged"
                        : "Not tracked yet"}
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Sponsor adherence</span>
                    <strong>
                      {formatPercent(viewModel.organization.sponsorCallAdherencePercent)}
                    </strong>
                    <span className="metric-detail">
                      {viewModel.organization.sponsorTracked
                        ? "Explicit sponsor calls logged"
                        : "Not tracked yet"}
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">House-meeting / work</span>
                    <strong>{formatPercent(viewModel.organization.workCompliancePercent)}</strong>
                    <span className="metric-detail">Work/job-search compliance where modeled</span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Missed chores / curfew</span>
                    <strong>
                      {viewModel.organization.missedChoresToday} /{" "}
                      {viewModel.organization.curfewMissesThisWeek}
                    </strong>
                    <span className="metric-detail">
                      Today’s chores / this week’s curfew misses
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Enforcement queue</span>
                    <strong>
                      {viewModel.organizationEnforcement.warningCount}/
                      {viewModel.organizationEnforcement.reviewCount}/
                      {viewModel.organizationEnforcement.incidentCount}
                    </strong>
                    <span className="metric-detail">
                      Warning / review / incident items currently open
                    </span>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Proof review</span>
                    <strong>
                      {viewModel.organizationProofSummary.pendingCount}/
                      {viewModel.organizationProofSummary.rejectedCount}/
                      {viewModel.organizationProofSummary.missingCount}
                    </strong>
                    <span className="metric-detail">
                      Pending / rejected / missing proof across visible houses
                    </span>
                  </div>
                </div>
              </article>

              <article className="summary-card">
                <p className="section-label">Recent console activity</p>
                <div className="mini-list">
                  {viewModel.snapshots.slice(0, 3).map((summary) => (
                    <button
                      key={summary.id}
                      className="mini-row"
                      onClick={() => setActiveSection("summaries")}
                    >
                      <div>
                        <strong>{summary.title}</strong>
                        <p>{summary.subtitle}</p>
                      </div>
                      <span>{summary.filters.startDate}</span>
                    </button>
                  ))}
                  {viewModel.recentExports.slice(0, 3).map((report) => (
                    <button
                      key={report.id}
                      className="mini-row"
                      onClick={() => setActiveSection("reports")}
                    >
                      <div>
                        <strong>{report.title}</strong>
                        <p>
                          {report.format} • {report.itemCount} items
                        </p>
                      </div>
                      <span>{report.generatedAt.slice(0, 10)}</span>
                    </button>
                  ))}
                </div>
              </article>
            </div>

            <div className="dual-grid">
              <article className="panel-card">
                <div className="panel-header">
                  <div>
                    <p className="section-label">Highest-risk houses</p>
                    <h3>Drill into the houses driving operator attention</h3>
                  </div>
                </div>
                <div className="mini-list">
                  {viewModel.organization.highestRiskHouses.map((house) => (
                    <button
                      key={house.houseId}
                      className="mini-row"
                      onClick={() => {
                        setSelectedHouseId(house.houseId);
                        setActiveSection("houses");
                      }}
                    >
                      <div>
                        <strong>{house.houseName}</strong>
                        <p>{house.detail}</p>
                      </div>
                      <span className={`risk-pill ${house.complianceBand}`}>
                        {house.complianceBand}
                      </span>
                    </button>
                  ))}
                </div>
              </article>

              <article className="panel-card">
                <div className="panel-header">
                  <div>
                    <p className="section-label">Highest-risk residents</p>
                    <h3>Fast resident lookup from the org landing page</h3>
                  </div>
                </div>
                <div className="mini-list">
                  {viewModel.organization.highestRiskResidents.map((resident) => (
                    <button
                      key={resident.residentId}
                      className="mini-row"
                      onClick={() => {
                        setSelectedResidentId(resident.residentId);
                        setActiveSection("residents");
                      }}
                    >
                      <div>
                        <strong>{resident.residentName}</strong>
                        <p>{resident.detail}</p>
                      </div>
                      <span className={`risk-pill ${resident.complianceBand}`}>
                        {resident.complianceBand}
                      </span>
                    </button>
                  ))}
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {activeSection === "actions" ? (
          <section className="section-stack">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Action queue</p>
                  <h3>Threshold-based escalation and enforcement workflow</h3>
                </div>
              </div>
              <div className="filter-grid">
                <select
                  className="control-input"
                  value={enforcementFilters.houseId ?? ""}
                  onChange={(event) =>
                    setEnforcementFilters((current) => ({
                      ...current,
                      houseId: event.target.value || null,
                    }))
                  }
                >
                  <option value="">All houses</option>
                  {viewModel.houses.map((house) => (
                    <option key={house.houseId} value={house.houseId}>
                      {house.houseName}
                    </option>
                  ))}
                </select>
                <select
                  className="control-input"
                  value={enforcementFilters.level}
                  onChange={(event) =>
                    setEnforcementFilters((current) => ({
                      ...current,
                      level: event.target.value as OperatorEnforcementQueueFilters["level"],
                    }))
                  }
                >
                  <option value="all">All levels</option>
                  <option value="REMINDER">Reminder</option>
                  <option value="WARNING">Warning</option>
                  <option value="STAFF_REVIEW">Staff review</option>
                  <option value="INCIDENT">Incident</option>
                  <option value="DISCHARGE_REVIEW">Discharge review</option>
                </select>
                <select
                  className="control-input"
                  value={enforcementFilters.status}
                  onChange={(event) =>
                    setEnforcementFilters((current) => ({
                      ...current,
                      status: event.target.value as OperatorEnforcementQueueFilters["status"],
                    }))
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="ACKNOWLEDGED">Acknowledged</option>
                  <option value="ESCALATED">Escalated</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
                <select
                  className="control-input"
                  value={enforcementFilters.category}
                  onChange={(event) =>
                    setEnforcementFilters((current) => ({
                      ...current,
                      category: event.target.value as OperatorEnforcementQueueFilters["category"],
                    }))
                  }
                >
                  <option value="all">All categories</option>
                  <option value="CHORES">Chores</option>
                  <option value="CURFEW">Curfew</option>
                  <option value="HOUSE_MEETINGS">House meetings</option>
                  <option value="ONE_ON_ONES">One-on-ones</option>
                  <option value="SPONSOR_CALLS">Sponsor calls</option>
                  <option value="MISSING_PROOF">Missing proof</option>
                  <option value="WORK">Work</option>
                  <option value="JOB_SEARCH">Job search</option>
                  <option value="MEETINGS">Meetings</option>
                  <option value="VIOLATION">Violation</option>
                  <option value="REPEATED_NONCOMPLIANCE">Repeated noncompliance</option>
                </select>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={enforcementFilters.urgentOnly}
                    onChange={(event) =>
                      setEnforcementFilters((current) => ({
                        ...current,
                        urgentOnly: event.target.checked,
                      }))
                    }
                  />
                  Urgent only
                </label>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={enforcementFilters.highRiskOnly}
                    onChange={(event) =>
                      setEnforcementFilters((current) => ({
                        ...current,
                        highRiskOnly: event.target.checked,
                      }))
                    }
                  />
                  High-risk only
                </label>
              </div>

              <div className="dual-grid">
                <div className="mini-list">
                  {viewModel.enforcementQueue.length === 0 ? (
                    <div className="empty-state">
                      No open enforcement items in the current scope.
                    </div>
                  ) : (
                    viewModel.enforcementQueue.map((item) => (
                      <button
                        key={item.id}
                        className="mini-row"
                        onClick={() => {
                          setSelectedActionId(item.id);
                          setSelectedResidentId(item.residentId);
                        }}
                      >
                        <div>
                          <strong>
                            {item.residentName} • {item.category.toLowerCase().replaceAll("_", " ")}
                          </strong>
                          <p>
                            {item.houseName} • {item.reasonSummary}
                          </p>
                        </div>
                        <span className={`risk-pill ${item.complianceBand}`}>
                          {item.level.toLowerCase().replaceAll("_", " ")}
                        </span>
                      </button>
                    ))
                  )}
                </div>

                {viewModel.selectedAction ? (
                  <article className="panel-card nested">
                    <div className="panel-header">
                      <div>
                        <p className="section-label">Action detail</p>
                        <h3>{viewModel.selectedAction.residentName}</h3>
                      </div>
                      <span className={`risk-pill ${viewModel.selectedAction.complianceBand}`}>
                        {viewModel.selectedAction.level.toLowerCase().replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="muted-copy">
                      {viewModel.selectedAction.houseName} •{" "}
                      {viewModel.selectedAction.reasonSummary}
                    </p>
                    <div className="metric-grid compact">
                      <div className="metric-card">
                        <span className="metric-label">Status</span>
                        <strong>{viewModel.selectedAction.status.toLowerCase()}</strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Source</span>
                        <strong>{viewModel.selectedAction.sourceKind}</strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Urgent</span>
                        <strong>{viewModel.selectedAction.urgent ? "Yes" : "No"}</strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Assigned</span>
                        <strong>
                          {viewModel.staff.find(
                            (assignment) =>
                              assignment.id === viewModel.selectedAction?.assignedStaffAssignmentId,
                          )?.firstName ?? "Unassigned"}
                        </strong>
                      </div>
                    </div>
                    <div className="subpanel">
                      <h4>Recommended action</h4>
                      <p className="muted-copy">{viewModel.selectedAction.recommendedAction}</p>
                    </div>
                    <div className="action-row">
                      <button
                        className="action-button primary"
                        onClick={() => handleAcknowledgeAction(viewModel.selectedAction!.id)}
                      >
                        Acknowledge
                      </button>
                      <button
                        className="action-button secondary"
                        onClick={() => handleAssignAction(viewModel.selectedAction!.id)}
                      >
                        Assign
                      </button>
                      <button
                        className="action-button secondary"
                        onClick={() => handleAddNote(viewModel.selectedAction!.id)}
                      >
                        Add note
                      </button>
                      <button
                        className="action-button secondary"
                        onClick={() => handleEscalateAction(viewModel.selectedAction!.id)}
                      >
                        Escalate
                      </button>
                      <button
                        className="action-button secondary"
                        onClick={() => handleLinkIncident(viewModel.selectedAction!.id)}
                      >
                        Link incident
                      </button>
                      <button
                        className="action-button secondary"
                        onClick={() => handleResolveAction(viewModel.selectedAction!.id)}
                      >
                        Mark resolved
                      </button>
                    </div>
                  </article>
                ) : (
                  <div className="empty-state">Select an action to review or update it.</div>
                )}
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "proof" ? (
          <section className="section-stack">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Live resident execution</p>
                  <h3>Pending sober-house proof reviews from real resident submissions</h3>
                </div>
              </div>
              <div className="metric-grid compact">
                <div className="metric-card">
                  <span className="metric-label">Due today</span>
                  <strong>{viewModel.liveComplianceSummary.dueTodayCount}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Completed today</span>
                  <strong>{viewModel.liveComplianceSummary.completedTodayCount}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Pending review</span>
                  <strong>{viewModel.liveComplianceSummary.pendingReviewCount}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Overdue</span>
                  <strong>{viewModel.liveComplianceSummary.overdueCount}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Rejected proof</span>
                  <strong>{viewModel.liveComplianceSummary.rejectedProofCount}</strong>
                </div>
              </div>
              {liveReviewMessage ? (
                <p className={liveReviewState === "error" ? "error-copy" : "muted-copy"}>
                  {liveReviewMessage}
                </p>
              ) : null}
              <div className="mini-list">
                {viewModel.livePendingReviewQueue.length === 0 ? (
                  <div className="empty-state">
                    No live resident submissions are waiting on proof review right now.
                  </div>
                ) : (
                  viewModel.livePendingReviewQueue.map((item) => (
                    <div key={item.obligationId} className="mini-row static">
                      <div>
                        <strong>
                          {item.residentName} • {item.title}
                        </strong>
                        <p>
                          {item.houseName} • {formatLiveObligationTypeLabel(item.obligationType)} •{" "}
                          submitted {formatDashboardDate(item.submittedAt ?? item.completedAt)}
                        </p>
                        <p>{item.detail}</p>
                        <div className="action-row">
                          <button
                            className="action-button primary"
                            onClick={() =>
                              void handleReviewLiveProof(item.proofReviewId!, "APPROVED")
                            }
                            disabled={activeLiveReviewId === item.proofReviewId}
                          >
                            Approve
                          </button>
                          <button
                            className="action-button secondary"
                            onClick={() =>
                              void handleReviewLiveProof(item.proofReviewId!, "REJECTED")
                            }
                            disabled={activeLiveReviewId === item.proofReviewId}
                          >
                            Reject
                          </button>
                          <button
                            className="action-button secondary"
                            onClick={() => {
                              setSelectedResidentId(item.residentId);
                              setActiveSection("residents");
                            }}
                            disabled={activeLiveReviewId === item.proofReviewId}
                          >
                            View resident
                          </button>
                        </div>
                      </div>
                      <span className={`risk-pill ${item.statusTone}`}>{item.statusLabel}</span>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Proof review queue</p>
                  <h3>Review resident proof submissions and unresolved proof gaps</h3>
                </div>
              </div>
              <div className="filter-grid">
                <select
                  className="control-input"
                  value={proofFilters.houseId ?? ""}
                  onChange={(event) =>
                    setProofFilters((current) => ({
                      ...current,
                      houseId: event.target.value || null,
                    }))
                  }
                >
                  <option value="">All houses</option>
                  {viewModel.houses.map((house) => (
                    <option key={house.houseId} value={house.houseId}>
                      {house.houseName}
                    </option>
                  ))}
                </select>
                <select
                  className="control-input"
                  value={proofFilters.residentId ?? ""}
                  onChange={(event) =>
                    setProofFilters((current) => ({
                      ...current,
                      residentId: event.target.value || null,
                    }))
                  }
                >
                  <option value="">All residents</option>
                  {viewModel.residents.map((resident) => (
                    <option key={resident.residentId} value={resident.residentId}>
                      {resident.fullName}
                    </option>
                  ))}
                </select>
                <select
                  className="control-input"
                  value={proofFilters.category}
                  onChange={(event) =>
                    setProofFilters((current) => ({
                      ...current,
                      category: event.target.value as OperatorProofQueueFilters["category"],
                    }))
                  }
                >
                  <option value="all">All categories</option>
                  <option value="CHORES">Chores</option>
                  <option value="HOUSE_MEETINGS">House meetings</option>
                  <option value="SPONSOR_CALLS">Sponsor calls</option>
                  <option value="JOB_SEARCH">Job search</option>
                  <option value="WORK">Work</option>
                </select>
                <select
                  className="control-input"
                  value={proofFilters.status}
                  onChange={(event) =>
                    setProofFilters((current) => ({
                      ...current,
                      status: event.target.value as OperatorProofQueueFilters["status"],
                    }))
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="follow_up_required">Follow up required</option>
                  <option value="missing">Missing</option>
                </select>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={proofFilters.proofRequiredOnly}
                    onChange={(event) =>
                      setProofFilters((current) => ({
                        ...current,
                        proofRequiredOnly: event.target.checked,
                      }))
                    }
                  />
                  Proof required only
                </label>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={proofFilters.pendingOnly}
                    onChange={(event) =>
                      setProofFilters((current) => ({
                        ...current,
                        pendingOnly: event.target.checked,
                      }))
                    }
                  />
                  Pending only
                </label>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={proofFilters.rejectedOnly}
                    onChange={(event) =>
                      setProofFilters((current) => ({
                        ...current,
                        rejectedOnly: event.target.checked,
                      }))
                    }
                  />
                  Rejected only
                </label>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={proofFilters.missingOnly}
                    onChange={(event) =>
                      setProofFilters((current) => ({
                        ...current,
                        missingOnly: event.target.checked,
                      }))
                    }
                  />
                  Missing only
                </label>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={proofFilters.highRiskOnly}
                    onChange={(event) =>
                      setProofFilters((current) => ({
                        ...current,
                        highRiskOnly: event.target.checked,
                      }))
                    }
                  />
                  High-risk only
                </label>
              </div>

              <div className="metric-grid compact">
                <div className="metric-card">
                  <span className="metric-label">Pending</span>
                  <strong>{viewModel.organizationProofSummary.pendingCount}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Rejected</span>
                  <strong>{viewModel.organizationProofSummary.rejectedCount}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Follow up</span>
                  <strong>{viewModel.organizationProofSummary.followUpCount}</strong>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Missing</span>
                  <strong>{viewModel.organizationProofSummary.missingCount}</strong>
                </div>
              </div>

              <div className="dual-grid">
                <div className="mini-list">
                  {viewModel.proofQueue.length === 0 ? (
                    <div className="empty-state">
                      No proof items match the current queue filters.
                    </div>
                  ) : (
                    viewModel.proofQueue.map((item) => (
                      <button
                        key={item.id}
                        className="mini-row"
                        onClick={() => {
                          setSelectedProofItemId(item.id);
                          setSelectedResidentId(item.residentId);
                        }}
                      >
                        <div>
                          <strong>
                            {item.residentName} • {item.title}
                          </strong>
                          <p>
                            {item.houseName} • {item.category.toLowerCase().replaceAll("_", " ")} •{" "}
                            {item.reviewStatus.replaceAll("_", " ")}
                          </p>
                        </div>
                        <span className={`risk-pill ${item.complianceBand}`}>
                          {item.reviewStatus.replaceAll("_", " ")}
                        </span>
                      </button>
                    ))
                  )}
                </div>

                {viewModel.selectedProofItem ? (
                  <article className="panel-card nested">
                    <div className="panel-header">
                      <div>
                        <p className="section-label">Proof detail</p>
                        <h3>{viewModel.selectedProofItem.title}</h3>
                      </div>
                      <span className={`risk-pill ${viewModel.selectedProofItem.complianceBand}`}>
                        {viewModel.selectedProofItem.reviewStatus.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="muted-copy">
                      {viewModel.selectedProofItem.residentName} •{" "}
                      {viewModel.selectedProofItem.houseName}
                    </p>
                    <div className="metric-grid compact">
                      <div className="metric-card">
                        <span className="metric-label">Submitted</span>
                        <strong>
                          {viewModel.selectedProofItem.submittedAt?.slice(0, 10) ?? "No"}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Evidence items</span>
                        <strong>{viewModel.selectedProofItem.evidenceItemIds.length}</strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Notes</span>
                        <strong>{viewModel.selectedProofItem.noteCount}</strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Open enforcement</span>
                        <strong>{viewModel.selectedProofItem.linkedEnforcementCount}</strong>
                      </div>
                    </div>
                    <div className="subpanel">
                      <h4>Review actions</h4>
                      <div className="action-row">
                        <button
                          className="action-button primary"
                          onClick={() =>
                            handleSetProofStatus(viewModel.selectedProofItem!.id, "APPROVED")
                          }
                        >
                          Approve
                        </button>
                        <button
                          className="action-button secondary"
                          onClick={() =>
                            handleSetProofStatus(viewModel.selectedProofItem!.id, "REJECTED")
                          }
                        >
                          Reject
                        </button>
                        <button
                          className="action-button secondary"
                          onClick={() =>
                            handleSetProofStatus(
                              viewModel.selectedProofItem!.id,
                              "FOLLOW_UP_REQUIRED",
                            )
                          }
                        >
                          Needs follow-up
                        </button>
                        <button
                          className="action-button secondary"
                          onClick={() =>
                            handleSetProofStatus(viewModel.selectedProofItem!.id, "PENDING")
                          }
                        >
                          Mark pending
                        </button>
                        <button
                          className="action-button secondary"
                          onClick={() => handleAddProofNote(viewModel.selectedProofItem!.id)}
                        >
                          Add note
                        </button>
                        <button
                          className="action-button secondary"
                          onClick={() => {
                            setSelectedResidentId(viewModel.selectedProofItem!.residentId);
                            setActiveSection("residents");
                          }}
                        >
                          View resident
                        </button>
                        <button
                          className="action-button secondary"
                          onClick={() => {
                            setEnforcementFilters((current) => ({
                              ...current,
                              residentId: viewModel.selectedProofItem!.residentId,
                            }));
                            setSelectedResidentId(viewModel.selectedProofItem!.residentId);
                            setSelectedActionId(null);
                            setActiveSection("actions");
                          }}
                        >
                          Open actions
                        </button>
                      </div>
                    </div>
                    <div className="subpanel">
                      <h4>Context</h4>
                      <p className="muted-copy">
                        Proof required: {viewModel.selectedProofItem.proofRequired ? "Yes" : "No"} •
                        Proof provided: {viewModel.selectedProofItem.proofProvided ? "Yes" : "No"}
                      </p>
                      {viewModel.selectedProofItem.latestNote ? (
                        <p className="muted-copy">
                          Latest note: {viewModel.selectedProofItem.latestNote}
                        </p>
                      ) : null}
                    </div>
                  </article>
                ) : (
                  <div className="empty-state">Select a proof item to review it.</div>
                )}
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "houses" ? (
          <section className="section-stack">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Houses</p>
                  <h3>Searchable house index with compliance and issue counts</h3>
                </div>
              </div>
              <div className="table-wrap">
                <table className="control-table">
                  <thead>
                    <tr>
                      <th>House</th>
                      <th>Group</th>
                      <th>Occupancy</th>
                      <th>Compliance</th>
                      <th>Warnings</th>
                      <th>Critical</th>
                      <th>Open issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModel.houses.map((house) => (
                      <tr
                        key={house.houseId}
                        className={
                          viewModel.selectedHouse?.houseId === house.houseId ? "selected-row" : ""
                        }
                        onClick={() => setSelectedHouseId(house.houseId)}
                      >
                        <td>{house.houseName}</td>
                        <td>{house.groupName}</td>
                        <td>
                          {house.occupiedBeds}/{house.bedCount}
                        </td>
                        <td>{formatPercent(house.compliancePercent)}</td>
                        <td>{house.warningResidents + house.noncompliantResidents}</td>
                        <td>{house.criticalResidents}</td>
                        <td>{house.openViolations + house.unresolvedActionItems}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            {viewModel.selectedHouse ? (
              <div className="dual-grid">
                <article className="panel-card">
                  <div className="panel-header">
                    <div>
                      <p className="section-label">House detail</p>
                      <h3>{viewModel.selectedHouse.houseName}</h3>
                    </div>
                    <span className="panel-chip">{viewModel.selectedHouse.groupName}</span>
                  </div>
                  <div className="metric-grid compact">
                    <div className="metric-card">
                      <span className="metric-label">Roster</span>
                      <strong>{viewModel.selectedHouse.rosterCount}</strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Meetings</span>
                      <strong>
                        {viewModel.selectedHouse.meetingsCompleted ?? 0}/
                        {viewModel.selectedHouse.meetingsRequired ?? 0}
                      </strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">One-on-ones</span>
                      <strong>
                        {viewModel.selectedHouse.oneOnOnesCompleted ?? 0}/
                        {viewModel.selectedHouse.oneOnOnesDue ?? 0}
                      </strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Sponsor</span>
                      <strong>
                        {formatPercent(viewModel.selectedHouse.sponsorCallAdherencePercent)}
                      </strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Open actions</span>
                      <strong>{viewModel.selectedHouseEnforcement?.openCount ?? 0}</strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Incident / review</span>
                      <strong>
                        {(viewModel.selectedHouseEnforcement?.incidentCount ?? 0) +
                          (viewModel.selectedHouseEnforcement?.reviewCount ?? 0)}
                      </strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Pending proof</span>
                      <strong>{viewModel.selectedHouseProofSummary?.pendingCount ?? 0}</strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Rejected / missing</span>
                      <strong>
                        {(viewModel.selectedHouseProofSummary?.rejectedCount ?? 0) +
                          (viewModel.selectedHouseProofSummary?.missingCount ?? 0)}
                      </strong>
                    </div>
                  </div>

                  <div className="subpanel">
                    <h4>Enforcement summary</h4>
                    <div className="metric-grid compact">
                      <div className="metric-card">
                        <span className="metric-label">Reminders</span>
                        <strong>{viewModel.selectedHouseEnforcement?.reminderCount ?? 0}</strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Warnings</span>
                        <strong>{viewModel.selectedHouseEnforcement?.warningCount ?? 0}</strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Reviews</span>
                        <strong>{viewModel.selectedHouseEnforcement?.reviewCount ?? 0}</strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Incidents</span>
                        <strong>{viewModel.selectedHouseEnforcement?.incidentCount ?? 0}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="subpanel">
                    <h4>Assigned staff</h4>
                    <div className="mini-list">
                      {viewModel.selectedHouseStaff.map((assignment) => (
                        <div key={assignment.id} className="mini-row static">
                          <div>
                            <strong>
                              {assignment.firstName} {assignment.lastName}
                            </strong>
                            <p>{assignment.role.toLowerCase().replaceAll("_", " ")}</p>
                          </div>
                          <span>{assignment.phone}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="subpanel">
                    <h4>Recent activity</h4>
                    <div className="mini-list">
                      {viewModel.recentHouseActivity.length === 0 ? (
                        <div className="empty-state">No recent activity in this house.</div>
                      ) : (
                        viewModel.recentHouseActivity.slice(0, 6).map((item) => (
                          <div key={item.id} className="mini-row static">
                            <div>
                              <strong>{item.label}</strong>
                              <p>{item.detail}</p>
                            </div>
                            <span>{item.at.slice(0, 10)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </article>

                <article className="panel-card">
                  <div className="panel-header">
                    <div>
                      <p className="section-label">House roster</p>
                      <h3>Resident drilldown</h3>
                    </div>
                  </div>
                  <div className="mini-list">
                    {viewModel.selectedHouseRoster.map((resident) => (
                      <button
                        key={resident.residentId}
                        className="mini-row"
                        onClick={() => {
                          setSelectedResidentId(resident.residentId);
                          setActiveSection("residents");
                        }}
                      >
                        <div>
                          <strong>{resident.fullName}</strong>
                          <p>
                            {resident.houseName} •{" "}
                            {resident.assignedStaff?.firstName ?? "Unassigned"}{" "}
                            {resident.assignedStaff?.lastName ?? ""}
                          </p>
                        </div>
                        <span className={`risk-pill ${resident.complianceBand}`}>
                          {resident.complianceBand}
                        </span>
                      </button>
                    ))}
                  </div>
                </article>
              </div>
            ) : (
              <div className="empty-state">
                No house detail is available for the current role scope.
              </div>
            )}
          </section>
        ) : null}

        {activeSection === "residents" ? (
          <section className="section-stack">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Resident lookup</p>
                  <h3>Search and filter residents across the organization</h3>
                </div>
              </div>
              <div className="filter-grid">
                <input
                  className="control-input"
                  value={residentFilters.search}
                  onChange={(event) =>
                    setResidentFilters((current) => ({ ...current, search: event.target.value }))
                  }
                  placeholder="Search resident name or house"
                />
                <select
                  className="control-input"
                  value={residentFilters.houseId ?? ""}
                  onChange={(event) =>
                    setResidentFilters((current) => ({
                      ...current,
                      houseId: event.target.value || null,
                    }))
                  }
                >
                  <option value="">All houses</option>
                  {viewModel.houses.map((house) => (
                    <option key={house.houseId} value={house.houseId}>
                      {house.houseName}
                    </option>
                  ))}
                </select>
                <select
                  className="control-input"
                  value={residentFilters.complianceBand}
                  onChange={(event) =>
                    setResidentFilters((current) => ({
                      ...current,
                      complianceBand: event.target.value as ResidentLookupFilters["complianceBand"],
                    }))
                  }
                >
                  <option value="all">All compliance bands</option>
                  <option value="compliant">Compliant</option>
                  <option value="warning">Warning</option>
                  <option value="noncompliant">Noncompliant</option>
                  <option value="critical">Critical</option>
                </select>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={residentFilters.overdueOnly}
                    onChange={(event) =>
                      setResidentFilters((current) => ({
                        ...current,
                        overdueOnly: event.target.checked,
                      }))
                    }
                  />
                  Overdue only
                </label>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={residentFilters.highRiskOnly}
                    onChange={(event) =>
                      setResidentFilters((current) => ({
                        ...current,
                        highRiskOnly: event.target.checked,
                      }))
                    }
                  />
                  High-risk only
                </label>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={residentFilters.openViolationsOnly}
                    onChange={(event) =>
                      setResidentFilters((current) => ({
                        ...current,
                        openViolationsOnly: event.target.checked,
                      }))
                    }
                  />
                  Open violations only
                </label>
              </div>

              <div className="dual-grid">
                <div className="mini-list">
                  {viewModel.residents.map((resident) => (
                    <button
                      key={resident.residentId}
                      className="mini-row"
                      onClick={() => setSelectedResidentId(resident.residentId)}
                    >
                      <div>
                        <strong>{resident.fullName}</strong>
                        <p>
                          {resident.houseName} • {resident.phaseLabel} • score{" "}
                          {resident.complianceScore}
                        </p>
                      </div>
                      <span className={`risk-pill ${resident.complianceBand}`}>
                        {resident.complianceBand}
                      </span>
                    </button>
                  ))}
                </div>

                {viewModel.selectedResident ? (
                  <article className="panel-card nested">
                    {(() => {
                      const resident = viewModel.selectedResident;
                      return (
                        <>
                          <div className="panel-header">
                            <div>
                              <p className="section-label">Resident profile</p>
                              <h3>{resident.fullName}</h3>
                            </div>
                            <span className={`risk-pill ${resident.complianceBand}`}>
                              {resident.complianceBand}
                            </span>
                          </div>
                          <p className="muted-copy">
                            {resident.houseName} • {resident.phaseLabel}
                            {resident.assignedStaff
                              ? ` • ${resident.assignedStaff.firstName} ${resident.assignedStaff.lastName}`
                              : ""}
                          </p>
                          <div className="metric-grid compact">
                            <div className="metric-card">
                              <span className="metric-label">Meetings</span>
                              <strong>
                                {resident.meetingsCompleted ?? 0}/{resident.meetingsRequired ?? 0}
                              </strong>
                            </div>
                            <div className="metric-card">
                              <span className="metric-label">Chores</span>
                              <strong>
                                {resident.choresCompleted}/{resident.choresAssigned}
                              </strong>
                            </div>
                            <div className="metric-card">
                              <span className="metric-label">Curfew</span>
                              <strong>{resident.curfewMissesThisWeek}</strong>
                            </div>
                            <div className="metric-card">
                              <span className="metric-label">One-on-ones</span>
                              <strong>
                                {resident.oneOnOnesCompleted ?? 0}/{resident.oneOnOnesDue ?? 0}
                              </strong>
                            </div>
                            <div className="metric-card">
                              <span className="metric-label">Sponsor</span>
                              <strong>
                                {resident.sponsorCallsCompleted ?? 0}/
                                {resident.sponsorCallsDue ?? 0}
                              </strong>
                            </div>
                            <div className="metric-card">
                              <span className="metric-label">Missing proof</span>
                              <strong>{resident.missingProofCount}</strong>
                            </div>
                          </div>

                          <div className="subpanel">
                            <h4>Proof status</h4>
                            <div className="metric-grid compact">
                              <div className="metric-card">
                                <span className="metric-label">Pending</span>
                                <strong>{resident.proofSummary?.pendingCount ?? 0}</strong>
                              </div>
                              <div className="metric-card">
                                <span className="metric-label">Rejected</span>
                                <strong>{resident.proofSummary?.rejectedCount ?? 0}</strong>
                              </div>
                              <div className="metric-card">
                                <span className="metric-label">Missing</span>
                                <strong>{resident.proofSummary?.missingCount ?? 0}</strong>
                              </div>
                              <div className="metric-card">
                                <span className="metric-label">Follow-up</span>
                                <strong>{resident.proofSummary?.followUpCount ?? 0}</strong>
                              </div>
                            </div>
                          </div>

                          <div className="subpanel">
                            <h4>Live obligation execution</h4>
                            <div className="metric-grid compact">
                              <div className="metric-card">
                                <span className="metric-label">Active</span>
                                <strong>{resident.liveObligationSummary.activeCount}</strong>
                              </div>
                              <div className="metric-card">
                                <span className="metric-label">Pending review</span>
                                <strong>{resident.liveObligationSummary.reviewPendingCount}</strong>
                              </div>
                              <div className="metric-card">
                                <span className="metric-label">Rejected</span>
                                <strong>{resident.liveObligationSummary.rejectedCount}</strong>
                              </div>
                              <div className="metric-card">
                                <span className="metric-label">Overdue</span>
                                <strong>{resident.liveObligationSummary.overdueCount}</strong>
                              </div>
                            </div>
                            <div className="mini-list">
                              {resident.liveObligations.length === 0 ? (
                                <div className="empty-state">
                                  No live sober-house obligations are currently visible for this
                                  resident.
                                </div>
                              ) : (
                                resident.liveObligations.map((item) => (
                                  <div key={item.obligationId} className="mini-row static">
                                    <div>
                                      <strong>
                                        {item.title} •{" "}
                                        {formatLiveObligationTypeLabel(item.obligationType)}
                                      </strong>
                                      <p>{item.detail}</p>
                                      <p>
                                        Due {formatDashboardDate(item.dueAt ?? item.scheduledAt)} •
                                        Completion{" "}
                                        {item.completionStatus
                                          ?.toLowerCase()
                                          .replaceAll("_", " ") ?? "not started"}{" "}
                                        • Proof{" "}
                                        {item.proofSubmitted ? "submitted" : "not submitted"}
                                      </p>
                                    </div>
                                    <span className={`risk-pill ${item.statusTone}`}>
                                      {item.statusLabel}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <div className="subpanel">
                            <h4>Current compliance drivers</h4>
                            <div className="mini-list">
                              {resident.statusReasons.map((reason) => (
                                <div key={reason} className="mini-row static">
                                  <div>
                                    <strong>{reason}</strong>
                                    <p>Trend: {resident.trend}</p>
                                  </div>
                                  <span>score {resident.complianceScore}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="subpanel">
                            <h4>Intervention summary</h4>
                            <div className="metric-grid compact">
                              <div className="metric-card">
                                <span className="metric-label">Open actions</span>
                                <strong>{resident.enforcementSummary?.openCount ?? 0}</strong>
                              </div>
                              <div className="metric-card">
                                <span className="metric-label">Warnings</span>
                                <strong>{resident.enforcementSummary?.warningCount ?? 0}</strong>
                              </div>
                              <div className="metric-card">
                                <span className="metric-label">Reviews</span>
                                <strong>{resident.enforcementSummary?.reviewCount ?? 0}</strong>
                              </div>
                              <div className="metric-card">
                                <span className="metric-label">Incidents</span>
                                <strong>{resident.enforcementSummary?.incidentCount ?? 0}</strong>
                              </div>
                            </div>
                          </div>

                          <div className="subpanel">
                            <h4>Proof review history</h4>
                            <div className="mini-list">
                              {resident.interventionTimeline
                                .filter((entry) => entry.category === "MISSING_PROOF")
                                .slice(0, 6)
                                .map((entry) => (
                                  <div key={entry.id} className="mini-row static">
                                    <div>
                                      <strong>{entry.title}</strong>
                                      <p>{entry.detail}</p>
                                    </div>
                                    <span>{entry.at.slice(0, 10)}</span>
                                  </div>
                                ))}
                              {resident.interventionTimeline.filter(
                                (entry) => entry.category === "MISSING_PROOF",
                              ).length === 0 ? (
                                <div className="empty-state">
                                  No proof review history has been recorded for this resident.
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="subpanel">
                            <h4>Effective rule summary</h4>
                            <div className="table-wrap">
                              <table className="control-table compact-table">
                                <thead>
                                  <tr>
                                    <th>Category</th>
                                    <th>Effective</th>
                                    <th>Source</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {resident.effectiveRules.map((row) => (
                                    <tr key={row.category}>
                                      <td>{row.category}</td>
                                      <td>{row.effectiveValue}</td>
                                      <td>{row.source}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="subpanel">
                            <h4>Intervention timeline</h4>
                            <div className="mini-list">
                              {resident.interventionTimeline.length === 0 ? (
                                <div className="empty-state">
                                  No intervention history has been recorded for this resident.
                                </div>
                              ) : (
                                resident.interventionTimeline.slice(0, 8).map((event) => (
                                  <div key={event.id} className="mini-row static">
                                    <div>
                                      <strong>{event.title}</strong>
                                      <p>{event.detail}</p>
                                    </div>
                                    <span>{event.at.slice(0, 10)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </article>
                ) : (
                  <div className="empty-state">Select a resident to open the full profile.</div>
                )}
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "staff" ? (
          <section className="section-stack">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Staff directory</p>
                  <h3>House assignments and operational responsibility</h3>
                </div>
              </div>
              <div className="table-wrap">
                <table className="control-table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Role</th>
                      <th>Assigned houses</th>
                      <th>Resident evidence</th>
                      <th>Exceptions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModel.staff.map((assignment) => (
                      <tr key={assignment.id}>
                        <td>
                          {assignment.firstName} {assignment.lastName}
                          <div className="cell-subcopy">{assignment.email}</div>
                        </td>
                        <td>{assignment.role.toLowerCase().replaceAll("_", " ")}</td>
                        <td>
                          {assignment.assignedHouseIds
                            .map(
                              (houseId) =>
                                viewModel.houses.find((house) => house.houseId === houseId)
                                  ?.houseName ?? "Unknown house",
                            )
                            .join(", ")}
                        </td>
                        <td>{assignment.canViewResidentEvidence ? "Can review" : "Hidden"}</td>
                        <td>{assignment.canApproveExceptions ? "Can approve" : "Read only"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "rules" ? (
          <section className="section-stack">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Rules console</p>
                  <h3>Org defaults, house overrides, and resident exception visibility</h3>
                </div>
              </div>
              {viewModel.selectedResident ? (
                <div className="table-wrap">
                  <table className="control-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Org default</th>
                        <th>House scope</th>
                        <th>Resident exception</th>
                        <th>Effective</th>
                        <th>Source</th>
                        <th>Consequence path</th>
                        <th>Open actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewModel.selectedResident.effectiveRules.map((row) => {
                        const enforcement =
                          viewModel.selectedResident?.enforcementLinks.find(
                            (item) => item.category === row.category,
                          ) ?? null;
                        return (
                          <tr key={row.category}>
                            <td>{row.category}</td>
                            <td>{row.organizationValue}</td>
                            <td>{row.houseValue}</td>
                            <td>{row.residentExceptionValue ?? "No exception"}</td>
                            <td>{row.effectiveValue}</td>
                            <td>{row.source}</td>
                            <td>{enforcement?.consequencePath ?? "No linked consequence path"}</td>
                            <td>
                              {enforcement?.openCount ?? 0}
                              {enforcement?.activeLevel
                                ? ` • ${enforcement.activeLevel.toLowerCase().replaceAll("_", " ")}`
                                : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  Select a resident from the Residents view to inspect final effective rules and
                  source hierarchy.
                </div>
              )}
            </article>
          </section>
        ) : null}

        {activeSection === "reports" ? (
          <section className="section-stack">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Reports & exports console</p>
                  <h3>
                    On-demand report generation over the existing sober-house reporting engine
                  </h3>
                </div>
              </div>
              <div className="filter-grid">
                <select
                  className="control-input"
                  value={reportType}
                  onChange={(event) => setReportType(event.target.value as ReportType)}
                >
                  {REPORT_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  className="control-input"
                  value={residentFilters.houseId ?? ""}
                  onChange={(event) =>
                    setResidentFilters((current) => ({
                      ...current,
                      houseId: event.target.value || null,
                    }))
                  }
                >
                  <option value="">All houses</option>
                  {viewModel.houses.map((house) => (
                    <option key={house.houseId} value={house.houseId}>
                      {house.houseName}
                    </option>
                  ))}
                </select>
                <button
                  className="action-button primary"
                  onClick={() =>
                    downloadTextFile(
                      `${printableTitle(reportType)}.csv`,
                      buildOperatorReportCsv(reportPreview),
                      "text/csv",
                    )
                  }
                >
                  Download CSV
                </button>
                <button className="action-button secondary" onClick={openPrintableReport}>
                  Open printable report
                </button>
              </div>

              <div className="metric-grid compact">
                {reportPreview.metrics.map((metric) => (
                  <div key={metric.label} className="metric-card">
                    <span className="metric-label">{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <span className="metric-detail">{metric.detail}</span>
                  </div>
                ))}
              </div>

              <div className="dual-grid">
                <article className="panel-card nested">
                  <div className="panel-header">
                    <div>
                      <p className="section-label">Current preview</p>
                      <h3>{reportPreview.title}</h3>
                    </div>
                    <span className="panel-chip">
                      {reportPreview.periodStart} to {reportPreview.periodEnd}
                    </span>
                  </div>
                  <div className="mini-list">
                    {reportPreview.sections.map((section) => (
                      <div key={section.title} className="mini-row static">
                        <div>
                          <strong>{section.title}</strong>
                          <p>
                            {section.kind === "table"
                              ? `${section.rows.length} rows`
                              : section.kind === "trend"
                                ? `${section.points.length} points`
                                : `${section.items.length} items`}
                          </p>
                        </div>
                        <span>{section.kind}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel-card nested">
                  <div className="panel-header">
                    <div>
                      <p className="section-label">Recent exports</p>
                      <h3>Stored operator export metadata</h3>
                    </div>
                  </div>
                  <div className="mini-list">
                    {viewModel.recentExports.length === 0 ? (
                      <div className="empty-state">No report exports have been logged yet.</div>
                    ) : (
                      viewModel.recentExports.map((report) => (
                        <div key={report.id} className="mini-row static">
                          <div>
                            <strong>{report.title}</strong>
                            <p>
                              {report.format} • {report.itemCount} items
                            </p>
                          </div>
                          <span>
                            {selectedReportHouseId && report.houseId === selectedReportHouseId
                              ? "House scope"
                              : "Org scope"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "summaries" ? (
          <section className="section-stack">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Summary snapshot center</p>
                  <h3>Daily and weekly sober-house summary access</h3>
                </div>
              </div>
              <div className="dual-grid">
                {viewModel.snapshots.map((summary) => (
                  <article key={summary.id} className="panel-card nested">
                    <div className="panel-header">
                      <div>
                        <p className="section-label">
                          {summary.summaryType.toLowerCase().replaceAll("_", " ")}
                        </p>
                        <h3>{summary.title}</h3>
                      </div>
                      <span className="panel-chip">
                        {summary.filters.startDate} to {summary.filters.endDate}
                      </span>
                    </div>
                    <p className="muted-copy">{summary.subtitle}</p>
                    <div className="metric-grid compact">
                      {summary.metrics.map((metric) => (
                        <div key={metric.label} className="metric-card">
                          <span className="metric-label">{metric.label}</span>
                          <strong>{metric.value}</strong>
                          <span className="metric-detail">{metric.detail}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mini-list">
                      {summary.highlights.length === 0 ? (
                        <div className="empty-state">
                          No impacted residents or houses in this summary.
                        </div>
                      ) : (
                        summary.highlights.map((item) => (
                          <div key={item} className="mini-row static">
                            <div>
                              <strong>{item}</strong>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </section>
        ) : null}
      </section>
    </main>
  );
}
