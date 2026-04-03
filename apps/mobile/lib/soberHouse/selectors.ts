import { createDefaultHouseRuleSet } from "./defaults";
import type {
  AlertPreference,
  ChatMessage,
  ChatMessageReceipt,
  ChatParticipant,
  ChatThread,
  CorrectiveAction,
  EvidenceItem,
  House,
  HouseAlertAnnouncement,
  HouseChore,
  HouseGroup,
  HouseMeeting,
  HouseMeetingAttendanceRecord,
  HouseRuleSet,
  HouseRuleScopeType,
  MonthlyReport,
  OneOnOneSession,
  RecurringObligation,
  ScheduledWeekdayCode,
  SoberHouseUserAccessProfile,
  SoberHouseSettingsStore,
  SponsorCallRecord,
  StaffAssignment,
  Violation,
} from "./types";

export type EffectiveRuleValueSource = "ORGANIZATION" | "HOUSE_GROUP" | "HOUSE";

export type EffectiveRuleSourceMap = {
  curfew: EffectiveRuleValueSource;
  chores: EffectiveRuleValueSource;
  employment: EffectiveRuleValueSource;
  jobSearch: EffectiveRuleValueSource;
  meetings: EffectiveRuleValueSource;
  sponsorContact: EffectiveRuleValueSource;
  oneOnOne: EffectiveRuleValueSource;
  operations: EffectiveRuleValueSource;
  support: EffectiveRuleValueSource;
};

export type EffectiveRuleSetResult = {
  ruleSet: HouseRuleSet;
  sources: EffectiveRuleSourceMap;
};

const DEFAULT_RULE_SOURCE_MAP: EffectiveRuleSourceMap = {
  curfew: "ORGANIZATION",
  chores: "ORGANIZATION",
  employment: "ORGANIZATION",
  jobSearch: "ORGANIZATION",
  meetings: "ORGANIZATION",
  sponsorContact: "ORGANIZATION",
  oneOnOne: "ORGANIZATION",
  operations: "ORGANIZATION",
  support: "ORGANIZATION",
};

