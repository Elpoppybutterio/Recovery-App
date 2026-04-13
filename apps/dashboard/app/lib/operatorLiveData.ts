"use client";

import type {
  OperatorControlPlaneDataSource,
  OperatorHouseComplianceSummary,
  OperatorLiveComplianceSummary,
  OperatorResidentLiveObligation,
  OperatorWebRole,
} from "./soberHouseControlPlane";

export type OperatorLiveSession = {
  authMode: "DEV_BEARER";
  operatorUserId: string;
  operatorDisplayName: string;
  organizationId: string;
  organizationName: string;
  operatorRole: OperatorWebRole;
  allowedRoles: OperatorWebRole[];
  availableOrganizations: Array<{
    organizationId: string;
    organizationName: string;
    operatorRole: OperatorWebRole;
  }>;
};

export type OperatorLiveSnapshot = {
  session: OperatorLiveSession;
  data: OperatorControlPlaneDataSource;
  generatedAt: string;
};

export type OperatorLiveLoadResult =
  | { status: "ready"; snapshot: OperatorLiveSnapshot }
  | { status: "unauthenticated"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "error"; message: string };

type FetchLike = typeof fetch;

function debugOperatorLiveData(event: string, details: Record<string, unknown>) {
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.log(`[dashboard][control-plane] ${event}`, details);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseResidentLiveObligations(value: unknown): OperatorResidentLiveObligation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((entry) => {
      const obligationId = readString(entry.obligationId);
      const residentId = readString(entry.residentId);
      const residentUserId = readString(entry.residentUserId);
      const organizationId = readString(entry.organizationId);
      const houseId = readString(entry.houseId);
      const obligationType = entry.obligationType;
      const title = readString(entry.title);
      const scheduledAt = readString(entry.scheduledAt);
      const createdAt = readString(entry.createdAt);
      const updatedAt = readString(entry.updatedAt);

      if (
        !obligationId ||
        !residentId ||
        !residentUserId ||
        !organizationId ||
        !houseId ||
        !title ||
        !scheduledAt ||
        !createdAt ||
        !updatedAt ||
        (obligationType !== "HOUSE_MEETING" &&
          obligationType !== "ONE_ON_ONE" &&
          obligationType !== "CHORE")
      ) {
        return null;
      }

      return {
        obligationId,
        residentId,
        residentUserId,
        organizationId,
        houseId,
        obligationType,
        title,
        scheduledAt,
        dueAt: typeof entry.dueAt === "string" ? entry.dueAt : null,
        proofRequired: entry.proofRequired === true,
        obligationStatus: entry.obligationStatus === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        completionRecordId:
          typeof entry.completionRecordId === "string" ? entry.completionRecordId : null,
        completionStatus:
          entry.completionStatus === "SCHEDULED" ||
          entry.completionStatus === "COMPLETED" ||
          entry.completionStatus === "MISSED" ||
          entry.completionStatus === "EXCUSED"
            ? entry.completionStatus
            : null,
        completedAt: typeof entry.completedAt === "string" ? entry.completedAt : null,
        submittedAt: typeof entry.submittedAt === "string" ? entry.submittedAt : null,
        proofSubmitted: entry.proofSubmitted === true,
        proofReviewId: typeof entry.proofReviewId === "string" ? entry.proofReviewId : null,
        proofReviewOutcome:
          entry.proofReviewOutcome === "PENDING" ||
          entry.proofReviewOutcome === "APPROVED" ||
          entry.proofReviewOutcome === "REJECTED" ||
          entry.proofReviewOutcome === "FOLLOW_UP_REQUIRED"
            ? entry.proofReviewOutcome
            : null,
        reviewedAt: typeof entry.reviewedAt === "string" ? entry.reviewedAt : null,
        createdAt,
        updatedAt,
      } satisfies OperatorResidentLiveObligation;
    })
    .filter((entry): entry is OperatorResidentLiveObligation => entry !== null);
}

function emptyComplianceSummary(): OperatorLiveComplianceSummary {
  return {
    dueTodayCount: 0,
    completedTodayCount: 0,
    overdueCount: 0,
    pendingReviewCount: 0,
    rejectedProofCount: 0,
  };
}

