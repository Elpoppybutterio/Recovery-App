import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DAILY_REFLECTIONS_URL,
  createDefaultRoutinesStore,
  createEmptyMorningRoutineDayState,
  createEmptyNightlyInventoryDayState,
} from "./defaults";
import type {
  MorningRoutineDayState,
  NightlyInventoryDayState,
  RecoveryRoutinesStore,
} from "./types";

const ROUTINES_STORAGE_KEY_PREFIX = "recovery:routines:v1:";

function debugRoutinesStorage(event: string, details: Record<string, unknown>) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(`[routines][storage] ${event}`, details);
  }
}

function hasOwnBooleanEnabled(value: unknown): value is { enabled: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, "enabled") &&
    typeof (value as { enabled?: unknown }).enabled === "boolean"
  );
}

function hasLegacyMorningHistoryForItem(
  morningByDate: RecoveryRoutinesStore["morningByDate"] | null | undefined,
  itemId: string,
): boolean {
  if (!morningByDate || typeof morningByDate !== "object") {
    return false;
  }

  return Object.values(morningByDate).some((day) => {
    const completedByItemId =
      day &&
      typeof day === "object" &&
      day.completedByItemId &&
      typeof day.completedByItemId === "object"
        ? day.completedByItemId
        : null;
    return Boolean(completedByItemId && itemId in completedByItemId);
  });
}

function inferLegacyEnabledValue(input: {
  parsedItem: Record<string, unknown> | undefined;
  defaultItem: Record<string, unknown>;
  morningByDate: RecoveryRoutinesStore["morningByDate"] | null | undefined;
}): boolean {
  const { parsedItem, defaultItem, morningByDate } = input;
  if (!parsedItem) {
    return false;
  }
  if (hasOwnBooleanEnabled(parsedItem)) {
    return parsedItem.enabled;
  }

  const itemId = typeof defaultItem.id === "string" ? defaultItem.id : "";
  if (itemId && hasLegacyMorningHistoryForItem(morningByDate, itemId)) {
    return true;
  }

  const voiceText = typeof parsedItem.voiceText === "string" ? parsedItem.voiceText.trim() : "";
  if (voiceText.length > 0) {
    return true;
  }

  const detail = typeof parsedItem.detail === "string" ? parsedItem.detail.trim() : "";
  if (detail.length > 0) {
    return true;
  }

  const readerUrl = typeof parsedItem.readerUrl === "string" ? parsedItem.readerUrl.trim() : "";
  const defaultReaderUrl =
    typeof defaultItem.readerUrl === "string" ? defaultItem.readerUrl.trim() : "";
  if (readerUrl.length > 0 && readerUrl !== defaultReaderUrl) {
    return true;
  }

  return false;
}

export function routinesStorageKey(userId: string): string {
  return `${ROUTINES_STORAGE_KEY_PREFIX}${userId}`;
}