function sortStrings(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${key}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeRuleSectionValue<T>(section: T): T {
  if (!section || typeof section !== "object") {
    return section;
  }

  const record = { ...(section as Record<string, unknown>) };
  if (Array.isArray(record.allowedMeetingTypes)) {
    record.allowedMeetingTypes = sortStrings(record.allowedMeetingTypes as string[]);
  }
  if (Array.isArray(record.proofRequirement)) {
    record.proofRequirement = sortStrings(record.proofRequirement as string[]);
  }
  return record as T;
}

function ruleSectionDiffers<T>(base: T, candidate: T): boolean {
  return (
    stableSerialize(normalizeRuleSectionValue(base)) !==
    stableSerialize(normalizeRuleSectionValue(candidate))
  );
}

function getRawOrganizationRuleSet(store: SoberHouseSettingsStore, now: string): HouseRuleSet {
  return (
    getActiveRuleSetForScope(store, "ORGANIZATION", null) ??
    createDefaultHouseRuleSet(now, "", store.organization?.id ?? null)
  );
}

function mergeEffectiveRuleSet(
  base: EffectiveRuleSetResult,
  candidate: HouseRuleSet | null,
  nextSource: EffectiveRuleValueSource,
): EffectiveRuleSetResult {
  if (!candidate) {
    return base;
  }

  const sources: EffectiveRuleSourceMap = { ...base.sources };
  const ruleSet: HouseRuleSet = {
    ...candidate,
    curfew: base.ruleSet.curfew,
    chores: base.ruleSet.chores,
    employment: base.ruleSet.employment,
    jobSearch: base.ruleSet.jobSearch,
    meetings: base.ruleSet.meetings,
    sponsorContact: base.ruleSet.sponsorContact,
    oneOnOne: base.ruleSet.oneOnOne,
    operations: base.ruleSet.operations,
    support: base.ruleSet.support,
  };
  let hasOverride = false;

  if (ruleSectionDiffers(base.ruleSet.curfew, candidate.curfew)) {
    ruleSet.curfew = candidate.curfew;
    sources.curfew = nextSource;
    hasOverride = true;
  }
  if (ruleSectionDiffers(base.ruleSet.chores, candidate.chores)) {
    ruleSet.chores = candidate.chores;
    sources.chores = nextSource;
    hasOverride = true;
  }
  if (ruleSectionDiffers(base.ruleSet.employment, candidate.employment)) {
    ruleSet.employment = candidate.employment;
    sources.employment = nextSource;
    hasOverride = true;
  }
  if (ruleSectionDiffers(base.ruleSet.jobSearch, candidate.jobSearch)) {
    ruleSet.jobSearch = candidate.jobSearch;
    sources.jobSearch = nextSource;
    hasOverride = true;
  }
  if (ruleSectionDiffers(base.ruleSet.meetings, candidate.meetings)) {
    ruleSet.meetings = candidate.meetings;
    sources.meetings = nextSource;
    hasOverride = true;
  }
  if (ruleSectionDiffers(base.ruleSet.sponsorContact, candidate.sponsorContact)) {
    ruleSet.sponsorContact = candidate.sponsorContact;
    sources.sponsorContact = nextSource;
    hasOverride = true;
  }
  if (ruleSectionDiffers(base.ruleSet.oneOnOne, candidate.oneOnOne)) {
    ruleSet.oneOnOne = candidate.oneOnOne;
    sources.oneOnOne = nextSource;
    hasOverride = true;
  }
  if (ruleSectionDiffers(base.ruleSet.operations, candidate.operations)) {
    ruleSet.operations = candidate.operations;
    sources.operations = nextSource;
    hasOverride = true;
  }
  if (ruleSectionDiffers(base.ruleSet.support, candidate.support)) {
    ruleSet.support = candidate.support;
    sources.support = nextSource;
    hasOverride = true;
  }

  if (!hasOverride) {
    return {
      ruleSet: {
        ...base.ruleSet,
        name: candidate.name || base.ruleSet.name,
      },
      sources,
    };
  }

  return {
    ruleSet,
    sources,
  };
}

export function getActiveHouses(store: SoberHouseSettingsStore): House[] {
  return store.houses.filter((house) => house.status === "ACTIVE");
}

export function getUserAccessProfile(
  store: SoberHouseSettingsStore,
): SoberHouseUserAccessProfile | null {
  return store.userAccessProfile;
}

export function isOwnerOperatorAccess(store: SoberHouseSettingsStore): boolean {
  return store.userAccessProfile?.role === "OWNER_OPERATOR";
}

export function isResidentAccess(store: SoberHouseSettingsStore): boolean {
  return store.userAccessProfile?.role === "HOUSE_RESIDENT";
}

export function getHouseById(store: SoberHouseSettingsStore, houseId: string): House | null {
  return store.houses.find((house) => house.id === houseId) ?? null;
}

export function getActiveHouseGroups(store: SoberHouseSettingsStore): HouseGroup[] {
  return store.houseGroups.filter((group) => group.status === "ACTIVE");
}

export function getHouseGroupById(
  store: SoberHouseSettingsStore,
  houseGroupId: string,
): HouseGroup | null {
  return store.houseGroups.find((group) => group.id === houseGroupId) ?? null;
}

export function getStaffAssignmentById(
  store: SoberHouseSettingsStore,
  assignmentId: string,
): StaffAssignment | null {
  return store.staffAssignments.find((assignment) => assignment.id === assignmentId) ?? null;
}

export function getResidentHouseMemberships(
  store: SoberHouseSettingsStore,
  residentId: string,
): SoberHouseSettingsStore["residentHouseMemberships"] {
  return store.residentHouseMemberships.filter(
    (membership) => membership.residentId === residentId,
  );
}

export function getActiveResidentHouseMemberships(
  store: SoberHouseSettingsStore,
  residentId: string,
): SoberHouseSettingsStore["residentHouseMemberships"] {
  return getResidentHouseMemberships(store, residentId).filter(
    (membership) => membership.status === "ACTIVE",
  );
}

export function getPrimaryResidentHouseMembership(
  store: SoberHouseSettingsStore,
  residentId: string,
): SoberHouseSettingsStore["residentHouseMemberships"][number] | null {
  const activeMemberships = getActiveResidentHouseMemberships(store, residentId);
  return (
    activeMemberships.find((membership) => membership.isPrimary) ?? activeMemberships[0] ?? null
  );
}

export function getEffectiveRuleSetForScope(
  store: SoberHouseSettingsStore,
  scopeType: HouseRuleScopeType,
  scopeId: string | null,
  now: string,
): EffectiveRuleSetResult {
  if (scopeType === "ORGANIZATION") {
    return {
      ruleSet: getRawOrganizationRuleSet(store, now),
      sources: { ...DEFAULT_RULE_SOURCE_MAP },
    };
  }

  if (scopeType === "HOUSE_GROUP") {
    const organization = getEffectiveRuleSetForScope(store, "ORGANIZATION", null, now);
    const groupRuleSet = getActiveRuleSetForScope(store, "HOUSE_GROUP", scopeId);
    return mergeEffectiveRuleSet(organization, groupRuleSet, "HOUSE_GROUP");
  }

  if (!scopeId) {
    return getEffectiveRuleSetForScope(store, "ORGANIZATION", null, now);
  }

  const house = getHouseById(store, scopeId);
  const base = house?.houseGroupId
    ? getEffectiveRuleSetForScope(store, "HOUSE_GROUP", house.houseGroupId, now)
    : getEffectiveRuleSetForScope(store, "ORGANIZATION", null, now);
  const houseRuleSet = getActiveRuleSetForScope(store, "HOUSE", scopeId);
  return mergeEffectiveRuleSet(base, houseRuleSet, "HOUSE");
}

export function getRuleSetForHouse(
  store: SoberHouseSettingsStore,
  houseId: string,
  now: string,
): HouseRuleSet {
  return getEffectiveRuleSetForScope(store, "HOUSE", houseId, now).ruleSet;
}

function getActiveRuleSetForScope(
  store: SoberHouseSettingsStore,
  scopeType: HouseRuleScopeType,
  scopeId: string | null,
): HouseRuleSet | null {
  return (
    store.houseRuleSets.find((ruleSet) => {
      if (ruleSet.status !== "ACTIVE" || ruleSet.scopeType !== scopeType) {
        return false;
      }
      if (scopeType === "ORGANIZATION") {
        return true;
      }
      if (scopeType === "HOUSE_GROUP") {
        return ruleSet.houseGroupId === scopeId;
      }
      return ruleSet.houseId === scopeId;
    }) ?? null
  );
}

export function getRuleSetForScope(
  store: SoberHouseSettingsStore,
  scopeType: HouseRuleScopeType,
  scopeId: string | null,
): HouseRuleSet | null {
  const matchesScope = (ruleSet: HouseRuleSet) => {
    if (ruleSet.scopeType !== scopeType) {
      return false;
    }
    if (scopeType === "ORGANIZATION") {
      return true;
    }
    if (scopeType === "HOUSE_GROUP") {
      return ruleSet.houseGroupId === scopeId;
    }
    return ruleSet.houseId === scopeId;
  };

  return (
    store.houseRuleSets.find((ruleSet) => ruleSet.status === "ACTIVE" && matchesScope(ruleSet)) ??
    store.houseRuleSets.find((ruleSet) => {
      if (ruleSet.scopeType !== scopeType) {
        return false;
      }
      if (scopeType === "ORGANIZATION") {
        return true;
      }
      if (scopeType === "HOUSE_GROUP") {
        return ruleSet.houseGroupId === scopeId;
      }
      return ruleSet.houseId === scopeId;
    }) ??
    null
  );
}

export function getAlertPreferencesForHouse(
  store: SoberHouseSettingsStore,
  houseId: string | null,
): AlertPreference[] {
  return store.alertPreferences.filter((preference) =>
    preference.scope === "ORGANIZATION"
      ? houseId === null || preference.houseId === null
      : preference.houseId === houseId,
  );
}

export function getHouseChoresForResident(
  store: SoberHouseSettingsStore,
  residentId: string,
  houseId: string | null,
): HouseChore[] {
  return store.houseChores.filter(
    (chore) =>
      chore.status === "ACTIVE" &&
      chore.houseId === houseId &&
      (chore.residentId === null || chore.residentId === residentId),
  );
}

function jsDayFromWeekdayCode(code: ScheduledWeekdayCode): number {
  switch (code) {
    case "MON":
      return 1;
    case "TUE":
      return 2;
    case "WED":
      return 3;
    case "THU":
      return 4;
    case "FRI":
      return 5;
    case "SAT":
      return 6;
    case "SUN":
      return 0;
  }
}

function parseTimeOnDate(date: Date, hhmm: string): Date | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) {
    return null;
  }
  const [hoursText, minutesText] = hhmm.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const daysSinceMonday = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - daysSinceMonday);
  return next;
}

