import type { SoberHouseAccessRole } from "./types";

export const SOBER_HOUSE_PROTECTED_SESSION_TIMEOUT_MS = 10 * 60 * 1000;

export function requiresSoberHouseDeviceUnlock(
  role: SoberHouseAccessRole | null | undefined,
): boolean {
  return role === "HOUSE_RESIDENT";
}

export function isSoberHouseProtectedSessionExpired(
  lastActivityAtMs: number | null,
  nowMs: number,
  timeoutMs = SOBER_HOUSE_PROTECTED_SESSION_TIMEOUT_MS,
): boolean {
  if (lastActivityAtMs === null) {
    return true;
  }

  return nowMs - lastActivityAtMs >= timeoutMs;
}
