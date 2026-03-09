import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { GlassCard } from "../lib/ui/GlassCard";
import { AppButton } from "../lib/ui/AppButton";
import { SoberHouseResidentManager } from "../components/SoberHouseResidentManager";
import { SoberHouseComplianceSection } from "../components/SoberHouseComplianceSection";
import { SoberHouseInterventionSection } from "../components/SoberHouseInterventionSection";
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
  type HouseRuleSet,
  type HouseType,
  type MeetingType,
  type Organization,
  type SoberHouseSettingsStore,
  type StaffAssignment,
  type StaffRole,
} from "../lib/soberHouse/types";
import {
  createDefaultAlertPreference,
  createDefaultHouse,
  createDefaultHouseRuleSet,
  createDefaultStaffAssignment,
} from "../lib/soberHouse/defaults";
import {
  setAlertPreferenceStatus,
  setHouseRuleSetStatus,
  setHouseStatus,
  setStaffAssignmentStatus,
  upsertAlertPreference,
  upsertHouse,
  upsertHouseRuleSet,
  upsertOrganization,
  upsertStaffAssignment,
} from "../lib/soberHouse/mutations";
import {
  getActiveHouses,
  getRuleSetForHouse,
  getStaffAssignmentById,
} from "../lib/soberHouse/selectors";
import {
  loadSoberHouseSettingsStore,
  saveSoberHouseSettingsStore,
} from "../lib/soberHouse/storage";

type SoberHouseSettingsScreenProps = {
  userId: string;
  actorId: string;
  actorName: string;
  onBack: () => void;
};

type PersistOptions = {
  showStatus?: boolean;
};

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

type HouseDraft = {
  id?: string;
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
  houseId: string;
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

type AlertPreferenceDraft = {
  id?: string;
  label: string;
  scope: AlertScope;
  houseId: string | null;
  recipientStaffAssignmentId: string | null;
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  deliveryMethod: AlertPreference["deliveryMethod"];
  sendRealTimeViolationAlerts: boolean;
  sendNearMissAlerts: boolean;
  sendMonthlyReports: boolean;
  isActive: boolean;
};

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
    primaryPhone: value.primaryPhone,
    primaryEmail: value.primaryEmail,
    notes: value.notes,
    isActive: value.status === "ACTIVE",
  };
}

