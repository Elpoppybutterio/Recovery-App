import {
  soberHouseAlertAcknowledgementStatusSchema,
  type SoberHouseAlertAcknowledgementStatus,
  type SoberHouseResidentAlertAcknowledgementRequest,
  type SoberHouseResidentCompletionRequest,
  soberHouseResidentObligationRecordSchema,
  soberHouseResidentObligationStatusRecordSchema,
  type SoberHouseResidentProofSubmissionRequest,
  type SoberHouseResidentActionObligationType,
  type SoberHouseResidentObligationRecord,
  type SoberHouseResidentObligationStatusRecord,
} from "../../../../packages/shared-types/src/soberHouse";

const OFFLINE_CACHE_KEY_PREFIX = "recovery:sober-house-live-obligations:v1:";

type ProofReviewOutcome = "PENDING" | "APPROVED" | "REJECTED" | "FOLLOW_UP_REQUIRED";

type PendingProofReviewRecord = {
  reviewId: string;
  completionRecordId: string;
  obligationId: string;
  obligationType: SoberHouseResidentActionObligationType;
  reviewOutcome: ProofReviewOutcome;
  submittedAt: string | null;
  createdAt: string;
};

export type ResidentSoberHouseObligationsPayload = {
  fetchedAt: string;
  obligations: SoberHouseResidentObligationRecord[];
  obligationStatuses: SoberHouseResidentObligationStatusRecord[];
  pendingProofReviews: PendingProofReviewRecord[];
  alertAcknowledgements: ResidentSoberHouseAlertAcknowledgement[];
};

export type ResidentSoberHouseObligationSectionId =
  | "active"
  | "due_today"
  | "overdue"
  | "review_pending"
  | "completed_today";

export type ResidentSoberHouseObligationViewModel = {
  id: string;
  obligationType: SoberHouseResidentActionObligationType;
  title: string;
  detail: string;
  scheduledAt: string;
  dueAt: string | null;
  completedAt: string | null;
  proofRequired: boolean;
  proofSubmitted: boolean;
  reviewPending: boolean;
  isActive: boolean;
  isDueToday: boolean;
  isOverdue: boolean;
  isCompletedToday: boolean;
  primaryStatusLabel: string;
  metaBadges: string[];
};

export type ResidentSoberHouseObligationSection = {
  id: ResidentSoberHouseObligationSectionId;
  title: string;
  emptyMessage: string;
  items: ResidentSoberHouseObligationViewModel[];
};

export type ResidentSoberHouseObligationsSnapshot = {
  fetchedAt: string;
  source: "live" | "offline_cache";
  summary: {
    active: number;
    dueToday: number;
    overdue: number;
    reviewPending: number;
    completedToday: number;
  };
  alertAcknowledgements: ResidentSoberHouseAlertAcknowledgement[];
  sections: ResidentSoberHouseObligationSection[];
};

export type ResidentSoberHouseObligationsLoadResult =
  | {
      ok: true;
      snapshot: ResidentSoberHouseObligationsSnapshot;
      notice: string | null;
    }
  | {
      ok: false;
      snapshot: null;
      notice: string;
      offline: boolean;
    };

export type StorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type FetchLike = typeof fetch;

export type ResidentSoberHouseAlertAcknowledgement = {
  acknowledgementId: string;
  organizationId: string | null;
  houseId: string | null;
  residentUserId: string;
  alertId: string;
  status: SoberHouseAlertAcknowledgementStatus;
  acknowledgedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : value === null ? null : null;
}

function parsePendingProofReviews(value: unknown): PendingProofReviewRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = recordOrNull(entry);
      if (!record) {
        return null;
      }

      const obligationType =
        soberHouseResidentObligationRecordSchema.shape.obligationType.safeParse(
          record.obligationType,
        );
      const reviewId = readString(record.reviewId);
      const completionRecordId = readString(record.completionRecordId);
      const obligationId = readString(record.obligationId);
      const reviewOutcome = readString(record.reviewOutcome);
      const parsedCreatedAt = readString(record.createdAt);

      if (
        !reviewId ||
        !completionRecordId ||
        !obligationId ||
        !obligationType.success ||
        !parsedCreatedAt ||
        (reviewOutcome !== "PENDING" &&
          reviewOutcome !== "APPROVED" &&
          reviewOutcome !== "REJECTED" &&
          reviewOutcome !== "FOLLOW_UP_REQUIRED")
      ) {
        return null;
      }

      return {
        reviewId,
        completionRecordId,
        obligationId,
        obligationType: obligationType.data,
        reviewOutcome,
        submittedAt: readNullableString(record.submittedAt),
        createdAt: parsedCreatedAt,
      } satisfies PendingProofReviewRecord;
    })
    .filter((entry): entry is PendingProofReviewRecord => entry !== null);
}

