import { describe, expect, it } from "vitest";
import { buildPhysicalRecoveryViewModel } from "../lib/physicalRecovery";

describe("physical recovery timeline", () => {
  it("shows a recovery-profile CTA when substances are missing", () => {
    const view = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-03-01",
      nowMs: new Date("2026-03-18T18:00:00.000Z").getTime(),
      substances: [],
    });

    expect(view.hasProfile).toBe(false);
    expect(view.summary.headline).toBe("Add recovery profile details");
    expect(view.summary.ctaLabel).toBe("Open Recovery Settings");
    expect(view.detailItems).toHaveLength(0);
  });

  it("matches alcohol-only users to the current stage and next stage", () => {
    const view = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-03-01",
      nowMs: new Date("2026-03-18T18:00:00.000Z").getTime(),
      substances: ["ALCOHOL"],
    });

    expect(view.hasProfile).toBe(true);
    expect(view.summary.stageLabel).toBe("Alcohol • First weeks");
    expect(view.summary.nextLabel).toBe("Next: First 90 days");
    expect(view.currentFocus?.title).toBe("Alcohol recovery right now");
    expect(view.detailItems.map((item) => item.title)).toEqual([
      "Alcohol timeline",
      "Alcohol up next",
    ]);
  });

  it("blends alcohol and opioid content without duplicating the current-focus card", () => {
    const view = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-03-01",
      nowMs: new Date("2026-03-18T18:00:00.000Z").getTime(),
      substances: ["ALCOHOL", "OPIOIDS"],
    });

    expect(view.summary.stageLabel).toBe("First weeks");
    expect(view.summary.snapshot).toContain("Alcohol + Opioids");
    expect(view.currentFocus?.title).toBe("Current priorities in recovery");
    expect(view.detailItems.some((item) => item.title === "Current priorities in recovery")).toBe(
      false,
    );
    expect(view.detailItems.map((item) => item.title)).toEqual([
      "Alcohol timeline",
      "Alcohol up next",
      "Opioids timeline",
      "Opioids up next",
    ]);
  });

  it("supports alcohol and meth/stimulants together with a blended upcoming summary", () => {
    const view = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-01-01",
      nowMs: new Date("2026-05-30T18:00:00.000Z").getTime(),
      substances: ["ALCOHOL", "METH_STIMULANTS"],
    });

    expect(view.summary.stageLabel).toBe("3-6 months");
    expect(view.summary.nextLabel).toContain("6-12 months");
    expect(view.substanceTracks.map((track) => track.substance)).toEqual([
      "ALCOHOL",
      "METH_STIMULANTS",
    ]);
  });

  it("advances the current stage as sobriety time increases", () => {
    const firstMonth = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-01-01",
      nowMs: new Date("2026-01-20T18:00:00.000Z").getTime(),
      substances: ["OPIOIDS"],
    });
    const laterMonths = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-01-01",
      nowMs: new Date("2026-06-20T18:00:00.000Z").getTime(),
      substances: ["OPIOIDS"],
    });

    expect(firstMonth.summary.stageLabel).toBe("Opioids • First weeks");
    expect(laterMonths.summary.stageLabel).toBe("Opioids • 3-6 months");
    expect(laterMonths.currentFocus?.stageTimeWindow).toBe("3-6 months");
  });
});