function createHouseDraft(value: House | null): HouseDraft {
  if (!value) {
    const base = createDefaultHouse(new Date().toISOString(), null);
    return {
      id: base.id,
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
    name: value.name,
    address: value.address,
    phone: value.phone,
    geofenceCenterLat: value.geofenceCenterLat === null ? "" : String(value.geofenceCenterLat),
    geofenceCenterLng: value.geofenceCenterLng === null ? "" : String(value.geofenceCenterLng),
    geofenceRadiusFeetDefault: String(value.geofenceRadiusFeetDefault),
    houseTypes: [...value.houseTypes],
    bedCount: String(value.bedCount),
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
    phone: value.phone,
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
  houseId: string | null,
): HouseRuleSetDraft {
  const base =
    value ?? (houseId ? createDefaultHouseRuleSet(new Date().toISOString(), houseId, null) : null);

  return {
    id: base?.id,
    houseId: base?.houseId ?? houseId ?? "",
    name: base?.name ?? "Default house rules",
    isActive: base?.status !== "INACTIVE",
    curfewEnabled: base?.curfew.enabled ?? false,
    weekdayCurfew: base?.curfew.weekdayCurfew ?? "22:00",
    fridayCurfew: base?.curfew.fridayCurfew ?? "23:00",
    saturdayCurfew: base?.curfew.saturdayCurfew ?? "23:00",
    sundayCurfew: base?.curfew.sundayCurfew ?? "22:00",
    curfewGracePeriodMinutes: String(base?.curfew.gracePeriodMinutes ?? 15),
    preViolationAlertEnabled: base?.curfew.preViolationAlertEnabled ?? false,
    preViolationLeadTimeMinutes: String(base?.curfew.preViolationLeadTimeMinutes ?? 15),
    curfewAlertBasis: base?.curfew.alertBasis ?? "CLOCK_ONLY",
    choresEnabled: base?.chores.enabled ?? false,
    choresFrequency: base?.chores.frequency ?? "WEEKLY",
    choresDueTime: base?.chores.dueTime ?? "18:00",
    choresProofRequirement: base?.chores.proofRequirement ?? "CHECKLIST",
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
    meetingsProofMethod: base?.meetings.proofMethod ?? "GEOFENCE",
    sponsorContactEnabled: base?.sponsorContact.enabled ?? false,
    sponsorContactsRequiredPerWeek: String(base?.sponsorContact.contactsRequiredPerWeek ?? 0),
    sponsorProofType: base?.sponsorContact.proofType ?? "CALL_LOG",
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
      recipientStaffAssignmentId: null,
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
    recipientStaffAssignmentId: value.recipientStaffAssignmentId,
    recipientName: value.recipientName,
    recipientPhone: value.recipientPhone,
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

export function SoberHouseSettingsScreen({
  userId,
  actorId,
  actorName,
  onBack,
}: SoberHouseSettingsScreenProps) {
  const actor = useMemo<AuditActor>(() => ({ id: actorId, name: actorName }), [actorId, actorName]);
  const [store, setStore] = useState<SoberHouseSettingsStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [organizationDraft, setOrganizationDraft] = useState<OrganizationDraft>(
    createOrganizationDraft(null),
  );
  const [editingHouseId, setEditingHouseId] = useState<string | null>(null);
  const [houseDraft, setHouseDraft] = useState<HouseDraft>(createHouseDraft(null));
  const [editingStaffAssignmentId, setEditingStaffAssignmentId] = useState<string | null>(null);
  const [staffDraft, setStaffDraft] = useState<StaffAssignmentDraft>(
    createStaffAssignmentDraft(null),
  );
  const [selectedRuleHouseId, setSelectedRuleHouseId] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<HouseRuleSetDraft>(
    createHouseRuleSetDraft(null, null),
  );
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
      setOrganizationDraft(createOrganizationDraft(nextStore.organization));
      setHouseDraft(createHouseDraft(null));
      setStaffDraft(createStaffAssignmentDraft(null));
      setAlertDraft(createAlertPreferenceDraft(null));
      setEditingHouseId(null);
      setEditingStaffAssignmentId(null);
      setEditingAlertPreferenceId(null);
      setSelectedRuleHouseId(getActiveHouses(nextStore)[0]?.id ?? nextStore.houses[0]?.id ?? null);
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!store) {
      return;
    }

    const availableHouseIds = new Set(store.houses.map((house) => house.id));
    if (selectedRuleHouseId && availableHouseIds.has(selectedRuleHouseId)) {
      return;
    }
    setSelectedRuleHouseId(getActiveHouses(store)[0]?.id ?? store.houses[0]?.id ?? null);
  }, [selectedRuleHouseId, store]);

  useEffect(() => {
    if (!store || !selectedRuleHouseId) {
      setRuleDraft(createHouseRuleSetDraft(null, selectedRuleHouseId));
      return;
    }

    setRuleDraft(
      createHouseRuleSetDraft(
        getRuleSetForHouse(store, selectedRuleHouseId, new Date().toISOString()),
        selectedRuleHouseId,
      ),
    );
  }, [selectedRuleHouseId, store]);

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
        primaryPhone: organizationDraft.primaryPhone.trim(),
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
  }, [actor, organizationDraft, persistStore, store]);

  const saveHouse = useCallback(async () => {
    if (!store) {
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
    const geofenceLat = parseOptionalCoordinate(houseDraft.geofenceCenterLat);
    const geofenceLng = parseOptionalCoordinate(houseDraft.geofenceCenterLng);
    if ((geofenceLat === null) !== (geofenceLng === null)) {
      setStatusMessage("Provide both house geofence latitude and longitude, or leave both blank.");
      return;
    }

    const timestamp = new Date().toISOString();
    const result = upsertHouse(
      store,
      actor,
      {
        id: editingHouseId ?? houseDraft.id,
        name: houseDraft.name.trim(),
        address: houseDraft.address.trim(),
        phone: houseDraft.phone.trim(),
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
      `House saved with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
    );
    setHouseDraft(createHouseDraft(null));
    setEditingHouseId(null);
    if (!selectedRuleHouseId) {
      setSelectedRuleHouseId(result.store.houses[0]?.id ?? null);
    }
  }, [actor, editingHouseId, houseDraft, persistStore, selectedRuleHouseId, store]);

  const saveStaffAssignment = useCallback(async () => {
    if (!store) {
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
        phone: staffDraft.phone.trim(),
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
  }, [actor, editingStaffAssignmentId, persistStore, staffDraft, store]);

  const saveRuleSet = useCallback(async () => {
    if (!store || !selectedRuleHouseId) {
      setStatusMessage("Create a house before saving rules.");
      return;
    }
    if (!isValidHhmm(ruleDraft.weekdayCurfew)) {
      setStatusMessage("Weekday curfew must be HH:MM.");
      return;
    }
    if (
      !isValidHhmm(ruleDraft.fridayCurfew) ||
      !isValidHhmm(ruleDraft.saturdayCurfew) ||
      !isValidHhmm(ruleDraft.sundayCurfew)
    ) {
      setStatusMessage("All curfew times must be HH:MM.");
      return;
    }
    if (!isValidHhmm(ruleDraft.choresDueTime)) {
      setStatusMessage("Chore due time must be HH:MM.");
      return;
    }

    const timestamp = new Date().toISOString();
    const result = upsertHouseRuleSet(
      store,
      actor,
      {
        id: ruleDraft.id,
        houseId: selectedRuleHouseId,
        name: ruleDraft.name.trim() || "Default house rules",
        status: ruleDraft.isActive ? "ACTIVE" : "INACTIVE",
        curfew: {
          enabled: ruleDraft.curfewEnabled,
          weekdayCurfew: ruleDraft.weekdayCurfew,
          fridayCurfew: ruleDraft.fridayCurfew,
          saturdayCurfew: ruleDraft.saturdayCurfew,
          sundayCurfew: ruleDraft.sundayCurfew,
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
          dueTime: ruleDraft.choresDueTime,
          proofRequirement: ruleDraft.choresProofRequirement,
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
      },
      timestamp,
    );

    await persistStore(
      result.store,
      `House rules saved with ${result.auditCount} audit entr${result.auditCount === 1 ? "y" : "ies"}.`,
    );
  }, [actor, persistStore, ruleDraft, selectedRuleHouseId, store]);

  const saveAlertPreference = useCallback(async () => {
    if (!store) {
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

    const selectedStaff = alertDraft.recipientStaffAssignmentId
      ? getStaffAssignmentById(store, alertDraft.recipientStaffAssignmentId)
      : null;
    const recipientName =
      selectedStaff !== null
        ? `${selectedStaff.firstName} ${selectedStaff.lastName}`.trim()
        : alertDraft.recipientName.trim();
    const recipientEmail = selectedStaff?.email?.trim() || alertDraft.recipientEmail.trim();
    const recipientPhone = selectedStaff?.phone?.trim() || alertDraft.recipientPhone.trim();

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
        recipientStaffAssignmentId: alertDraft.recipientStaffAssignmentId,
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
    setAlertDraft(createAlertPreferenceDraft(null));
    setEditingAlertPreferenceId(null);
  }, [actor, alertDraft, editingAlertPreferenceId, persistStore, store]);

  if (loading || !store) {
    return (
      <GlassCard style={styles.card} strong>
        <Text style={styles.sectionTitle}>Sober Housing Settings</Text>
        <Text style={styles.sectionMeta}>Loading configuration…</Text>
      </GlassCard>
    );
  }

  return (
    <View style={styles.wrap}>
      <GlassCard style={styles.card} strong>
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
            <Text style={styles.summaryValue}>{store.auditLogEntries.length}</Text>
            <Text style={styles.summaryLabel}>Audit</Text>
          </View>
        </View>
        <SaveStatus message={statusMessage} />
      </GlassCard>

      <SoberHouseResidentManager
        store={store}
        actor={actor}
        linkedUserId={userId}
        isSaving={isSaving}
        onPersist={persistStore}
      />

      <SoberHouseComplianceSection
        userId={userId}
        store={store}
        actor={actor}
        isSaving={isSaving}
        onPersist={persistStore}
      />

      <SoberHouseInterventionSection
        userId={userId}
        store={store}
        actor={actor}
        isSaving={isSaving}
        onPersist={persistStore}
      />

      <GlassCard style={styles.card} strong>
        <SectionHeader
          title="Organization"
          meta="Organization profile and primary contact settings."
        />
        <FieldLabel>Organization name</FieldLabel>
        <TextInput
          style={styles.input}
          value={organizationDraft.name}
          onChangeText={(value) => setOrganizationDraft((current) => ({ ...current, name: value }))}
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
                setOrganizationDraft((current) => ({ ...current, primaryPhone: value }))
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
      </GlassCard>

      <GlassCard style={styles.card} strong>
        <SectionHeader
          title="Houses"
          meta="Multi-house roster, locations, geofence defaults, and activation state."
          action={
            <AppButton
              title="New house"
              variant="secondary"
              onPress={() => {
                setEditingHouseId(null);
                setHouseDraft(createHouseDraft(null));
              }}
            />
          }
        />
        <View style={styles.listWrap}>
          {store.houses.length === 0 ? (
            <Text style={styles.sectionMeta}>No houses configured yet.</Text>
          ) : (
            store.houses.map((house) => (
              <View key={house.id} style={styles.entityCard}>
                <Text style={styles.entityTitle}>{house.name}</Text>
                <Text style={styles.entityMeta}>{house.address}</Text>
                <Text style={styles.entityMeta}>
                  {labelForHouseTypes(house.houseTypes)} • Beds: {house.bedCount} • Radius:{" "}
                  {house.geofenceRadiusFeetDefault} ft
                </Text>
                <Text style={styles.entityMeta}>
                  Geofence center:{" "}
                  {house.geofenceCenterLat !== null && house.geofenceCenterLng !== null
                    ? `${house.geofenceCenterLat.toFixed(5)}, ${house.geofenceCenterLng.toFixed(5)}`
                    : "Missing"}
                </Text>
                <Text style={styles.entityMeta}>
                  {house.status === "ACTIVE" ? "Active" : "Inactive"}
                </Text>
                <View style={styles.buttonRow}>
                  <AppButton
                    title="Edit"
                    variant="secondary"
                    onPress={() => {
                      setEditingHouseId(house.id);
                      setHouseDraft(createHouseDraft(house));
                    }}
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
              onChangeText={(value) => setHouseDraft((current) => ({ ...current, phone: value }))}
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
        <View style={styles.twoColumnRow}>
          <View style={styles.column}>
            <FieldLabel>Geofence latitude</FieldLabel>
            <TextInput
              style={styles.input}
              value={houseDraft.geofenceCenterLat}
              onChangeText={(value) =>
                setHouseDraft((current) => ({ ...current, geofenceCenterLat: value }))
              }
              keyboardType="decimal-pad"
              placeholder="45.7833"
              placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            />
          </View>
          <View style={styles.column}>
            <FieldLabel>Geofence longitude</FieldLabel>
            <TextInput
              style={styles.input}
              value={houseDraft.geofenceCenterLng}
              onChangeText={(value) =>
                setHouseDraft((current) => ({ ...current, geofenceCenterLng: value }))
              }
              keyboardType="decimal-pad"
              placeholder="-108.5007"
              placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            />
          </View>
        </View>
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
                setHouseDraft((current) => ({ ...current, bedCount: normalizeIntegerInput(value) }))
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
        </View>
      </GlassCard>

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
              onChangeText={(value) => setStaffDraft((current) => ({ ...current, phone: value }))}
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

      <GlassCard style={styles.card} strong>
        <SectionHeader
          title="House Rules"
          meta="Per-house configuration only. This does not enforce runtime compliance behavior."
        />
        {store.houses.length === 0 ? (
          <Text style={styles.sectionMeta}>Create a house before configuring rule sets.</Text>
        ) : (
          <>
            <FieldLabel>Select house</FieldLabel>
            <View style={styles.chipRow}>
              {store.houses.map((house) => (
                <OptionChip
                  key={house.id}
                  label={house.name}
                  selected={selectedRuleHouseId === house.id}
                  onPress={() => setSelectedRuleHouseId(house.id)}
                />
              ))}
            </View>
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
                  placeholder="22:00"
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
                  placeholder="23:00"
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
                  placeholder="23:00"
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
                  placeholder="22:00"
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
                  placeholder="18:00"
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
                  selected={ruleDraft.choresProofRequirement === option.value}
                  onPress={() =>
                    setRuleDraft((current) => ({
                      ...current,
                      choresProofRequirement: option.value,
                    }))
                  }
                />
              ))}
            </View>
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
                    setRuleDraft((current) => ({ ...current, meetingsProofMethod: option.value }))
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

            <View style={styles.buttonRow}>
              <AppButton
                title="Save house rules"
                onPress={() => void saveRuleSet()}
                disabled={isSaving}
              />
              {selectedRuleHouseId ? (
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
                        selectedRuleHouseId,
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
              <View key={preference.id} style={styles.entityCard}>
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
            selected={alertDraft.recipientStaffAssignmentId === null}
            onPress={() =>
              setAlertDraft((current) => ({ ...current, recipientStaffAssignmentId: null }))
            }
          />
          {store.staffAssignments.map((assignment) => (
            <OptionChip
              key={assignment.id}
              label={`${assignment.firstName} ${assignment.lastName}`}
              selected={alertDraft.recipientStaffAssignmentId === assignment.id}
              onPress={() =>
                setAlertDraft((current) => ({
                  ...current,
                  recipientStaffAssignmentId: assignment.id,
                  recipientName: `${assignment.firstName} ${assignment.lastName}`.trim(),
                  recipientPhone: assignment.phone,
                  recipientEmail: assignment.email,
                }))
              }
            />
          ))}
        </View>
        <View style={styles.twoColumnRow}>
          <View style={styles.column}>
            <FieldLabel>Recipient name</FieldLabel>
            <TextInput
              style={styles.input}
              value={alertDraft.recipientName}
              onChangeText={(value) =>
                setAlertDraft((current) => ({ ...current, recipientName: value }))
              }
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
                setAlertDraft((current) => ({ ...current, recipientPhone: value }))
              }
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
            onPress={() => void saveAlertPreference()}
            disabled={isSaving}
          />
        </View>
      </GlassCard>

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
                {entry.actor.name} • {entry.entityType} • {entry.actionTaken ?? entry.fieldChanged}
              </Text>
              <Text style={styles.entityMeta}>{new Date(entry.timestamp).toLocaleString()}</Text>
              <Text style={styles.entityMeta}>
                {formatAuditValue(entry.oldValue)} → {formatAuditValue(entry.newValue)}
              </Text>
            </View>
          ))
        )}
      </GlassCard>
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
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
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
