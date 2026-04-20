export function resolveRuntimeDevUserId(input: {
  configuredUserId: string;
  overrideUserId: string | null | undefined;
  signedOut: boolean;
}): string {
  if (input.signedOut) {
    return "";
  }

  const overrideUserId =
    typeof input.overrideUserId === "string" ? input.overrideUserId.trim() : "";
  if (overrideUserId.length > 0) {
    return overrideUserId;
  }

  return input.configuredUserId.trim();
}

export function resolveStorageScopedDevUserId(input: {
  configuredUserId: string;
  runtimeUserId: string;
}): string {
  const runtimeUserId = input.runtimeUserId.trim();
  if (runtimeUserId.length > 0) {
    return runtimeUserId;
  }

  return input.configuredUserId.trim();
}

export function resolveRuntimeDevUserDisplayName(input: {
  explicitDisplayName: string | null | undefined;
  seededDisplayName: string | null | undefined;
  runtimeUserId: string;
  configuredUserId: string;
}): string {
  const explicitDisplayName =
    typeof input.explicitDisplayName === "string" ? input.explicitDisplayName.trim() : "";
  if (explicitDisplayName.length > 0) {
    return explicitDisplayName;
  }

  const seededDisplayName =
    typeof input.seededDisplayName === "string" ? input.seededDisplayName.trim() : "";
  if (seededDisplayName.length > 0) {
    return seededDisplayName;
  }

  const runtimeUserId = input.runtimeUserId.trim();
  if (runtimeUserId.length > 0) {
    return runtimeUserId;
  }

  return input.configuredUserId.trim();
}
