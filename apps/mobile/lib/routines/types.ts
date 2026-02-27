export type RoutineChecklistItem = {
  id: string;
  title: string;
  enabled: boolean;
  detail?: string;
  readerLabel?: string;
  readerUrl?: string | null;
  voiceText?: string;
};

export type CustomPrayer = {
  id: string;
  title: string;
  text: string;
};

export type MeditationLink = {
  id: string;
  title: string;
  url: string;
};

export type MorningRoutineTemplate = {
  items: RoutineChecklistItem[];
  sponsorSuggestions: string;
  dailyReflectionsLink: string;
  dailyReflectionsText: string;
  customPrayers: CustomPrayer[];
  meditationLinks: MeditationLink[];
};

export type MorningRoutineDayState = {
  dateKey: string;
  completedByItemId: Record<string, string>;
  prayerOnKneesByItemId: Record<string, boolean>;
  notes: string;
  audioRefs: Record<string, string>;
  completedAt: string | null;
};

export type NightlyInventoryEntry = {
  id: string;
  text: string;
  fear?: string | null;
};

export type NightlyInventoryDayState = {
  dateKey: string;
  prompt: string;
  gotOnKneesCompleted: boolean;
  eleventhStepPrayerEnabled: boolean;
  eleventhStepPrayerCompletedAt: string | null;
  resentful: NightlyInventoryEntry[];
  selfSeeking: NightlyInventoryEntry[];
  selfish: NightlyInventoryEntry[];
  dishonest: NightlyInventoryEntry[];
  afraid: NightlyInventoryEntry[];
  apology: NightlyInventoryEntry[];
  notes: string;
  completedAt: string | null;
};

export type RecoveryRoutinesStore = {
  version: 1;
  morningTemplate: MorningRoutineTemplate;
  morningByDate: Record<string, MorningRoutineDayState>;
  nightlyByDate: Record<string, NightlyInventoryDayState>;
};

export type MorningRoutineStats = {
  streakDays: number;
  last30CompletionPct: number;
  todayCompletedCount: number;
  todayTotalCount: number;
};

export type NightlyInventoryStats = {
  todayCompleted: boolean;
  todayIssueCount: number;
};

export type RoutineInsights = {
  averageIssuesOnMorningCompleteDays: number;
  averageIssuesOnMorningIncompleteDays: number;
  trend: "up" | "down" | "flat";
};
