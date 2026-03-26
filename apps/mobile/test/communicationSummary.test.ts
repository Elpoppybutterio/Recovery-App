import { describe, expect, it } from "vitest";
import { buildCommunicationNotificationSummary } from "../lib/communication/summary";

describe("communication summary copy", () => {
  it("uses release-safe copy for justice mode", () => {
    const summary = buildCommunicationNotificationSummary({
      mode: "JUSTICE",
      sponsorEnabled: false,
      sponsorActive: false,
      soberHouseSetupPending: false,
      soberHouseChatSummaries: [],
      soberHouseViolationSummary: null,
    });

    expect(summary.title).toBe("Messages & Alerts");
    expect(summary.subtitle).toBe("Current accountability reminders and alerts for this profile.");
    expect(summary.subtitle.toLowerCase()).not.toContain("will appear here");
    expect(summary.subtitle.toLowerCase()).not.toContain("coming soon");
  });

  it("keeps recovery mode focused on active sponsor communication", () => {
    const summary = buildCommunicationNotificationSummary({
      mode: "RECOVERY",
      sponsorEnabled: true,
      sponsorActive: true,
      soberHouseSetupPending: false,
      soberHouseChatSummaries: [],
      soberHouseViolationSummary: null,
    });

    expect(summary.subtitle).toBe("Recovery reminders and sponsor communication status.");
    expect(summary.items).toEqual([
      expect.objectContaining({
        title: "Sponsor reminders active",
        detail: "Sponsor call reminders are enabled from Recovery Settings.",
      }),
    ]);
  });
});