function nextCandidateForWeekday(now: Date, weekday: ScheduledWeekdayCode, weeksToAdd = 0): Date {
  const start = startOfWeek(now);
  start.setDate(start.getDate() + weeksToAdd * 7);
  const offset = (jsDayFromWeekdayCode(weekday) + 7 - start.getDay()) % 7;
  start.setDate(start.getDate() + offset);
  return start;
}

function buildRecurringMeetingOccurrences(
  obligation: RecurringObligation,
  house: House | null,
  nowIso: string,
  limit: number,
): HouseMeeting[] {
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime()) || obligation.status !== "ACTIVE") {
    return [];
  }

  const weekdays =
    obligation.weekdayList.length > 0
      ? obligation.weekdayList
      : obligation.weekday
        ? [obligation.weekday]
        : [];
  const occurrences: HouseMeeting[] = [];
  const pushOccurrence = (startDate: Date, index: number) => {
    const startsAt = parseTimeOnDate(startDate, obligation.timeLocalHhmm);
    if (!startsAt || startsAt.getTime() < now.getTime()) {
      return;
    }
    const endsAt = new Date(startsAt.getTime() + obligation.durationMinutes * 60_000);
    occurrences.push({
      id: `${obligation.id}:occurrence:${index}:${startsAt.toISOString()}`,
      organizationId: obligation.organizationId,
      houseId: house?.id ?? obligation.houseId,
      recurringObligationId: obligation.id,
      title: obligation.title,
      description: obligation.detail,
      meetingKind: "HOUSE_MEETING",
      locationLabel: obligation.locationLabel || house?.name || house?.address || "House location",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      required: obligation.required,
      reminderLeadMinutes: obligation.reminderLeadMinutes,
      inAppReminderEnabled: obligation.inAppReminderEnabled,
      addToCalendar: obligation.addToCalendar,
      acknowledgmentRequired: obligation.accountabilityMethod === "ACKNOWLEDGMENT",
      status: obligation.status,
      createdAt: obligation.createdAt,
      updatedAt: obligation.updatedAt,
    });
  };

  if (obligation.frequency === "ONCE" && obligation.scheduledDate) {
    pushOccurrence(new Date(`${obligation.scheduledDate}T00:00:00`), 0);
    return occurrences;
  }

  if (obligation.frequency === "DAILY") {
    for (let index = 0; index < limit; index += 1) {
      const day = new Date(now);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() + index);
      pushOccurrence(day, index);
    }
    return occurrences.slice(0, limit);
  }

  if (obligation.frequency === "MONTHLY" && obligation.monthlyOrdinal && weekdays[0]) {
    for (let monthOffset = 0; monthOffset < Math.max(limit, 3); monthOffset += 1) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const candidate = new Date(monthStart);
      const offset = (jsDayFromWeekdayCode(weekdays[0]) + 7 - candidate.getDay()) % 7;
      candidate.setDate(candidate.getDate() + offset + (obligation.monthlyOrdinal - 1) * 7);
      if (candidate.getMonth() !== monthStart.getMonth()) {
        continue;
      }
      pushOccurrence(candidate, monthOffset);
      if (occurrences.length >= limit) {
        break;
      }
    }
    return occurrences.slice(0, limit);
  }

  const weeklyStep = obligation.frequency === "BIWEEKLY" ? 2 : 1;
  for (let weekIndex = 0; weekIndex < 8 && occurrences.length < limit; weekIndex += weeklyStep) {
    for (const weekday of weekdays) {
      pushOccurrence(nextCandidateForWeekday(now, weekday, weekIndex), weekIndex);
    }
  }

  return occurrences
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
    .slice(0, limit);
}

