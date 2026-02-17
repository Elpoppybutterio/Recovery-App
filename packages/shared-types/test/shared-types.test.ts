import { describe, expect, it } from "vitest";
import {
  IncidentStatus,
  IncidentType,
  attendanceRecordSchema,
  exclusionZoneSchema,
  incidentSchema,
  notificationEventSchema,
  userZoneRuleSchema,
} from "../src";

describe("attendanceRecordSchema", () => {
  it("accepts a valid attendance payload", () => {
    const result = attendanceRecordSchema.safeParse({
      userId: "user-1",
      meetingId: "meeting-1",
      checkInAt: new Date().toISOString(),
      status: "PROVISIONAL",
    });

    expect(result.success).toBe(true);
  });
});

describe("exclusionZoneSchema", () => {
  it("accepts a valid circle exclusion zone payload", () => {
    const result = exclusionZoneSchema.safeParse({
      id: "zone-1",
      tenantId: "tenant-1",
      label: "School perimeter",
      type: "CIRCLE",
      centerLat: 33.755,
      centerLng: -84.39,
      radiusM: 150,
      active: true,
    });

    expect(result.success).toBe(true);
  });
});

describe("userZoneRuleSchema", () => {
  it("accepts a valid user-zone rule payload", () => {
    const result = userZoneRuleSchema.safeParse({
      id: "rule-1",
      tenantId: "tenant-1",
      userId: "user-1",
      zoneId: "zone-1",
      bufferM: 25,
      active: true,
    });

    expect(result.success).toBe(true);
  });
});

describe("incidentSchema", () => {
  it("accepts a valid incident payload", () => {
    const result = incidentSchema.safeParse({
      id: "incident-1",
      tenantId: "tenant-1",
      userId: "user-1",
      zoneId: "zone-1",
      type: IncidentType.WARNING,
      occurredAt: new Date().toISOString(),
      status: IncidentStatus.OPEN,
      metadata: { distanceM: 20 },
    });

    expect(result.success).toBe(true);
  });
});

describe("notificationEventSchema", () => {
  it("accepts a valid notification event payload", () => {
    const result = notificationEventSchema.safeParse({
      id: "notif-1",
      tenantId: "tenant-1",
      userId: "user-1",
      channel: "SMS",
      recipient: "+15555550123",
      templateKey: "zone.warning",
      payload: {
        zoneLabel: "School perimeter",
      },
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });
});
