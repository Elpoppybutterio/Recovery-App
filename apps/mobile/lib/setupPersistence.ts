export interface SetupPersistenceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SetupPersistenceKeys {
  modeStorage: string;
  setupCompleteStorage: string;
  sobrietyDateStorage: string;
  profileStorage: string;
  ninetyDayGoalStorage: string;
  sponsorEnabledAtStorage: string;
}

export interface SetupPersistenceLogger {
  (event: string, detail?: Record<string, unknown>): void;
}

export interface SetupPersistenceProfilePayload {
  [key: string]: unknown;
}

export interface SetupPersistenceSnapshot {
  mode: string | null;
  setupComplete: boolean;
  sobrietyDateIso: string | null;
  profile: SetupPersistenceProfilePayload | null;
  ninetyDayGoalTarget: number | null;
  sponsorEnabledAtIso: string | null;
}

function safeJsonParse<T>(
  raw: string | null,
  label: string,
  logger?: SetupPersistenceLogger,
): T | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logger?.("read-fallback", {
      label,
      reason: "invalid-json",
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function safeGetItem(
  storage: SetupPersistenceStorage,
  key: string,
  label: string,
  logger?: SetupPersistenceLogger,
): Promise<string | null> {
  try {
    const value = await storage.getItem(key);
    logger?.("read-success", { label, found: value !== null });
    return value;
  } catch (error) {
    logger?.("read-fallback", {
      label,
      reason: "storage-read-failed",
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function readSetupPersistenceSnapshot(
  storage: SetupPersistenceStorage,
  keys: SetupPersistenceKeys,
  logger?: SetupPersistenceLogger,
): Promise<SetupPersistenceSnapshot> {
  logger?.("read-start", {});

  const [
    modeRaw,
    setupCompleteRaw,
    sobrietyDateRaw,
    profileRaw,
    ninetyDayGoalRaw,
    sponsorEnabledAtRaw,
  ] = await Promise.all([
    safeGetItem(storage, keys.modeStorage, "mode", logger),
    safeGetItem(storage, keys.setupCompleteStorage, "setupComplete", logger),
    safeGetItem(storage, keys.sobrietyDateStorage, "sobrietyDate", logger),
    safeGetItem(storage, keys.profileStorage, "profile", logger),
    safeGetItem(storage, keys.ninetyDayGoalStorage, "ninetyDayGoal", logger),
    safeGetItem(storage, keys.sponsorEnabledAtStorage, "sponsorEnabledAt", logger),
  ]);

  const parsedProfile = safeJsonParse<SetupPersistenceProfilePayload>(
    profileRaw,
    "profile",
    logger,
  );
  const parsedGoal =
    typeof ninetyDayGoalRaw === "string" && ninetyDayGoalRaw.trim().length > 0
      ? Number(ninetyDayGoalRaw)
      : null;

  const snapshot: SetupPersistenceSnapshot = {
    mode: modeRaw,
    setupComplete: setupCompleteRaw === "true",
    sobrietyDateIso:
      typeof sobrietyDateRaw === "string" && sobrietyDateRaw.trim().length > 0
        ? sobrietyDateRaw
        : null,
    profile: parsedProfile,
    ninetyDayGoalTarget: Number.isFinite(parsedGoal) ? Math.floor(parsedGoal as number) : null,
    sponsorEnabledAtIso:
      typeof sponsorEnabledAtRaw === "string" && sponsorEnabledAtRaw.trim().length > 0
        ? sponsorEnabledAtRaw
        : null,
  };

  logger?.("read-complete", {
    setupComplete: snapshot.setupComplete,
    hasProfile: snapshot.profile !== null,
    hasSobrietyDate: snapshot.sobrietyDateIso !== null,
  });
  return snapshot;
}

export async function writeSetupPersistenceSnapshot(
  storage: SetupPersistenceStorage,
  keys: SetupPersistenceKeys,
  snapshot: SetupPersistenceSnapshot,
  logger?: SetupPersistenceLogger,
): Promise<void> {
  logger?.("write-start", {
    setupComplete: snapshot.setupComplete,
    hasProfile: snapshot.profile !== null,
  });

  const writes: Promise<void>[] = [
    storage.setItem(keys.modeStorage, snapshot.mode ?? "A"),
    storage.setItem(keys.setupCompleteStorage, snapshot.setupComplete ? "true" : "false"),
    storage.setItem(keys.ninetyDayGoalStorage, String(snapshot.ninetyDayGoalTarget ?? 90)),
    storage.setItem(keys.profileStorage, JSON.stringify(snapshot.profile ?? {})),
  ];

  if (snapshot.sobrietyDateIso) {
    writes.push(storage.setItem(keys.sobrietyDateStorage, snapshot.sobrietyDateIso));
  } else {
    writes.push(storage.removeItem(keys.sobrietyDateStorage));
  }

  if (snapshot.sponsorEnabledAtIso) {
    writes.push(storage.setItem(keys.sponsorEnabledAtStorage, snapshot.sponsorEnabledAtIso));
  } else {
    writes.push(storage.removeItem(keys.sponsorEnabledAtStorage));
  }

  await Promise.all(writes);
  logger?.("write-success", {
    setupComplete: snapshot.setupComplete,
    hasProfile: snapshot.profile !== null,
  });
}

export async function writeSetupPersistenceSnapshotIfHydrated(
  storage: SetupPersistenceStorage,
  keys: SetupPersistenceKeys,
  snapshot: SetupPersistenceSnapshot,
  hydrated: boolean,
  logger?: SetupPersistenceLogger,
): Promise<boolean> {
  if (!hydrated) {
    logger?.("write-skip", {
      reason: "not-hydrated",
      setupComplete: snapshot.setupComplete,
    });
    return false;
  }

  await writeSetupPersistenceSnapshot(storage, keys, snapshot, logger);
  return true;
}