function parseComplianceSummaryCounts(value: unknown): OperatorLiveComplianceSummary {
  if (!isRecord(value)) {
    return emptyComplianceSummary();
  }

  return {
    dueTodayCount: typeof value.dueTodayCount === "number" ? value.dueTodayCount : 0,
    completedTodayCount:
      typeof value.completedTodayCount === "number" ? value.completedTodayCount : 0,
    overdueCount: typeof value.overdueCount === "number" ? value.overdueCount : 0,
    pendingReviewCount: typeof value.pendingReviewCount === "number" ? value.pendingReviewCount : 0,
    rejectedProofCount: typeof value.rejectedProofCount === "number" ? value.rejectedProofCount : 0,
  };
}

function parseHouseComplianceSummaries(value: unknown): OperatorHouseComplianceSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((entry) => {
      const houseId = readString(entry.houseId);
      const houseName = readString(entry.houseName);
      if (!houseId || !houseName) {
        return null;
      }

      return {
        houseId,
        houseName,
        ...parseComplianceSummaryCounts(entry),
      } satisfies OperatorHouseComplianceSummary;
    })
    .filter((entry): entry is OperatorHouseComplianceSummary => entry !== null);
}

export function resolveDashboardApiUrl(): string {
  return "/api/operator/sober-house/control-plane";
}

export function normalizeDevOperatorUserId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("DEV_") ? trimmed.slice(4) : trimmed;
}

export function buildDevOperatorAuthHeader(userId: string): Record<string, string> {
  return {
    Authorization: `Bearer DEV_${normalizeDevOperatorUserId(userId)}`,
  };
}

