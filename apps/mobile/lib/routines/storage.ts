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
      return createDefaultRoutinesStore();
    }
    const parsed = JSON.parse(raw) as RecoveryRoutinesStore;
    if (!parsed || parsed.version !== 1) {
      return createDefaultRoutinesStore();
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
        enabled: parsedItem?.enabled === true,
      };
    });
    const dailyReflectionsLink =
      typeof mergedMorningTemplate.dailyReflectionsLink === "string" &&
      mergedMorningTemplate.dailyReflectionsLink.trim().length > 0
        ? mergedMorningTemplate.dailyReflectionsLink
        : DAILY_REFLECTIONS_URL;

    return {
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
  } catch {
    return createDefaultRoutinesStore();
  }
}

export async function saveRoutinesStore(
  userId: string,
  value: RecoveryRoutinesStore,
): Promise<void> {
  const key = routinesStorageKey(userId);
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
  return {
    ...empty,
    ...saved,
    resentful: saved.resentful ?? [],
    selfSeeking: saved.selfSeeking ?? [],
    selfish: saved.selfish ?? [],
    dishonest: saved.dishonest ?? [],
    afraid: saved.afraid ?? [],
    apology: saved.apology ?? [],
  };
}