export function getEffectiveRecurringObligationsForHouse(
  store: SoberHouseSettingsStore,
  houseId: string | null,
  obligationType: RecurringObligation["obligationType"],
): RecurringObligation[] {
  if (!houseId) {
    return [];
  }
  const house = getHouseById(store, houseId);
  const houseScoped = store.recurringObligations.filter(
    (obligation) =>
      obligation.status === "ACTIVE" &&
      obligation.obligationType === obligationType &&
      obligation.scopeType === "HOUSE" &&
      obligation.houseId === houseId,
  );
  if (houseScoped.length > 0) {
    return houseScoped;
  }

  if (house?.houseGroupId) {
    const groupScoped = store.recurringObligations.filter(
      (obligation) =>
        obligation.status === "ACTIVE" &&
        obligation.obligationType === obligationType &&
        obligation.scopeType === "HOUSE_GROUP" &&
        obligation.houseGroupId === house.houseGroupId,
    );
    if (groupScoped.length > 0) {
      return groupScoped;
    }
  }

  return store.recurringObligations.filter(
    (obligation) =>
      obligation.status === "ACTIVE" &&
      obligation.obligationType === obligationType &&
      obligation.scopeType === "ORGANIZATION",
  );
}

export function getRecurringObligationsForScope(
  store: SoberHouseSettingsStore,
  scopeType: HouseRuleScopeType,
  scopeId: string | null,
  obligationType?: RecurringObligation["obligationType"],
): RecurringObligation[] {
  return store.recurringObligations.filter((obligation) => {
    if (obligationType && obligation.obligationType !== obligationType) {
      return false;
    }
    if (obligation.scopeType !== scopeType) {
      return false;
    }
    if (scopeType === "ORGANIZATION") {
      return true;
    }
    if (scopeType === "HOUSE_GROUP") {
      return obligation.houseGroupId === scopeId;
    }
    return obligation.houseId === scopeId;
  });
}