function buildSnapshotUrl(apiUrl: string, organizationId: string | null): string {
  const isAbsolute = apiUrl.startsWith("http://") || apiUrl.startsWith("https://");
  const url = isAbsolute ? new URL(apiUrl) : new URL(apiUrl, "http://dashboard.local");
  if (organizationId) {
    url.searchParams.set("organizationId", organizationId);
  }
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

function parseSnapshot(payload: unknown): OperatorLiveSnapshot | null {
  if (!isRecord(payload) || !isRecord(payload.session) || !isRecord(payload.data)) {
    return null;
  }

  const roleDefaults = isRecord(payload.data.roleDefaults) ? payload.data.roleDefaults : {};
  const residentDirectory = Array.isArray(payload.data.residentDirectory)
    ? payload.data.residentDirectory
    : [];
  const residentLiveObligations = parseResidentLiveObligations(
    payload.data.residentLiveObligations,
  );
  const complianceSummary = isRecord(payload.data.complianceSummary)
    ? {
        organization: parseComplianceSummaryCounts(payload.data.complianceSummary.organization),
        houses: parseHouseComplianceSummaries(payload.data.complianceSummary.houses),
      }
    : {
        organization: emptyComplianceSummary(),
        houses: [],
      };
  const store = isRecord(payload.data.store) ? payload.data.store : null;
  if (!store) {
    return null;
  }

  const allowedRoles = Array.isArray(payload.session.allowedRoles)
    ? payload.session.allowedRoles.filter(
        (entry): entry is OperatorWebRole =>
          entry === "ORG_ADMIN" || entry === "HOUSE_MANAGER" || entry === "STAFF_VIEWER",
      )
    : [];
  const availableOrganizations = Array.isArray(payload.session.availableOrganizations)
    ? payload.session.availableOrganizations
        .filter(isRecord)
        .map((entry): OperatorLiveSession["availableOrganizations"][number] => ({
          organizationId:
            typeof entry.organizationId === "string"
              ? entry.organizationId
              : "unknown-organization",
          organizationName:
            typeof entry.organizationName === "string"
              ? entry.organizationName
              : "Unknown organization",
          operatorRole:
            entry.operatorRole === "HOUSE_MANAGER"
              ? "HOUSE_MANAGER"
              : entry.operatorRole === "STAFF_VIEWER"
                ? "STAFF_VIEWER"
                : "ORG_ADMIN",
        }))
    : [];

  return {
    session: {
      authMode: "DEV_BEARER",
      operatorUserId:
        typeof payload.session.operatorUserId === "string" ? payload.session.operatorUserId : "",
      operatorDisplayName:
        typeof payload.session.operatorDisplayName === "string"
          ? payload.session.operatorDisplayName
          : "Operator",
      organizationId:
        typeof payload.session.organizationId === "string" ? payload.session.organizationId : "",
      organizationName:
        typeof payload.session.organizationName === "string"
          ? payload.session.organizationName
          : "Organization",
      operatorRole:
        payload.session.operatorRole === "HOUSE_MANAGER"
          ? "HOUSE_MANAGER"
          : payload.session.operatorRole === "STAFF_VIEWER"
            ? "STAFF_VIEWER"
            : "ORG_ADMIN",
      allowedRoles: allowedRoles.length > 0 ? allowedRoles : ["ORG_ADMIN"],
      availableOrganizations,
    },
    data: {
      store: store as OperatorControlPlaneDataSource["store"],
      residentDirectory: residentDirectory as OperatorControlPlaneDataSource["residentDirectory"],
      roleDefaults: roleDefaults as OperatorControlPlaneDataSource["roleDefaults"],
      residentLiveObligations,
      complianceSummary,
    },
    generatedAt:
      typeof payload.generatedAt === "string" ? payload.generatedAt : new Date().toISOString(),
  };
}

export async function loadOperatorLiveSnapshot(input: {
  fetchImpl?: FetchLike;
  apiUrl: string;
  devUserId: string;
  organizationId: string | null;
}): Promise<OperatorLiveLoadResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const normalizedUserId = normalizeDevOperatorUserId(input.devUserId);
  if (normalizedUserId.length === 0) {
    return {
      status: "unauthenticated",
      message: "Enter a DEV operator user id to start an authenticated operator session.",
    };
  }

  try {
    debugOperatorLiveData("load.request", {
      apiUrl: input.apiUrl,
      organizationId: input.organizationId,
      devUserId: normalizedUserId,
    });
    const response = await fetchImpl(buildSnapshotUrl(input.apiUrl, input.organizationId), {
      headers: buildDevOperatorAuthHeader(normalizedUserId),
      cache: "no-store",
    });

    if (response.status === 401) {
      return {
        status: "unauthenticated",
        message: "Sign in with a valid DEV operator user id to load the control plane.",
      };
    }

    if (response.status === 403) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      return {
        status: "forbidden",
        message:
          payload?.message ??
          "This authenticated account does not have sober-housing organization access.",
      };
    }

    if (!response.ok) {
      return {
        status: "error",
        message: `Dashboard API responded with ${response.status}.`,
      };
    }

    const snapshot = parseSnapshot(await response.json());
    if (!snapshot) {
      return {
        status: "error",
        message: "Dashboard API returned an invalid sober-house snapshot.",
      };
    }

    debugOperatorLiveData("load.success", {
      organizationId: snapshot.session.organizationId,
      houseCount: snapshot.data.store.houses.length,
      houseIds: snapshot.data.store.houses.map((house) => house.id),
    });
    return {
      status: "ready",
      snapshot,
    };
  } catch {
    return {
      status: "error",
      message: "Dashboard API is unreachable.",
    };
  }
}

export async function persistOperatorLiveSnapshot(input: {
  fetchImpl?: FetchLike;
  apiUrl: string;
  devUserId: string;
  organizationId: string;
  store: OperatorControlPlaneDataSource["store"];
}): Promise<OperatorLiveSnapshot> {
  const fetchImpl = input.fetchImpl ?? fetch;
  debugOperatorLiveData("save.request", {
    apiUrl: input.apiUrl,
    organizationId: input.organizationId,
    houseCount: input.store.houses.length,
    houseIds: input.store.houses.map((house) => house.id),
  });
  const response = await fetchImpl(buildSnapshotUrl(input.apiUrl, input.organizationId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...buildDevOperatorAuthHeader(input.devUserId),
    },
    body: JSON.stringify({
      store: input.store,
    }),
  });

  if (!response.ok) {
    throw new Error(`Dashboard API responded with ${response.status}.`);
  }

  const snapshot = parseSnapshot(await response.json());
  if (!snapshot) {
    throw new Error("Dashboard API returned an invalid sober-house snapshot.");
  }
  debugOperatorLiveData("save.success", {
    organizationId: snapshot.session.organizationId,
    houseCount: snapshot.data.store.houses.length,
    houseIds: snapshot.data.store.houses.map((house) => house.id),
  });
  return snapshot;
}
