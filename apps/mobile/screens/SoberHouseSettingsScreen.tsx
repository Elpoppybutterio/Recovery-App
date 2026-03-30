import { geocodeAsync } from "expo-location";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { GlassCard } from "../lib/ui/GlassCard";
import { AppButton } from "../lib/ui/AppButton";
import {
  canManageSoberHouseHierarchy,
  canViewSoberHouseResidentExperience,
  type AppAccessRole,
} from "../lib/access";
import { formatUsPhoneDisplay, normalizeUsPhoneInput } from "../lib/phone";
import { SoberHouseComplianceSection } from "../components/SoberHouseComplianceSection";
import { SoberHouseInterventionSection } from "../components/SoberHouseInterventionSection";
import { SoberHouseChatSection } from "../components/SoberHouseChatSection";
import { SoberHouseReportsSection } from "../components/SoberHouseReportsSection";
import {
  buildSoberHouseOwnerHouseDetail,
  buildSoberHouseOwnerHouseViolationRows,
} from "../lib/soberHouse/orgDashboard";
import { SCHEDULED_WEEKDAY_OPTIONS } from "../lib/soberHouse/scheduling";
import { colors, radius, spacing, typography } from "../lib/theme/tokens";
import {
  ALERT_DELIVERY_METHOD_OPTIONS,
  ALERT_SCOPE_OPTIONS,
  CHORE_FREQUENCY_OPTIONS,
  CURFEW_ALERT_BASIS_OPTIONS,
  HOUSE_TYPE_OPTIONS,
  MEETING_PROOF_METHOD_OPTIONS,
  MEETING_TYPE_OPTIONS,
  PROOF_REQUIREMENT_OPTIONS,
  SPONSOR_PROOF_TYPE_OPTIONS,
  STAFF_ROLE_OPTIONS,
  type AlertPreference,
  type AlertScope,
  type AuditActor,
  type House,
  type HouseGroup,
  type HouseRuleSet,
  type HouseRuleScopeType,
  type HouseType,
  type MeetingType,
  type Organization,
  type RecurringObligation,
  type ScheduledFrequency,
  type ScheduledWeekdayCode,
  type SoberHouseAccessRole,
  type SoberHouseSettingsStore,
  type SoberHouseUserAccessProfile,
  type StaffAssignment,
  type StaffRole,
} from "../lib/soberHouse/types";
import {
  createDefaultAlertPreference,
  createDefaultHouse,
  createDefaultHouseGroup,
  createDefaultHouseRuleSet,
  createDefaultStaffAssignment,
} from "../lib/soberHouse/defaults";
import {
  setAlertPreferenceStatus,
  setHouseGroupStatus,
  setHouseRuleSetStatus,
  setHouseStatus,
  setStaffAssignmentStatus,
  upsertAlertPreference,
  upsertHouse,
  upsertHouseGroup,
  upsertHouseRuleSet,
  upsertOrganization,
  upsertRecurringObligation,
  upsertStaffAssignment,
  upsertUserAccessProfile,
} from "../lib/soberHouse/mutations";
import {
  getEffectiveRuleSetForScope,
  getHouseGroupById,
  getRecurringObligationsForScope,
  getRuleSetForScope,
  getUserAccessProfile,
  isResidentAccess,
  getStaffAssignmentById,
  type EffectiveRuleValueSource,
} from "../lib/soberHouse/selectors";
import {
  loadSoberHouseSettingsStore,
  saveSoberHouseSettingsStore,
} from "../lib/soberHouse/storage";
import { getResidentSetupState } from "../lib/soberHouse/resident";

type SoberHouseSettingsScreenProps = {
  userId: string;
  actorId: string;
  actorName: string;
  viewerRole: AppAccessRole;
  sponsorCallLogs: Array<{ id: string; atIso: string; success: boolean }>;
  onBack: () => void;
  adminLaunchContext?: SoberHouseAdminLaunchContext | null;
};

type PersistOptions = {
  showStatus?: boolean;
};

type AdminModule =
  | "HUB"
  | "ORGANIZATION"
  | "HOUSE_GROUPS"
  | "HOUSES"
  | "RULES"
  | "MANAGERS"
  | "RESIDENTS"
  | "CHAT"
  | "VIOLATIONS"
  | "REPORTS";

type ResidentView = "OVERVIEW" | "REQUIREMENTS";

export type SoberHouseAdminLaunchContext = {
  module: AdminModule;
  mode?: "view" | "create" | "edit";
  houseId?: string | null;
  staffAssignmentId?: string | null;
  residentView?: ResidentView;
};

function resolveInitialAdminModule(
  viewerRole: AppAccessRole,
  adminLaunchContext: SoberHouseAdminLaunchContext | null,
): AdminModule {
  if (!canManageSoberHouseHierarchy(viewerRole) || !adminLaunchContext) {
    return "HUB";
  }

  return adminLaunchContext.module;
}

function resolveInitialResidentView(
  viewerRole: AppAccessRole,
  adminLaunchContext: SoberHouseAdminLaunchContext | null,
): ResidentView {
  if (adminLaunchContext?.residentView) {
    return adminLaunchContext.residentView;
  }

  if (canManageSoberHouseHierarchy(viewerRole)) {
    return "OVERVIEW";
  }

  return "OVERVIEW";
}

const INPUT_PLACEHOLDER_COLOR = "rgba(245,243,255,0.45)";

type OrganizationDraft = {
  id?: string;
  name: string;
  primaryContactName: string;
  primaryPhone: string;
  primaryEmail: string;
  notes: string;
  isActive: boolean;
};

type AccessDraft = {
  id?: string;
  role: SoberHouseAccessRole;
  houseId: string | null;
};

type HouseDraft = {
  id?: string;
  houseGroupId: string | null;
  name: string;
  address: string;
  phone: string;
  geofenceCenterLat: string;
  geofenceCenterLng: string;
  geofenceRadiusFeetDefault: string;
  houseTypes: HouseType[];
  bedCount: string;
  notes: string;
  isActive: boolean;
};

type HouseGroupDraft = {
  id?: string;
  name: string;
  houseIds: string[];
  notes: string;
  isActive: boolean;
};

type StaffAssignmentDraft = {
  id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  role: StaffRole;
  assignedHouseIds: string[];
  receiveRealTimeViolationAlerts: boolean;
  receiveNearMissAlerts: boolean;
  receiveMonthlyReports: boolean;
  canApproveExceptions: boolean;
  canIssueCorrectiveActions: boolean;
  canViewResidentEvidence: boolean;
  isActive: boolean;
};

type HouseRuleSetDraft = {
  id?: string;
  scopeType: HouseRuleScopeType;
  houseId: string | null;
  houseGroupId: string | null;
  name: string;
  isActive: boolean;
  curfewEnabled: boolean;
  weekdayCurfew: string;
  fridayCurfew: string;
  saturdayCurfew: string;
  sundayCurfew: string;
  curfewGracePeriodMinutes: string;
  preViolationAlertEnabled: boolean;
  preViolationLeadTimeMinutes: string;
  curfewAlertBasis: HouseRuleSet["curfew"]["alertBasis"];
  choresEnabled: boolean;
  choresFrequency: HouseRuleSet["chores"]["frequency"];
  choresDueTime: string;
  choresProofRequirement: HouseRuleSet["chores"]["proofRequirement"];
  choresGracePeriodMinutes: string;
  choresManagerInstantNotificationEnabled: boolean;
  employmentRequired: boolean;
  workplaceVerificationEnabled: boolean;
  workplaceGeofenceRadiusDefault: string;
  managerVerificationRequired: boolean;
  jobSearchApplicationsRequiredPerWeek: string;
  jobSearchProofRequired: boolean;
  jobSearchManagerApprovalRequired: boolean;
  meetingsRequired: boolean;
  meetingsPerWeek: string;
  allowedMeetingTypes: MeetingType[];
  meetingsProofMethod: HouseRuleSet["meetings"]["proofMethod"];
  sponsorContactEnabled: boolean;
  sponsorContactsRequiredPerWeek: string;
  sponsorProofType: HouseRuleSet["sponsorContact"]["proofType"];
};

type RuleScopeSelection = {
  scopeType: HouseRuleScopeType;
  scopeId: string | null;
};

type HouseMeetingScheduleDraft = {
  id?: string;
  title: string;
  notes: string;
  frequency: ScheduledFrequency;
  weekdayList: ScheduledWeekdayCode[];
  monthlyOrdinal: 1 | 2 | 3 | 4 | 5;
  monthlyDay: ScheduledWeekdayCode;
  startsAt: string;
  durationMinutes: string;
  locationLabel: string;
  required: boolean;
  addToCalendar: boolean;
  reminderEnabled: boolean;
  reminderLeadMinutes: string;
  isActive: boolean;
};

type AlertPreferenceDraft = {
  id?: string;
  label: string;
  scope: AlertScope;
  houseId: string | null;
  recipientStaffAssignmentIds: string[];
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  deliveryMethod: AlertPreference["deliveryMethod"];
  sendRealTimeViolationAlerts: boolean;
  sendNearMissAlerts: boolean;
  sendMonthlyReports: boolean;
  isActive: boolean;
};

const HOUSE_MEETING_FREQUENCY_OPTIONS: Array<{ value: ScheduledFrequency; label: string }> = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Biweekly" },
  { value: "MONTHLY", label: "Monthly" },
];

const MONTHLY_ORDINAL_OPTIONS: Array<{ value: 1 | 2 | 3 | 4 | 5; label: string }> = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: 5, label: "Fifth" },
];

function createOrganizationDraft(value: Organization | null): OrganizationDraft {
  if (!value) {
    return {
      name: "",
      primaryContactName: "",
      primaryPhone: "",
      primaryEmail: "",
      notes: "",
      isActive: true,
    };
  }

  return {
    id: value.id,
    name: value.name,
    primaryContactName: value.primaryContactName,
    primaryPhone: formatUsPhoneDisplay(value.primaryPhone),
    primaryEmail: value.primaryEmail,
    notes: value.notes,
    isActive: value.status === "ACTIVE",
  };
}

function createAccessDraft(value: SoberHouseUserAccessProfile | null): AccessDraft {
  return {
    id: value?.id,
    role: value?.role ?? "UNASSIGNED",
    houseId: value?.houseId ?? null,
  };
}

function createHouseDraft(value: House | null): HouseDraft {
  if (!value) {
    const base = createDefaultHouse(new Date().toISOString(), null);
    return {
      id: base.id,
      houseGroupId: null,
      name: "",
      address: "",
      phone: "",
      geofenceCenterLat: "",
      geofenceCenterLng: "",
      geofenceRadiusFeetDefault: String(base.geofenceRadiusFeetDefault),
      houseTypes: [...base.houseTypes],
      bedCount: String(base.bedCount),
      notes: "",
      isActive: true,
    };
  }

  return {
    id: value.id,
    houseGroupId: value.houseGroupId,
    name: value.name,
    address: value.address,
    phone: formatUsPhoneDisplay(value.phone),
    geofenceCenterLat: value.geofenceCenterLat === null ? "" : String(value.geofenceCenterLat),
    geofenceCenterLng: value.geofenceCenterLng === null ? "" : String(value.geofenceCenterLng),
    geofenceRadiusFeetDefault: String(value.geofenceRadiusFeetDefault),
    houseTypes: [...value.houseTypes],
    bedCount: String(value.bedCount),
    notes: value.notes,
    isActive: value.status === "ACTIVE",
  };
}

function createHouseGroupDraft(value: HouseGroup | null): HouseGroupDraft {
  if (!value) {
    const base = createDefaultHouseGroup(new Date().toISOString(), null);
    return {
      id: base.id,
      name: "",
      houseIds: [],
      notes: "",
      isActive: true,
    };
  }

  return {
    id: value.id,
    name: value.name,
    houseIds: [...value.houseIds],
    notes: value.notes,
    isActive: value.status === "ACTIVE",
  };
}

function createStaffAssignmentDraft(value: StaffAssignment | null): StaffAssignmentDraft {
  if (!value) {
    const base = createDefaultStaffAssignment(new Date().toISOString(), null);
    return {
      id: base.id,
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      role: base.role,
      assignedHouseIds: [],
      receiveRealTimeViolationAlerts: false,
      receiveNearMissAlerts: false,
      receiveMonthlyReports: false,
      canApproveExceptions: false,
      canIssueCorrectiveActions: false,
      canViewResidentEvidence: false,
      isActive: true,
    };
  }

  return {
    id: value.id,
    firstName: value.firstName,
    lastName: value.lastName,
    phone: formatUsPhoneDisplay(value.phone),
    email: value.email,
    role: value.role,
    assignedHouseIds: [...value.assignedHouseIds],
    receiveRealTimeViolationAlerts: value.receiveRealTimeViolationAlerts,
    receiveNearMissAlerts: value.receiveNearMissAlerts,
    receiveMonthlyReports: value.receiveMonthlyReports,
    canApproveExceptions: value.canApproveExceptions,
    canIssueCorrectiveActions: value.canIssueCorrectiveActions,
    canViewResidentEvidence: value.canViewResidentEvidence,
    isActive: value.status === "ACTIVE",
  };
}

function createHouseRuleSetDraft(
  value: HouseRuleSet | null,
  scopeType: HouseRuleScopeType,
  scopeId: string | null,
): HouseRuleSetDraft {
  const houseId = scopeType === "HOUSE" ? scopeId : null;
  const base =
    value ?? (houseId ? createDefaultHouseRuleSet(new Date().toISOString(), houseId, null) : null);

  return {
    id: base?.id,
    scopeType,
    houseId: scopeType === "HOUSE" ? (base?.houseId ?? houseId) : null,
    houseGroupId: scopeType === "HOUSE_GROUP" ? (base?.houseGroupId ?? scopeId) : null,
    name: base?.name ?? "Default house rules",
    isActive: base?.status !== "INACTIVE",
    curfewEnabled: base?.curfew.enabled ?? false,
    weekdayCurfew: formatTwelveHourTime(base?.curfew.weekdayCurfew ?? "22:00"),
    fridayCurfew: formatTwelveHourTime(base?.curfew.fridayCurfew ?? "23:00"),
    saturdayCurfew: formatTwelveHourTime(base?.curfew.saturdayCurfew ?? "23:00"),
    sundayCurfew: formatTwelveHourTime(base?.curfew.sundayCurfew ?? "22:00"),
    curfewGracePeriodMinutes: String(base?.curfew.gracePeriodMinutes ?? 15),
    preViolationAlertEnabled: base?.curfew.preViolationAlertEnabled ?? false,
    preViolationLeadTimeMinutes: String(base?.curfew.preViolationLeadTimeMinutes ?? 15),
    curfewAlertBasis: base?.curfew.alertBasis ?? "CLOCK_ONLY",
    choresEnabled: base?.chores.enabled ?? false,
    choresFrequency: base?.chores.frequency ?? "WEEKLY",
    choresDueTime: formatTwelveHourTime(base?.chores.dueTime ?? "18:00"),
    choresProofRequirement: [...(base?.chores.proofRequirement ?? ["CHECKLIST"])],
    choresGracePeriodMinutes: String(base?.chores.gracePeriodMinutes ?? 15),
    choresManagerInstantNotificationEnabled:
      base?.chores.managerInstantNotificationEnabled ?? false,
    employmentRequired: base?.employment.employmentRequired ?? false,
    workplaceVerificationEnabled: base?.employment.workplaceVerificationEnabled ?? false,
    workplaceGeofenceRadiusDefault: String(base?.employment.workplaceGeofenceRadiusDefault ?? 200),
    managerVerificationRequired: base?.employment.managerVerificationRequired ?? false,
    jobSearchApplicationsRequiredPerWeek: String(base?.jobSearch.applicationsRequiredPerWeek ?? 0),
    jobSearchProofRequired: base?.jobSearch.proofRequired ?? false,
    jobSearchManagerApprovalRequired: base?.jobSearch.managerApprovalRequired ?? false,
    meetingsRequired: base?.meetings.meetingsRequired ?? false,
    meetingsPerWeek: String(base?.meetings.meetingsPerWeek ?? 0),
    allowedMeetingTypes: [...(base?.meetings.allowedMeetingTypes ?? ["AA"])],
    meetingsProofMethod: base?.meetings.proofMethod ?? "GEOFENCE_SIGNATURE",
    sponsorContactEnabled: base?.sponsorContact.enabled ?? false,
    sponsorContactsRequiredPerWeek: String(base?.sponsorContact.contactsRequiredPerWeek ?? 0),
    sponsorProofType: base?.sponsorContact.proofType ?? "CALL_LOG",
  };
}

function createHouseMeetingScheduleDraft(
  value: RecurringObligation | null,
): HouseMeetingScheduleDraft {
  return {
    id: value?.id,
    title: value?.title ?? "",
    notes: value?.detail ?? "",
    frequency: value?.frequency ?? "WEEKLY",
    weekdayList:
      value?.weekdayList && value.weekdayList.length > 0
        ? [...value.weekdayList]
        : value?.weekday
          ? [value.weekday]
          : ["MON"],
    monthlyOrdinal: value?.monthlyOrdinal ?? 1,
    monthlyDay: value?.weekdayList[0] ?? value?.weekday ?? "MON",
    startsAt: formatTwelveHourTime(value?.timeLocalHhmm ?? "19:00"),
    durationMinutes: String(value?.durationMinutes ?? 60),
    locationLabel: value?.locationLabel ?? "",
    required: value?.required ?? true,
    addToCalendar: value?.addToCalendar ?? true,
    reminderEnabled: value?.inAppReminderEnabled ?? true,
    reminderLeadMinutes: String(value?.reminderLeadMinutes ?? 30),
    isActive: value?.status !== "INACTIVE",
  };
}

function createAlertPreferenceDraft(value: AlertPreference | null): AlertPreferenceDraft {
  if (!value) {
    const base = createDefaultAlertPreference(new Date().toISOString(), null);
    return {
      id: base.id,
      label: "",
      scope: "ORGANIZATION",
      houseId: null,
      recipientStaffAssignmentIds: [],
      recipientName: "",
      recipientPhone: "",
      recipientEmail: "",
      deliveryMethod: base.deliveryMethod,
      sendRealTimeViolationAlerts: base.sendRealTimeViolationAlerts,
      sendNearMissAlerts: base.sendNearMissAlerts,
      sendMonthlyReports: base.sendMonthlyReports,
      isActive: true,
    };
  }

  return {
    id: value.id,
    label: value.label,
    scope: value.scope,
    houseId: value.houseId,
    recipientStaffAssignmentIds: [...value.recipientStaffAssignmentIds],
    recipientName: value.recipientName,
    recipientPhone: formatUsPhoneDisplay(value.recipientPhone),
    recipientEmail: value.recipientEmail,
    deliveryMethod: value.deliveryMethod,
    sendRealTimeViolationAlerts: value.sendRealTimeViolationAlerts,
    sendNearMissAlerts: value.sendNearMissAlerts,
    sendMonthlyReports: value.sendMonthlyReports,
    isActive: value.status === "ACTIVE",
  };
}

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  );
}

function normalizeIntegerInput(value: string): string {
  return digitsOnly(value).replace(/^0+(?=\d)/, "");
}

