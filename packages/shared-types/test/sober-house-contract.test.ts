import { describe, expect, it } from "vitest";
import { soberHouseLiveStoreSchema, soberHouseScheduledItemCompletionRecordSchema } from "../src";

describe("soberHouseScheduledItemCompletionRecordSchema", () => {
  it("accepts a valid canonical scheduled-item completion record", () => {
    const now = new Date().toISOString();
    const result = soberHouseScheduledItemCompletionRecordSchema.safeParse({
      id: "completion-1",
      residentId: "resident-1",
      linkedUserId: "user-1",
      organizationId: "org-1",
      houseId: "house-1",
      scheduledItemType: "HOUSE_CHORE",
      scheduledItemId: "chore-1",
      recurringObligationId: "obligation-1",
      scheduledAt: now,
      status: "COMPLETED",
      completedAt: now,
      excusedAt: null,
      excusedReason: null,
      proofRequired: true,
      proofRequirement: ["PHOTO"],
      proofProvided: true,
      proofReference: "proof://asset-1",
      submittedAt: now,
      managerConfirmationRequired: false,
      managerConfirmationStatus: "NOT_REQUIRED",
      managerConfirmationRequestedAt: null,
      managerConfirmationRequestedVia: null,
      managerConfirmedAt: null,
      notes: "",
      createdAt: now,
      updatedAt: now,
    });

    expect(result.success).toBe(true);
  });
});

describe("soberHouseLiveStoreSchema", () => {
  it("accepts the first live sober-house slice", () => {
    const now = new Date().toISOString();
    const result = soberHouseLiveStoreSchema.safeParse({
      residentHouseMemberships: [
        {
          id: "membership-1",
          residentId: "resident-1",
          linkedUserId: "user-1",
          organizationId: "org-1",
          houseId: "house-1",
          roomOrBed: "1A",
          moveInDate: "2026-04-01",
          moveOutDate: null,
          isPrimary: true,
          status: "ACTIVE",
          notes: "",
          createdAt: now,
          updatedAt: now,
        },
      ],
      recurringObligations: [],
      houseMeetings: [],
      oneOnOneSessions: [],
      houseChores: [],
      alertAcknowledgementRecords: [],
      scheduledItemCompletionRecords: [],
      proofReviewRecords: [],
    });

    expect(result.success).toBe(true);
  });
});
