import { formatUsPhoneDisplay } from "../phone";
import { createDefaultSoberHouseSettingsStore } from "./defaults";
import { upsertOrganization, upsertStaffAssignment, upsertUserAccessProfile } from "./mutations";
import type { SoberHouseSettingsStore } from "./types";

function splitContactName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/).filter((segment) => segment.length > 0);
  return {
    firstName: parts.slice(0, 1).join(" ") || "Owner",
    lastName: parts.slice(1).join(" ") || "Operator",
  };
}

export type HousingAdminBootstrapFields = {
  organizationId?: string | null;
  organizationName: string;
  primaryContactName: string;
  primaryPhone: string;
  primaryEmail: string;
  notes: string;
};

export function buildHousingAdminBootstrapStore(input: {
  userId: string;
  actorName: string;
  fields: HousingAdminBootstrapFields;
  timestamp: string;
}): SoberHouseSettingsStore {
  const actor = { id: input.userId, name: input.actorName };
  const store = createDefaultSoberHouseSettingsStore();
  const primaryPhone = formatUsPhoneDisplay(input.fields.primaryPhone);
  const primaryEmail = input.fields.primaryEmail.trim();
  const contactName = input.fields.primaryContactName.trim();
  const splitName = splitContactName(contactName);

  let nextStore = upsertOrganization(
    store,
    actor,
    {
      id: input.fields.organizationId ?? undefined,
      name: input.fields.organizationName.trim(),
      primaryContactName: contactName,
      primaryPhone,
      primaryEmail,
      notes: input.fields.notes.trim(),
      status: "ACTIVE",
    },
    input.timestamp,
  ).store;

  nextStore = upsertStaffAssignment(
    nextStore,
    actor,
    {
      firstName: splitName.firstName,
      lastName: splitName.lastName,
      phone: primaryPhone,
      email: primaryEmail,
      role: "OWNER",
      assignedHouseIds: [],
      receiveRealTimeViolationAlerts: true,
      receiveNearMissAlerts: true,
      receiveMonthlyReports: true,
      canApproveExceptions: true,
      canIssueCorrectiveActions: true,
      canViewResidentEvidence: true,
      status: "ACTIVE",
    },
    input.timestamp,
  ).store;

  nextStore = upsertUserAccessProfile(
    nextStore,
    actor,
    {
      linkedUserId: input.userId,
      role: "OWNER_OPERATOR",
      organizationId: nextStore.organization?.id ?? null,
      houseId: null,
      houseGroupId: null,
      status: "ACTIVE",
    },
    input.timestamp,
  ).store;

  return nextStore;
}