function parseAlertAcknowledgements(value: unknown): ResidentSoberHouseAlertAcknowledgement[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = recordOrNull(entry);
      if (!record) {
        return null;
      }

      const acknowledgementId = readString(record.acknowledgementId);
      const residentUserId = readString(record.residentUserId);
      const alertId = readString(record.alertId);
      const createdAt = readString(record.createdAt);
      const updatedAt = readString(record.updatedAt);
      const status = soberHouseAlertAcknowledgementStatusSchema.safeParse(record.status);

      if (
        !acknowledgementId ||
        !residentUserId ||
        !alertId ||
        !createdAt ||
        !updatedAt ||
        !status.success
      ) {
        return null;
      }

      return {
        acknowledgementId,
        organizationId: readNullableString(record.organizationId),
        houseId: readNullableString(record.houseId),
        residentUserId,
        alertId,
        status: status.data,
        acknowledgedAt: readNullableString(record.acknowledgedAt),
        note: readNullableString(record.note),
        createdAt,
        updatedAt,
      } satisfies ResidentSoberHouseAlertAcknowledgement;
    })
    .filter((entry): entry is ResidentSoberHouseAlertAcknowledgement => entry !== null);
}

function parseResidentObligationsPayload(
  input: unknown,
): ResidentSoberHouseObligationsPayload | null {
  const record = recordOrNull(input);
  if (!record) {
    return null;
  }

  const obligationsSource = Array.isArray(record.obligations) ? record.obligations : null;
  const statusesSource = Array.isArray(record.obligationStatuses)
    ? record.obligationStatuses
    : null;

  if (!obligationsSource || !statusesSource) {
    return null;
  }

  const obligations: SoberHouseResidentObligationRecord[] = [];
  for (const entry of obligationsSource) {
    const parsed = soberHouseResidentObligationRecordSchema.safeParse(entry);
    if (!parsed.success) {
      return null;
    }
    obligations.push(parsed.data);
  }

  const obligationStatuses: SoberHouseResidentObligationStatusRecord[] = [];
  for (const entry of statusesSource) {
    const parsed = soberHouseResidentObligationStatusRecordSchema.safeParse(entry);
    if (!parsed.success) {
      return null;
    }
    obligationStatuses.push(parsed.data);
  }

  const fetchedAt = readString(record.fetchedAt) ?? new Date().toISOString();
  return {
    fetchedAt,
    obligations,
    obligationStatuses,
    pendingProofReviews: parsePendingProofReviews(record.pendingProofReviews),
    alertAcknowledgements: parseAlertAcknowledgements(record.alertAcknowledgements),
  };
}

function buildObligationsUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/v1/me/sober-house/obligations`;
}

function buildStatusUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/v1/me/sober-house/obligations/status`;
}

function buildChoreCompletionUrl(apiUrl: string, obligationId: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/v1/me/sober-house/obligations/${encodeURIComponent(
    obligationId,
  )}/chore-completion`;
}

function buildOneOnOneCompletionUrl(apiUrl: string, obligationId: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/v1/me/sober-house/obligations/${encodeURIComponent(
    obligationId,
  )}/one-on-one-completion`;
}

function buildProofSubmissionUrl(apiUrl: string, obligationId: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/v1/me/sober-house/obligations/${encodeURIComponent(
    obligationId,
  )}/proof`;
}

function buildAlertAcknowledgementUrl(apiUrl: string, alertId: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/v1/me/sober-house/alerts/${encodeURIComponent(
    alertId,
  )}/acknowledgements`;
}

