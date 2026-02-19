import { describe, expect, it } from "vitest";
import {
  ComplianceEventType,
  IncidentStatus,
  IncidentType,
  SponsorRepeatDay,
  SponsorRepeatUnit,
  attendanceRecordSchema,
  complianceEventSchema,
  exclusionZoneSchema,
  incidentSchema,
  lastKnownLocationSchema,
  locationPingSchema,
  notificationEventSchema,
  sponsorConfigSchema,
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

describe("locationPingSchema", () => {
  it("accepts a valid location ping payload", () => {
    const result = locationPingSchema.safeParse({
      lat: 33.755,
      lng: -84.39,
      accuracyM: 12,
      recordedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });
});

describe("lastKnownLocationSchema", () => {
  it("accepts a valid last-known-location payload", () => {
    const result = lastKnownLocationSchema.safeParse({
      tenantId: "tenant-1",
      userId: "user-1",
      lat: 33.755,
      lng: -84.39,
      accuracyM: 25,
      recordedAt: new Date().toISOString(),
      source: "MOBILE",
    });

    expect(result.success).toBe(true);
  });
});

describe("complianceEventSchema", () => {
  it("accepts a valid compliance event payload", () => {
    const result = complianceEventSchema.safeParse({
      id: "event-1",
      tenantId: "tenant-1",
      userId: "user-1",
      eventType: ComplianceEventType.LOCATION_STALE,
      occurredAt: new Date().toISOString(),
      metadata: { staleBySeconds: 300 },
    });

    expect(result.success).toBe(true);
  });
});

describe("sponsorConfigSchema", () => {
  it("accepts a valid sponsor config payload", () => {
    const result = sponsorConfigSchema.safeParse({
      sponsorName: "Test Sponsor",
      sponsorPhoneE164: "+15555550123",
      callTimeLocalHhmm: "17:00",
      repeatUnit: SponsorRepeatUnit.WEEKLY,
      repeatInterval: 1,
      repeatDays: [SponsorRepeatDay.TUE],
      active: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects weekly payloads without day selections", () => {
    const result = sponsorConfigSchema.safeParse({
      sponsorName: "Test Sponsor",
      sponsorPhoneE164: "+15555550123",
      callTimeLocalHhmm: "17:00",
      repeatUnit: SponsorRepeatUnit.WEEKLY,
      repeatInterval: 1,
      repeatDays: [],
      active: true,
    });

    expect(result.success).toBe(false);
  });
});
