import type {
  MorningRoutineDayState,
  MorningRoutineTemplate,
  NightlyInventoryDayState,
  RecoveryRoutinesStore,
} from "./types";

export const DAILY_REFLECTIONS_URL = "https://www.aa.org/daily-reflections";
export const DEFAULT_MEDITATION_SPOTIFY_URL =
  "https://open.spotify.com/show/6a9T4BCFksnSo9AukzU2Nx";
export const DEFAULT_MEDITATION_LINK_TITLE = "Spotify Meditation Show";

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export const DEFAULT_NIGHTLY_PROMPT =
  "At night, we constructively review our day. Were we resentful, selfish, self-seeking, dishonest, or afraid?";

export function createDefaultMorningRoutineTemplate(): MorningRoutineTemplate {
  return {
    items: [
      {
        id: "sponsor-check-in",
        title: "Sponsor Check-in",
        enabled: false,
        supportsPlay: false,
      },
      {
        id: "bb-60-63",
        title: "Big Book Reading #2: 60-63",
        enabled: false,
        supportsPlay: false,
        readerLabel: "Read",
        readerUrl: null,
        readerMode: "reader",
      },
      {
        id: "bb-86-88",
        title: "Big Book Reading #1: 86-88",
        enabled: false,
        supportsPlay: false,
        readerLabel: "Read",
        readerUrl: null,
        readerMode: "reader",
      },
      {
        id: "prayer-third-step",
        title: "3rd Step Prayer",
        enabled: false,
        supportsPlay: false,
        voiceText: "",
      },
      {
        id: "prayer-seventh-step",
        title: "7th Step Prayer",
        enabled: false,
        supportsPlay: false,
        voiceText: "",
      },
      {
        id: "prayer-eleventh-step",
        title: "11th Step AM Prayer",
        enabled: false,
        supportsPlay: false,
        voiceText: "",
      },
      {
        id: "daily-reflections",
        title: "Daily Reflections",
        enabled: false,
        supportsPlay: false,
        readerLabel: "Read",
        readerUrl: DAILY_REFLECTIONS_URL,
      },
      {
        id: "meditation",
        title: "Meditation",
        enabled: false,
        supportsPlay: false,
        readerLabel: "Open",
        readerUrl: DEFAULT_MEDITATION_SPOTIFY_URL,
        readerMode: "external",
      },
      {
        id: "additional-suggestions",
        title: "Additional Suggestions",
        enabled: false,
        supportsPlay: false,
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
        title: DEFAULT_MEDITATION_LINK_TITLE,
        url: DEFAULT_MEDITATION_SPOTIFY_URL,
      },
    ],
  };
}

export function createEmptyMorningRoutineDayState(dateKey: string): MorningRoutineDayState {
  return {
    dateKey,
    completedByItemId: {},
    prayerOnKneesByItemId: {},
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
    selfSeeking: [],
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
