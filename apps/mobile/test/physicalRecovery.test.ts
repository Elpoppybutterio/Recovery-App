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
    expect(view.summary.headline).toBe("Physical Recovery");
    expect(view.summary.stageLabel).toBe("Personalize this guide");
    expect(view.summary.ctaLabel).toBe("Open Recovery Settings");
    expect(view.detailItems).toHaveLength(0);
  });

  it("adapts alcohol-only users into the week-based physical recovery guide", () => {
    const view = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-03-01",
      nowMs: new Date("2026-03-18T18:00:00.000Z").getTime(),
      substances: ["ALCOHOL"],
    });

    expect(view.hasProfile).toBe(true);
    expect(view.summary.headline).toBe("Physical Recovery");
    expect(view.summary.stageLabel).toBe("Alcohol • Week 3");
    expect(view.summary.ctaLabel).toBe("View guide");
    expect(view.summary.snapshot).toContain("Weeks 2-4");
    expect(view.summary.nextLabel).toContain("baseline is often stronger");
    expect(view.currentFocus?.title).toBe("Alcohol recovery right now");
    expect(view.currentFocus?.stageTimeWindow).toBe("Week 3");
    expect(view.detailItems.map((item) => item.title)).toEqual(["Alcohol recovery right now"]);
  });

  it("uses the slowest-recovering selected substance to drive the physical gauge summary", () => {
    const view = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-03-01",
      nowMs: new Date("2026-03-18T18:00:00.000Z").getTime(),
      substances: ["ALCOHOL", "OPIOIDS"],
    });

    expect(view.summary.stageLabel).toBe("Opioids • Week 3");
    expect(view.summary.snapshot).toContain("Weeks 2-4");
    expect(view.summary.nextLabel).toContain("setting the pace right now");
    expect(view.currentFocus?.title).toBe("Opioids recovery right now");
    expect(view.detailItems.map((item) => item.title)).toEqual(["Opioids recovery right now"]);
    expect(view.substanceTracks.map((track) => track.substance)).toEqual(["ALCOHOL", "OPIOIDS"]);
  });

  it("supports week-based summaries for multi-substance stimulant recovery", () => {
    const view = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-01-01",
      nowMs: new Date("2026-05-30T18:00:00.000Z").getTime(),
      substances: ["ALCOHOL", "METH_STIMULANTS"],
    });

    expect(view.summary.stageLabel).toBe("Meth / stimulants • Week 22");
    expect(view.summary.nextLabel).toContain("setting the pace right now");
    expect(view.currentFocus?.stageTimeWindow).toBe("Week 22");
    expect(view.substanceTracks.map((track) => track.substance)).toEqual([
      "ALCOHOL",
      "METH_STIMULANTS",
    ]);
  });

  it("advances the week-based stage as sobriety time increases", () => {
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

    expect(firstMonth.summary.stageLabel).toBe("Opioids • Week 3");
    expect(laterMonths.summary.stageLabel).toMatch(/^Opioids • Week \d+$/);
    expect(laterMonths.currentFocus?.stageTimeWindow).toMatch(/^Week \d+$/);

    const firstWeek = Number(firstMonth.summary.stageLabel.split("Week ")[1]);
    const laterWeek = Number(laterMonths.summary.stageLabel.split("Week ")[1]);
    expect(laterWeek).toBeGreaterThan(firstWeek);
  });

  it("supports marijuana and kratom in the physical recovery model", () => {
    const view = buildPhysicalRecoveryViewModel({
      sobrietyDateIso: "2026-03-01",
      nowMs: new Date("2026-04-20T18:00:00.000Z").getTime(),
      substances: ["MARIJUANA", "KRATOM"],
    });

    expect(view.hasProfile).toBe(true);
    expect(view.substanceTracks.map((track) => track.substance)).toEqual(["MARIJUANA", "KRATOM"]);
    expect(view.summary.stageLabel).toMatch(/^(Marijuana|Kratom) • Week \d+$/);
    expect(view.currentFocus?.title).toMatch(/^(Marijuana|Kratom) recovery right now$/);
  });
});