function formatDateTime(value: string | null): string {
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

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function compareByTimeline(
  left: ResidentSoberHouseObligationViewModel,
  right: ResidentSoberHouseObligationViewModel,
): number {
  const leftAt = new Date(left.dueAt ?? left.scheduledAt).getTime();
  const rightAt = new Date(right.dueAt ?? right.scheduledAt).getTime();
  return leftAt - rightAt;
}

function titleForObligationType(value: SoberHouseResidentActionObligationType): string {
  switch (value) {
    case "HOUSE_MEETING":
      return "House meeting";
    case "ONE_ON_ONE":
      return "One-on-one";
    case "CHORE":
      return "Chore";
    default:
      return "Obligation";
  }
}

function buildPrimaryStatusLabel(input: {
  reviewPending: boolean;
  isCompletedToday: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  isActive: boolean;
}): string {
  if (input.isOverdue) {
    return "Overdue";
  }
  if (input.reviewPending) {
    return "Review pending";
  }
  if (input.isCompletedToday) {
    return "Completed today";
  }
  if (input.isDueToday) {
    return "Due today";
  }
  if (input.isActive) {
    return "Active";
  }
  return "Scheduled";
}

function buildDetail(input: {
  dueAt: string | null;
  scheduledAt: string;
  completedAt: string | null;
  reviewPending: boolean;
  isCompletedToday: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
}): string {
  if (input.reviewPending) {
    return `Submitted and waiting on staff review since ${formatDateTime(
      input.completedAt ?? input.dueAt ?? input.scheduledAt,
    )}.`;
  }
  if (input.isCompletedToday) {
    return `Completed ${formatDateTime(input.completedAt)}.`;
  }
  if (input.isOverdue) {
    return `Overdue since ${formatDateTime(input.dueAt ?? input.scheduledAt)}.`;
  }
  if (input.isDueToday) {
    return `Due today at ${formatDateTime(input.dueAt ?? input.scheduledAt)}.`;
  }
  return `Scheduled ${formatDateTime(input.dueAt ?? input.scheduledAt)}.`;
}

function buildMetaBadges(input: {
  obligationType: SoberHouseResidentActionObligationType;
  proofRequired: boolean;
  proofSubmitted: boolean;
  reviewPending: boolean;
  completedAt: string | null;
}): string[] {
  const badges = [titleForObligationType(input.obligationType)];
  if (input.proofRequired) {
    badges.push(input.proofSubmitted ? "Proof submitted" : "Proof required");
  }
  if (input.reviewPending) {
    badges.push("Awaiting review");
  }
  if (input.completedAt) {
    badges.push(`Completed ${formatDateTime(input.completedAt)}`);
  }
  return badges;
}

function buildViewModels(
  payload: ResidentSoberHouseObligationsPayload,
  now: Date,
): ResidentSoberHouseObligationViewModel[] {
  const pendingReviewIds = new Set(
    payload.pendingProofReviews
      .filter((entry) => entry.reviewOutcome === "PENDING")
      .map((entry) => entry.obligationId),
  );
  const statusByObligationId = new Map(
    payload.obligationStatuses.map((entry) => [entry.obligationId, entry] as const),
  );

  return payload.obligations
    .map((record) => {
      const status = statusByObligationId.get(record.obligationId) ?? null;
      const dueAt = record.dueAt ?? record.scheduledAt;
      const dueDate = new Date(dueAt);
      const completedDate = record.completedAt ? new Date(record.completedAt) : null;
      const proofSubmitted = status?.proofSubmitted ?? record.completionRecordId !== null;
      const reviewPending =
        pendingReviewIds.has(record.obligationId) ||
        status?.proofReviewOutcome === "PENDING" ||
        record.proofReviewOutcome === "PENDING";
      const isCompleted = record.completionStatus === "COMPLETED" && completedDate !== null;
      const isCompletedToday =
        isCompleted && completedDate ? isSameLocalDay(completedDate, now) : false;
      const isActive = record.obligationStatus === "ACTIVE" && !isCompleted;
      const isDueToday =
        isActive && !Number.isNaN(dueDate.getTime()) ? isSameLocalDay(dueDate, now) : false;
      const isOverdue =
        isActive && !Number.isNaN(dueDate.getTime()) ? dueDate.getTime() < now.getTime() : false;

      return {
        id: record.obligationId,
        obligationType: record.obligationType,
        title: titleForObligationType(record.obligationType),
        detail: buildDetail({
          dueAt: record.dueAt,
          scheduledAt: record.scheduledAt,
          completedAt: record.completedAt,
          reviewPending,
          isCompletedToday,
          isOverdue,
          isDueToday,
        }),
        scheduledAt: record.scheduledAt,
        dueAt: record.dueAt,
        completedAt: record.completedAt,
        proofRequired: record.proofRequired,
        proofSubmitted,
        reviewPending,
        isActive,
        isDueToday,
        isOverdue,
        isCompletedToday,
        primaryStatusLabel: buildPrimaryStatusLabel({
          reviewPending,
          isCompletedToday,
          isOverdue,
          isDueToday,
          isActive,
        }),
        metaBadges: buildMetaBadges({
          obligationType: record.obligationType,
          proofRequired: record.proofRequired,
          proofSubmitted,
          reviewPending,
          completedAt: record.completedAt,
        }),
      } satisfies ResidentSoberHouseObligationViewModel;
    })
    .sort(compareByTimeline);
}

export function buildResidentSoberHouseObligationsSnapshot(
  payload: ResidentSoberHouseObligationsPayload,
  source: "live" | "offline_cache",
  now: Date,
): ResidentSoberHouseObligationsSnapshot {
  const items = buildViewModels(payload, now);
  const activeItems = items.filter((item) => item.isActive);
  const dueTodayItems = items.filter((item) => item.isDueToday);
  const overdueItems = items.filter((item) => item.isOverdue);
  const reviewPendingItems = items.filter((item) => item.reviewPending);
  const completedTodayItems = items.filter((item) => item.isCompletedToday);

  return {
    fetchedAt: payload.fetchedAt,
    source,
    summary: {
      active: activeItems.length,
      dueToday: dueTodayItems.length,
      overdue: overdueItems.length,
      reviewPending: reviewPendingItems.length,
      completedToday: completedTodayItems.length,
    },
    alertAcknowledgements: payload.alertAcknowledgements,
    sections: [
      {
        id: "active",
        title: "Active obligations",
        emptyMessage: "No active sober-house obligations are assigned right now.",
        items: activeItems,
      },
      {
        id: "due_today",
        title: "Due today",
        emptyMessage: "Nothing is due today.",
        items: dueTodayItems,
      },
      {
        id: "overdue",
        title: "Overdue",
        emptyMessage: "No overdue obligations.",
        items: overdueItems,
      },
      {
        id: "review_pending",
        title: "Review pending",
        emptyMessage: "Nothing is waiting on staff review.",
        items: reviewPendingItems,
      },
      {
        id: "completed_today",
        title: "Completed today",
        emptyMessage: "No completions have posted today yet.",
        items: completedTodayItems,
      },
    ],
  };
}

function cacheKeyForIdentity(identityKey: string): string {
  return `${OFFLINE_CACHE_KEY_PREFIX}${identityKey}`;
}

async function fetchResidentSoberHouseObligationsPayload(input: {
  apiUrl: string;
  authHeader: string;
  fetchImpl?: FetchLike;
}): Promise<ResidentSoberHouseObligationsPayload> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = {
    Authorization: input.authHeader,
  };

  const [obligationsResponse, statusResponse] = await Promise.all([
    fetchImpl(buildObligationsUrl(input.apiUrl), { headers }),
    fetchImpl(buildStatusUrl(input.apiUrl), { headers }),
  ]);

  if (!obligationsResponse.ok) {
    throw new Error(`Resident obligations request failed: ${obligationsResponse.status}`);
  }
  if (!statusResponse.ok) {
    throw new Error(`Resident obligation status request failed: ${statusResponse.status}`);
  }

  const obligationsPayload = recordOrNull(await obligationsResponse.json());
  const statusPayload = recordOrNull(await statusResponse.json());
  const mergedPayload = parseResidentObligationsPayload({
    fetchedAt: new Date().toISOString(),
    obligations: obligationsPayload?.obligations,
    obligationStatuses: statusPayload?.obligationStatuses,
    pendingProofReviews: statusPayload?.pendingProofReviews,
    alertAcknowledgements: statusPayload?.alertAcknowledgements,
  });

  if (!mergedPayload) {
    throw new Error("Resident sober-house obligations returned an invalid payload.");
  }

  return mergedPayload;
}