export function dateKeyForRoutines(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function loadRoutinesStore(userId: string): Promise<RecoveryRoutinesStore> {
  const key = routinesStorageKey(userId);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      const defaultStore = createDefaultRoutinesStore();
      debugRoutinesStorage("load.miss", {
        userId,
        enabledCount: defaultStore.morningTemplate.items.filter((item) => item.enabled).length,
      });
      return defaultStore;
    }
    const parsed = JSON.parse(raw) as RecoveryRoutinesStore;
    if (!parsed || parsed.version !== 1) {
      const defaultStore = createDefaultRoutinesStore();
      debugRoutinesStorage("load.invalid_version", {
        userId,
        version: parsed?.version ?? null,
      });
      return defaultStore;
    }
    const defaultStore = createDefaultRoutinesStore();
    const mergedMorningTemplate = {
      ...defaultStore.morningTemplate,
      ...parsed.morningTemplate,
    };
    const parsedItemsById = new Map(
      (Array.isArray(parsed.morningTemplate?.items) ? parsed.morningTemplate.items : []).map(
        (item) => [item.id, item] as const,
      ),
    );
    const normalizedItems = defaultStore.morningTemplate.items.map((defaultItem) => {
      const parsedItem = parsedItemsById.get(defaultItem.id);
      const normalizedReaderUrl =
        defaultItem.id === "daily-reflections"
          ? typeof parsedItem?.readerUrl === "string" && parsedItem.readerUrl.trim().length > 0
            ? parsedItem.readerUrl
            : DAILY_REFLECTIONS_URL
          : (parsedItem?.readerUrl ?? defaultItem.readerUrl);

      return {
        ...defaultItem,
        ...parsedItem,
        id: defaultItem.id,
        title: defaultItem.title,
        readerLabel: defaultItem.readerLabel ?? parsedItem?.readerLabel,
        readerUrl: normalizedReaderUrl,
        enabled: inferLegacyEnabledValue({
          parsedItem: parsedItem as Record<string, unknown> | undefined,
          defaultItem: defaultItem as Record<string, unknown>,
          morningByDate: parsed.morningByDate ?? {},
        }),
      };
    });
    const dailyReflectionsLink =
      typeof mergedMorningTemplate.dailyReflectionsLink === "string" &&
      mergedMorningTemplate.dailyReflectionsLink.trim().length > 0
        ? mergedMorningTemplate.dailyReflectionsLink
        : DAILY_REFLECTIONS_URL;

    const normalizedStore = {
      ...defaultStore,
      ...parsed,
      morningTemplate: {
        ...mergedMorningTemplate,
        items: normalizedItems,
        dailyReflectionsLink,
      },
      morningByDate: parsed.morningByDate ?? {},
      nightlyByDate: parsed.nightlyByDate ?? {},
    };
    debugRoutinesStorage("load.hit", {
      userId,
      enabledCount: normalizedStore.morningTemplate.items.filter((item) => item.enabled).length,
      morningDayCount: Object.keys(normalizedStore.morningByDate).length,
    });
    return normalizedStore;
  } catch {
    const defaultStore = createDefaultRoutinesStore();
    debugRoutinesStorage("load.error", {
      userId,
    });
    return defaultStore;
  }
}

export async function saveRoutinesStore(
  userId: string,
  value: RecoveryRoutinesStore,
): Promise<void> {
  const key = routinesStorageKey(userId);
  debugRoutinesStorage("save", {
    userId,
    enabledCount: value.morningTemplate.items.filter((item) => item.enabled).length,
    morningDayCount: Object.keys(value.morningByDate).length,
  });
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export function getMorningDayState(
  store: RecoveryRoutinesStore,
  dateKey: string,
): MorningRoutineDayState {
  const empty = createEmptyMorningRoutineDayState(dateKey);
  const saved = store.morningByDate[dateKey];
  if (!saved) {
    return empty;
  }
  return {
    ...empty,
    ...saved,
    completedByItemId: saved.completedByItemId ?? {},
    prayerOnKneesByItemId: saved.prayerOnKneesByItemId ?? {},
    audioRefs: saved.audioRefs ?? {},
  };
}

export function getNightlyDayState(
  store: RecoveryRoutinesStore,
  dateKey: string,
): NightlyInventoryDayState {
  const empty = createEmptyNightlyInventoryDayState(dateKey);
  const saved = store.nightlyByDate[dateKey];
  if (!saved) {
    return empty;
  }
  const legacyPrompt =
    "At night, we constructively review our day. Were we resentful, selfish, dishonest, or afraid?";
  const normalizedPrompt =
    typeof saved.prompt === "string" && saved.prompt.trim().length > 0
      ? saved.prompt === legacyPrompt
        ? empty.prompt
        : saved.prompt
      : empty.prompt;

  return {
    ...empty,
    ...saved,
    prompt: normalizedPrompt,
    resentful: saved.resentful ?? [],
    selfSeeking: saved.selfSeeking ?? [],
    selfish: saved.selfish ?? [],
    dishonest: saved.dishonest ?? [],
    afraid: saved.afraid ?? [],
    apology: saved.apology ?? [],
  };
}
