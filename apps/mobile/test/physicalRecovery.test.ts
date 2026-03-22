import { describe, expect, it } from "vitest";
import {
  RECOVERY_SUBSTANCE_OPTIONS,
  buildPhysicalRecoveryViewModel,
} from "../lib/physicalRecovery";

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
    expect(view.summary.gauges).toEqual([
      expect.objectContaining({
        id: "mental",
        percent: 0,
        statusLabel: "Not set",
      }),
      expect.objectContaining({
        id: "physical",
        percent: 0,
        statusLabel: "Not set",
      }),
    ]);
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
    expect(
      firstMonth.summary.gauges.find((gauge) => gauge.id === "physical")?.percent,
    ).toBeLessThan(
      laterMonths.summary.gauges.find((gauge) => gauge.id === "physical")?.percent ?? 0,
    );
    expect(firstMonth.summary.gauges.find((gauge) => gauge.id === "mental")?.percent).toBeLessThan(
      laterMonths.summary.gauges.find((gauge) => gauge.id === "mental")?.percent ?? 0,
    );
  });

  it("includes marijuana and kratom in the selectable substance options", () => {
    expect(RECOVERY_SUBSTANCE_OPTIONS.map((option) => option.value)).toEqual([
      "ALCOHOL",
      "OPIOIDS",
      "METH_STIMULANTS",
      "MARIJUANA",
      "KRATOM",
    ]);
  });

  it("supports marijuana and kratom timelines in the physical recovery view", () => {
    const view = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-02-01",
      nowMs: new Date("2026-03-20T18:00:00.000Z").getTime(),
      substances: ["MARIJUANA", "KRATOM"],
    });

    expect(view.hasProfile).toBe(true);
    expect(view.substanceTracks.map((track) => track.substance)).toEqual(["MARIJUANA", "KRATOM"]);
    expect(view.detailItems.map((item) => item.title)).toEqual([
      "Marijuana timeline",
      "Marijuana up next",
      "Kratom timeline",
      "Kratom up next",
    ]);
    expect(view.summary.gauges.map((gauge) => gauge.label)).toEqual([
      "Mental repair",
      "Physical repair",
    ]);
  });

  it("builds separate mental and physical weekly detail panels from the same recovery window", () => {
    const view = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-03-01",
      nowMs: new Date("2026-03-20T18:00:00.000Z").getTime(),
      substances: ["ALCOHOL"],
    });

    expect(view.summary.headline).toBe("Recovery Repair");
    expect(view.lensDetails.mental.label).toBe("Mental repair");
    expect(view.lensDetails.mental.primaryTitle).toBe(
      "What may be happening in your brain chemistry",
    );
    expect(view.lensDetails.mental.secondaryTitle).toBe("What to expect in thoughts and emotions");
    expect(view.lensDetails.physical.label).toBe("Physical repair");
    expect(view.lensDetails.physical.primaryTitle).toBe(
      "What physical healing may still be happening",
    );
    expect(view.lensDetails.physical.secondaryTitle).toBe("How this usually presents");
    expect(view.lensDetails.physical.primaryPoints[0]).toContain("Alcohol:");
  });
});
