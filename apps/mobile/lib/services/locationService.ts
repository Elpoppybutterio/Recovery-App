import * as Location from "expo-location";
import { Platform } from "react-native";

export type LocationPermissionState = "unknown" | "granted" | "denied" | "unavailable";
export type LocationReadFailureReason =
  | "none"
  | "permission_denied"
  | "services_disabled"
  | "position_unavailable"
  | "timeout"
  | "unavailable";

export type LocationCoords = {
  lat: number;
  lng: number;
  accuracyM: number | null;
};

export type LocationReadResult = {
  coords: LocationCoords | null;
  permissionStatus: LocationPermissionState;
  alwaysPermissionStatus: LocationPermissionState;
  timedOut: boolean;
  servicesEnabled: boolean | null;
  failureReason: LocationReadFailureReason;
};

type ExpoPermission = {
  granted: boolean;
  canAskAgain?: boolean;
};

type ExpoPosition = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  };
};

const locationCompat = Location as unknown as {
  getBackgroundPermissionsAsync?: () => Promise<ExpoPermission>;
  requestBackgroundPermissionsAsync?: () => Promise<ExpoPermission>;
  hasServicesEnabledAsync?: () => Promise<boolean>;
  getLastKnownPositionAsync?: () => Promise<ExpoPosition | null>;
};

let cachedLocation: { value: LocationCoords; capturedAtMs: number } | null = null;
let foregroundPrompted = false;
let backgroundPrompted = false;

function toPermissionState(permission: ExpoPermission | null): LocationPermissionState {
  if (!permission) {
    return "unavailable";
  }
  if (permission.granted) {
    return "granted";
  }
  return permission.canAskAgain === false ? "denied" : "unknown";
}

async function getAlwaysPermission(): Promise<ExpoPermission | null> {
  if (Platform.OS === "ios") {
    return null;
  }
  if (typeof locationCompat.getBackgroundPermissionsAsync !== "function") {
    return null;
  }
  try {
    return await locationCompat.getBackgroundPermissionsAsync();
  } catch {
    return null;
  }
}

async function getLocationServicesEnabled(): Promise<boolean | null> {
  if (typeof locationCompat.hasServicesEnabledAsync !== "function") {
    return null;
  }
  try {
    return await locationCompat.hasServicesEnabledAsync();
  } catch {
    return null;
  }
}

function toLocationCoords(position: ExpoPosition): LocationCoords {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyM: position.coords.accuracy ?? null,
  };
}

export async function refreshLocationPermissionStates(): Promise<{
  permissionStatus: LocationPermissionState;
  alwaysPermissionStatus: LocationPermissionState;
}> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    const background = await getAlwaysPermission();
    return {
      permissionStatus: toPermissionState(foreground),
      alwaysPermissionStatus: toPermissionState(background),
    };
  } catch {
    return {
      permissionStatus: "unavailable",
      alwaysPermissionStatus: "unavailable",
    };
  }
}