function isLikelyOfflineError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|failed to fetch|networkerror|offline|load failed/i.test(message);
}

function formatResidentSoberHouseActionError(status: number, payload: unknown): string {
  const record = recordOrNull(payload);
  const message = readString(record?.message);
  if (message) {
    return message;
  }
  if (status === 400) {
    return "The request was invalid. Check the action details and try again.";
  }
  if (status === 401) {
    return "Sign in to continue.";
  }
  if (status === 403) {
    return "You do not have permission to perform this resident action.";
  }
  if (status === 404) {
    return "That sober-house item is no longer available.";
  }
  return `Resident action failed: ${status}`;
}

async function postResidentSoberHouseAction(input: {
  url: string;
  authHeader: string;
  body: Record<string, unknown>;
  fetchImpl?: FetchLike;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(input.url, {
      method: "POST",
      headers: {
        Authorization: input.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
    });
  } catch (error) {
    if (isLikelyOfflineError(error)) {
      throw new Error("You appear to be offline. Reconnect and try again.");
    }
    throw new Error(
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "Resident action failed before the request completed.",
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(formatResidentSoberHouseActionError(response.status, payload));
  }
}

export async function completeResidentSoberHouseChore(input: {
  apiUrl: string;
  authHeader: string;
  obligationId: string;
  payload: SoberHouseResidentCompletionRequest;
  fetchImpl?: FetchLike;
}): Promise<void> {
  await postResidentSoberHouseAction({
    url: buildChoreCompletionUrl(input.apiUrl, input.obligationId),
    authHeader: input.authHeader,
    body: input.payload,
    fetchImpl: input.fetchImpl,
  });
}

export async function completeResidentSoberHouseOneOnOne(input: {
  apiUrl: string;
  authHeader: string;
  obligationId: string;
  payload: SoberHouseResidentCompletionRequest;
  fetchImpl?: FetchLike;
}): Promise<void> {
  await postResidentSoberHouseAction({
    url: buildOneOnOneCompletionUrl(input.apiUrl, input.obligationId),
    authHeader: input.authHeader,
    body: input.payload,
    fetchImpl: input.fetchImpl,
  });
}

export async function submitResidentSoberHouseProof(input: {
  apiUrl: string;
  authHeader: string;
  obligationId: string;
  payload: SoberHouseResidentProofSubmissionRequest;
  fetchImpl?: FetchLike;
}): Promise<void> {
  await postResidentSoberHouseAction({
    url: buildProofSubmissionUrl(input.apiUrl, input.obligationId),
    authHeader: input.authHeader,
    body: input.payload,
    fetchImpl: input.fetchImpl,
  });
}

export async function acknowledgeResidentSoberHouseAlert(input: {
  apiUrl: string;
  authHeader: string;
  alertId: string;
  payload: SoberHouseResidentAlertAcknowledgementRequest;
  fetchImpl?: FetchLike;
}): Promise<void> {
  await postResidentSoberHouseAction({
    url: buildAlertAcknowledgementUrl(input.apiUrl, input.alertId),
    authHeader: input.authHeader,
    body: input.payload,
    fetchImpl: input.fetchImpl,
  });
}

export async function persistCachedResidentSoberHouseObligations(
  storage: StorageLike,
  identityKey: string,
  payload: ResidentSoberHouseObligationsPayload,
): Promise<void> {
  await storage.setItem(cacheKeyForIdentity(identityKey), JSON.stringify(payload));
}

export async function readCachedResidentSoberHouseObligations(
  storage: StorageLike,
  identityKey: string,
  now: Date,
): Promise<ResidentSoberHouseObligationsSnapshot | null> {
  const raw = await storage.getItem(cacheKeyForIdentity(identityKey));
  if (!raw) {
    return null;
  }

  try {
    const parsed = parseResidentObligationsPayload(JSON.parse(raw));
    return parsed ? buildResidentSoberHouseObligationsSnapshot(parsed, "offline_cache", now) : null;
  } catch {
    return null;
  }
}

export async function loadResidentSoberHouseObligationsWithCache(input: {
  storage: StorageLike;
  identityKey: string;
  apiUrl: string;
  authHeader: string;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<ResidentSoberHouseObligationsLoadResult> {
  const now = input.now ?? new Date();

  try {
    const payload = await fetchResidentSoberHouseObligationsPayload(input);
    await persistCachedResidentSoberHouseObligations(input.storage, input.identityKey, payload);
    return {
      ok: true,
      snapshot: buildResidentSoberHouseObligationsSnapshot(payload, "live", now),
      notice: null,
    };
  } catch (error) {
    // Temporary offline fallback while the resident obligations screen still uses local screen
    // state instead of a shared query/cache layer.
    const cached = await readCachedResidentSoberHouseObligations(
      input.storage,
      input.identityKey,
      now,
    );
    if (cached) {
      return {
        ok: true,
        snapshot: cached,
        notice: isLikelyOfflineError(error)
          ? "Offline. Showing the last live obligations snapshot saved on this device."
          : "Live obligations could not refresh. Showing the last saved snapshot instead.",
      };
    }

    return {
      ok: false,
      snapshot: null,
      notice:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Live obligations are unavailable right now.",
      offline: isLikelyOfflineError(error),
    };
  }
}
