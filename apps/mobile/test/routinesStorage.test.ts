import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultRoutinesStore } from "../lib/routines/defaults";
import { computeMorningRoutineStats } from "../lib/routines/stats";
import {
  getMorningDayState,
  loadRoutinesStore,
  routinesStorageKey,
  saveRoutinesStore,
} from "../lib/routines/storage";

const { storage } = vi.hoisted(() => ({
  storage: {
    getItem: vi.fn<(_: string) => Promise<string | null>>(),
    setItem: vi.fn<(_: string, __: string) => Promise<void>>(),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: storage,
}));

describe("routines storage", () => {
  beforeEach(() => {
    storage.getItem.mockReset();
    storage.setItem.mockReset();
  });

  it("persists and reloads enabled morning routine items", async () => {
    const store = createDefaultRoutinesStore();
    store.morningTemplate.items = store.morningTemplate.items.map((item) =>
      item.id === "prayer-third-step" ? { ...item, enabled: true } : item,
    );

    storage.getItem.mockResolvedValueOnce(JSON.stringify(store));

    await saveRoutinesStore("enduser-a1", store);
    const loaded = await loadRoutinesStore("enduser-a1");

    expect(storage.setItem).toHaveBeenCalledWith(
      routinesStorageKey("enduser-a1"),
      JSON.stringify(store),
    );
    expect(
      loaded.morningTemplate.items.find((item) => item.id === "prayer-third-step")?.enabled,
    ).toBe(true);
  });

  it("hydrates legacy routines without enabled by inferring from existing completion history", async () => {
    storage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        version: 1,
        morningTemplate: {
          items: [
            {
              id: "prayer-third-step",
              title: "3rd Step Prayer",
            },
          ],
          sponsorSuggestions: "",
          dailyReflectionsLink: "",
          dailyReflectionsText: "",
          customPrayers: [],
          meditationLinks: [],
        },
        morningByDate: {
          "2026-04-12": {
            dateKey: "2026-04-12",
            completedByItemId: {
              "prayer-third-step": "2026-04-12T08:00:00.000Z",
            },
            prayerOnKneesByItemId: {},
            notes: "",
            audioRefs: {},
            completedAt: "2026-04-12T08:00:00.000Z",
          },
        },
        nightlyByDate: {},
      }),
    );

    const loaded = await loadRoutinesStore("enduser-a1");

    expect(
      loaded.morningTemplate.items.find((item) => item.id === "prayer-third-step")?.enabled,
    ).toBe(true);
  });

  it("preserves enabled configuration across day rollover while daily execution resets by date", async () => {
    const store = createDefaultRoutinesStore();
    store.morningTemplate.items = store.morningTemplate.items.map((item) =>
      item.id === "daily-reflections" ? { ...item, enabled: true } : item,
    );
    store.morningByDate["2026-04-12"] = {
      dateKey: "2026-04-12",
      completedByItemId: {
        "daily-reflections": "2026-04-12T07:30:00.000Z",
      },
      prayerOnKneesByItemId: {},
      notes: "",
      audioRefs: {},
      completedAt: "2026-04-12T07:30:00.000Z",
    };

    const nextDayState = getMorningDayState(store, "2026-04-13");
    const nextDayStats = computeMorningRoutineStats(store, new Date("2026-04-13T12:00:00.000Z"));

    expect(
      store.morningTemplate.items.find((item) => item.id === "daily-reflections")?.enabled,
    ).toBe(true);
    expect(nextDayState.completedByItemId).toEqual({});
    expect(nextDayState.completedAt).toBeNull();
    expect(nextDayStats.todayTotalCount).toBe(1);
    expect(nextDayStats.todayCompletedCount).toBe(0);
  });

  it("returns the stored enabled state during launch hydration", async () => {
    const store = createDefaultRoutinesStore();
    store.morningTemplate.items = store.morningTemplate.items.map((item) =>
      item.id === "sponsor-check-in" ? { ...item, enabled: true } : item,
    );
    storage.getItem.mockResolvedValueOnce(JSON.stringify(store));

    const loaded = await loadRoutinesStore("enduser-a1");

    expect(
      loaded.morningTemplate.items.filter((item) => item.enabled).map((item) => item.id),
    ).toEqual(["sponsor-check-in"]);
  });
});