export async function getCurrentLocation(options?: {
  requestPermission?: boolean;
  timeoutMs?: number;
  cacheTtlMs?: number;
}): Promise<LocationReadResult> {
  const requestPermission = options?.requestPermission ?? false;
  const timeoutMs = options?.timeoutMs ?? 12_000;
  const cacheTtlMs = options?.cacheTtlMs ?? 45_000;

  if (cachedLocation && Date.now() - cachedLocation.capturedAtMs <= cacheTtlMs) {
    const permissionStates = await refreshLocationPermissionStates();
    const servicesEnabled = await getLocationServicesEnabled();
    return {
      coords: cachedLocation.value,
      permissionStatus: permissionStates.permissionStatus,
      alwaysPermissionStatus: permissionStates.alwaysPermissionStatus,
      timedOut: false,
      servicesEnabled,
      failureReason: "none",
    };
  }

  try {
    const servicesEnabled = await getLocationServicesEnabled();
    if (servicesEnabled === false) {
      const permissionStates = await refreshLocationPermissionStates();
      return {
        coords: null,
        permissionStatus: permissionStates.permissionStatus,
        alwaysPermissionStatus: permissionStates.alwaysPermissionStatus,
        timedOut: false,
        servicesEnabled: false,
        failureReason: "services_disabled",
      };
    }

    const foregroundCurrent = await Location.getForegroundPermissionsAsync();
    const foregroundCanAskAgain =
      "canAskAgain" in foregroundCurrent
        ? (foregroundCurrent as { canAskAgain?: boolean }).canAskAgain
        : true;
    const shouldPromptForeground =
      !foregroundCurrent.granted &&
      requestPermission &&
      (!foregroundPrompted || foregroundCanAskAgain !== false);

    const foreground = shouldPromptForeground
      ? await Location.requestForegroundPermissionsAsync()
      : foregroundCurrent;
    if (shouldPromptForeground) {
      foregroundPrompted = true;
    }

    if (!foreground.granted) {
      const background = await getAlwaysPermission();
      return {
        coords: null,
        permissionStatus: toPermissionState(foreground),
        alwaysPermissionStatus: toPermissionState(background),
        timedOut: false,
        servicesEnabled,
        failureReason: "permission_denied",
      };
    }

    const position =
      timeoutMs > 0
        ? await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }),
            new Promise<null>((resolve) => {
              setTimeout(() => resolve(null), timeoutMs);
            }),
          ])
        : await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

    const background = await getAlwaysPermission();

    if (!position) {
      const lastKnown =
        typeof locationCompat.getLastKnownPositionAsync === "function"
          ? await locationCompat.getLastKnownPositionAsync()
          : null;
      if (lastKnown) {
        const coords = toLocationCoords(lastKnown);
        cachedLocation = { value: coords, capturedAtMs: Date.now() };
        return {
          coords,
          permissionStatus: "granted",
          alwaysPermissionStatus: toPermissionState(background),
          timedOut: true,
          servicesEnabled,
          failureReason: "timeout",
        };
      }

      return {
        coords: cachedLocation?.value ?? null,
        permissionStatus: "granted",
        alwaysPermissionStatus: toPermissionState(background),
        timedOut: true,
        servicesEnabled,
        failureReason: cachedLocation ? "timeout" : "position_unavailable",
      };
    }

    const coords: LocationCoords = toLocationCoords(position);
    cachedLocation = { value: coords, capturedAtMs: Date.now() };

    return {
      coords,
      permissionStatus: "granted",
      alwaysPermissionStatus: toPermissionState(background),
      timedOut: false,
      servicesEnabled,
      failureReason: "none",
    };
  } catch {
    const permissionStates = await refreshLocationPermissionStates();
    const servicesEnabled = await getLocationServicesEnabled();
    return {
      coords: cachedLocation?.value ?? null,
      permissionStatus: permissionStates.permissionStatus,
      alwaysPermissionStatus: permissionStates.alwaysPermissionStatus,
      timedOut: false,
      servicesEnabled,
      failureReason: cachedLocation ? "timeout" : "unavailable",
    };
  }
}

export async function requestAlwaysLocationPermission(): Promise<{
  permissionStatus: LocationPermissionState;
  alwaysPermissionStatus: LocationPermissionState;
}> {
  if (Platform.OS === "ios") {
    try {
      const foregroundCurrent = await Location.getForegroundPermissionsAsync();
      return {
        permissionStatus: toPermissionState(foregroundCurrent),
        alwaysPermissionStatus: "unavailable",
      };
    } catch {
      return {
        permissionStatus: "unavailable",
        alwaysPermissionStatus: "unavailable",
      };
    }
  }
  try {
    const foregroundCurrent = await Location.getForegroundPermissionsAsync();
    const foreground = foregroundCurrent.granted
      ? foregroundCurrent
      : await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) {
      return {
        permissionStatus: toPermissionState(foreground),
        alwaysPermissionStatus: "unknown",
      };
    }

    if (typeof locationCompat.requestBackgroundPermissionsAsync !== "function") {
      return {
        permissionStatus: "granted",
        alwaysPermissionStatus: "unavailable",
      };
    }

    const backgroundCurrent = await getAlwaysPermission();
    const shouldPromptBackground =
      backgroundCurrent !== null &&
      !backgroundCurrent.granted &&
      (!backgroundPrompted || backgroundCurrent.canAskAgain !== false);

    const background = shouldPromptBackground
      ? await locationCompat.requestBackgroundPermissionsAsync()
      : backgroundCurrent;
    if (shouldPromptBackground) {
      backgroundPrompted = true;
    }

    return {
      permissionStatus: "granted",
      alwaysPermissionStatus: toPermissionState(background),
    };
  } catch {
    return {
      permissionStatus: "unavailable",
      alwaysPermissionStatus: "unavailable",
    };
  }
}

export function clearLocationCache(): void {
  cachedLocation = null;
}
