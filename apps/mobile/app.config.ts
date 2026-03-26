type ConfigContext = import("expo/config").ConfigContext;
type ExpoConfig = import("expo/config").ExpoConfig;
type AppEnv = "development" | "preview" | "production";
type JsEngine = "hermes" | "jsc";

const DEFAULT_PROD_BUNDLE_ID = "com.rabbithole.soberai";
const DEFAULT_RENDER_API_URL = "https://sober-ai-api.onrender.com";
const APP_SCHEME = "soberai";
const APP_VERSION = "0.1.33";
const IOS_BUILD_NUMBER = "57";
const ANDROID_VERSION_CODE = 57;

function resolveProdBundleIdentifier() {
  const envValue = process.env.APP_BUNDLE_ID?.trim();
  if (envValue) return envValue;
  return DEFAULT_PROD_BUNDLE_ID;
}

function resolveAppEnv(rawValue: string | undefined): AppEnv {
  const value = rawValue?.trim().toLowerCase();

  if (value === "production") return "production";
  if (value === "preview") return "preview";
  if (value === "development") return "development";

  if (process.env.EAS_BUILD_PROFILE === "production") return "production";
  if (process.env.EAS_BUILD_PROFILE === "preview") return "preview";
  if (process.env.CONFIGURATION === "Release") return "production";

  return "development";
}

function resolveBundleIdentifier(appEnv: AppEnv): string {
  const prodBundleId = resolveProdBundleIdentifier();
  if (appEnv === "production" || appEnv === "preview") {
    return prodBundleId;
  }
  return `${prodBundleId}.dev`;
}

function resolveAppName(appEnv: AppEnv): string {
  if (appEnv === "production") return "Sober²";
  if (appEnv === "preview") return "Sober² Preview";
  return "Sober² Dev";
}

function resolveIosBuildNumber(appEnv: AppEnv): string {
  const envValue = process.env.IOS_BUILD_NUMBER?.trim();
  if (envValue) return envValue;

  if (appEnv === "production" || appEnv === "preview") {
    return IOS_BUILD_NUMBER;
  }
  return "1";
}

function resolveAndroidVersionCode(appEnv: AppEnv): number {
  const parsedFromEnv = Number.parseInt(process.env.ANDROID_VERSION_CODE ?? "", 10);
  if (Number.isFinite(parsedFromEnv) && parsedFromEnv > 0) {
    return parsedFromEnv;
  }

  if (appEnv === "production" || appEnv === "preview") {
    return ANDROID_VERSION_CODE;
  }
  return 1;
}

function resolveApiUrl(appEnv: AppEnv): string {
  const envValue = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envValue) {
    return envValue.replace(/\/+$/, "");
  }

  if (appEnv === "preview" || appEnv === "production") {
    return DEFAULT_RENDER_API_URL;
  }

  return "";
}

function resolveJsEngine(): JsEngine {
  const raw = process.env.EXPO_JS_ENGINE?.trim().toLowerCase();
  if (raw === "jsc") return "jsc";
  return "hermes";
}

function resolveNewArchEnabled(): boolean {
  const raw = process.env.EXPO_NEW_ARCH_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

module.exports = ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = resolveAppEnv(process.env.APP_ENV);
  const bundleIdentifier = resolveBundleIdentifier(appEnv);
  const iosBuildNumber = resolveIosBuildNumber(appEnv);
  const androidVersionCode = resolveAndroidVersionCode(appEnv);
  const apiUrl = resolveApiUrl(appEnv);
  const jsEngine = resolveJsEngine();
  const newArchEnabled = resolveNewArchEnabled();
  const runtimeVersion = APP_VERSION;

  const updatesConfig =
    appEnv === "production"
      ? config.updates
      : {
          enabled: false,
          checkAutomatically: "NEVER" as const,
          fallbackToCacheTimeout: 0,
        };

  return {
    ...config,
    name: resolveAppName(appEnv),
    slug: "sober-ai",
    icon: "./assets/icon.png",
    version: APP_VERSION,
    runtimeVersion,
    orientation: "portrait",
    scheme: APP_SCHEME,
    userInterfaceStyle: "light",
    jsEngine,
    newArchEnabled,
    ios: {
      ...config.ios,
      icon: "./assets/icon.png",
      bundleIdentifier,
      buildNumber: iosBuildNumber,
      runtimeVersion,
      infoPlist: {
        ...config.ios?.infoPlist,
        ITSAppUsesNonExemptEncryption: false,
        NSFaceIDUsageDescription:
          "Use Face ID or your device passcode to unlock sober-house records.",
        NSCalendarsUsageDescription:
          "SoberAI uses your calendar to add recovery meetings, sober house obligations, and accountability appointments you choose to save.",
        NSCalendarsWriteOnlyAccessUsageDescription:
          "SoberAI uses calendar access to create recovery meetings, sober house obligations, and accountability appointments at your request.",
        NSCalendarsFullAccessUsageDescription:
          "SoberAI uses calendar access to create and update recovery meetings, service commitments, sober house obligations, and accountability appointments you choose to save.",
        NSRemindersUsageDescription:
          "SoberAI uses reminders access only when needed to support recovery calendar items you choose to save.",
        NSRemindersFullAccessUsageDescription:
          "SoberAI uses reminders access only when needed to support recovery calendar items you choose to save.",
        NSLocationWhenInUseUsageDescription:
          "Sober AI uses your location while the app is open to show nearby meetings, estimate distance, and confirm arrival when you start attendance.",
        UIBackgroundModes: ["fetch", "remote-notification"],
      },
    },
    android: {
      ...config.android,
      package: bundleIdentifier,
      versionCode: androidVersionCode,
      adaptiveIcon: {
        foregroundImage: "./assets/icon-foreground.png",
        backgroundImage: "./assets/icon-background.png",
      },
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "READ_CALENDAR",
        "WRITE_CALENDAR",
      ],
    },
    assetBundlePatterns: ["**/*"],
    updates: updatesConfig,
    extra: {
      ...config.extra,
      apiUrl,
      devAuthUserId: appEnv === "development" ? "enduser-a1" : "",
      devUserDisplayName: appEnv === "development" ? "DEV User" : "",
      meetingFeedUrl: "",
      supervisionEnabled: false,
      enableSponsorApiSync: false,
      appEnv,
      appScheme: APP_SCHEME,
      appBundleIdentifier: bundleIdentifier,
      eas: {
        ...(config.extra?.eas ?? {}),
        projectId: "b4ee8eed-aaa7-4aa9-870a-e796c31c8f51",
      },
    },
  };
};