function isValidHhmm(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function formatTwelveHourTime(value: string): string {
  if (!isValidHhmm(value)) {
    return value;
  }
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const meridiem = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(normalizedHours).padStart(2, "0")}:${minutesText} ${meridiem}`;
}

function parseTwelveHourTime(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 1 || hours > 12) {
    return null;
  }
  if (minutes < 0 || minutes > 59) {
    return null;
  }
  const normalizedHours =
    meridiem === "AM" ? (hours === 12 ? 0 : hours) : hours === 12 ? 12 : hours + 12;
  return `${String(normalizedHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatProofRequirementList(values: HouseRuleSet["chores"]["proofRequirement"]): string {
  return (
    values
      .map(
        (value) =>
          PROOF_REQUIREMENT_OPTIONS.find((option) => option.value === value)?.label ?? value,
      )
      .join(", ") || "None"
  );
}

function parseNonNegativeInt(value: string, fallback = 0): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parseOptionalCoordinate(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateEmail(value: string): boolean {
  if (value.trim().length === 0) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function toggleStringValue<T extends string>(current: T[], value: T): T[] {
  return current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
}

function labelForHouseTypes(values: HouseType[]): string {
  const labels = values
    .map((value) => HOUSE_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value)
    .join(", ");
  return labels || "None";
}

function labelForRole(role: StaffRole): string {
  return STAFF_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

function labelForRuleScope(scopeType: HouseRuleScopeType): string {
  if (scopeType === "ORGANIZATION") {
    return "Organization defaults";
  }
  if (scopeType === "HOUSE_GROUP") {
    return "House group";
  }
  return "House";
}

function summarizeHouseMeetingSchedule(obligation: RecurringObligation): string {
  const weekdayLabel =
    obligation.frequency === "MONTHLY"
      ? `${
          MONTHLY_ORDINAL_OPTIONS.find(
            (option) => option.value === (obligation.monthlyOrdinal ?? 1),
          )?.label ?? "First"
        } ${
          SCHEDULED_WEEKDAY_OPTIONS.find(
            (option) => option.value === (obligation.weekdayList[0] ?? obligation.weekday ?? "MON"),
          )?.label ?? "Mon"
        }`
      : obligation.weekdayList.length > 0
        ? obligation.weekdayList
            .map(
              (weekday) =>
                SCHEDULED_WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.label ??
                weekday,
            )
            .join(", ")
        : obligation.weekday
          ? (SCHEDULED_WEEKDAY_OPTIONS.find((option) => option.value === obligation.weekday)
              ?.label ?? obligation.weekday)
          : "schedule";
  const frequencyLabel =
    HOUSE_MEETING_FREQUENCY_OPTIONS.find((option) => option.value === obligation.frequency)
      ?.label ?? obligation.frequency;
  return `${frequencyLabel} • ${weekdayLabel} • ${formatTwelveHourTime(obligation.timeLocalHhmm)}`;
}

function labelForEffectiveRuleSource(source: EffectiveRuleValueSource): string {
  if (source === "HOUSE") {
    return "House Override";
  }
  if (source === "HOUSE_GROUP") {
    return "House Group";
  }
  return "Organization Default";
}

function summarizeSourceBreakdown(values: EffectiveRuleValueSource[]): string {
  const counts = values.reduce<Record<EffectiveRuleValueSource, number>>(
    (current, value) => ({
      ...current,
      [value]: (current[value] ?? 0) + 1,
    }),
    {
      ORGANIZATION: 0,
      HOUSE_GROUP: 0,
      HOUSE: 0,
    },
  );
  return [
    counts.ORGANIZATION > 0 ? `${counts.ORGANIZATION} org default` : null,
    counts.HOUSE_GROUP > 0 ? `${counts.HOUSE_GROUP} group template` : null,
    counts.HOUSE > 0 ? `${counts.HOUSE} house override` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" • ");
}

type EffectiveRuleSummaryItem = {
  label: string;
  value: string;
  source: EffectiveRuleValueSource;
};

function buildEffectiveRuleSummaryItems(input: {
  ruleSet: HouseRuleSet;
  sources: {
    meetings: EffectiveRuleValueSource;
    sponsorContact: EffectiveRuleValueSource;
    employment: EffectiveRuleValueSource;
    jobSearch: EffectiveRuleValueSource;
    chores: EffectiveRuleValueSource;
    curfew: EffectiveRuleValueSource;
  };
  houseMeetingCount: number;
  houseMeetingSource: EffectiveRuleValueSource;
}): EffectiveRuleSummaryItem[] {
  return [
    {
      label: "Meetings per week",
      value: input.ruleSet.meetings.meetingsRequired
        ? String(input.ruleSet.meetings.meetingsPerWeek)
        : "Not required",
      source: input.sources.meetings,
    },
    {
      label: "Sponsor calls",
      value: input.ruleSet.sponsorContact.enabled
        ? `${input.ruleSet.sponsorContact.contactsRequiredPerWeek} per week`
        : "Not required",
      source: input.sources.sponsorContact,
    },
    {
      label: "Work / job applications",
      value: input.ruleSet.employment.employmentRequired
        ? input.ruleSet.jobSearch.applicationsRequiredPerWeek > 0
          ? `Employment required or ${input.ruleSet.jobSearch.applicationsRequiredPerWeek} applications/week`
          : "Employment required"
        : input.ruleSet.jobSearch.applicationsRequiredPerWeek > 0
          ? `${input.ruleSet.jobSearch.applicationsRequiredPerWeek} applications/week`
          : "Not required",
      source:
        input.sources.jobSearch === "HOUSE" || input.sources.jobSearch === "HOUSE_GROUP"
          ? input.sources.jobSearch
          : input.sources.employment,
    },
    {
      label: "Chores",
      value: input.ruleSet.chores.enabled
        ? `${input.ruleSet.chores.frequency.toLowerCase()} • ${formatProofRequirementList(
            input.ruleSet.chores.proofRequirement,
          )}`
        : "Not required",
      source: input.sources.chores,
    },
    {
      label: "Curfew",
      value: input.ruleSet.curfew.enabled
        ? `${formatTwelveHourTime(input.ruleSet.curfew.weekdayCurfew)} weekdays`
        : "Not monitored",
      source: input.sources.curfew,
    },
    {
      label: "House meetings",
      value:
        input.houseMeetingCount > 0
          ? `${input.houseMeetingCount} inherited schedule${
              input.houseMeetingCount === 1 ? "" : "s"
            }`
          : "No recurring default",
      source: input.houseMeetingSource,
    },
  ];
}

function labelForAccessRole(role: SoberHouseAccessRole): string {
  if (role === "OWNER_OPERATOR") {
    return "Owner / operator";
  }
  if (role === "HOUSE_RESIDENT") {
    return "Resident";
  }
  if (role === "DRUG_COURT_PARTICIPANT") {
    return "Drug court";
  }
  if (role === "PROBATION_PAROLE_PARTICIPANT") {
    return "Probation / parole";
  }
  return "Not linked";
}

function formatAuditValue(value: string | null): string {
  if (value === null || value === "") {
    return "None";
  }
  if (value.length > 80) {
    return `${value.slice(0, 77)}...`;
  }
  return value;
}

function SaveStatus({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return <Text style={styles.statusText}>{message}</Text>;
}

function SectionHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionMeta}>{meta}</Text>
      </View>
      {action}
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, selected ? styles.chipSelected : null]} onPress={onPress}>
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function SetupModuleCard({
  title,
  meta,
  status,
  actionLabel,
  onPress,
}: {
  title: string;
  meta: string;
  status: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.entityCard} onPress={onPress}>
      <Text style={styles.entityTitle}>{title}</Text>
      <Text style={styles.entityMeta}>{meta}</Text>
      <Text style={styles.entityMeta}>{status}</Text>
      <View style={styles.buttonRow}>
        <AppButton title={actionLabel} variant="secondary" onPress={onPress} />
      </View>
    </Pressable>
  );
}

export function SoberHouseSettingsScreen({
  userId,
  actorId,
  actorName,
  viewerRole,
  sponsorCallLogs,
  onBack,
  adminLaunchContext = null,
}: SoberHouseSettingsScreenProps) {
  const actor = useMemo<AuditActor>(() => ({ id: actorId, name: actorName }), [actorId, actorName]);
  const [store, setStore] = useState<SoberHouseSettingsStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [adminModule, setAdminModule] = useState<AdminModule>(() =>
    resolveInitialAdminModule(viewerRole, adminLaunchContext),
  );
  const [residentView, setResidentView] = useState<ResidentView>(() =>
    resolveInitialResidentView(viewerRole, adminLaunchContext),
  );
  const [selectedAdminHouseId, setSelectedAdminHouseId] = useState<string | null>(null);
  const [selectedAdminHouseView, setSelectedAdminHouseView] = useState<"OVERVIEW" | "VIOLATIONS">(
    "OVERVIEW",
  );
  const [chatIntent, setChatIntent] = useState<{
    violationId: string;
    correctiveActionId?: string | null;
  } | null>(null);
  const [organizationDraft, setOrganizationDraft] = useState<OrganizationDraft>(
    createOrganizationDraft(null),
  );
  const [accessDraft, setAccessDraft] = useState<AccessDraft>(createAccessDraft(null));
  const [isHouseGroupEditorVisible, setIsHouseGroupEditorVisible] = useState(false);
  const [editingHouseGroupId, setEditingHouseGroupId] = useState<string | null>(null);
  const [houseGroupDraft, setHouseGroupDraft] = useState<HouseGroupDraft>(
    createHouseGroupDraft(null),
  );
  const [selectedHouseIds, setSelectedHouseIds] = useState<string[]>([]);
  const [isHouseEditorVisible, setIsHouseEditorVisible] = useState(false);
  const [editingHouseId, setEditingHouseId] = useState<string | null>(null);
  const [houseDraft, setHouseDraft] = useState<HouseDraft>(createHouseDraft(null));
  const [editingStaffAssignmentId, setEditingStaffAssignmentId] = useState<string | null>(null);
  const [staffDraft, setStaffDraft] = useState<StaffAssignmentDraft>(
    createStaffAssignmentDraft(null),
  );
  const [selectedRuleScope, setSelectedRuleScope] = useState<RuleScopeSelection>({
    scopeType: "ORGANIZATION",
    scopeId: null,
  });
  const [ruleDraft, setRuleDraft] = useState<HouseRuleSetDraft>(
    createHouseRuleSetDraft(null, "ORGANIZATION", null),
  );
  const [editingHouseMeetingScheduleId, setEditingHouseMeetingScheduleId] = useState<string | null>(
    null,
  );
  const [houseMeetingScheduleDraft, setHouseMeetingScheduleDraft] =
    useState<HouseMeetingScheduleDraft>(createHouseMeetingScheduleDraft(null));
  const [editingAlertPreferenceId, setEditingAlertPreferenceId] = useState<string | null>(null);
  const [alertDraft, setAlertDraft] = useState<AlertPreferenceDraft>(
    createAlertPreferenceDraft(null),
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const nextStore = await loadSoberHouseSettingsStore(userId);
      if (!active) {
        return;
      }

      setStore(nextStore);
      setAccessDraft(createAccessDraft(nextStore.userAccessProfile));
      setOrganizationDraft(createOrganizationDraft(nextStore.organization));
      setHouseGroupDraft(createHouseGroupDraft(null));
      setHouseDraft(createHouseDraft(null));
      setStaffDraft(createStaffAssignmentDraft(null));
      setAlertDraft(createAlertPreferenceDraft(null));
      setIsHouseGroupEditorVisible(false);
      setEditingHouseGroupId(null);
      setIsHouseEditorVisible(false);
      setEditingHouseId(null);
      setEditingStaffAssignmentId(null);
      setEditingHouseMeetingScheduleId(null);
      setHouseMeetingScheduleDraft(createHouseMeetingScheduleDraft(null));
      setEditingAlertPreferenceId(null);
      setSelectedHouseIds([]);
      setSelectedRuleScope({ scopeType: "ORGANIZATION", scopeId: null });
      setAdminModule(resolveInitialAdminModule(viewerRole, adminLaunchContext));
      setResidentView(resolveInitialResidentView(viewerRole, adminLaunchContext));
      setSelectedAdminHouseId(null);
      setSelectedAdminHouseView("OVERVIEW");

      if (
        canManageSoberHouseHierarchy(viewerRole) &&
        adminLaunchContext &&
        !adminLaunchContext.residentView
      ) {
        if (adminLaunchContext.module === "HOUSES") {
          if (adminLaunchContext.mode === "create") {
            setHouseDraft(createHouseDraft(null));
            setIsHouseEditorVisible(true);
          } else if (adminLaunchContext.houseId) {
            const selectedHouse =
              nextStore.houses.find((house) => house.id === adminLaunchContext.houseId) ?? null;
            if (selectedHouse) {
              setSelectedAdminHouseId(selectedHouse.id);
              if (adminLaunchContext.mode === "edit") {
                setEditingHouseId(selectedHouse.id);
                setHouseDraft(createHouseDraft(selectedHouse));
                setIsHouseEditorVisible(true);
              }
            }
          }
        } else if (adminLaunchContext.module === "MANAGERS") {
          if (adminLaunchContext.mode === "create") {
            setStaffDraft(createStaffAssignmentDraft(null));
          } else if (adminLaunchContext.staffAssignmentId && adminLaunchContext.mode === "edit") {
            const selectedAssignment =
              nextStore.staffAssignments.find(
                (assignment) => assignment.id === adminLaunchContext.staffAssignmentId,
              ) ?? null;
            if (selectedAssignment) {
              setEditingStaffAssignmentId(selectedAssignment.id);
              setStaffDraft(createStaffAssignmentDraft(selectedAssignment));
            }
          }
        }
      }

      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [adminLaunchContext, userId, viewerRole]);

  useEffect(() => {
    if (!store) {
      return;
    }

    setSelectedHouseIds((current) =>
      current.filter((houseId) => store.houses.some((house) => house.id === houseId)),
    );
  }, [store]);

  useEffect(() => {
    if (!store) {
      return;
    }

    if (
      selectedRuleScope.scopeType === "HOUSE" &&
      selectedRuleScope.scopeId &&
      !store.houses.some((house) => house.id === selectedRuleScope.scopeId)
    ) {
      setSelectedRuleScope({ scopeType: "ORGANIZATION", scopeId: null });
      return;
    }
    if (
      selectedRuleScope.scopeType === "HOUSE_GROUP" &&
      selectedRuleScope.scopeId &&
      !store.houseGroups.some((group) => group.id === selectedRuleScope.scopeId)
    ) {
      setSelectedRuleScope({ scopeType: "ORGANIZATION", scopeId: null });
      return;
    }

    const editableRuleSet =
      selectedRuleScope.scopeType === "ORGANIZATION"
        ? getRuleSetForScope(store, "ORGANIZATION", null)
        : selectedRuleScope.scopeType === "HOUSE_GROUP"
          ? (getRuleSetForScope(store, "HOUSE_GROUP", selectedRuleScope.scopeId) ??
            getEffectiveRuleSetForScope(
              store,
              "HOUSE_GROUP",
              selectedRuleScope.scopeId,
              new Date().toISOString(),
            ).ruleSet)
          : selectedRuleScope.scopeId
            ? (getRuleSetForScope(store, "HOUSE", selectedRuleScope.scopeId) ??
              getEffectiveRuleSetForScope(
                store,
                "HOUSE",
                selectedRuleScope.scopeId,
                new Date().toISOString(),
              ).ruleSet)
            : null;

    setRuleDraft(
      createHouseRuleSetDraft(
        editableRuleSet,
        selectedRuleScope.scopeType,
        selectedRuleScope.scopeId,
      ),
    );
  }, [selectedRuleScope, store]);

  useEffect(() => {
    if (adminModule === "ORGANIZATION") {
      setSelectedRuleScope({ scopeType: "ORGANIZATION", scopeId: null });
    }
  }, [adminModule]);

  const scopedHouseMeetingSchedules = useMemo(
    () =>
      store
        ? getRecurringObligationsForScope(
            store,
            selectedRuleScope.scopeType,
            selectedRuleScope.scopeId,
            "HOUSE_MEETING",
          )
        : [],
    [selectedRuleScope.scopeId, selectedRuleScope.scopeType, store],
  );

  useEffect(() => {
    if (!store) {
      return;
    }
    if (!editingHouseMeetingScheduleId) {
      setHouseMeetingScheduleDraft(createHouseMeetingScheduleDraft(null));
      return;
    }
    const selectedSchedule =
      scopedHouseMeetingSchedules.find(
        (schedule) => schedule.id === editingHouseMeetingScheduleId,
      ) ?? null;
    if (!selectedSchedule) {
      setEditingHouseMeetingScheduleId(null);
      setHouseMeetingScheduleDraft(createHouseMeetingScheduleDraft(null));
      return;
    }
    setHouseMeetingScheduleDraft(createHouseMeetingScheduleDraft(selectedSchedule));
  }, [editingHouseMeetingScheduleId, scopedHouseMeetingSchedules, store]);

  const persistStore = useCallback(
    async (
      nextStore: SoberHouseSettingsStore,
      successMessage: string,
      options?: PersistOptions,
    ) => {
      setIsSaving(true);
      try {
        await saveSoberHouseSettingsStore(userId, nextStore);
        setStore(nextStore);
        if (options?.showStatus !== false) {
          setStatusMessage(successMessage);
        }
      } catch {
        setStatusMessage("Unable to save sober house settings locally.");
      } finally {
        setIsSaving(false);
      }
    },
    [userId],
  );

  const saveOrganization = useCallback(async () => {
    if (!store) {
      return;
    }
    if (!canManageSoberHouseHierarchy(viewerRole)) {
      setStatusMessage("Only authorized administrators can change sober-house configuration.");
      return;
    }
    if (organizationDraft.name.trim().length === 0) {
      setStatusMessage("Organization name is required.");
      return;
    }
    if (!validateEmail(organizationDraft.primaryEmail)) {
      setStatusMessage("Primary email is invalid.");
      return;
    }

    const timestamp = new Date().toISOString();
    const result = upsertOrganization(
      store,
      actor,
      {
        id: organizationDraft.id,
        name: organizationDraft.name.trim(),
        primaryContactName: organizationDraft.primaryContactName.trim(),
        primaryPhone: formatUsPhoneDisplay(organizationDraft.primaryPhone),
        primaryEmail: organizationDraft.primaryEmail.trim(),
        notes: organizationDraft.notes.trim(),
        status: organizationDraft.isActive ? "ACTIVE" : "INACTIVE",
      },
      timestamp,
    );

    await persistStore(
      result.store,
      `Organization saved with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
    );
    setOrganizationDraft(createOrganizationDraft(result.store.organization));
  }, [actor, organizationDraft, persistStore, store, viewerRole]);

  const saveAccessProfile = useCallback(async () => {
    if (!store) {
      return;
    }
    if (!canManageSoberHouseHierarchy(viewerRole)) {
      setStatusMessage("Only authorized administrators can change sober-house configuration.");
      return;
    }
    if (accessDraft.role === "HOUSE_RESIDENT" && !accessDraft.houseId) {
      setStatusMessage("Select the sober house you live in.");
      return;
    }
    const timestamp = new Date().toISOString();
    const result = upsertUserAccessProfile(
      store,
      actor,
      {
        id: accessDraft.id,
        linkedUserId: userId,
        role: accessDraft.role,
        organizationId: store.organization?.id ?? null,
        houseId: accessDraft.role === "HOUSE_RESIDENT" ? accessDraft.houseId : null,
        houseGroupId:
          accessDraft.role === "HOUSE_RESIDENT" && accessDraft.houseId
            ? (store.houses.find((house) => house.id === accessDraft.houseId)?.houseGroupId ?? null)
            : null,
        status: "ACTIVE",
      },
      timestamp,
    );
    await persistStore(
      result.store,
      `Access profile saved with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
    );
    setAccessDraft(createAccessDraft(result.store.userAccessProfile));
  }, [accessDraft, actor, persistStore, store, userId, viewerRole]);

  const saveHouseGroup = useCallback(async () => {
    if (!store) {
      return;
    }
    if (!canManageSoberHouseHierarchy(viewerRole)) {
      setStatusMessage("Only authorized administrators can change sober-house configuration.");
      return;
    }
    if (houseGroupDraft.name.trim().length === 0) {
      setStatusMessage("House group name is required.");
      return;
    }

    const timestamp = new Date().toISOString();
    const result = upsertHouseGroup(
      store,
      actor,
      {
        id: editingHouseGroupId ?? houseGroupDraft.id,
        name: houseGroupDraft.name.trim(),
        houseIds: [...houseGroupDraft.houseIds],
        notes: houseGroupDraft.notes.trim(),
        status: houseGroupDraft.isActive ? "ACTIVE" : "INACTIVE",
      },
      timestamp,
    );

    await persistStore(
      result.store,
      `House group saved with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
    );
    setHouseGroupDraft(createHouseGroupDraft(null));
    setEditingHouseGroupId(null);
    setIsHouseGroupEditorVisible(false);
  }, [actor, editingHouseGroupId, houseGroupDraft, persistStore, store, viewerRole]);

  const saveHouse = useCallback(async () => {
    if (!store) {
      return;
    }
    if (!canManageSoberHouseHierarchy(viewerRole)) {
      setStatusMessage("Only authorized administrators can change sober-house configuration.");
      return;
    }
    if (houseDraft.name.trim().length === 0) {
      setStatusMessage("House name is required.");
      return;
    }
    if (houseDraft.address.trim().length === 0) {
      setStatusMessage("House address is required.");
      return;
    }
    if (houseDraft.houseTypes.length === 0) {
      setStatusMessage("Select at least one house type.");
      return;
    }
    const trimmedAddress = houseDraft.address.trim();
    const existingHouse =
      editingHouseId !== null
        ? (store.houses.find((house) => house.id === editingHouseId) ?? null)
        : null;
    const addressChanged =
      existingHouse !== null ? existingHouse.address.trim() !== trimmedAddress : true;
    let geofenceLat = parseOptionalCoordinate(houseDraft.geofenceCenterLat);
    let geofenceLng = parseOptionalCoordinate(houseDraft.geofenceCenterLng);
    let geofenceResolutionMessage: string | null = null;

    if (addressChanged || geofenceLat === null || geofenceLng === null) {
      try {
        const geocoded = await geocodeAsync(trimmedAddress);
        const firstResult = geocoded[0];
        if (
          firstResult &&
          Number.isFinite(firstResult.latitude) &&
          Number.isFinite(firstResult.longitude)
        ) {
          geofenceLat = firstResult.latitude;
          geofenceLng = firstResult.longitude;
        } else {
          geofenceLat = null;
          geofenceLng = null;
          geofenceResolutionMessage =
            "House saved, but the geofence point could not be derived from the address yet.";
        }
      } catch {
        geofenceLat = null;
        geofenceLng = null;
        geofenceResolutionMessage =
          "House saved, but the geofence point could not be derived from the address yet.";
      }
    }

    const timestamp = new Date().toISOString();
    const result = upsertHouse(
      store,
      actor,
      {
        id: editingHouseId ?? houseDraft.id,
        houseGroupId: houseDraft.houseGroupId,
        name: houseDraft.name.trim(),
        address: trimmedAddress,
        phone: formatUsPhoneDisplay(houseDraft.phone),
        geofenceCenterLat: geofenceLat,
        geofenceCenterLng: geofenceLng,
        geofenceRadiusFeetDefault: parseNonNegativeInt(houseDraft.geofenceRadiusFeetDefault, 200),
        houseTypes: [...houseDraft.houseTypes],
        bedCount: parseNonNegativeInt(houseDraft.bedCount, 0),
        notes: houseDraft.notes.trim(),
        status: houseDraft.isActive ? "ACTIVE" : "INACTIVE",
      },
      timestamp,
    );

    await persistStore(
      result.store,
      geofenceResolutionMessage ??
        `House saved with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
    );
    setHouseDraft(createHouseDraft(null));
    setEditingHouseId(null);
    setIsHouseEditorVisible(false);
  }, [actor, editingHouseId, houseDraft, persistStore, store, viewerRole]);

  const beginHouseCreate = useCallback(() => {
    setEditingHouseId(null);
    setSelectedAdminHouseId(null);
    setSelectedAdminHouseView("OVERVIEW");
    setHouseDraft(createHouseDraft(null));
    setIsHouseEditorVisible(true);
  }, []);

  const beginHouseEdit = useCallback((house: House) => {
    setEditingHouseId(house.id);
    setSelectedAdminHouseId(house.id);
    setSelectedAdminHouseView("OVERVIEW");
    setHouseDraft(createHouseDraft(house));
    setSelectedRuleScope({ scopeType: "HOUSE", scopeId: house.id });
    setIsHouseEditorVisible(true);
  }, []);

  const openHouseRulesEditor = useCallback((houseId: string | null) => {
    if (!houseId) {
      setStatusMessage("Save the house first, then configure house-specific rules.");
      return;
    }
    setSelectedRuleScope({ scopeType: "HOUSE", scopeId: houseId });
    setIsHouseEditorVisible(false);
    setAdminModule("RULES");
  }, []);

  const saveStaffAssignment = useCallback(async () => {
    if (!store) {
      return;
    }
    if (!canManageSoberHouseHierarchy(viewerRole)) {
      setStatusMessage("Only authorized administrators can change sober-house configuration.");
      return;
    }
    if (staffDraft.firstName.trim().length === 0 || staffDraft.lastName.trim().length === 0) {
      setStatusMessage("Staff first and last name are required.");
      return;
    }
    if (!validateEmail(staffDraft.email)) {
      setStatusMessage("Staff email is invalid.");
      return;
    }
    if (store.houses.length > 0 && staffDraft.assignedHouseIds.length === 0) {
      setStatusMessage("Assign at least one house.");
      return;
    }

    const timestamp = new Date().toISOString();
    const result = upsertStaffAssignment(
      store,
      actor,
      {
        id: editingStaffAssignmentId ?? staffDraft.id,
        firstName: staffDraft.firstName.trim(),
        lastName: staffDraft.lastName.trim(),
        phone: formatUsPhoneDisplay(staffDraft.phone),
        email: staffDraft.email.trim(),
        role: staffDraft.role,
        assignedHouseIds: [...staffDraft.assignedHouseIds],
        receiveRealTimeViolationAlerts: staffDraft.receiveRealTimeViolationAlerts,
        receiveNearMissAlerts: staffDraft.receiveNearMissAlerts,
        receiveMonthlyReports: staffDraft.receiveMonthlyReports,
        canApproveExceptions: staffDraft.canApproveExceptions,
        canIssueCorrectiveActions: staffDraft.canIssueCorrectiveActions,
        canViewResidentEvidence: staffDraft.canViewResidentEvidence,
        status: staffDraft.isActive ? "ACTIVE" : "INACTIVE",
      },
      timestamp,
    );

    await persistStore(
      result.store,
      `Staff assignment saved with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
    );
    setStaffDraft(createStaffAssignmentDraft(null));
    setEditingStaffAssignmentId(null);
  }, [actor, editingStaffAssignmentId, persistStore, staffDraft, store, viewerRole]);

  const saveRuleSet = useCallback(async () => {
    if (!store) {
      return;
    }
    if (!canManageSoberHouseHierarchy(viewerRole)) {
      setStatusMessage("Only authorized administrators can change sober-house configuration.");
      return;
    }
    if (selectedRuleScope.scopeType !== "ORGANIZATION" && !selectedRuleScope.scopeId) {
      setStatusMessage(
        `Select a ${labelForRuleScope(selectedRuleScope.scopeType).toLowerCase()} before saving rules.`,
      );
      return;
    }
    const weekdayCurfew = parseTwelveHourTime(ruleDraft.weekdayCurfew);
    const fridayCurfew = parseTwelveHourTime(ruleDraft.fridayCurfew);
    const saturdayCurfew = parseTwelveHourTime(ruleDraft.saturdayCurfew);
    const sundayCurfew = parseTwelveHourTime(ruleDraft.sundayCurfew);
    const choresDueTime = parseTwelveHourTime(ruleDraft.choresDueTime);

    if (!weekdayCurfew) {
      setStatusMessage("Weekday curfew must use 12-hour time like 10:00 PM.");
      return;
    }
    if (!fridayCurfew || !saturdayCurfew || !sundayCurfew) {
      setStatusMessage("All curfew times must use 12-hour format with AM or PM.");
      return;
    }
    if (!choresDueTime) {
      setStatusMessage("Chore due time must use 12-hour format with AM or PM.");
      return;
    }

    const timestamp = new Date().toISOString();
    const effectiveRuleSet = getEffectiveRuleSetForScope(
      store,
      selectedRuleScope.scopeType,
      selectedRuleScope.scopeId,
      timestamp,
    ).ruleSet;
    const result = upsertHouseRuleSet(
      store,
      actor,
      {
        id: ruleDraft.id,
        scopeType: selectedRuleScope.scopeType,
        houseId: selectedRuleScope.scopeType === "HOUSE" ? selectedRuleScope.scopeId : null,
        houseGroupId:
          selectedRuleScope.scopeType === "HOUSE_GROUP" ? selectedRuleScope.scopeId : null,
        name: ruleDraft.name.trim() || "Default house rules",
        status: ruleDraft.isActive ? "ACTIVE" : "INACTIVE",
        curfew: {
          enabled: ruleDraft.curfewEnabled,
          weekdayCurfew,
          fridayCurfew,
          saturdayCurfew,
          sundayCurfew,
          gracePeriodMinutes: parseNonNegativeInt(ruleDraft.curfewGracePeriodMinutes, 15),
          preViolationAlertEnabled: ruleDraft.preViolationAlertEnabled,
          preViolationLeadTimeMinutes: parseNonNegativeInt(
            ruleDraft.preViolationLeadTimeMinutes,
            15,
          ),
          alertBasis: ruleDraft.curfewAlertBasis,
        },
        chores: {
          enabled: ruleDraft.choresEnabled,
          frequency: ruleDraft.choresFrequency,
          dueTime: choresDueTime,
          proofRequirement:
            ruleDraft.choresProofRequirement.length > 0
              ? ruleDraft.choresProofRequirement
              : ["NONE"],
          gracePeriodMinutes: parseNonNegativeInt(ruleDraft.choresGracePeriodMinutes, 15),
          managerInstantNotificationEnabled: ruleDraft.choresManagerInstantNotificationEnabled,
        },
        employment: {
          employmentRequired: ruleDraft.employmentRequired,
          workplaceVerificationEnabled: ruleDraft.workplaceVerificationEnabled,
          workplaceGeofenceRadiusDefault: parseNonNegativeInt(
            ruleDraft.workplaceGeofenceRadiusDefault,
            200,
          ),
          managerVerificationRequired: ruleDraft.managerVerificationRequired,
        },
        jobSearch: {
          applicationsRequiredPerWeek: parseNonNegativeInt(
            ruleDraft.jobSearchApplicationsRequiredPerWeek,
            0,
          ),
          proofRequired: ruleDraft.jobSearchProofRequired,
          managerApprovalRequired: ruleDraft.jobSearchManagerApprovalRequired,
        },
        meetings: {
          meetingsRequired: ruleDraft.meetingsRequired,
          meetingsPerWeek: parseNonNegativeInt(ruleDraft.meetingsPerWeek, 0),
          allowedMeetingTypes:
            ruleDraft.allowedMeetingTypes.length > 0 ? ruleDraft.allowedMeetingTypes : ["AA"],
          proofMethod: ruleDraft.meetingsProofMethod,
        },
        sponsorContact: {
          enabled: ruleDraft.sponsorContactEnabled,
          contactsRequiredPerWeek: parseNonNegativeInt(ruleDraft.sponsorContactsRequiredPerWeek, 0),
          proofType: ruleDraft.sponsorProofType,
        },
        oneOnOne: effectiveRuleSet.oneOnOne,
        operations: effectiveRuleSet.operations,
        support: effectiveRuleSet.support,
      },
      timestamp,
    );

    await persistStore(
      result.store,
      `Rules saved with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
    );
  }, [actor, persistStore, ruleDraft, selectedRuleScope, store, viewerRole]);

  const saveHouseMeetingSchedule = useCallback(async () => {
    if (!store) {
      return;
    }
    if (!canManageSoberHouseHierarchy(viewerRole)) {
      setStatusMessage("Only authorized administrators can change sober-house configuration.");
      return;
    }
    if (selectedRuleScope.scopeType !== "ORGANIZATION" && !selectedRuleScope.scopeId) {
      setStatusMessage("Select a scope before saving a house meeting schedule.");
      return;
    }
    if (houseMeetingScheduleDraft.title.trim().length === 0) {
      setStatusMessage("Meeting title is required.");
      return;
    }
    const startsAt = parseTwelveHourTime(houseMeetingScheduleDraft.startsAt);
    if (!startsAt) {
      setStatusMessage("Meeting start time must use 12-hour format with AM or PM.");
      return;
    }
    const weekdays =
      houseMeetingScheduleDraft.frequency === "MONTHLY"
        ? [houseMeetingScheduleDraft.monthlyDay]
        : houseMeetingScheduleDraft.weekdayList;
    if (houseMeetingScheduleDraft.frequency !== "ONCE" && weekdays.length === 0) {
      setStatusMessage("Select at least one day for the recurring house meeting.");
      return;
    }

    const timestamp = new Date().toISOString();
    const scopeHouse =
      selectedRuleScope.scopeType === "HOUSE" && selectedRuleScope.scopeId
        ? (store.houses.find((house) => house.id === selectedRuleScope.scopeId) ?? null)
        : null;
    const result = upsertRecurringObligation(
      store,
      actor,
      {
        id: editingHouseMeetingScheduleId ?? houseMeetingScheduleDraft.id,
        organizationId: store.organization?.id ?? null,
        scopeType: selectedRuleScope.scopeType,
        houseId: selectedRuleScope.scopeType === "HOUSE" ? selectedRuleScope.scopeId : null,
        houseGroupId:
          selectedRuleScope.scopeType === "HOUSE_GROUP" ? selectedRuleScope.scopeId : null,
        residentId: null,
        linkedUserId: null,
        obligationType: "HOUSE_MEETING",
        title: houseMeetingScheduleDraft.title.trim(),
        detail: houseMeetingScheduleDraft.notes.trim(),
        locationLabel:
          houseMeetingScheduleDraft.locationLabel.trim() ||
          scopeHouse?.name ||
          scopeHouse?.address ||
          "House location",
        frequency: houseMeetingScheduleDraft.frequency,
        weekday: weekdays[0] ?? null,
        weekdayList: weekdays,
        monthlyOrdinal:
          houseMeetingScheduleDraft.frequency === "MONTHLY"
            ? houseMeetingScheduleDraft.monthlyOrdinal
            : null,
        scheduledDate: null,
        timeLocalHhmm: startsAt,
        durationMinutes: parseNonNegativeInt(houseMeetingScheduleDraft.durationMinutes, 60),
        required: houseMeetingScheduleDraft.required,
        reminderLeadMinutes: parseNonNegativeInt(houseMeetingScheduleDraft.reminderLeadMinutes, 30),
        inAppReminderEnabled: houseMeetingScheduleDraft.reminderEnabled,
        addToCalendar: houseMeetingScheduleDraft.addToCalendar,
        accountabilityMethod: houseMeetingScheduleDraft.required ? "ACKNOWLEDGMENT" : "NONE",
        status: houseMeetingScheduleDraft.isActive ? "ACTIVE" : "INACTIVE",
      },
      timestamp,
    );

    await persistStore(
      result.store,
      `House meeting schedule saved with ${result.auditCount} audit entr${
        result.auditCount === 1 ? "y" : "ies"
      }.`,
    );
    setEditingHouseMeetingScheduleId(null);
    setHouseMeetingScheduleDraft(createHouseMeetingScheduleDraft(null));
  }, [
    actor,
    editingHouseMeetingScheduleId,
    houseMeetingScheduleDraft,
    persistStore,
    selectedRuleScope.scopeId,
    selectedRuleScope.scopeType,
    store,
    viewerRole,
  ]);

  const saveAlertPreference = useCallback(async () => {
    if (!store) {
      return;
    }
    if (!canManageSoberHouseHierarchy(viewerRole)) {
      setStatusMessage("Only authorized administrators can change sober-house configuration.");
      return;
    }
    if (alertDraft.label.trim().length === 0) {
      setStatusMessage("Alert preference label is required.");
      return;
    }
    if (alertDraft.scope === "HOUSE" && !alertDraft.houseId) {
      setStatusMessage("Select a house for house-scoped alerts.");
      return;
    }

    const selectedStaff = alertDraft.recipientStaffAssignmentIds
      .map((assignmentId) => getStaffAssignmentById(store, assignmentId))
      .filter((assignment): assignment is NonNullable<typeof assignment> => assignment !== null);
    const recipientName =
      selectedStaff.length > 0
        ? uniqueNonEmptyStrings(
            selectedStaff.map((assignment) =>
              `${assignment.firstName} ${assignment.lastName}`.trim(),
            ),
          ).join(", ")
        : alertDraft.recipientName.trim();
    const recipientEmail =
      selectedStaff.length > 0
        ? uniqueNonEmptyStrings(selectedStaff.map((assignment) => assignment.email)).join(", ")
        : alertDraft.recipientEmail.trim();
    const recipientPhone =
      selectedStaff.length > 0
        ? uniqueNonEmptyStrings(
            selectedStaff
              .map((assignment) => formatUsPhoneDisplay(assignment.phone))
              .filter((value) => value.length > 0),
          ).join(", ")
        : formatUsPhoneDisplay(alertDraft.recipientPhone.trim());

    if (recipientName.length === 0) {
      setStatusMessage("Alert recipient name is required.");
      return;
    }
    if (
      (alertDraft.deliveryMethod === "EMAIL" || alertDraft.deliveryMethod === "BOTH") &&
      !validateEmail(recipientEmail)
    ) {
      setStatusMessage("Alert recipient email is invalid.");
      return;
    }
    if (
      (alertDraft.deliveryMethod === "SMS" || alertDraft.deliveryMethod === "BOTH") &&
      recipientPhone.length === 0
    ) {
      setStatusMessage("Alert recipient phone is required for SMS delivery.");
      return;
    }

    const timestamp = new Date().toISOString();
    const result = upsertAlertPreference(
      store,
      actor,
      {
        id: editingAlertPreferenceId ?? alertDraft.id,
        label: alertDraft.label.trim(),
        scope: alertDraft.scope,
        houseId: alertDraft.scope === "HOUSE" ? alertDraft.houseId : null,
        recipientStaffAssignmentIds: [...alertDraft.recipientStaffAssignmentIds],
        recipientName,
        recipientPhone,
        recipientEmail,
        deliveryMethod: alertDraft.deliveryMethod,
        sendRealTimeViolationAlerts: alertDraft.sendRealTimeViolationAlerts,
        sendNearMissAlerts: alertDraft.sendNearMissAlerts,
        sendMonthlyReports: alertDraft.sendMonthlyReports,
        status: alertDraft.isActive ? "ACTIVE" : "INACTIVE",
      },
      timestamp,
    );

    await persistStore(
      result.store,
      `Alert preference saved with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
    );
    const savedId = editingAlertPreferenceId ?? alertDraft.id ?? null;
    const savedPreference =
      savedId !== null
        ? (result.store.alertPreferences.find((preference) => preference.id === savedId) ?? null)
        : null;
    setAlertDraft(createAlertPreferenceDraft(savedPreference));
    setEditingAlertPreferenceId(savedPreference?.id ?? null);
  }, [actor, alertDraft, editingAlertPreferenceId, persistStore, store, viewerRole]);

  const userAccessProfile = store ? getUserAccessProfile(store) : null;
  const residentMode = store ? isResidentAccess(store) : false;
  const forceResidentSafeMode = residentMode && adminLaunchContext?.residentView !== undefined;
  const residentSetupState = useMemo(
    () => (residentMode && store ? getResidentSetupState(store, userId) : null),
    [residentMode, store, userId],
  );
  const residentAssignedHouse =
    store && userAccessProfile?.houseId
      ? (store.houses.find((house) => house.id === userAccessProfile.houseId) ?? null)
      : null;
  const nowIso = new Date().toISOString();
  const residentAssignedRuleSet =
    store && residentAssignedHouse
      ? getEffectiveRuleSetForScope(store, "HOUSE", residentAssignedHouse.id, nowIso)
      : null;
  const residentHouseMeetingSchedules =
    store && residentAssignedHouse
      ? getRecurringObligationsForScope(store, "HOUSE", residentAssignedHouse.id, "HOUSE_MEETING")
      : [];
  const residentGroupMeetingSchedules =
    store && residentAssignedHouse?.houseGroupId
      ? getRecurringObligationsForScope(
          store,
          "HOUSE_GROUP",
          residentAssignedHouse.houseGroupId,
          "HOUSE_MEETING",
        )
      : [];
  const residentOrganizationMeetingSchedules = store
    ? getRecurringObligationsForScope(store, "ORGANIZATION", null, "HOUSE_MEETING")
    : [];
  const residentEffectiveMeetingSchedules =
    residentHouseMeetingSchedules.length > 0
      ? residentHouseMeetingSchedules
      : residentGroupMeetingSchedules.length > 0
        ? residentGroupMeetingSchedules
        : residentOrganizationMeetingSchedules;
  const residentMeetingSource: EffectiveRuleValueSource =
    residentHouseMeetingSchedules.length > 0
      ? "HOUSE"
      : residentGroupMeetingSchedules.length > 0
        ? "HOUSE_GROUP"
        : "ORGANIZATION";
  const showAdminControls = canManageSoberHouseHierarchy(viewerRole) && !forceResidentSafeMode;

  if (loading || !store) {
    return (
      <GlassCard style={styles.card} strong>
        <Text style={styles.sectionTitle}>Sober Housing Settings</Text>
        <Text style={styles.sectionMeta}>Loading configuration…</Text>
      </GlassCard>
    );
  }

  if (!showAdminControls && !residentMode && !canViewSoberHouseResidentExperience(viewerRole)) {
    return (
      <GlassCard style={styles.card} strong>
        <SectionHeader
          title="Sober House Profile"
          meta="This area is limited to sober-house residents and authorized organization administrators."
          action={<AppButton title="Back to Dashboard" onPress={onBack} variant="secondary" />}
        />
      </GlassCard>
    );
  }

  const selectedAdminHouseDetail = selectedAdminHouseId
    ? buildSoberHouseOwnerHouseDetail(store, selectedAdminHouseId)
    : null;
  const selectedAdminHouseRecord = selectedAdminHouseId
    ? (store.houses.find((house) => house.id === selectedAdminHouseId) ?? null)
    : null;
  const selectedAdminHouseViolations = selectedAdminHouseId
    ? buildSoberHouseOwnerHouseViolationRows(store, selectedAdminHouseId)
    : [];
  const selectedAdminHouseEffectiveRules =
    selectedAdminHouseRecord !== null
      ? getEffectiveRuleSetForScope(store, "HOUSE", selectedAdminHouseRecord.id, nowIso)
      : null;
  const selectedAdminHouseBaseSourceLabel = selectedAdminHouseRecord?.houseGroupId
    ? `House group template: ${
        getHouseGroupById(store, selectedAdminHouseRecord.houseGroupId)?.name ?? "Assigned group"
      }`
    : "Organization default";
  const selectedAdminHouseMeetingSchedules = selectedAdminHouseRecord
    ? getRecurringObligationsForScope(store, "HOUSE", selectedAdminHouseRecord.id, "HOUSE_MEETING")
    : [];
  const selectedAdminGroupMeetingSchedules = selectedAdminHouseRecord?.houseGroupId
    ? getRecurringObligationsForScope(
        store,
        "HOUSE_GROUP",
        selectedAdminHouseRecord.houseGroupId,
        "HOUSE_MEETING",
      )
    : [];
  const selectedAdminHouseMeetingSource: EffectiveRuleValueSource =
    selectedAdminHouseMeetingSchedules.length > 0
      ? "HOUSE"
      : selectedAdminGroupMeetingSchedules.length > 0
        ? "HOUSE_GROUP"
        : "ORGANIZATION";
  const selectedAdminHouseRuleSummaryItems =
    selectedAdminHouseEffectiveRules !== null
      ? buildEffectiveRuleSummaryItems({
          ruleSet: selectedAdminHouseEffectiveRules.ruleSet,
          sources: selectedAdminHouseEffectiveRules.sources,
          houseMeetingCount:
            selectedAdminHouseMeetingSchedules.length > 0
              ? selectedAdminHouseMeetingSchedules.length
              : selectedAdminGroupMeetingSchedules.length > 0
                ? selectedAdminGroupMeetingSchedules.length
                : residentOrganizationMeetingSchedules.length,
          houseMeetingSource: selectedAdminHouseMeetingSource,
        })
      : [];
  const selectedAdminHouseEffectiveBreakdown =
    selectedAdminHouseEffectiveRules !== null
      ? summarizeSourceBreakdown([
          ...Object.values(selectedAdminHouseEffectiveRules.sources),
          selectedAdminHouseMeetingSource,
        ])
      : "";
  const editingHouseBaseSourceLabel = houseDraft.houseGroupId
    ? `House group template: ${
        getHouseGroupById(store, houseDraft.houseGroupId)?.name ?? "Assigned group"
      }`
    : "Organization default";
  const editingHouseRuleContext =
    editingHouseId !== null
      ? getEffectiveRuleSetForScope(store, "HOUSE", editingHouseId, nowIso)
      : houseDraft.houseGroupId
        ? getEffectiveRuleSetForScope(store, "HOUSE_GROUP", houseDraft.houseGroupId, nowIso)
        : getEffectiveRuleSetForScope(store, "ORGANIZATION", null, nowIso);
  const editingHouseLocalMeetingSchedules =
    editingHouseId !== null
      ? getRecurringObligationsForScope(store, "HOUSE", editingHouseId, "HOUSE_MEETING")
      : [];
  const editingHouseBaseMeetingSchedules = houseDraft.houseGroupId
    ? getRecurringObligationsForScope(
        store,
        "HOUSE_GROUP",
        houseDraft.houseGroupId,
        "HOUSE_MEETING",
      )
    : residentOrganizationMeetingSchedules;
  const editingHouseMeetingSource: EffectiveRuleValueSource =
    editingHouseLocalMeetingSchedules.length > 0
      ? "HOUSE"
      : houseDraft.houseGroupId
        ? "HOUSE_GROUP"
        : "ORGANIZATION";
  const editingHouseRuleSummaryItems = buildEffectiveRuleSummaryItems({
    ruleSet: editingHouseRuleContext.ruleSet,
    sources: editingHouseRuleContext.sources,
    houseMeetingCount:
      editingHouseLocalMeetingSchedules.length > 0
        ? editingHouseLocalMeetingSchedules.length
        : editingHouseBaseMeetingSchedules.length,
    houseMeetingSource: editingHouseMeetingSource,
  });
  const editingHouseEffectiveBreakdown = summarizeSourceBreakdown([
    ...Object.values(editingHouseRuleContext.sources),
    editingHouseMeetingSource,
  ]);
  const selectedRulesScopeReady =
    selectedRuleScope.scopeType === "ORGANIZATION" || selectedRuleScope.scopeId !== null;
  const selectedRulesScopeEffectiveRules = selectedRulesScopeReady
    ? getEffectiveRuleSetForScope(
        store,
        selectedRuleScope.scopeType,
        selectedRuleScope.scopeId,
        nowIso,
      )
    : null;
  const selectedRulesScopeMeetingSchedules = selectedRulesScopeReady
    ? getRecurringObligationsForScope(
        store,
        selectedRuleScope.scopeType,
        selectedRuleScope.scopeId,
        "HOUSE_MEETING",
      )
    : [];
  const selectedRulesScopeHouseMeetingSource: EffectiveRuleValueSource =
    selectedRuleScope.scopeType === "HOUSE" && selectedRuleScope.scopeId
      ? getRecurringObligationsForScope(store, "HOUSE", selectedRuleScope.scopeId, "HOUSE_MEETING")
          .length > 0
        ? "HOUSE"
        : store.houses.find((house) => house.id === selectedRuleScope.scopeId)?.houseGroupId
          ? getRecurringObligationsForScope(
              store,
              "HOUSE_GROUP",
              store.houses.find((house) => house.id === selectedRuleScope.scopeId)?.houseGroupId ??
                null,
              "HOUSE_MEETING",
            ).length > 0
            ? "HOUSE_GROUP"
            : "ORGANIZATION"
          : "ORGANIZATION"
      : selectedRuleScope.scopeType === "HOUSE_GROUP"
        ? selectedRuleScope.scopeId &&
          getRecurringObligationsForScope(
            store,
            "HOUSE_GROUP",
            selectedRuleScope.scopeId,
            "HOUSE_MEETING",
          ).length > 0
          ? "HOUSE_GROUP"
          : "ORGANIZATION"
        : "ORGANIZATION";
  const selectedRulesScopeEffectiveMeetingCount =
    selectedRuleScope.scopeType === "HOUSE" && selectedRuleScope.scopeId
      ? getRecurringObligationsForScope(store, "HOUSE", selectedRuleScope.scopeId, "HOUSE_MEETING")
          .length > 0
        ? getRecurringObligationsForScope(
            store,
            "HOUSE",
            selectedRuleScope.scopeId,
            "HOUSE_MEETING",
          ).length
        : store.houses.find((house) => house.id === selectedRuleScope.scopeId)?.houseGroupId
          ? getRecurringObligationsForScope(
              store,
              "HOUSE_GROUP",
              store.houses.find((house) => house.id === selectedRuleScope.scopeId)?.houseGroupId ??
                null,
              "HOUSE_MEETING",
            ).length > 0
            ? getRecurringObligationsForScope(
                store,
                "HOUSE_GROUP",
                store.houses.find((house) => house.id === selectedRuleScope.scopeId)
                  ?.houseGroupId ?? null,
                "HOUSE_MEETING",
              ).length
            : residentOrganizationMeetingSchedules.length
          : residentOrganizationMeetingSchedules.length
      : selectedRuleScope.scopeType === "HOUSE_GROUP" && selectedRuleScope.scopeId
        ? selectedRulesScopeMeetingSchedules.length > 0
          ? selectedRulesScopeMeetingSchedules.length
          : residentOrganizationMeetingSchedules.length
        : selectedRulesScopeMeetingSchedules.length;
  const organizationSetupStatus = store.organization
    ? `Complete • ${store.organization.name || "Organization saved"}`
    : "Start setup";
  const houseGroupsSetupStatus =
    store.houseGroups.length > 0
      ? `${store.houseGroups.length} group${store.houseGroups.length === 1 ? "" : "s"} configured`
      : "No house groups yet";
  const housesSetupStatus =
    store.houses.length > 0
      ? `${store.houses.length} house${store.houses.length === 1 ? "" : "s"} configured`
      : "No houses yet";
  const rulesSetupStatus =
    store.houseRuleSets.length > 0
      ? `${store.houseRuleSets.filter((ruleSet) => ruleSet.status === "ACTIVE").length} active rule set${store.houseRuleSets.filter((ruleSet) => ruleSet.status === "ACTIVE").length === 1 ? "" : "s"}`
      : "No rule sets yet";
  const managersSetupStatus =
    store.staffAssignments.length > 0
      ? `${store.staffAssignments.length} manager/staff record${store.staffAssignments.length === 1 ? "" : "s"}`
      : "No managers yet";
  const residentsOperationsStatus =
    store.residentHouseMemberships.length > 0
      ? `${store.residentHouseMemberships.filter((membership) => membership.status === "ACTIVE").length} active resident placement${store.residentHouseMemberships.filter((membership) => membership.status === "ACTIVE").length === 1 ? "" : "s"}`
      : "No resident placements yet";
  const chatOperationsStatus =
    store.chatThreads.length > 0
      ? `${store.chatThreads.length} active thread${store.chatThreads.length === 1 ? "" : "s"}`
      : "No internal chat threads yet";
  const violationsOperationsStatus =
    store.violations.length > 0
      ? `${store.violations.filter((violation) => violation.status !== "RESOLVED" && violation.status !== "DISMISSED").length} open or active issue${store.violations.filter((violation) => violation.status !== "RESOLVED" && violation.status !== "DISMISSED").length === 1 ? "" : "s"}`
      : "No violations logged";
  const reportsOperationsStatus =
    store.monthlyReports.length > 0
      ? `${store.monthlyReports.length} report snapshot${store.monthlyReports.length === 1 ? "" : "s"}`
      : "No report snapshots yet";

  const renderHouseEditor = () =>
    isHouseEditorVisible ? (
      <GlassCard style={styles.subCard}>
        <SectionHeader
          title={editingHouseId ? `Edit House: ${houseDraft.name || "House"}` : "New House"}
          meta="Choose the base rule source, confirm inherited defaults, and manage any house-only overrides."
        />
        <Text style={styles.entityMeta}>Base source: {editingHouseBaseSourceLabel}</Text>
        <Text style={styles.entityMeta}>Effective breakdown: {editingHouseEffectiveBreakdown}</Text>
        <View style={styles.buttonRow}>
          <AppButton
            title={editingHouseId ? "Edit local overrides" : "Save house before overrides"}
            variant="secondary"
            onPress={() => openHouseRulesEditor(editingHouseId)}
            disabled={isSaving || !editingHouseId}
          />
        </View>
        <FieldLabel>Rule source mode</FieldLabel>
        <View style={styles.chipRow}>
          <OptionChip
            label="Organization default"
            selected={houseDraft.houseGroupId === null}
            onPress={() => setHouseDraft((current) => ({ ...current, houseGroupId: null }))}
          />
          <OptionChip
            label="House group template"
            selected={houseDraft.houseGroupId !== null}
            onPress={() => {
              const firstGroupId = store.houseGroups[0]?.id ?? null;
              if (!firstGroupId) {
                setStatusMessage("Create a house group before assigning a house-group template.");
                return;
              }
              setHouseDraft((current) => ({
                ...current,
                houseGroupId: current.houseGroupId ?? firstGroupId,
              }));
            }}
          />
        </View>
        {houseDraft.houseGroupId !== null ? (
          <>
            <FieldLabel>Assigned house group template</FieldLabel>
            <View style={styles.chipRow}>
              {store.houseGroups.map((group) => (
                <OptionChip
                  key={group.id}
                  label={group.name}
                  selected={houseDraft.houseGroupId === group.id}
                  onPress={() =>
                    setHouseDraft((current) => ({ ...current, houseGroupId: group.id }))
                  }
                />
              ))}
            </View>
          </>
        ) : null}
        <GlassCard style={styles.subCard}>
          <SectionHeader
            title="Effective Requirements"
            meta="These are the resident-facing defaults this house will resolve to right now."
          />
          {editingHouseRuleSummaryItems.map((item) => (
            <View key={item.label} style={styles.auditRow}>
              <Text style={styles.auditTitle}>{item.label}</Text>
              <Text style={styles.entityMeta}>
                {item.value} ({labelForEffectiveRuleSource(item.source)})
              </Text>
            </View>
          ))}
        </GlassCard>
        <FieldLabel>House name</FieldLabel>
        <TextInput
          style={styles.input}
          value={houseDraft.name}
          onChangeText={(value) => setHouseDraft((current) => ({ ...current, name: value }))}
          placeholder="Maple House"
          placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
        />
        <FieldLabel>House address</FieldLabel>
        <TextInput
          style={styles.input}
          value={houseDraft.address}
          onChangeText={(value) => setHouseDraft((current) => ({ ...current, address: value }))}
          placeholder="123 Main St, Billings, MT"
          placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
        />
        <View style={styles.twoColumnRow}>
          <View style={styles.column}>
            <FieldLabel>House phone</FieldLabel>
            <TextInput
              style={styles.input}
              value={houseDraft.phone}
              onChangeText={(value) =>
                setHouseDraft((current) => ({
                  ...current,
                  phone: normalizeUsPhoneInput(value),
                }))
              }
              keyboardType="phone-pad"
              placeholder="(555) 555-3434"
              placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            />
          </View>
          <View style={styles.column}>
            <FieldLabel>Geofence radius (ft)</FieldLabel>
            <TextInput
              style={styles.input}
              value={houseDraft.geofenceRadiusFeetDefault}
              onChangeText={(value) =>
                setHouseDraft((current) => ({
                  ...current,
                  geofenceRadiusFeetDefault: normalizeIntegerInput(value),
                }))
              }
              keyboardType="number-pad"
              placeholder="200"
              placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            />
          </View>
        </View>
        <Text style={styles.sectionMeta}>
          Geofence location is derived internally from the saved house address. Admins set the
          address and radius only.
        </Text>
        <FieldLabel>House type</FieldLabel>
        <View style={styles.chipRow}>
          {HOUSE_TYPE_OPTIONS.map((option) => (
            <OptionChip
              key={option.value}
              label={option.label}
              selected={houseDraft.houseTypes.includes(option.value)}
              onPress={() =>
                setHouseDraft((current) => ({
                  ...current,
                  houseTypes: toggleStringValue(current.houseTypes, option.value),
                }))
              }
            />
          ))}
        </View>
        <View style={styles.twoColumnRow}>
          <View style={styles.column}>
            <FieldLabel>Bed count</FieldLabel>
            <TextInput
              style={styles.input}
              value={houseDraft.bedCount}
              onChangeText={(value) =>
                setHouseDraft((current) => ({
                  ...current,
                  bedCount: normalizeIntegerInput(value),
                }))
              }
              keyboardType="number-pad"
              placeholder="12"
              placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            />
          </View>
          <View style={styles.column}>
            <ToggleRow
              label="House active"
              value={houseDraft.isActive}
              onValueChange={(value) =>
                setHouseDraft((current) => ({ ...current, isActive: value }))
              }
            />
          </View>
        </View>
        <FieldLabel>Notes</FieldLabel>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={houseDraft.notes}
          onChangeText={(value) => setHouseDraft((current) => ({ ...current, notes: value }))}
          placeholder="Notes about admission profile, transportation, or curfew handling."
          placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
          multiline
        />
        <View style={styles.buttonRow}>
          <AppButton
            title={editingHouseId ? "Update house" : "Create house"}
            onPress={() => void saveHouse()}
            disabled={isSaving}
          />
          <View style={styles.buttonSpacer} />
          <AppButton
            title="Cancel"
            variant="secondary"
            onPress={() => {
              setIsHouseEditorVisible(false);
              setEditingHouseId(null);
              setHouseDraft(createHouseDraft(null));
            }}
          />
        </View>
      </GlassCard>
    ) : null;

  return (
    <View style={styles.wrap}>
      <GlassCard style={styles.card} strong>
        {showAdminControls ? (
          <>
            <SectionHeader
              title="Sober Housing Settings"
              meta="System of record for sober-house configuration, house rules, staff routing, and audit history."
              action={<AppButton title="Back to Dashboard" onPress={onBack} variant="secondary" />}
            />
            <View style={styles.summaryRow}>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryValue}>{store.organization ? "1" : "0"}</Text>
                <Text style={styles.summaryLabel}>Organization</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryValue}>{store.houses.length}</Text>
                <Text style={styles.summaryLabel}>Houses</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryValue}>{store.staffAssignments.length}</Text>
                <Text style={styles.summaryLabel}>Staff</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryValue}>{store.violations.length}</Text>
                <Text style={styles.summaryLabel}>Violations</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryValue}>{store.chatThreads.length}</Text>
                <Text style={styles.summaryLabel}>Threads</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryValue}>{store.monthlyReports.length}</Text>
                <Text style={styles.summaryLabel}>Reports</Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryValue}>{store.auditLogEntries.length}</Text>
                <Text style={styles.summaryLabel}>Audit</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <SectionHeader
              title="Sober House Profile"
              meta="Your resident-facing house details, requirements, and progress live here."
              action={<AppButton title="Back to Dashboard" onPress={onBack} variant="secondary" />}
            />
            <Text style={styles.entityTitle}>
              {residentAssignedHouse?.name ?? "No house assigned"}
            </Text>
            <Text style={styles.entityMeta}>
              Organization: {store.organization?.name ?? "No organization configured"}
            </Text>
            <Text style={styles.entityMeta}>
              Meetings required:{" "}
              {residentAssignedRuleSet?.ruleSet.meetings.meetingsRequired
                ? `${residentAssignedRuleSet.ruleSet.meetings.meetingsPerWeek} per week`
                : "No weekly meeting requirement"}
            </Text>
            <Text style={styles.entityMeta}>
              Sponsor contact:{" "}
              {residentAssignedRuleSet?.ruleSet.sponsorContact.enabled
                ? `${residentAssignedRuleSet.ruleSet.sponsorContact.contactsRequiredPerWeek} per week`
                : "Not required"}
            </Text>
            <Text style={styles.entityMeta}>
              Curfew:{" "}
              {residentAssignedRuleSet?.ruleSet.curfew.enabled
                ? `${formatTwelveHourTime(residentAssignedRuleSet.ruleSet.curfew.weekdayCurfew)} weekdays`
                : "Disabled"}
            </Text>
            {residentSetupState ? (
              <Text style={styles.entityMeta}>
                {residentSetupState.complete
                  ? "Resident setup is saved. Review house requirements here and complete assigned tasks from the routine page."
                  : `Setup remaining: ${residentSetupState.missingItems.join(" • ")}`}
              </Text>
            ) : null}
            {residentMode ? (
              <View style={styles.buttonRow}>
                <AppButton
                  title="Overview"
                  variant={residentView === "OVERVIEW" ? "primary" : "secondary"}
                  onPress={() => setResidentView("OVERVIEW")}
                />
                <View style={styles.buttonSpacer} />
                <AppButton
                  title="Routine"
                  variant={residentView === "REQUIREMENTS" ? "primary" : "secondary"}
                  onPress={() => setResidentView("REQUIREMENTS")}
                />
              </View>
            ) : null}
          </>
        )}
        <SaveStatus message={statusMessage} />
        {showAdminControls && adminModule !== "HUB" ? (
          <View style={styles.buttonRow}>
            <AppButton
              title="Back to Setup Hub"
              variant="secondary"
              onPress={() => {
                setAdminModule("HUB");
                setSelectedAdminHouseId(null);
                setSelectedAdminHouseView("OVERVIEW");
              }}
            />
          </View>
        ) : null}
      </GlassCard>

      {showAdminControls && adminModule === "HUB" ? (
        <>
          <GlassCard style={styles.card} strong>
            <SectionHeader
              title="Setup"
              meta="Configure the core sober-house setup modules independently and resume them any time."
            />
            <View style={styles.listWrap}>
              <SetupModuleCard
                title="Organization"
                meta="Organization baseline, contact profile, and default policy layer."
                status={organizationSetupStatus}
                actionLabel={store.organization ? "Edit organization" : "Start organization"}
                onPress={() => setAdminModule("ORGANIZATION")}
              />
              <SetupModuleCard
                title="House Groups"
                meta="Reusable rule templates for subsets of houses."
                status={houseGroupsSetupStatus}
                actionLabel={store.houseGroups.length > 0 ? "Edit groups" : "Create groups"}
                onPress={() => setAdminModule("HOUSE_GROUPS")}
              />
              <SetupModuleCard
                title="Houses"
                meta="Create houses, assign rule source, and review inherited policy."
                status={housesSetupStatus}
                actionLabel={store.houses.length > 0 ? "Edit houses" : "Add houses"}
                onPress={() => setAdminModule("HOUSES")}
              />
              <SetupModuleCard
                title="Rules"
                meta="Configure organization defaults, house-group templates, and house overrides."
                status={rulesSetupStatus}
                actionLabel={store.houseRuleSets.length > 0 ? "Edit rules" : "Build rules"}
                onPress={() => setAdminModule("RULES")}
              />
              <SetupModuleCard
                title="Managers"
                meta="Assign staff roles, scopes, and house coverage."
                status={managersSetupStatus}
                actionLabel={store.staffAssignments.length > 0 ? "Edit managers" : "Add managers"}
                onPress={() => setAdminModule("MANAGERS")}
              />
            </View>
          </GlassCard>

          <GlassCard style={styles.card} strong>
            <SectionHeader
              title="Operations"
              meta="Operational pages stay separate from initial setup and remain available after configuration."
            />
            <View style={styles.listWrap}>
              <SetupModuleCard
                title="Residents"
                meta="Resident placements and participant-facing house context."
                status={residentsOperationsStatus}
                actionLabel="Open residents"
                onPress={() => setAdminModule("RESIDENTS")}
              />
              <SetupModuleCard
                title="Internal Chat"
                meta="Operational chat threads between admins, managers, and residents."
                status={chatOperationsStatus}
                actionLabel="Open chat"
                onPress={() => setAdminModule("CHAT")}
              />
              <SetupModuleCard
                title="Violations & Actions"
                meta="Review violations, corrective actions, and follow-up."
                status={violationsOperationsStatus}
                actionLabel="Open violations"
                onPress={() => setAdminModule("VIOLATIONS")}
              />
              <SetupModuleCard
                title="Reports & Snapshots"
                meta="Monthly snapshots and reporting records."
                status={reportsOperationsStatus}
                actionLabel="Open reports"
                onPress={() => setAdminModule("REPORTS")}
              />
            </View>
          </GlassCard>
        </>
      ) : null}

      {showAdminControls && adminModule === "HUB" ? (
        <GlassCard style={styles.card} strong>
          <SectionHeader
            title="Access & Scope"
            meta="Choose whether this user is configuring sober-house defaults or living under inherited house policy."
          />
          <FieldLabel>Current role</FieldLabel>
          <View style={styles.chipRow}>
            {(["UNASSIGNED", "OWNER_OPERATOR", "HOUSE_RESIDENT"] as const).map((role) => (
              <OptionChip
                key={role}
                label={labelForAccessRole(role)}
                selected={accessDraft.role === role}
                onPress={() =>
                  setAccessDraft((current) => ({
                    ...current,
                    role,
                    houseId: role === "HOUSE_RESIDENT" ? current.houseId : null,
                  }))
                }
              />
            ))}
          </View>
          <Text style={styles.entityMeta}>
            Saved role: {labelForAccessRole(userAccessProfile?.role ?? "UNASSIGNED")}
          </Text>
          {accessDraft.role === "HOUSE_RESIDENT" ? (
            <>
              <FieldLabel>Assigned sober house</FieldLabel>
              <View style={styles.chipRow}>
                {store.houses.map((house) => (
                  <OptionChip
                    key={house.id}
                    label={house.name}
                    selected={accessDraft.houseId === house.id}
                    onPress={() => setAccessDraft((current) => ({ ...current, houseId: house.id }))}
                  />
                ))}
              </View>
              <Text style={styles.sectionMeta}>
                Residents inherit house defaults. Recovery settings that come from the house stay
                read-only in the recovery app.
              </Text>
            </>
          ) : accessDraft.role === "OWNER_OPERATOR" ? (
            <Text style={styles.sectionMeta}>
              Owner/operators can manage organization defaults, house groups, houses, staff, rules,
              alerts, and activation state.
            </Text>
          ) : (
            <Text style={styles.sectionMeta}>
              Leave this unlinked if the user is only using the recovery app without sober-house
              policy control.
            </Text>
          )}
          <View style={styles.buttonRow}>
            <AppButton
              title="Save access role"
              onPress={() => void saveAccessProfile()}
              disabled={isSaving}
            />
          </View>
        </GlassCard>
      ) : null}

      {residentMode && residentView === "OVERVIEW" ? (
        <>
          <GlassCard style={styles.card} strong>
            <SectionHeader
              title="Sober House Requirements"
              meta="Resident-safe overview of the effective house requirements driving your dashboard and sober-house routine."
            />
            <Text style={styles.entityTitle}>
              {residentAssignedHouse?.name ?? "No house assigned"}
            </Text>
            <Text style={styles.entityMeta}>
              Organization: {store.organization?.name ?? "No organization configured"}
            </Text>
            <Text style={styles.entityMeta}>
              House group:{" "}
              {residentAssignedHouse?.houseGroupId
                ? (getHouseGroupById(store, residentAssignedHouse.houseGroupId)?.name ??
                  "Unassigned")
                : "Unassigned"}
            </Text>
            <Text style={styles.entityMeta}>
              Effective rule sources:{" "}
              {residentAssignedRuleSet
                ? summarizeSourceBreakdown([
                    ...Object.values(residentAssignedRuleSet.sources),
                    residentMeetingSource,
                  ])
                : "No active rules configured"}
            </Text>
            {residentAssignedRuleSet
              ? buildEffectiveRuleSummaryItems({
                  ruleSet: residentAssignedRuleSet.ruleSet,
                  sources: residentAssignedRuleSet.sources,
                  houseMeetingCount: residentEffectiveMeetingSchedules.length,
                  houseMeetingSource: residentMeetingSource,
                }).map((item) => (
                  <Text key={item.label} style={styles.entityMeta}>
                    {item.label}: {item.value} ({labelForEffectiveRuleSource(item.source)})
                  </Text>
                ))
              : null}
            {residentAssignedRuleSet ? (
              <>
                <Text style={styles.entityMeta}>
                  Proof / photo requirements: meetings{" "}
                  {residentAssignedRuleSet.ruleSet.meetings.proofMethod
                    .toLowerCase()
                    .replaceAll("_", " ")}{" "}
                  ({labelForEffectiveRuleSource(residentAssignedRuleSet.sources.meetings)}) • chores{" "}
                  {formatProofRequirementList(
                    residentAssignedRuleSet.ruleSet.chores.proofRequirement,
                  )}{" "}
                  ({labelForEffectiveRuleSource(residentAssignedRuleSet.sources.chores)}) • job
                  applications{" "}
                  {residentAssignedRuleSet.ruleSet.jobSearch.proofRequired
                    ? "photo proof required"
                    : "proof optional"}
                </Text>
                <Text style={styles.entityMeta}>
                  Curfew / accountability:{" "}
                  {residentAssignedRuleSet.ruleSet.curfew.enabled
                    ? `${formatTwelveHourTime(
                        residentAssignedRuleSet.ruleSet.curfew.weekdayCurfew,
                      )} weekdays with ${residentAssignedRuleSet.ruleSet.curfew.gracePeriodMinutes} minute grace`
                    : "Curfew monitoring is not enabled"}
                </Text>
              </>
            ) : null}
          </GlassCard>

          <GlassCard style={styles.card} strong>
            <SectionHeader
              title="House Meeting Schedule"
              meta="Read-only recurring requirements inherited from your organization, house group, or house."
            />
            {residentEffectiveMeetingSchedules.length === 0 ? (
              <Text style={styles.sectionMeta}>No recurring house meetings are configured.</Text>
            ) : (
              residentEffectiveMeetingSchedules.map((schedule) => (
                <View key={schedule.id} style={styles.auditRow}>
                  <Text style={styles.auditTitle}>{schedule.title}</Text>
                  <Text style={styles.entityMeta}>{summarizeHouseMeetingSchedule(schedule)}</Text>
                  <Text style={styles.entityMeta}>
                    {schedule.locationLabel || "House location"} •{" "}
                    {labelForEffectiveRuleSource(residentMeetingSource)}
                  </Text>
                </View>
              ))
            )}
          </GlassCard>
        </>
      ) : null}

      {residentMode && residentView === "REQUIREMENTS" ? (
        <>
          <GlassCard style={styles.card} strong>
            <SectionHeader
              title="Sober House Routine"
              meta="Complete resident-safe sober-house tasks here: chores, applications, house meetings, and work accountability."
            />
            <Text style={styles.entityMeta}>
              This routine stays resident-safe. Admin setup, rule editing, and house hierarchy
              controls remain protected.
            </Text>
            {residentAssignedRuleSet ? (
              <Text style={styles.entityMeta}>
                Active requirements: meetings{" "}
                {residentAssignedRuleSet.ruleSet.meetings.meetingsRequired
                  ? `${residentAssignedRuleSet.ruleSet.meetings.meetingsPerWeek}/week`
                  : "not required"}{" "}
                • sponsor{" "}
                {residentAssignedRuleSet.ruleSet.sponsorContact.enabled
                  ? `${residentAssignedRuleSet.ruleSet.sponsorContact.contactsRequiredPerWeek}/week`
                  : "not required"}{" "}
                • chores{" "}
                {residentAssignedRuleSet.ruleSet.chores.enabled
                  ? residentAssignedRuleSet.ruleSet.chores.frequency.toLowerCase()
                  : "not required"}{" "}
                • job applications{" "}
                {residentAssignedRuleSet.ruleSet.jobSearch.applicationsRequiredPerWeek > 0
                  ? `${residentAssignedRuleSet.ruleSet.jobSearch.applicationsRequiredPerWeek}/week`
                  : "not required"}
              </Text>
            ) : null}
          </GlassCard>
          <SoberHouseComplianceSection
            userId={userId}
            store={store}
            actor={actor}
            isSaving={isSaving}
            sponsorCallLogs={sponsorCallLogs}
            onPersist={persistStore}
          />
        </>
      ) : null}

      {showAdminControls && adminModule === "RESIDENTS" ? (
        <GlassCard style={styles.card} strong>
          <SectionHeader
            title="Residents"
            meta="Resident placements, linked house assignments, and current participant context."
          />
          <Text style={styles.entityMeta}>{residentsOperationsStatus}</Text>
          {store.residentHousingProfile ? (
            <>
              <Text style={styles.entityTitle}>
                {store.residentHousingProfile.firstName} {store.residentHousingProfile.lastName}
              </Text>
              <Text style={styles.entityMeta}>
                House:{" "}
                {store.houses.find((house) => house.id === store.residentHousingProfile?.houseId)
                  ?.name ?? "Unassigned"}
              </Text>
              <Text style={styles.entityMeta}>
                Move-in: {store.residentHousingProfile.moveInDate || "Not set"} • Room/Bed:{" "}
                {store.residentHousingProfile.roomOrBed || "Not set"}
              </Text>
              <Text style={styles.entityMeta}>
                Program phase: {store.residentHousingProfile.programPhaseOnEntry || "Not set"}
              </Text>
            </>
          ) : (
            <Text style={styles.sectionMeta}>
              No resident profile is linked to this admin account yet. Resident-facing workflow
              remains separate from the admin setup modules.
            </Text>
          )}
        </GlassCard>
      ) : null}

      {showAdminControls && adminModule === "VIOLATIONS" ? (
        <SoberHouseInterventionSection
          userId={userId}
          store={store}
          actor={actor}
          isSaving={isSaving}
          onOpenChat={(input) => setChatIntent(input)}
          onPersist={persistStore}
        />
      ) : null}

      {showAdminControls && adminModule === "CHAT" ? (
        <SoberHouseChatSection
          store={store}
          actor={actor}
          isSaving={isSaving}
          chatIntent={chatIntent}
          onChatIntentHandled={() => setChatIntent(null)}
          onPersist={persistStore}
        />
      ) : null}

      {showAdminControls && adminModule === "REPORTS" ? (
        <SoberHouseReportsSection
          userId={userId}
          store={store}
          actor={actor}
          isSaving={isSaving}
          onPersist={persistStore}
        />
      ) : null}

      {showAdminControls && adminModule === "ORGANIZATION" ? (
        <GlassCard style={styles.card} strong>
          <SectionHeader
            title="Organization"
            meta="Baseline organization setup, primary contact profile, and default accountability layer."
          />
          <FieldLabel>Organization name</FieldLabel>
          <TextInput
            style={styles.input}
            value={organizationDraft.name}
            onChangeText={(value) =>
              setOrganizationDraft((current) => ({ ...current, name: value }))
            }
            placeholder="Bright Path Recovery Homes"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
          />
          <FieldLabel>Primary contact name</FieldLabel>
          <TextInput
            style={styles.input}
            value={organizationDraft.primaryContactName}
            onChangeText={(value) =>
              setOrganizationDraft((current) => ({ ...current, primaryContactName: value }))
            }
            placeholder="Primary contact name"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
          />
          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <FieldLabel>Primary phone</FieldLabel>
              <TextInput
                style={styles.input}
                value={organizationDraft.primaryPhone}
                onChangeText={(value) =>
                  setOrganizationDraft((current) => ({
                    ...current,
                    primaryPhone: normalizeUsPhoneInput(value),
                  }))
                }
                keyboardType="phone-pad"
                placeholder="(555) 555-1212"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
            </View>
            <View style={styles.column}>
              <FieldLabel>Primary email</FieldLabel>
              <TextInput
                style={styles.input}
                value={organizationDraft.primaryEmail}
                onChangeText={(value) =>
                  setOrganizationDraft((current) => ({ ...current, primaryEmail: value }))
                }
                autoCapitalize="none"
                placeholder="ops@example.org"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
            </View>
          </View>
          <FieldLabel>Notes</FieldLabel>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={organizationDraft.notes}
            onChangeText={(value) =>
              setOrganizationDraft((current) => ({ ...current, notes: value }))
            }
            placeholder="Internal notes for sober-house operations."
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            multiline
          />
          <ToggleRow
            label="Organization active"
            value={organizationDraft.isActive}
            onValueChange={(value) =>
              setOrganizationDraft((current) => ({ ...current, isActive: value }))
            }
          />
          <View style={styles.buttonRow}>
            <AppButton
              title={isSaving ? "Saving..." : "Save organization"}
              onPress={() => void saveOrganization()}
              disabled={isSaving}
            />
          </View>
          <GlassCard style={styles.subCard}>
            <SectionHeader
              title="Organization Default Rules"
              meta="This is the base rule layer for every house unless a house group template or a house override changes it."
              action={
                <AppButton
                  title="Open full rules editor"
                  variant="secondary"
                  onPress={() => {
                    setSelectedRuleScope({ scopeType: "ORGANIZATION", scopeId: null });
                    setAdminModule("RULES");
                  }}
                />
              }
            />
            <View style={styles.twoColumnRow}>
              <View style={styles.column}>
                <ToggleRow
                  label="Meetings required"
                  value={ruleDraft.meetingsRequired}
                  onValueChange={(value) =>
                    setRuleDraft((current) => ({ ...current, meetingsRequired: value }))
                  }
                />
                <FieldLabel>Meetings per week</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={ruleDraft.meetingsPerWeek}
                  onChangeText={(value) =>
                    setRuleDraft((current) => ({
                      ...current,
                      meetingsPerWeek: normalizeIntegerInput(value),
                    }))
                  }
                  keyboardType="number-pad"
                  placeholder="4"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                />
              </View>
              <View style={styles.column}>
                <ToggleRow
                  label="Sponsor calls required"
                  value={ruleDraft.sponsorContactEnabled}
                  onValueChange={(value) =>
                    setRuleDraft((current) => ({ ...current, sponsorContactEnabled: value }))
                  }
                />
                <FieldLabel>Sponsor calls per week</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={ruleDraft.sponsorContactsRequiredPerWeek}
                  onChangeText={(value) =>
                    setRuleDraft((current) => ({
                      ...current,
                      sponsorContactsRequiredPerWeek: normalizeIntegerInput(value),
                    }))
                  }
                  keyboardType="number-pad"
                  placeholder="3"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                />
              </View>
            </View>
            <View style={styles.twoColumnRow}>
              <View style={styles.column}>
                <ToggleRow
                  label="Work required"
                  value={ruleDraft.employmentRequired}
                  onValueChange={(value) =>
                    setRuleDraft((current) => ({ ...current, employmentRequired: value }))
                  }
                />
                <FieldLabel>Job applications per week</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={ruleDraft.jobSearchApplicationsRequiredPerWeek}
                  onChangeText={(value) =>
                    setRuleDraft((current) => ({
                      ...current,
                      jobSearchApplicationsRequiredPerWeek: normalizeIntegerInput(value),
                    }))
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                />
              </View>
              <View style={styles.column}>
                <ToggleRow
                  label="Chores required"
                  value={ruleDraft.choresEnabled}
                  onValueChange={(value) =>
                    setRuleDraft((current) => ({ ...current, choresEnabled: value }))
                  }
                />
                <FieldLabel>Chore frequency</FieldLabel>
                <View style={styles.chipRow}>
                  {CHORE_FREQUENCY_OPTIONS.map((option) => (
                    <OptionChip
                      key={option.value}
                      label={option.label}
                      selected={ruleDraft.choresFrequency === option.value}
                      onPress={() =>
                        setRuleDraft((current) => ({
                          ...current,
                          choresFrequency: option.value,
                        }))
                      }
                    />
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.twoColumnRow}>
              <View style={styles.column}>
                <ToggleRow
                  label="Curfew monitored"
                  value={ruleDraft.curfewEnabled}
                  onValueChange={(value) =>
                    setRuleDraft((current) => ({ ...current, curfewEnabled: value }))
                  }
                />
                <FieldLabel>Weekday curfew</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={ruleDraft.weekdayCurfew}
                  onChangeText={(value) =>
                    setRuleDraft((current) => ({ ...current, weekdayCurfew: value }))
                  }
                  placeholder="10:00 PM"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                />
              </View>
              <View style={styles.column}>
                <FieldLabel>Meeting proof</FieldLabel>
                <View style={styles.chipRow}>
                  {MEETING_PROOF_METHOD_OPTIONS.map((option) => (
                    <OptionChip
                      key={option.value}
                      label={option.label}
                      selected={ruleDraft.meetingsProofMethod === option.value}
                      onPress={() =>
                        setRuleDraft((current) => ({
                          ...current,
                          meetingsProofMethod: option.value,
                        }))
                      }
                    />
                  ))}
                </View>
              </View>
            </View>
            <FieldLabel>Chore proof / photo requirements</FieldLabel>
            <View style={styles.chipRow}>
              {PROOF_REQUIREMENT_OPTIONS.map((option) => (
                <OptionChip
                  key={option.value}
                  label={option.label}
                  selected={ruleDraft.choresProofRequirement.includes(option.value)}
                  onPress={() =>
                    setRuleDraft((current) => ({
                      ...current,
                      choresProofRequirement: toggleStringValue(
                        current.choresProofRequirement,
                        option.value,
                      ),
                    }))
                  }
                />
              ))}
            </View>
            <Text style={styles.entityMeta}>
              House meeting defaults: {residentOrganizationMeetingSchedules.length} recurring
              schedule{residentOrganizationMeetingSchedules.length === 1 ? "" : "s"} configured.
            </Text>
            <Text style={styles.entityMeta}>
              Dashboard-driving defaults here feed meetings, sponsor, chores, work, curfew, proof,
              and house-meeting KPIs for resident views.
            </Text>
            <View style={styles.buttonRow}>
              <AppButton
                title="Save organization default rules"
                onPress={() => void saveRuleSet()}
                disabled={isSaving}
              />
            </View>
          </GlassCard>
        </GlassCard>
      ) : null}

      {showAdminControls && (adminModule === "HOUSE_GROUPS" || adminModule === "HOUSES") ? (
        <>
          <GlassCard style={styles.card} strong>
            <SectionHeader
              title={adminModule === "HOUSE_GROUPS" ? "House Groups" : "Houses"}
              meta={
                adminModule === "HOUSE_GROUPS"
                  ? "Reusable house-rule templates that sit between organization defaults and house-specific overrides."
                  : "Actual sober homes, their rule source, inherited defaults, and local overrides."
              }
              action={
                <View style={styles.inlineButtonRow}>
                  {adminModule === "HOUSE_GROUPS" ? (
                    <AppButton
                      title="New group"
                      variant="secondary"
                      onPress={() => {
                        setEditingHouseGroupId(null);
                        setHouseGroupDraft(createHouseGroupDraft(null));
                        setIsHouseGroupEditorVisible(true);
                      }}
                    />
                  ) : (
                    <AppButton title="New house" variant="secondary" onPress={beginHouseCreate} />
                  )}
                </View>
              }
            />
            {adminModule === "HOUSES" ? renderHouseEditor() : null}
            {adminModule === "HOUSE_GROUPS" ? (
              <Text style={styles.groupTitle}>House groups</Text>
            ) : null}
            {adminModule === "HOUSE_GROUPS" ? (
              <View style={styles.listWrap}>
                {store.houseGroups.length === 0 ? (
                  <Text style={styles.sectionMeta}>No house groups configured yet.</Text>
                ) : (
                  store.houseGroups.map((group) => (
                    <View key={group.id} style={styles.entityCard}>
                      <Text style={styles.entityTitle}>{group.name}</Text>
                      <Text style={styles.entityMeta}>
                        Template layer:{" "}
                        {summarizeSourceBreakdown([
                          ...Object.values(
                            getEffectiveRuleSetForScope(store, "HOUSE_GROUP", group.id, nowIso)
                              .sources,
                          ),
                        ])}
                      </Text>
                      <Text style={styles.entityMeta}>
                        Houses:{" "}
                        {group.houseIds
                          .map(
                            (houseId) =>
                              store.houses.find((house) => house.id === houseId)?.name ?? houseId,
                          )
                          .join(", ") || "None"}
                      </Text>
                      <Text style={styles.entityMeta}>{group.notes || "No notes"}</Text>
                      <Text style={styles.entityMeta}>
                        {group.status === "ACTIVE" ? "Active" : "Inactive"}
                      </Text>
                      <Text style={styles.entityMeta}>
                        Meetings:{" "}
                        {getEffectiveRuleSetForScope(store, "HOUSE_GROUP", group.id, nowIso).ruleSet
                          .meetings.meetingsRequired
                          ? `${getEffectiveRuleSetForScope(store, "HOUSE_GROUP", group.id, nowIso).ruleSet.meetings.meetingsPerWeek}/week`
                          : "Not required"}{" "}
                        • Sponsor:{" "}
                        {getEffectiveRuleSetForScope(store, "HOUSE_GROUP", group.id, nowIso).ruleSet
                          .sponsorContact.enabled
                          ? `${getEffectiveRuleSetForScope(store, "HOUSE_GROUP", group.id, nowIso).ruleSet.sponsorContact.contactsRequiredPerWeek}/week`
                          : "Not required"}
                      </Text>
                      <View style={styles.buttonRow}>
                        <AppButton
                          title="Edit"
                          variant="secondary"
                          onPress={() => {
                            setEditingHouseGroupId(group.id);
                            setHouseGroupDraft(createHouseGroupDraft(group));
                            setIsHouseGroupEditorVisible(true);
                          }}
                        />
                        <View style={styles.buttonSpacer} />
                        <AppButton
                          title="Edit template"
                          variant="secondary"
                          onPress={() => {
                            setSelectedRuleScope({ scopeType: "HOUSE_GROUP", scopeId: group.id });
                            setAdminModule("RULES");
                          }}
                        />
                        <View style={styles.buttonSpacer} />
                        <AppButton
                          title={group.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                          variant={group.status === "ACTIVE" ? "danger" : "secondary"}
                          onPress={() => {
                            const timestamp = new Date().toISOString();
                            const result = setHouseGroupStatus(
                              store,
                              actor,
                              group.id,
                              group.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                              timestamp,
                            );
                            void persistStore(
                              result.store,
                              `House group status updated with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
                            );
                          }}
                        />
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}
            {adminModule === "HOUSE_GROUPS" && isHouseGroupEditorVisible ? (
              <>
                <FieldLabel>House group name</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={houseGroupDraft.name}
                  onChangeText={(value) =>
                    setHouseGroupDraft((current) => ({ ...current, name: value }))
                  }
                  placeholder="Downtown houses"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                />
                <FieldLabel>Included houses</FieldLabel>
                <View style={styles.chipRow}>
                  {store.houses.map((house) => (
                    <OptionChip
                      key={house.id}
                      label={house.name}
                      selected={houseGroupDraft.houseIds.includes(house.id)}
                      onPress={() =>
                        setHouseGroupDraft((current) => ({
                          ...current,
                          houseIds: toggleStringValue(current.houseIds, house.id),
                        }))
                      }
                    />
                  ))}
                </View>
                <FieldLabel>Notes</FieldLabel>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={houseGroupDraft.notes}
                  onChangeText={(value) =>
                    setHouseGroupDraft((current) => ({ ...current, notes: value }))
                  }
                  placeholder="Shared defaults for a cluster of houses."
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  multiline
                />
                <ToggleRow
                  label="House group active"
                  value={houseGroupDraft.isActive}
                  onValueChange={(value) =>
                    setHouseGroupDraft((current) => ({ ...current, isActive: value }))
                  }
                />
                {editingHouseGroupId ? (
                  <Text style={styles.sectionMeta}>
                    Rule template: edit the reusable ruleset for this house group from the Rules
                    module. Houses assigned here inherit this template before any house-level
                    overrides.
                  </Text>
                ) : null}
                <View style={styles.buttonRow}>
                  <AppButton
                    title={editingHouseGroupId ? "Update group" : "Create group"}
                    onPress={() => void saveHouseGroup()}
                    disabled={isSaving}
                  />
                  {editingHouseGroupId ? (
                    <>
                      <View style={styles.buttonSpacer} />
                      <AppButton
                        title="Edit template rules"
                        variant="secondary"
                        onPress={() => {
                          setSelectedRuleScope({
                            scopeType: "HOUSE_GROUP",
                            scopeId: editingHouseGroupId,
                          });
                          setAdminModule("RULES");
                        }}
                      />
                    </>
                  ) : null}
                  <View style={styles.buttonSpacer} />
                  <AppButton
                    title="Cancel"
                    variant="secondary"
                    onPress={() => {
                      setIsHouseGroupEditorVisible(false);
                      setEditingHouseGroupId(null);
                      setHouseGroupDraft(createHouseGroupDraft(null));
                    }}
                  />
                </View>
              </>
            ) : adminModule === "HOUSE_GROUPS" ? (
              <Text style={styles.sectionMeta}>
                Select New group or Edit to manage group membership and shared defaults.
              </Text>
            ) : null}

            {adminModule === "HOUSES" && selectedAdminHouseDetail && !isHouseEditorVisible ? (
              <>
                <Text style={styles.groupTitle}>{selectedAdminHouseDetail.houseName}</Text>
                <View style={[styles.entityCard, styles.entityCardSelected]}>
                  <Text style={styles.entityMeta}>{selectedAdminHouseDetail.address}</Text>
                  <Text style={styles.entityMeta}>
                    {selectedAdminHouseDetail.groupName} •{" "}
                    {selectedAdminHouseDetail.status === "ACTIVE" ? "Active" : "Inactive"}
                  </Text>
                  <Text style={styles.entityMeta}>
                    {selectedAdminHouseDetail.houseTypesLabel} • Beds{" "}
                    {selectedAdminHouseDetail.bedCount} • Radius{" "}
                    {selectedAdminHouseDetail.geofenceRadiusFeetDefault} ft
                  </Text>
                  <Text style={styles.entityMeta}>
                    Base source: {selectedAdminHouseBaseSourceLabel}
                  </Text>
                  <Text style={styles.entityMeta}>
                    Effective breakdown: {selectedAdminHouseEffectiveBreakdown}
                  </Text>
                  {selectedAdminHouseView === "OVERVIEW" ? (
                    <>
                      <Text style={styles.entityMeta}>
                        Residents {selectedAdminHouseDetail.activeResidents} • Staff{" "}
                        {selectedAdminHouseDetail.assignedStaffCount} • Reports{" "}
                        {selectedAdminHouseDetail.currentReports}
                      </Text>
                      <Text style={styles.entityMeta}>
                        Violations {selectedAdminHouseDetail.activeViolations} • Under review{" "}
                        {selectedAdminHouseDetail.underReviewViolations} • Corrective actions{" "}
                        {selectedAdminHouseDetail.openCorrectiveActions}
                      </Text>
                      <Text style={styles.entityMeta}>
                        Geofence:{" "}
                        {selectedAdminHouseDetail.geofenceResolved
                          ? "Derived from saved address"
                          : "Pending address resolution"}
                      </Text>
                      {selectedAdminHouseRuleSummaryItems.map((item) => (
                        <Text key={item.label} style={styles.entityMeta}>
                          {item.label}: {item.value} ({labelForEffectiveRuleSource(item.source)})
                        </Text>
                      ))}
                      {selectedAdminHouseDetail.notes ? (
                        <Text style={styles.entityMeta}>{selectedAdminHouseDetail.notes}</Text>
                      ) : null}
                    </>
                  ) : selectedAdminHouseViolations.length > 0 ? (
                    selectedAdminHouseViolations.map((violation) => (
                      <View key={violation.violationId} style={styles.auditRow}>
                        <Text style={styles.auditTitle}>{violation.reasonSummary}</Text>
                        <Text style={styles.entityMeta}>
                          {violation.severity} • {violation.status}
                        </Text>
                        <Text style={styles.entityMeta}>
                          Triggered {new Date(violation.triggeredAt).toLocaleString()}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.sectionMeta}>No violations recorded for this house.</Text>
                  )}
                  <View style={styles.buttonRow}>
                    <AppButton
                      title={
                        selectedAdminHouseView === "OVERVIEW" ? "View violations" : "House overview"
                      }
                      variant="secondary"
                      onPress={() =>
                        setSelectedAdminHouseView((current) =>
                          current === "OVERVIEW" ? "VIOLATIONS" : "OVERVIEW",
                        )
                      }
                    />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title="Edit house"
                      variant="secondary"
                      onPress={() => {
                        const selectedHouse = store.houses.find(
                          (house) => house.id === selectedAdminHouseDetail.houseId,
                        );
                        if (!selectedHouse) {
                          return;
                        }
                        beginHouseEdit(selectedHouse);
                      }}
                    />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title="Back to houses"
                      variant="secondary"
                      onPress={() => {
                        setSelectedAdminHouseId(null);
                        setSelectedAdminHouseView("OVERVIEW");
                      }}
                    />
                  </View>
                </View>
              </>
            ) : null}
            {adminModule === "HOUSES" ? (
              <Text style={styles.groupTitle}>Organization houses</Text>
            ) : null}
            {adminModule === "HOUSES" ? (
              <View style={styles.listWrap}>
                {store.houses.length === 0 ? (
                  <Text style={styles.sectionMeta}>No houses configured yet.</Text>
                ) : (
                  store.houses.map((house) => (
                    <View
                      key={house.id}
                      style={[
                        styles.entityCard,
                        selectedHouseIds.includes(house.id) ? styles.entityCardSelected : null,
                      ]}
                    >
                      <Pressable
                        onPress={() => {
                          setSelectedAdminHouseId(house.id);
                          setSelectedAdminHouseView("OVERVIEW");
                          setIsHouseEditorVisible(false);
                        }}
                      >
                        <Text style={styles.entityTitle}>{house.name}</Text>
                        <Text style={styles.entityMeta}>{house.address}</Text>
                        <Text style={styles.entityMeta}>
                          Group:{" "}
                          {getHouseGroupById(store, house.houseGroupId ?? "")?.name ?? "Unassigned"}
                        </Text>
                        <Text style={styles.entityMeta}>
                          {labelForHouseTypes(house.houseTypes)} • Beds: {house.bedCount} • Radius:{" "}
                          {house.geofenceRadiusFeetDefault} ft
                        </Text>
                        <Text style={styles.entityMeta}>
                          Geofence status:{" "}
                          {typeof house.geofenceCenterLat === "number" &&
                          Number.isFinite(house.geofenceCenterLat) &&
                          typeof house.geofenceCenterLng === "number" &&
                          Number.isFinite(house.geofenceCenterLng)
                            ? "Derived from saved address"
                            : "Pending address resolution"}
                        </Text>
                        <Text style={styles.entityMeta}>
                          {house.status === "ACTIVE" ? "Active" : "Inactive"}
                        </Text>
                      </Pressable>
                      <View style={styles.buttonRow}>
                        <AppButton
                          title="Open house"
                          variant="secondary"
                          onPress={() => {
                            setSelectedAdminHouseId(house.id);
                            setSelectedAdminHouseView("OVERVIEW");
                            setIsHouseEditorVisible(false);
                          }}
                        />
                        <View style={styles.buttonSpacer} />
                        <AppButton
                          title={selectedHouseIds.includes(house.id) ? "Unselect" : "Select"}
                          variant="secondary"
                          onPress={() =>
                            setSelectedHouseIds((current) => toggleStringValue(current, house.id))
                          }
                        />
                        <View style={styles.buttonSpacer} />
                        <AppButton
                          title="Edit"
                          variant="secondary"
                          onPress={() => beginHouseEdit(house)}
                        />
                        <View style={styles.buttonSpacer} />
                        <AppButton
                          title={house.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                          variant={house.status === "ACTIVE" ? "danger" : "secondary"}
                          onPress={() => {
                            const timestamp = new Date().toISOString();
                            const result = setHouseStatus(
                              store,
                              actor,
                              house.id,
                              house.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                              timestamp,
                            );
                            void persistStore(
                              result.store,
                              `House status updated with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
                            );
                          }}
                        />
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}
            {adminModule === "HOUSES" ? (
              <View style={styles.buttonRow}>
                {selectedHouseIds.length > 0 ? (
                  <>
                    <AppButton
                      title="Deactivate selected"
                      variant="danger"
                      onPress={() => {
                        let nextStore = store;
                        let auditCount = 0;
                        const timestamp = new Date().toISOString();
                        selectedHouseIds.forEach((houseId) => {
                          const result = setHouseStatus(
                            nextStore,
                            actor,
                            houseId,
                            "INACTIVE",
                            timestamp,
                          );
                          nextStore = result.store;
                          auditCount += result.auditCount;
                        });
                        void persistStore(
                          nextStore,
                          `Updated ${selectedHouseIds.length} selected house statuses with ${auditCount} audit entr${auditCount === 1 ? "y" : "ies"}.`,
                        );
                        setSelectedHouseIds([]);
                      }}
                    />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title="Reactivate selected"
                      variant="secondary"
                      onPress={() => {
                        let nextStore = store;
                        let auditCount = 0;
                        const timestamp = new Date().toISOString();
                        selectedHouseIds.forEach((houseId) => {
                          const result = setHouseStatus(
                            nextStore,
                            actor,
                            houseId,
                            "ACTIVE",
                            timestamp,
                          );
                          nextStore = result.store;
                          auditCount += result.auditCount;
                        });
                        void persistStore(
                          nextStore,
                          `Updated ${selectedHouseIds.length} selected house statuses with ${auditCount} audit entr${auditCount === 1 ? "y" : "ies"}.`,
                        );
                        setSelectedHouseIds([]);
                      }}
                    />
                  </>
                ) : null}
              </View>
            ) : null}
            {adminModule === "HOUSES" ? (
              <View style={styles.buttonRow}>
                <AppButton
                  title="Deactivate all houses"
                  variant="danger"
                  onPress={() => {
                    let nextStore = store;
                    let auditCount = 0;
                    const timestamp = new Date().toISOString();
                    store.houses.forEach((house) => {
                      const result = setHouseStatus(
                        nextStore,
                        actor,
                        house.id,
                        "INACTIVE",
                        timestamp,
                      );
                      nextStore = result.store;
                      auditCount += result.auditCount;
                    });
                    void persistStore(
                      nextStore,
                      `All house statuses updated with ${auditCount} audit entr${auditCount === 1 ? "y" : "ies"}.`,
                    );
                  }}
                />
                <View style={styles.buttonSpacer} />
                <AppButton
                  title="Reactivate all houses"
                  variant="secondary"
                  onPress={() => {
                    let nextStore = store;
                    let auditCount = 0;
                    const timestamp = new Date().toISOString();
                    store.houses.forEach((house) => {
                      const result = setHouseStatus(
                        nextStore,
                        actor,
                        house.id,
                        "ACTIVE",
                        timestamp,
                      );
                      nextStore = result.store;
                      auditCount += result.auditCount;
                    });
                    void persistStore(
                      nextStore,
                      `All house statuses updated with ${auditCount} audit entr${auditCount === 1 ? "y" : "ies"}.`,
                    );
                  }}
                />
              </View>
            ) : null}
            {adminModule === "HOUSES" && !isHouseEditorVisible ? (
              <Text style={styles.sectionMeta}>
                Select New house or Edit to configure an individual house. Houses stay visible here,
                but their settings stay hidden until you choose one.
              </Text>
            ) : null}
          </GlassCard>
        </>
      ) : null}

      {showAdminControls && adminModule === "MANAGERS" ? (
        <GlassCard style={styles.card} strong>
          <SectionHeader
            title="Staff / Managers"
            meta="People, roles, house assignments, alert routing flags, and permissions."
            action={
              <AppButton
                title="New staff"
                variant="secondary"
                onPress={() => {
                  setEditingStaffAssignmentId(null);
                  setStaffDraft(createStaffAssignmentDraft(null));
                }}
              />
            }
          />
          <View style={styles.listWrap}>
            {store.staffAssignments.length === 0 ? (
              <Text style={styles.sectionMeta}>No staff assignments configured yet.</Text>
            ) : (
              store.staffAssignments.map((assignment) => (
                <View key={assignment.id} style={styles.entityCard}>
                  <Text style={styles.entityTitle}>
                    {assignment.firstName} {assignment.lastName}
                  </Text>
                  <Text style={styles.entityMeta}>{labelForRole(assignment.role)}</Text>
                  <Text style={styles.entityMeta}>
                    Houses:{" "}
                    {assignment.assignedHouseIds
                      .map(
                        (houseId) =>
                          store.houses.find((house) => house.id === houseId)?.name ?? houseId,
                      )
                      .join(", ") || "None"}
                  </Text>
                  <Text style={styles.entityMeta}>
                    Alerts: {assignment.receiveRealTimeViolationAlerts ? "Real-time " : ""}
                    {assignment.receiveNearMissAlerts ? "Near-miss " : ""}
                    {assignment.receiveMonthlyReports ? "Monthly reports" : ""}
                  </Text>
                  <Text style={styles.entityMeta}>
                    {assignment.status === "ACTIVE" ? "Active" : "Inactive"}
                  </Text>
                  <View style={styles.buttonRow}>
                    <AppButton
                      title="Edit"
                      variant="secondary"
                      onPress={() => {
                        setEditingStaffAssignmentId(assignment.id);
                        setStaffDraft(createStaffAssignmentDraft(assignment));
                      }}
                    />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title={assignment.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                      variant={assignment.status === "ACTIVE" ? "danger" : "secondary"}
                      onPress={() => {
                        const timestamp = new Date().toISOString();
                        const result = setStaffAssignmentStatus(
                          store,
                          actor,
                          assignment.id,
                          assignment.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                          timestamp,
                        );
                        void persistStore(
                          result.store,
                          `Staff status updated with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
                        );
                      }}
                    />
                  </View>
                </View>
              ))
            )}
          </View>
          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <FieldLabel>First name</FieldLabel>
              <TextInput
                style={styles.input}
                value={staffDraft.firstName}
                onChangeText={(value) =>
                  setStaffDraft((current) => ({ ...current, firstName: value }))
                }
                placeholder="Jordan"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
            </View>
            <View style={styles.column}>
              <FieldLabel>Last name</FieldLabel>
              <TextInput
                style={styles.input}
                value={staffDraft.lastName}
                onChangeText={(value) =>
                  setStaffDraft((current) => ({ ...current, lastName: value }))
                }
                placeholder="Hayes"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
            </View>
          </View>
          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <FieldLabel>Phone</FieldLabel>
              <TextInput
                style={styles.input}
                value={staffDraft.phone}
                onChangeText={(value) =>
                  setStaffDraft((current) => ({
                    ...current,
                    phone: normalizeUsPhoneInput(value),
                  }))
                }
                keyboardType="phone-pad"
                placeholder="(555) 555-9898"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
            </View>
            <View style={styles.column}>
              <FieldLabel>Email</FieldLabel>
              <TextInput
                style={styles.input}
                value={staffDraft.email}
                onChangeText={(value) => setStaffDraft((current) => ({ ...current, email: value }))}
                autoCapitalize="none"
                placeholder="manager@example.org"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
            </View>
          </View>
          <FieldLabel>Role</FieldLabel>
          <View style={styles.chipRow}>
            {STAFF_ROLE_OPTIONS.map((option) => (
              <OptionChip
                key={option.value}
                label={option.label}
                selected={staffDraft.role === option.value}
                onPress={() => setStaffDraft((current) => ({ ...current, role: option.value }))}
              />
            ))}
          </View>
          <FieldLabel>Assigned house(s)</FieldLabel>
          <View style={styles.chipRow}>
            {store.houses.map((house) => (
              <OptionChip
                key={house.id}
                label={house.name}
                selected={staffDraft.assignedHouseIds.includes(house.id)}
                onPress={() =>
                  setStaffDraft((current) => ({
                    ...current,
                    assignedHouseIds: toggleStringValue(current.assignedHouseIds, house.id),
                  }))
                }
              />
            ))}
          </View>
          <ToggleRow
            label="Receive real-time violation alerts"
            value={staffDraft.receiveRealTimeViolationAlerts}
            onValueChange={(value) =>
              setStaffDraft((current) => ({ ...current, receiveRealTimeViolationAlerts: value }))
            }
          />
          <ToggleRow
            label="Receive near-miss alerts"
            value={staffDraft.receiveNearMissAlerts}
            onValueChange={(value) =>
              setStaffDraft((current) => ({ ...current, receiveNearMissAlerts: value }))
            }
          />
          <ToggleRow
            label="Receive monthly reports"
            value={staffDraft.receiveMonthlyReports}
            onValueChange={(value) =>
              setStaffDraft((current) => ({ ...current, receiveMonthlyReports: value }))
            }
          />
          <ToggleRow
            label="Can approve exceptions"
            value={staffDraft.canApproveExceptions}
            onValueChange={(value) =>
              setStaffDraft((current) => ({ ...current, canApproveExceptions: value }))
            }
          />
          <ToggleRow
            label="Can issue corrective actions"
            value={staffDraft.canIssueCorrectiveActions}
            onValueChange={(value) =>
              setStaffDraft((current) => ({ ...current, canIssueCorrectiveActions: value }))
            }
          />
          <ToggleRow
            label="Can view resident evidence"
            value={staffDraft.canViewResidentEvidence}
            onValueChange={(value) =>
              setStaffDraft((current) => ({ ...current, canViewResidentEvidence: value }))
            }
          />
          <ToggleRow
            label="Staff assignment active"
            value={staffDraft.isActive}
            onValueChange={(value) => setStaffDraft((current) => ({ ...current, isActive: value }))}
          />
          <View style={styles.buttonRow}>
            <AppButton
              title={editingStaffAssignmentId ? "Update staff" : "Create staff"}
              onPress={() => void saveStaffAssignment()}
              disabled={isSaving}
            />
          </View>
        </GlassCard>
      ) : null}

      {showAdminControls && adminModule === "RULES" ? (
        <GlassCard style={styles.card} strong>
          <SectionHeader
            title="Rules Editor"
            meta="Edit the rule source directly: organization defaults, house-group templates, or house-specific overrides."
          />
          <Text style={styles.sectionMeta}>
            Source guide: organization default is the baseline, house groups are reusable templates,
            and house scope stores local overrides that can sit on top of inherited defaults.
          </Text>
          <FieldLabel>Configuration scope</FieldLabel>
          <View style={styles.chipRow}>
            {(["ORGANIZATION", "HOUSE_GROUP", "HOUSE"] as const).map((scopeType) => (
              <OptionChip
                key={scopeType}
                label={labelForRuleScope(scopeType)}
                selected={selectedRuleScope.scopeType === scopeType}
                onPress={() => setSelectedRuleScope({ scopeType, scopeId: null })}
              />
            ))}
          </View>
          {selectedRuleScope.scopeType === "HOUSE_GROUP" ? (
            <>
              <FieldLabel>Select house group</FieldLabel>
              <View style={styles.chipRow}>
                {store.houseGroups.map((group) => (
                  <OptionChip
                    key={group.id}
                    label={group.name}
                    selected={selectedRuleScope.scopeId === group.id}
                    onPress={() =>
                      setSelectedRuleScope({ scopeType: "HOUSE_GROUP", scopeId: group.id })
                    }
                  />
                ))}
              </View>
            </>
          ) : null}
          {selectedRuleScope.scopeType === "HOUSE" ? (
            <>
              <FieldLabel>Select house</FieldLabel>
              <View style={styles.chipRow}>
                {store.houses.map((house) => (
                  <OptionChip
                    key={house.id}
                    label={house.name}
                    selected={selectedRuleScope.scopeId === house.id}
                    onPress={() => setSelectedRuleScope({ scopeType: "HOUSE", scopeId: house.id })}
                  />
                ))}
              </View>
            </>
          ) : null}
          {selectedRuleScope.scopeType !== "ORGANIZATION" && !selectedRuleScope.scopeId ? (
            <Text style={styles.sectionMeta}>
              Select a {selectedRuleScope.scopeType === "HOUSE_GROUP" ? "house group" : "house"} to
              configure defaults for that scope.
            </Text>
          ) : (
            <>
              <Text style={styles.entityMeta}>
                Editing {labelForRuleScope(selectedRuleScope.scopeType)}
                {selectedRuleScope.scopeType === "HOUSE_GROUP" && selectedRuleScope.scopeId
                  ? ` • ${getHouseGroupById(store, selectedRuleScope.scopeId)?.name ?? "Unknown group"}`
                  : ""}
                {selectedRuleScope.scopeType === "HOUSE" && selectedRuleScope.scopeId
                  ? ` • ${store.houses.find((house) => house.id === selectedRuleScope.scopeId)?.name ?? "Unknown house"}`
                  : ""}
              </Text>
              {selectedRulesScopeEffectiveRules ? (
                <GlassCard style={styles.subCard}>
                  <SectionHeader
                    title="Rule Source Manager"
                    meta="This makes the active source of each resident KPI-driving rule explicit before you edit it."
                    action={
                      <View style={styles.inlineButtonRow}>
                        <AppButton
                          title="Violations"
                          variant="secondary"
                          onPress={() => setAdminModule("VIOLATIONS")}
                        />
                      </View>
                    }
                  />
                  <Text style={styles.entityMeta}>
                    Resident KPI drivers: meetings, sponsorship, chores, work/job applications,
                    curfew, house meetings, and proof settings resolve from this layer.
                  </Text>
                  {buildEffectiveRuleSummaryItems({
                    ruleSet: selectedRulesScopeEffectiveRules.ruleSet,
                    sources: selectedRulesScopeEffectiveRules.sources,
                    houseMeetingCount: selectedRulesScopeEffectiveMeetingCount,
                    houseMeetingSource: selectedRulesScopeHouseMeetingSource,
                  }).map((item) => (
                    <Text key={item.label} style={styles.entityMeta}>
                      {item.label}: {item.value} ({labelForEffectiveRuleSource(item.source)})
                    </Text>
                  ))}
                  <Text style={styles.entityMeta}>
                    Violations / corrective actions use the Violations & Actions module for alert
                    routing, corrective actions, and manager follow-up.
                  </Text>
                </GlassCard>
              ) : null}
              <FieldLabel>Rule set name</FieldLabel>
              <TextInput
                style={styles.input}
                value={ruleDraft.name}
                onChangeText={(value) => setRuleDraft((current) => ({ ...current, name: value }))}
                placeholder="Default house rules"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
              <ToggleRow
                label="Rule set active"
                value={ruleDraft.isActive}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({ ...current, isActive: value }))
                }
              />
              <Text style={styles.groupTitle}>Curfew</Text>
              <ToggleRow
                label="Enabled"
                value={ruleDraft.curfewEnabled}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({ ...current, curfewEnabled: value }))
                }
              />
              <View style={styles.twoColumnRow}>
                <View style={styles.column}>
                  <FieldLabel>Weekday curfew</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={ruleDraft.weekdayCurfew}
                    onChangeText={(value) =>
                      setRuleDraft((current) => ({ ...current, weekdayCurfew: value }))
                    }
                    placeholder="10:00 PM"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </View>
                <View style={styles.column}>
                  <FieldLabel>Friday curfew</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={ruleDraft.fridayCurfew}
                    onChangeText={(value) =>
                      setRuleDraft((current) => ({ ...current, fridayCurfew: value }))
                    }
                    placeholder="11:00 PM"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </View>
              </View>
              <View style={styles.twoColumnRow}>
                <View style={styles.column}>
                  <FieldLabel>Saturday curfew</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={ruleDraft.saturdayCurfew}
                    onChangeText={(value) =>
                      setRuleDraft((current) => ({ ...current, saturdayCurfew: value }))
                    }
                    placeholder="11:00 PM"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </View>
                <View style={styles.column}>
                  <FieldLabel>Sunday curfew</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={ruleDraft.sundayCurfew}
                    onChangeText={(value) =>
                      setRuleDraft((current) => ({ ...current, sundayCurfew: value }))
                    }
                    placeholder="10:00 PM"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </View>
              </View>
              <View style={styles.twoColumnRow}>
                <View style={styles.column}>
                  <FieldLabel>Grace period (min)</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={ruleDraft.curfewGracePeriodMinutes}
                    onChangeText={(value) =>
                      setRuleDraft((current) => ({
                        ...current,
                        curfewGracePeriodMinutes: normalizeIntegerInput(value),
                      }))
                    }
                    keyboardType="number-pad"
                    placeholder="15"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </View>
                <View style={styles.column}>
                  <FieldLabel>Pre-alert lead (min)</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={ruleDraft.preViolationLeadTimeMinutes}
                    onChangeText={(value) =>
                      setRuleDraft((current) => ({
                        ...current,
                        preViolationLeadTimeMinutes: normalizeIntegerInput(value),
                      }))
                    }
                    keyboardType="number-pad"
                    placeholder="15"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </View>
              </View>
              <ToggleRow
                label="Pre-violation alert enabled"
                value={ruleDraft.preViolationAlertEnabled}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({ ...current, preViolationAlertEnabled: value }))
                }
              />
              <FieldLabel>Alert basis</FieldLabel>
              <View style={styles.chipRow}>
                {CURFEW_ALERT_BASIS_OPTIONS.map((option) => (
                  <OptionChip
                    key={option.value}
                    label={option.label}
                    selected={ruleDraft.curfewAlertBasis === option.value}
                    onPress={() =>
                      setRuleDraft((current) => ({ ...current, curfewAlertBasis: option.value }))
                    }
                  />
                ))}
              </View>

              <Text style={styles.groupTitle}>Chores</Text>
              <ToggleRow
                label="Enabled"
                value={ruleDraft.choresEnabled}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({ ...current, choresEnabled: value }))
                }
              />
              <FieldLabel>Frequency</FieldLabel>
              <View style={styles.chipRow}>
                {CHORE_FREQUENCY_OPTIONS.map((option) => (
                  <OptionChip
                    key={option.value}
                    label={option.label}
                    selected={ruleDraft.choresFrequency === option.value}
                    onPress={() =>
                      setRuleDraft((current) => ({ ...current, choresFrequency: option.value }))
                    }
                  />
                ))}
              </View>
              <View style={styles.twoColumnRow}>
                <View style={styles.column}>
                  <FieldLabel>Due time</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={ruleDraft.choresDueTime}
                    onChangeText={(value) =>
                      setRuleDraft((current) => ({ ...current, choresDueTime: value }))
                    }
                    placeholder="06:00 PM"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </View>
                <View style={styles.column}>
                  <FieldLabel>Grace period (min)</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={ruleDraft.choresGracePeriodMinutes}
                    onChangeText={(value) =>
                      setRuleDraft((current) => ({
                        ...current,
                        choresGracePeriodMinutes: normalizeIntegerInput(value),
                      }))
                    }
                    keyboardType="number-pad"
                    placeholder="15"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </View>
              </View>
              <FieldLabel>Proof requirement</FieldLabel>
              <View style={styles.chipRow}>
                {PROOF_REQUIREMENT_OPTIONS.map((option) => (
                  <OptionChip
                    key={option.value}
                    label={option.label}
                    selected={ruleDraft.choresProofRequirement.includes(option.value)}
                    onPress={() =>
                      setRuleDraft((current) => ({
                        ...current,
                        choresProofRequirement: toggleStringValue(
                          current.choresProofRequirement,
                          option.value,
                        ),
                      }))
                    }
                  />
                ))}
              </View>
              <Text style={styles.entityMeta}>
                Selected: {formatProofRequirementList(ruleDraft.choresProofRequirement)}
              </Text>
              <ToggleRow
                label="Manager instant notification enabled"
                value={ruleDraft.choresManagerInstantNotificationEnabled}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    choresManagerInstantNotificationEnabled: value,
                  }))
                }
              />

              <Text style={styles.groupTitle}>Employment</Text>
              <ToggleRow
                label="Employment required"
                value={ruleDraft.employmentRequired}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({ ...current, employmentRequired: value }))
                }
              />
              <ToggleRow
                label="Workplace verification enabled"
                value={ruleDraft.workplaceVerificationEnabled}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({ ...current, workplaceVerificationEnabled: value }))
                }
              />
              <ToggleRow
                label="Manager verification required"
                value={ruleDraft.managerVerificationRequired}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({ ...current, managerVerificationRequired: value }))
                }
              />
              <FieldLabel>Workplace geofence radius default (ft)</FieldLabel>
              <TextInput
                style={styles.input}
                value={ruleDraft.workplaceGeofenceRadiusDefault}
                onChangeText={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    workplaceGeofenceRadiusDefault: normalizeIntegerInput(value),
                  }))
                }
                keyboardType="number-pad"
                placeholder="200"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />

              <Text style={styles.groupTitle}>Job search</Text>
              <View style={styles.twoColumnRow}>
                <View style={styles.column}>
                  <FieldLabel>Applications required per week</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={ruleDraft.jobSearchApplicationsRequiredPerWeek}
                    onChangeText={(value) =>
                      setRuleDraft((current) => ({
                        ...current,
                        jobSearchApplicationsRequiredPerWeek: normalizeIntegerInput(value),
                      }))
                    }
                    keyboardType="number-pad"
                    placeholder="5"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </View>
              </View>
              <ToggleRow
                label="Proof required"
                value={ruleDraft.jobSearchProofRequired}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({ ...current, jobSearchProofRequired: value }))
                }
              />
              <ToggleRow
                label="Manager approval required"
                value={ruleDraft.jobSearchManagerApprovalRequired}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    jobSearchManagerApprovalRequired: value,
                  }))
                }
              />

              <Text style={styles.groupTitle}>Meetings</Text>
              <ToggleRow
                label="Meetings required"
                value={ruleDraft.meetingsRequired}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({ ...current, meetingsRequired: value }))
                }
              />
              <FieldLabel>Meetings per week</FieldLabel>
              <TextInput
                style={styles.input}
                value={ruleDraft.meetingsPerWeek}
                onChangeText={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    meetingsPerWeek: normalizeIntegerInput(value),
                  }))
                }
                keyboardType="number-pad"
                placeholder="4"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
              <FieldLabel>Allowed meeting types</FieldLabel>
              <View style={styles.chipRow}>
                {MEETING_TYPE_OPTIONS.map((option) => (
                  <OptionChip
                    key={option.value}
                    label={option.label}
                    selected={ruleDraft.allowedMeetingTypes.includes(option.value)}
                    onPress={() =>
                      setRuleDraft((current) => ({
                        ...current,
                        allowedMeetingTypes: toggleStringValue(
                          current.allowedMeetingTypes,
                          option.value,
                        ),
                      }))
                    }
                  />
                ))}
              </View>
              <FieldLabel>Proof method</FieldLabel>
              <View style={styles.chipRow}>
                {MEETING_PROOF_METHOD_OPTIONS.map((option) => (
                  <OptionChip
                    key={option.value}
                    label={option.label}
                    selected={ruleDraft.meetingsProofMethod === option.value}
                    onPress={() =>
                      setRuleDraft((current) => ({
                        ...current,
                        meetingsProofMethod: option.value,
                      }))
                    }
                  />
                ))}
              </View>

              <Text style={styles.groupTitle}>Sponsor contact</Text>
              <ToggleRow
                label="Enabled"
                value={ruleDraft.sponsorContactEnabled}
                onValueChange={(value) =>
                  setRuleDraft((current) => ({ ...current, sponsorContactEnabled: value }))
                }
              />
              <FieldLabel>Contacts required per week</FieldLabel>
              <TextInput
                style={styles.input}
                value={ruleDraft.sponsorContactsRequiredPerWeek}
                onChangeText={(value) =>
                  setRuleDraft((current) => ({
                    ...current,
                    sponsorContactsRequiredPerWeek: normalizeIntegerInput(value),
                  }))
                }
                keyboardType="number-pad"
                placeholder="3"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
              <FieldLabel>Proof type</FieldLabel>
              <View style={styles.chipRow}>
                {SPONSOR_PROOF_TYPE_OPTIONS.map((option) => (
                  <OptionChip
                    key={option.value}
                    label={option.label}
                    selected={ruleDraft.sponsorProofType === option.value}
                    onPress={() =>
                      setRuleDraft((current) => ({ ...current, sponsorProofType: option.value }))
                    }
                  />
                ))}
              </View>

              <Text style={styles.groupTitle}>Recurring house meetings</Text>
              <Text style={styles.sectionMeta}>
                House meetings follow the same inheritance model as other sober-house defaults:
                organization defaults, then house groups, then house-specific overrides.
              </Text>
              {scopedHouseMeetingSchedules.length > 0 ? (
                scopedHouseMeetingSchedules.map((schedule) => (
                  <View key={schedule.id} style={styles.entityCard}>
                    <Text style={styles.entityTitle}>{schedule.title}</Text>
                    <Text style={styles.entityMeta}>{summarizeHouseMeetingSchedule(schedule)}</Text>
                    <Text style={styles.entityMeta}>
                      {schedule.locationLabel || "Uses the house location"} •{" "}
                      {schedule.required ? "Required for residents" : "Optional attendance"}
                    </Text>
                    <View style={styles.buttonRow}>
                      <AppButton
                        title="Edit"
                        variant="secondary"
                        onPress={() => setEditingHouseMeetingScheduleId(schedule.id)}
                      />
                      <View style={styles.buttonSpacer} />
                      <AppButton
                        title={schedule.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                        variant={schedule.status === "ACTIVE" ? "danger" : "secondary"}
                        onPress={() => {
                          const timestamp = new Date().toISOString();
                          const result = upsertRecurringObligation(
                            store,
                            actor,
                            {
                              ...schedule,
                              status: schedule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                            },
                            timestamp,
                          );
                          void persistStore(
                            result.store,
                            `House meeting schedule updated with ${result.auditCount} audit entr${
                              result.auditCount === 1 ? "y" : "ies"
                            }.`,
                          );
                        }}
                      />
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.sectionMeta}>
                  No recurring house meeting schedule exists for this scope yet.
                </Text>
              )}

              <GlassCard style={styles.subCard}>
                <SectionHeader
                  title={editingHouseMeetingScheduleId ? "Edit house meeting" : "Add house meeting"}
                  meta="Residents in this scope inherit these recurring house meeting requirements."
                />
                <FieldLabel>Meeting title</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={houseMeetingScheduleDraft.title}
                  onChangeText={(value) =>
                    setHouseMeetingScheduleDraft((current) => ({ ...current, title: value }))
                  }
                  placeholder="Sunday house meeting"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                />
                <FieldLabel>Recurrence</FieldLabel>
                <View style={styles.chipRow}>
                  {HOUSE_MEETING_FREQUENCY_OPTIONS.map((option) => (
                    <OptionChip
                      key={option.value}
                      label={option.label}
                      selected={houseMeetingScheduleDraft.frequency === option.value}
                      onPress={() =>
                        setHouseMeetingScheduleDraft((current) => ({
                          ...current,
                          frequency: option.value,
                        }))
                      }
                    />
                  ))}
                </View>
                {houseMeetingScheduleDraft.frequency === "MONTHLY" ? (
                  <>
                    <FieldLabel>Monthly cadence</FieldLabel>
                    <View style={styles.chipRow}>
                      {MONTHLY_ORDINAL_OPTIONS.map((option) => (
                        <OptionChip
                          key={`ordinal-${option.value}`}
                          label={option.label}
                          selected={houseMeetingScheduleDraft.monthlyOrdinal === option.value}
                          onPress={() =>
                            setHouseMeetingScheduleDraft((current) => ({
                              ...current,
                              monthlyOrdinal: option.value,
                            }))
                          }
                        />
                      ))}
                    </View>
                    <View style={styles.chipRow}>
                      {SCHEDULED_WEEKDAY_OPTIONS.map((option) => (
                        <OptionChip
                          key={`monthly-day-${option.value}`}
                          label={option.label}
                          selected={houseMeetingScheduleDraft.monthlyDay === option.value}
                          onPress={() =>
                            setHouseMeetingScheduleDraft((current) => ({
                              ...current,
                              monthlyDay: option.value,
                            }))
                          }
                        />
                      ))}
                    </View>
                  </>
                ) : houseMeetingScheduleDraft.frequency !== "ONCE" ? (
                  <>
                    <FieldLabel>Days</FieldLabel>
                    <View style={styles.chipRow}>
                      {SCHEDULED_WEEKDAY_OPTIONS.map((option) => (
                        <OptionChip
                          key={`weekday-${option.value}`}
                          label={option.label}
                          selected={houseMeetingScheduleDraft.weekdayList.includes(option.value)}
                          onPress={() =>
                            setHouseMeetingScheduleDraft((current) => ({
                              ...current,
                              weekdayList: toggleStringValue(current.weekdayList, option.value),
                            }))
                          }
                        />
                      ))}
                    </View>
                  </>
                ) : null}
                <View style={styles.twoColumnRow}>
                  <View style={styles.column}>
                    <FieldLabel>Start time</FieldLabel>
                    <TextInput
                      style={styles.input}
                      value={houseMeetingScheduleDraft.startsAt}
                      onChangeText={(value) =>
                        setHouseMeetingScheduleDraft((current) => ({ ...current, startsAt: value }))
                      }
                      placeholder="07:00 PM"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                    />
                  </View>
                  <View style={styles.column}>
                    <FieldLabel>Duration (min)</FieldLabel>
                    <TextInput
                      style={styles.input}
                      value={houseMeetingScheduleDraft.durationMinutes}
                      onChangeText={(value) =>
                        setHouseMeetingScheduleDraft((current) => ({
                          ...current,
                          durationMinutes: normalizeIntegerInput(value),
                        }))
                      }
                      keyboardType="number-pad"
                      placeholder="60"
                      placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                    />
                  </View>
                </View>
                <FieldLabel>Location</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={houseMeetingScheduleDraft.locationLabel}
                  onChangeText={(value) =>
                    setHouseMeetingScheduleDraft((current) => ({
                      ...current,
                      locationLabel: value,
                    }))
                  }
                  placeholder="Leave blank to use the house location"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                />
                <FieldLabel>Notes</FieldLabel>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={houseMeetingScheduleDraft.notes}
                  onChangeText={(value) =>
                    setHouseMeetingScheduleDraft((current) => ({ ...current, notes: value }))
                  }
                  placeholder="Optional resident guidance"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  multiline
                />
                <View style={styles.twoColumnRow}>
                  <View style={styles.column}>
                    <ToggleRow
                      label="Add to calendar"
                      value={houseMeetingScheduleDraft.addToCalendar}
                      onValueChange={(value) =>
                        setHouseMeetingScheduleDraft((current) => ({
                          ...current,
                          addToCalendar: value,
                        }))
                      }
                    />
                  </View>
                  <View style={styles.column}>
                    <ToggleRow
                      label="Reminder enabled"
                      value={houseMeetingScheduleDraft.reminderEnabled}
                      onValueChange={(value) =>
                        setHouseMeetingScheduleDraft((current) => ({
                          ...current,
                          reminderEnabled: value,
                        }))
                      }
                    />
                  </View>
                </View>
                <View style={styles.twoColumnRow}>
                  <View style={styles.column}>
                    <ToggleRow
                      label="Required for residents"
                      value={houseMeetingScheduleDraft.required}
                      onValueChange={(value) =>
                        setHouseMeetingScheduleDraft((current) => ({ ...current, required: value }))
                      }
                    />
                  </View>
                  <View style={styles.column}>
                    <ToggleRow
                      label="Schedule active"
                      value={houseMeetingScheduleDraft.isActive}
                      onValueChange={(value) =>
                        setHouseMeetingScheduleDraft((current) => ({ ...current, isActive: value }))
                      }
                    />
                  </View>
                </View>
                <FieldLabel>Reminder lead time (min)</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={houseMeetingScheduleDraft.reminderLeadMinutes}
                  onChangeText={(value) =>
                    setHouseMeetingScheduleDraft((current) => ({
                      ...current,
                      reminderLeadMinutes: normalizeIntegerInput(value),
                    }))
                  }
                  keyboardType="number-pad"
                  placeholder="30"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                />
                <View style={styles.buttonRow}>
                  <AppButton
                    title={
                      editingHouseMeetingScheduleId
                        ? "Update meeting schedule"
                        : "Add meeting schedule"
                    }
                    onPress={() => void saveHouseMeetingSchedule()}
                    disabled={isSaving}
                  />
                  {editingHouseMeetingScheduleId ? (
                    <>
                      <View style={styles.buttonSpacer} />
                      <AppButton
                        title="Cancel"
                        variant="secondary"
                        onPress={() => {
                          setEditingHouseMeetingScheduleId(null);
                          setHouseMeetingScheduleDraft(createHouseMeetingScheduleDraft(null));
                        }}
                      />
                    </>
                  ) : null}
                </View>
              </GlassCard>

              <View style={styles.buttonRow}>
                <AppButton
                  title="Save house rules"
                  onPress={() => void saveRuleSet()}
                  disabled={isSaving}
                />
                {ruleDraft.id ? (
                  <>
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title={ruleDraft.isActive ? "Deactivate rule set" : "Reactivate rule set"}
                      variant={ruleDraft.isActive ? "danger" : "secondary"}
                      onPress={() => {
                        const timestamp = new Date().toISOString();
                        const result = setHouseRuleSetStatus(
                          store,
                          actor,
                          ruleDraft.id ?? "",
                          ruleDraft.isActive ? "INACTIVE" : "ACTIVE",
                          timestamp,
                        );
                        void persistStore(
                          result.store,
                          `Rule set status updated with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
                        );
                      }}
                    />
                  </>
                ) : null}
              </View>
            </>
          )}
        </GlassCard>
      ) : null}

      {adminModule === "VIOLATIONS" ? (
        <GlassCard style={styles.card} strong>
          <SectionHeader
            title="Alert Preferences"
            meta="Alert recipient records and delivery methods for violations, near-misses, and monthly reporting."
            action={
              <AppButton
                title="New alert"
                variant="secondary"
                onPress={() => {
                  setEditingAlertPreferenceId(null);
                  setAlertDraft(createAlertPreferenceDraft(null));
                }}
              />
            }
          />
          <View style={styles.listWrap}>
            {store.alertPreferences.length === 0 ? (
              <Text style={styles.sectionMeta}>No alert preferences configured yet.</Text>
            ) : (
              store.alertPreferences.map((preference) => (
                <View
                  key={preference.id}
                  style={[
                    styles.entityCard,
                    editingAlertPreferenceId === preference.id ? styles.entityCardSelected : null,
                  ]}
                >
                  <Text style={styles.entityTitle}>{preference.label}</Text>
                  <Text style={styles.entityMeta}>
                    Scope:{" "}
                    {preference.scope === "ORGANIZATION"
                      ? "Organization-wide"
                      : (store.houses.find((house) => house.id === preference.houseId)?.name ??
                        "House")}
                  </Text>
                  <Text style={styles.entityMeta}>
                    Recipient: {preference.recipientName || "Unassigned"} •{" "}
                    {preference.deliveryMethod}
                  </Text>
                  <Text style={styles.entityMeta}>
                    {preference.sendRealTimeViolationAlerts ? "Real-time " : ""}
                    {preference.sendNearMissAlerts ? "Near-miss " : ""}
                    {preference.sendMonthlyReports ? "Monthly reports" : ""}
                  </Text>
                  <Text style={styles.entityMeta}>
                    {preference.status === "ACTIVE" ? "Active" : "Inactive"}
                  </Text>
                  <View style={styles.buttonRow}>
                    <AppButton
                      title="Edit"
                      variant="secondary"
                      onPress={() => {
                        setEditingAlertPreferenceId(preference.id);
                        setAlertDraft(createAlertPreferenceDraft(preference));
                      }}
                    />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title={preference.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                      variant={preference.status === "ACTIVE" ? "danger" : "secondary"}
                      onPress={() => {
                        const timestamp = new Date().toISOString();
                        const result = setAlertPreferenceStatus(
                          store,
                          actor,
                          preference.id,
                          preference.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                          timestamp,
                        );
                        void persistStore(
                          result.store,
                          `Alert preference status updated with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
                        );
                      }}
                    />
                  </View>
                </View>
              ))
            )}
          </View>
          <FieldLabel>Label</FieldLabel>
          <TextInput
            style={styles.input}
            value={alertDraft.label}
            onChangeText={(value) => setAlertDraft((current) => ({ ...current, label: value }))}
            placeholder="Default manager alerts"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
          />
          <FieldLabel>Scope</FieldLabel>
          <View style={styles.chipRow}>
            {ALERT_SCOPE_OPTIONS.map((option) => (
              <OptionChip
                key={option.value}
                label={option.label}
                selected={alertDraft.scope === option.value}
                onPress={() =>
                  setAlertDraft((current) => ({
                    ...current,
                    scope: option.value,
                    houseId: option.value === "HOUSE" ? current.houseId : null,
                  }))
                }
              />
            ))}
          </View>
          {alertDraft.scope === "HOUSE" ? (
            <>
              <FieldLabel>Assigned house</FieldLabel>
              <View style={styles.chipRow}>
                {store.houses.map((house) => (
                  <OptionChip
                    key={house.id}
                    label={house.name}
                    selected={alertDraft.houseId === house.id}
                    onPress={() => setAlertDraft((current) => ({ ...current, houseId: house.id }))}
                  />
                ))}
              </View>
            </>
          ) : null}
          <FieldLabel>Recipient staff</FieldLabel>
          <View style={styles.chipRow}>
            <OptionChip
              label="Custom"
              selected={alertDraft.recipientStaffAssignmentIds.length === 0}
              onPress={() =>
                setAlertDraft((current) => ({ ...current, recipientStaffAssignmentIds: [] }))
              }
            />
            {store.staffAssignments.map((assignment) => (
              <OptionChip
                key={assignment.id}
                label={`${assignment.firstName} ${assignment.lastName}`}
                selected={alertDraft.recipientStaffAssignmentIds.includes(assignment.id)}
                onPress={() =>
                  setAlertDraft((current) => ({
                    ...current,
                    recipientStaffAssignmentIds: current.recipientStaffAssignmentIds.includes(
                      assignment.id,
                    )
                      ? current.recipientStaffAssignmentIds.filter((id) => id !== assignment.id)
                      : [...current.recipientStaffAssignmentIds, assignment.id],
                  }))
                }
              />
            ))}
          </View>
          <Text style={styles.sectionMeta}>
            {alertDraft.recipientStaffAssignmentIds.length > 0
              ? `${alertDraft.recipientStaffAssignmentIds.length} staff recipient${alertDraft.recipientStaffAssignmentIds.length === 1 ? "" : "s"} selected.`
              : "Select Custom to enter one manual recipient, or choose one or more staff members."}
          </Text>
          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <FieldLabel>Recipient name</FieldLabel>
              <TextInput
                style={styles.input}
                value={alertDraft.recipientName}
                onChangeText={(value) =>
                  setAlertDraft((current) => ({ ...current, recipientName: value }))
                }
                editable={alertDraft.recipientStaffAssignmentIds.length === 0}
                placeholder="Manager name"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
            </View>
            <View style={styles.column}>
              <FieldLabel>Recipient phone</FieldLabel>
              <TextInput
                style={styles.input}
                value={alertDraft.recipientPhone}
                onChangeText={(value) =>
                  setAlertDraft((current) => ({
                    ...current,
                    recipientPhone: normalizeUsPhoneInput(value),
                  }))
                }
                editable={alertDraft.recipientStaffAssignmentIds.length === 0}
                keyboardType="phone-pad"
                placeholder="(555) 555-4545"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
            </View>
          </View>
          <FieldLabel>Recipient email</FieldLabel>
          <TextInput
            style={styles.input}
            value={alertDraft.recipientEmail}
            onChangeText={(value) =>
              setAlertDraft((current) => ({ ...current, recipientEmail: value }))
            }
            editable={alertDraft.recipientStaffAssignmentIds.length === 0}
            autoCapitalize="none"
            placeholder="alerts@example.org"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
          />
          <FieldLabel>Delivery method</FieldLabel>
          <View style={styles.chipRow}>
            {ALERT_DELIVERY_METHOD_OPTIONS.map((option) => (
              <OptionChip
                key={option.value}
                label={option.label}
                selected={alertDraft.deliveryMethod === option.value}
                onPress={() =>
                  setAlertDraft((current) => ({ ...current, deliveryMethod: option.value }))
                }
              />
            ))}
          </View>
          <ToggleRow
            label="Receive real-time violation alerts"
            value={alertDraft.sendRealTimeViolationAlerts}
            onValueChange={(value) =>
              setAlertDraft((current) => ({ ...current, sendRealTimeViolationAlerts: value }))
            }
          />
          <ToggleRow
            label="Receive near-miss alerts"
            value={alertDraft.sendNearMissAlerts}
            onValueChange={(value) =>
              setAlertDraft((current) => ({ ...current, sendNearMissAlerts: value }))
            }
          />
          <ToggleRow
            label="Receive monthly reports"
            value={alertDraft.sendMonthlyReports}
            onValueChange={(value) =>
              setAlertDraft((current) => ({ ...current, sendMonthlyReports: value }))
            }
          />
          <ToggleRow
            label="Alert preference active"
            value={alertDraft.isActive}
            onValueChange={(value) => setAlertDraft((current) => ({ ...current, isActive: value }))}
          />
          <View style={styles.buttonRow}>
            <AppButton
              title={editingAlertPreferenceId ? "Update alert" : "Create alert"}
              variant={editingAlertPreferenceId ? "secondary" : undefined}
              onPress={() => void saveAlertPreference()}
              disabled={isSaving}
            />
            {editingAlertPreferenceId ? (
              <>
                <View style={styles.buttonSpacer} />
                <AppButton
                  title="New alert"
                  variant="secondary"
                  onPress={() => {
                    setEditingAlertPreferenceId(null);
                    setAlertDraft(createAlertPreferenceDraft(null));
                  }}
                  disabled={isSaving}
                />
              </>
            ) : null}
          </View>
        </GlassCard>
      ) : null}

      {adminModule === "REPORTS" ? (
        <GlassCard style={styles.card} strong>
          <SectionHeader
            title="Audit Log"
            meta="Read-only record of settings changes written on every saved edit."
          />
          {store.auditLogEntries.length === 0 ? (
            <Text style={styles.sectionMeta}>No settings edits have been logged yet.</Text>
          ) : (
            store.auditLogEntries.slice(0, 30).map((entry) => (
              <View key={entry.id} style={styles.auditRow}>
                <Text style={styles.auditTitle}>
                  {entry.actor.name} • {entry.entityType} •{" "}
                  {entry.actionTaken ?? entry.fieldChanged}
                </Text>
                <Text style={styles.entityMeta}>{new Date(entry.timestamp).toLocaleString()}</Text>
                <Text style={styles.entityMeta}>
                  {formatAuditValue(entry.oldValue)} → {formatAuditValue(entry.newValue)}
                </Text>
              </View>
            ))
          )}
        </GlassCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.h2,
    fontWeight: "700",
  },
  sectionMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 18,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  summaryPill: {
    minWidth: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    gap: 4,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: "600",
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "600",
  },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  column: {
    flex: 1,
    minWidth: 160,
    gap: spacing.xs,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    minHeight: 40,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipSelected: {
    borderColor: colors.neonLavender,
    backgroundColor: "rgba(139, 92, 246, 0.24)",
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: colors.textPrimary,
  },
  listWrap: {
    gap: spacing.sm,
  },
  entityCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: spacing.sm,
    gap: 4,
  },
  entityCardSelected: {
    borderColor: "rgba(96,165,250,0.8)",
    backgroundColor: "rgba(59,130,246,0.16)",
  },
  entityTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  entityMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 18,
  },
  subCard: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  inlineButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  buttonSpacer: {
    width: spacing.sm,
  },
  groupTitle: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  auditRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: spacing.sm,
    gap: 2,
  },
  auditTitle: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: "700",
  },
  statusText: {
    color: colors.neonLavender,
    fontSize: typography.small,
    fontWeight: "600",
  },
});
