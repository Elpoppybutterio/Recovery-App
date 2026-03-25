import { beforeEach, describe, expect, it } from "vitest";
import {
  readSetupPersistenceSnapshot,
  writeSetupPersistenceSnapshot,
  writeSetupPersistenceSnapshotIfHydrated,
  type SetupPersistenceKeys,
  type SetupPersistenceLogger,
  type SetupPersistenceStorage,
} from "../lib/setupPersistence";

class MemoryStorage implements SetupPersistenceStorage {
  private values = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    Object.entries(initial ?? {}).forEach(([key, value]) => {
      this.values.set(key, value);
    });
  }

  async getItem(key: string): Promise<string | null> {
    return this.values.has(key) ? (this.values.get(key) ?? null) : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const keys: SetupPersistenceKeys = {
  modeStorage: "mode",
  setupCompleteStorage: "setup",
  sobrietyDateStorage: "sobrietyDate",
  profileStorage: "profile",
  ninetyDayGoalStorage: "goal",
  sponsorEnabledAtStorage: "sponsorEnabledAt",
};

describe("setup persistence", () => {
  let events: Array<{ event: string; detail?: Record<string, unknown> }>;
  let logger: SetupPersistenceLogger;

  beforeEach(() => {
    events = [];
    logger = (event, detail) => {
      events.push({ event, detail });
    };
  });

  it("hydrates existing saved setup data on launch", async () => {
    const storage = new MemoryStorage({
      mode: "A",
      setup: "true",
      sobrietyDate: "2026-03-01",
      goal: "120",
      sponsorEnabledAt: "2026-03-05T00:00:00.000Z",
      profile: JSON.stringify({
        sponsorName: "Sam",
        recoverySubstances: ["ALCOHOL"],
        wizardSupervisionMode: "INDEPENDENT",
      }),
    });

    const snapshot = await readSetupPersistenceSnapshot(storage, keys, logger);

    expect(snapshot.mode).toBe("A");
    expect(snapshot.setupComplete).toBe(true);
    expect(snapshot.sobrietyDateIso).toBe("2026-03-01");
    expect(snapshot.ninetyDayGoalTarget).toBe(120);
    expect(snapshot.sponsorEnabledAtIso).toBe("2026-03-05T00:00:00.000Z");
    expect(snapshot.profile?.sponsorName).toBe("Sam");
    expect(events.map((entry) => entry.event)).toContain("read-complete");
  });

  it("does not overwrite persisted data with defaults before hydration", async () => {
    const storage = new MemoryStorage({
      setup: "true",
      profile: JSON.stringify({ sponsorName: "Persisted Name" }),
      goal: "150",
    });

    const wrote = await writeSetupPersistenceSnapshotIfHydrated(
      storage,
      keys,
      {
        mode: "A",
        setupComplete: false,
        sobrietyDateIso: null,
        profile: { sponsorName: "" },
        ninetyDayGoalTarget: 90,
        sponsorEnabledAtIso: null,
      },
      false,
      logger,
    );

    expect(wrote).toBe(false);
    expect(await storage.getItem(keys.setupCompleteStorage)).toBe("true");
    expect(await storage.getItem(keys.ninetyDayGoalStorage)).toBe("150");
    expect(await storage.getItem(keys.profileStorage)).toBe(
      JSON.stringify({ sponsorName: "Persisted Name" }),
    );
    expect(events.at(-1)?.event).toBe("write-skip");
  });

  it("saves updated setup data and restores it after simulated relaunch", async () => {
    const storage = new MemoryStorage();

    await writeSetupPersistenceSnapshot(
      storage,
      keys,
      {
        mode: "A",
        setupComplete: true,
        sobrietyDateIso: "2026-02-14",
        profile: {
          sponsorName: "Casey",
          wizardJusticeTrack: "DRUG_COURT",
        },
        ninetyDayGoalTarget: 365,
        sponsorEnabledAtIso: "2026-02-15T00:00:00.000Z",
      },
      logger,
    );

    const restored = await readSetupPersistenceSnapshot(storage, keys, logger);

    expect(restored.setupComplete).toBe(true);
    expect(restored.sobrietyDateIso).toBe("2026-02-14");
    expect(restored.ninetyDayGoalTarget).toBe(365);
    expect(restored.profile?.sponsorName).toBe("Casey");
    expect(restored.profile?.wizardJusticeTrack).toBe("DRUG_COURT");
  });

  it("falls back safely when the stored payload is invalid", async () => {
    const storage = new MemoryStorage({
      setup: "true",
      goal: "abc",
      profile: "{not-json",
    });

    const snapshot = await readSetupPersistenceSnapshot(storage, keys, logger);

    expect(snapshot.setupComplete).toBe(true);
    expect(snapshot.profile).toBeNull();
    expect(snapshot.ninetyDayGoalTarget).toBeNull();
    expect(events.some((entry) => entry.event === "read-fallback")).toBe(true);
  });
});
