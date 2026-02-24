import AsyncStorage from "@react-native-async-storage/async-storage";
import {
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
    return {
      ...createDefaultRoutinesStore(),
      ...parsed,
      morningTemplate: {
        ...createDefaultRoutinesStore().morningTemplate,
        ...parsed.morningTemplate,
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
  return store.morningByDate[dateKey] ?? createEmptyMorningRoutineDayState(dateKey);
}

export function getNightlyDayState(
  store: RecoveryRoutinesStore,
  dateKey: string,
): NightlyInventoryDayState {
  return store.nightlyByDate[dateKey] ?? createEmptyNightlyInventoryDayState(dateKey);
}