function resolveHouseMeetingsForHouse(
  store: SoberHouseSettingsStore,
  houseId: string | null,
  nowIso: string,
): HouseMeeting[] {
  const nowMs = new Date(nowIso).getTime();
  const house = houseId ? getHouseById(store, houseId) : null;
  const explicitMeetings = [...store.houseMeetings]
    .filter((meeting) => meeting.status === "ACTIVE" && meeting.houseId === houseId)
    .filter((meeting) => {
      const startsAtMs = new Date(meeting.startsAt).getTime();
      return Number.isFinite(startsAtMs) && startsAtMs >= nowMs;
    })
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

  const recurringMeetings = getEffectiveRecurringObligationsForHouse(
    store,
    houseId,
    "HOUSE_MEETING",
  ).flatMap((obligation) => buildRecurringMeetingOccurrences(obligation, house, nowIso, 8));

  const byKey = new Map<string, HouseMeeting>();
  for (const meeting of [...explicitMeetings, ...recurringMeetings]) {
    byKey.set(`${meeting.recurringObligationId ?? meeting.id}:${meeting.startsAt}`, meeting);
  }

  return [...byKey.values()].sort(
    (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
  );
}

export function getUpcomingHouseMeetings(
  store: SoberHouseSettingsStore,
  houseId: string | null,
  nowIso: string,
): HouseMeeting[] {
  return resolveHouseMeetingsForHouse(store, houseId, nowIso);
}

export function getHouseMeetingsInRange(
  store: SoberHouseSettingsStore,
  houseId: string | null,
  rangeStartIso: string,
  rangeEndIso: string,
): HouseMeeting[] {
  const rangeStartMs = new Date(rangeStartIso).getTime();
  const rangeEndMs = new Date(rangeEndIso).getTime();
  const seedNow = new Date(rangeStartMs);
  seedNow.setDate(seedNow.getDate() - 1);
  return resolveHouseMeetingsForHouse(store, houseId, seedNow.toISOString()).filter((meeting) => {
    const startsAtMs = new Date(meeting.startsAt).getTime();
    return Number.isFinite(startsAtMs) && startsAtMs >= rangeStartMs && startsAtMs < rangeEndMs;
  });
}

export function getUpcomingOneOnOneSessions(
  store: SoberHouseSettingsStore,
  residentId: string,
  houseId: string | null,
  nowIso: string,
): OneOnOneSession[] {
  const nowMs = new Date(nowIso).getTime();
  return [...store.oneOnOneSessions]
    .filter(
      (session) =>
        session.status === "ACTIVE" &&
        session.residentId === residentId &&
        session.houseId === houseId,
    )
    .filter((session) => {
      const scheduledAtMs = new Date(session.scheduledAt).getTime();
      return Number.isFinite(scheduledAtMs) && scheduledAtMs >= nowMs;
    })
    .sort(
      (left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
    );
}

export function getResidentOneOnOneSessionsInRange(
  store: SoberHouseSettingsStore,
  residentId: string,
  rangeStartIso: string,
  rangeEndIso: string,
): OneOnOneSession[] {
  const rangeStartMs = new Date(rangeStartIso).getTime();
  const rangeEndMs = new Date(rangeEndIso).getTime();
  return store.oneOnOneSessions
    .filter((session) => session.residentId === residentId && session.status === "ACTIVE")
    .filter((session) => {
      const scheduledAtMs = new Date(session.scheduledAt).getTime();
      return (
        Number.isFinite(scheduledAtMs) &&
        scheduledAtMs >= rangeStartMs &&
        scheduledAtMs < rangeEndMs
      );
    })
    .sort(
      (left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
    );
}

export function getResidentSponsorCallRecordsInRange(
  store: SoberHouseSettingsStore,
  residentId: string,
  rangeStartIso: string,
  rangeEndIso: string,
): SponsorCallRecord[] {
  const rangeStartMs = new Date(rangeStartIso).getTime();
  const rangeEndMs = new Date(rangeEndIso).getTime();
  return store.sponsorCallRecords
    .filter((record) => record.residentId === residentId)
    .filter((record) => {
      const scheduledMs = record.scheduledFor ? new Date(record.scheduledFor).getTime() : null;
      const completedMs = record.completedAt ? new Date(record.completedAt).getTime() : null;
      return (
        (scheduledMs !== null &&
          Number.isFinite(scheduledMs) &&
          scheduledMs >= rangeStartMs &&
          scheduledMs < rangeEndMs) ||
        (completedMs !== null &&
          Number.isFinite(completedMs) &&
          completedMs >= rangeStartMs &&
          completedMs < rangeEndMs)
      );
    })
    .sort((left, right) => {
      const leftAt = left.scheduledFor ?? left.completedAt ?? left.createdAt;
      const rightAt = right.scheduledFor ?? right.completedAt ?? right.createdAt;
      return new Date(leftAt).getTime() - new Date(rightAt).getTime();
    });
}

export function getResidentHouseMeetingAttendanceRecordsInRange(
  store: SoberHouseSettingsStore,
  residentId: string,
  rangeStartIso: string,
  rangeEndIso: string,
): HouseMeetingAttendanceRecord[] {
  const rangeStartMs = new Date(rangeStartIso).getTime();
  const rangeEndMs = new Date(rangeEndIso).getTime();
  return store.houseMeetingAttendanceRecords
    .filter((record) => record.residentId === residentId)
    .filter((record) => {
      const scheduledMs = new Date(record.scheduledStartAt).getTime();
      return (
        Number.isFinite(scheduledMs) && scheduledMs >= rangeStartMs && scheduledMs < rangeEndMs
      );
    })
    .sort(
      (left, right) =>
        new Date(left.scheduledStartAt).getTime() - new Date(right.scheduledStartAt).getTime(),
    );
}

export function getActiveHouseAlertAnnouncements(
  store: SoberHouseSettingsStore,
  houseId: string | null,
  nowIso: string,
): HouseAlertAnnouncement[] {
  const nowMs = new Date(nowIso).getTime();
  return [...store.houseAlertAnnouncements]
    .filter((announcement) => announcement.status === "ACTIVE" && announcement.houseId === houseId)
    .filter((announcement) => {
      const startsAtMs = new Date(announcement.startsAt).getTime();
      const endsAtMs = announcement.endsAt ? new Date(announcement.endsAt).getTime() : null;
      if (!Number.isFinite(startsAtMs)) {
        return false;
      }
      return startsAtMs <= nowMs && (endsAtMs === null || endsAtMs >= nowMs);
    })
    .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime());
}

export function getViolationById(
  store: SoberHouseSettingsStore,
  violationId: string,
): Violation | null {
  return store.violations.find((violation) => violation.id === violationId) ?? null;
}

export function getCorrectiveActionsForViolation(
  store: SoberHouseSettingsStore,
  violationId: string,
): CorrectiveAction[] {
  return store.correctiveActions.filter((action) => action.violationId === violationId);
}

export function getEvidenceItemsForViolation(
  store: SoberHouseSettingsStore,
  violationId: string,
): EvidenceItem[] {
  return store.evidenceItems.filter((item) => item.linkedViolationId === violationId);
}

export function getChatThreadById(
  store: SoberHouseSettingsStore,
  threadId: string,
): ChatThread | null {
  return store.chatThreads.find((thread) => thread.id === threadId) ?? null;
}

export function getChatParticipantsForThread(
  store: SoberHouseSettingsStore,
  threadId: string,
): ChatParticipant[] {
  return store.chatParticipants.filter((participant) => participant.threadId === threadId);
}

export function getChatMessagesForThread(
  store: SoberHouseSettingsStore,
  threadId: string,
): ChatMessage[] {
  return [...store.chatMessages]
    .filter((message) => message.threadId === threadId && message.active)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function getChatReceiptsForMessage(
  store: SoberHouseSettingsStore,
  messageId: string,
): ChatMessageReceipt[] {
  return store.chatMessageReceipts.filter((receipt) => receipt.messageId === messageId);
}

export function getChatReceiptForMessageAndUser(
  store: SoberHouseSettingsStore,
  messageId: string,
  userId: string,
): ChatMessageReceipt | null {
  return (
    store.chatMessageReceipts.find(
      (receipt) => receipt.messageId === messageId && receipt.userId === userId,
    ) ?? null
  );
}

export function getMonthlyReportById(
  store: SoberHouseSettingsStore,
  reportId: string,
): MonthlyReport | null {
  return store.monthlyReports.find((report) => report.id === reportId) ?? null;
}

export function getMonthlyReportsForHouse(
  store: SoberHouseSettingsStore,
  houseId: string,
): MonthlyReport[] {
  return store.monthlyReports.filter((report) => report.houseId === houseId);
}

export function getMonthlyReportsForResident(
  store: SoberHouseSettingsStore,
  residentId: string,
): MonthlyReport[] {
  return store.monthlyReports.filter((report) => report.residentId === residentId);
}

export function getCurrentMonthlyReports(store: SoberHouseSettingsStore): MonthlyReport[] {
  return store.monthlyReports.filter((report) => report.isCurrentVersion);
}

export function getResidentDisplayName(store: SoberHouseSettingsStore): string {
  const housing = store.residentHousingProfile;
  if (!housing) {
    return "Resident";
  }
  return `${housing.firstName} ${housing.lastName}`.trim() || "Resident";
}
