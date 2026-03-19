import { describe, expect, it } from "vitest";
import {
  buildRecoveryMilestoneTileSummary,
  buildRecoveryMilestoneRoadmap,
  buildSobrietyMilestones,
  getDaysSober,
  getExactRecoveryMilestone,
  getNextRecoveryMilestone,
} from "../lib/recoveryMilestones";

describe("recovery milestones", () => {
  it("keeps day counting stable across DST boundaries", () => {
    expect(getDaysSober("2026-03-07", new Date("2026-03-10T18:00:00.000Z").getTime())).toBe(3);
  });

  it("uses month-based milestones and resolves the 6 month coin after 149 days sober", () => {
    const nowMs = new Date("2026-05-30T18:00:00.000Z").getTime();
    const summary = buildRecoveryMilestoneTileSummary("2026-01-01", nowMs);

    expect(getDaysSober("2026-01-01", nowMs)).toBe(149);
    expect(summary?.heading).toBe("Next Recovery Milestone");
    expect(summary?.label).toBe("6 Months");
    expect(summary?.coinLabel).toBe("6M");
    expect(summary?.daysRemaining).toBe(32);
  });

  it("detects exact benchmark days and advances to yearly milestones after one year", () => {
    const exact = getExactRecoveryMilestone(
      "2025-03-18",
      new Date("2026-03-18T12:00:00.000Z").getTime(),
    );
    const exactSummary = buildRecoveryMilestoneTileSummary(
      "2025-03-18",
      new Date("2026-03-18T12:00:00.000Z").getTime(),
    );
    const next = getNextRecoveryMilestone(
      "2024-03-18",
      new Date("2026-03-19T12:00:00.000Z").getTime(),
    );

    expect(exact?.label).toBe("1 Year");
    expect(exactSummary?.heading).toBe("Recovery Milestone Today");
    expect(next?.label).toBe("3 Years");
    expect(next?.coinLabel).toBe("3Y");
  });

  it("keeps calendar milestone generation limited to the fixed benchmark set", () => {
    const milestones = buildSobrietyMilestones("2026-01-01");

    expect(milestones.map((entry) => entry.id)).not.toContain("2Y");
    expect(milestones.map((entry) => entry.id)).not.toContain("3Y");
    expect(milestones.find((entry) => entry.id === "1Y")?.milestoneDateIso).toBe("2027-01-01");
  });

  it("builds a roadmap with achieved milestones followed by upcoming ones", () => {
    const roadmap = buildRecoveryMilestoneRoadmap(
      "2026-01-01",
      new Date("2026-05-30T18:00:00.000Z").getTime(),
      3,
    );

    expect(roadmap.find((entry) => entry.id === "30D")?.status).toBe("achieved");
    expect(roadmap.find((entry) => entry.id === "90D")?.status).toBe("achieved");
    expect(roadmap.find((entry) => entry.id === "6M")?.status).toBe("upcoming");
    expect(roadmap[roadmap.length - 1]?.id).toBe("1Y");
  });
});
