import type {
  MorningRoutineDayState,
  MorningRoutineTemplate,
  NightlyInventoryDayState,
  RecoveryRoutinesStore,
} from "./types";
import {
  MORNING_READY_ITEM_ID,
  MORNING_READY_READ_TEXT,
  MORNING_READY_TITLE,
} from "./morningReady";

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
        title: "Sponsor Check-in",
        enabled: false,
      },
      {
        id: "bb-86-88",
        title: "Big Book Reading #1: 86-88",
        enabled: false,
        readerLabel: "Read",
        readerUrl: null,
      },
      {
        id: "bb-60-63",
        title: "Big Book Reading #2: 60-63",
        enabled: false,
        readerLabel: "Read",
        readerUrl: null,
      },
      {
        id: "prayer-third-step",
        title: "3rd Step Prayer",
        enabled: false,
        voiceText: "",
      },
      {
        id: "prayer-seventh-step",
        title: "7th Step Prayer",
        enabled: false,
        voiceText: "",
      },
      {
        id: MORNING_READY_ITEM_ID,
        title: MORNING_READY_TITLE,
        enabled: false,
        voiceText: MORNING_READY_READ_TEXT,
      },
      {
        id: "prayer-eleventh-step",
        title: "11th Step AM Prayer",
        enabled: false,
        voiceText: "",
      },
      {
        id: "daily-reflections",
        title: "Daily Reflections",
        enabled: false,
        readerLabel: "Read",
        readerUrl: DAILY_REFLECTIONS_URL,
      },
      {
        id: "meditation",
        title: "Meditation",
        enabled: false,
      },
      {
        id: "additional-suggestions",
        title: "Additional Suggestions",
        enabled: false,
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
    gotOnKneesCompleted: false,
    notes: "",
    audioRefs: {},
    completedAt: null,
  };
}

export function createEmptyNightlyInventoryDayState(dateKey: string): NightlyInventoryDayState {
  return {
    dateKey,
    prompt: DEFAULT_NIGHTLY_PROMPT,
    gotOnKneesCompleted: false,
    eleventhStepPrayerEnabled: false,
    eleventhStepPrayerCompletedAt: null,
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
