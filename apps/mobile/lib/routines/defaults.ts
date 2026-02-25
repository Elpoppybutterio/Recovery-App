import type {
  MorningRoutineDayState,
  MorningRoutineTemplate,
  NightlyInventoryDayState,
  RecoveryRoutinesStore,
} from "./types";

export const DAILY_REFLECTIONS_URL = "https://www.aa.org/daily-reflections";

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export const DEFAULT_NIGHTLY_PROMPT =
  "At night, we constructively review our day. Were we resentful, selfish, dishonest, or afraid?";

export function createDefaultMorningRoutineTemplate(): MorningRoutineTemplate {
  return {
    items: [
      {
        id: "sponsor-check-in",
        title: "Sponsor check-in / suggestions",
      },
      {
        id: "bb-86-88",
        title: "Big Book reading: Pages 86-88",
        readerLabel: "Open Reader",
        readerUrl: null,
      },
      {
        id: "bb-60-63",
        title: "Big Book reading: Pages 60-63",
        readerLabel: "Open Reader",
        readerUrl: null,
      },
      {
        id: "prayer-third-step",
        title: "Prayer: 3rd Step",
        voiceText: "",
      },
      {
        id: "prayer-seventh-step",
        title: "Prayer: 7th Step",
        voiceText: "",
      },
      {
        id: "meditation",
        title: "Meditation",
      },
      {
        id: "daily-reflections",
        title: "Daily Reflections",
        readerLabel: "Read",
        readerUrl: DAILY_REFLECTIONS_URL,
      },
    ],
    sponsorSuggestions: "",
    dailyReflectionsLink: DAILY_REFLECTIONS_URL,
    dailyReflectionsText:
      "Add your licensed Daily Reflections source link or your own reflection text.",
    customPrayers: [
      {
        id: createId("prayer"),
        title: "Custom Prayer",
        text: "",
      },
    ],
    meditationLinks: [
      {
        id: createId("meditation"),
        title: "Meditation Link",
        url: "",
      },
    ],
  };
}

export function createEmptyMorningRoutineDayState(dateKey: string): MorningRoutineDayState {
  return {
    dateKey,
    completedByItemId: {},
    notes: "",
    audioRefs: {},
    completedAt: null,
  };
}

export function createEmptyNightlyInventoryDayState(dateKey: string): NightlyInventoryDayState {
  return {
    dateKey,
    prompt: DEFAULT_NIGHTLY_PROMPT,
    resentful: [],
    selfish: [],
    dishonest: [],
    afraid: [],
    apology: [],
    notes: "",
    completedAt: null,
  };
}

export function createDefaultRoutinesStore(): RecoveryRoutinesStore {
  return {
    version: 1,
    morningTemplate: createDefaultMorningRoutineTemplate(),
    morningByDate: {},
    nightlyByDate: {},
  };
}
