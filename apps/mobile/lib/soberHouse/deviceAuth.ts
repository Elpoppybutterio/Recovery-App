import type { SoberHouseAccessRole } from "./types";

export function requiresSoberHouseDeviceUnlock(
  role: SoberHouseAccessRole | null | undefined,
): boolean {
  return role === "OWNER_OPERATOR" || role === "HOUSE_RESIDENT";
}
