import type { ConfigContext, ExpoConfig } from "expo/config";

type AppEnv = "development" | "preview" | "production";

const DEFAULT_PROD_BUNDLE_ID = "com.rabbithole.soberai";
const DEFAULT_RENDER_API_URL = "https://sober-ai-api.onrender.com";
const APP_SCHEME = "soberai";

function resolveProdBundleIdentifier(): string {
  const envValue = process.env.APP_BUNDLE_ID?.trim();
  if (envValue && envValue.length > 0) {
    return envValue;
  }
  return DEFAULT_PROD_BUNDLE_ID;
}

function resolveAppEnv(rawValue: string | undefined): AppEnv {
  if (rawValue === "preview") {
    return "preview";
  }
  if (rawValue === "production") {
    return "production";
  }
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
  if (appEnv === "production") {
    return "Sober AI";
  }
  if (appEnv === "preview") {
    return "Sober AI Preview";
  }
  return "Sober AI Dev";
}

function resolveIosBuildNumber(appEnv: AppEnv): string {
  if (appEnv === "production") {
    return process.env.IOS_BUILD_NUMBER ?? "1";
  }
  if (appEnv === "preview") {
    return process.env.IOS_BUILD_NUMBER ?? "1";
  }
  return process.env.IOS_BUILD_NUMBER ?? "1";
}

function resolveAndroidVersionCode(appEnv: AppEnv): number {
  const parsedFromEnv = Number.parseInt(process.env.ANDROID_VERSION_CODE ?? "", 10);
  if (Number.isFinite(parsedFromEnv) && parsedFromEnv > 0) {
    return parsedFromEnv;
  }
  if (appEnv === "production") {
    return 1;
  }
  if (appEnv === "preview") {
    return 1;
  }
  return 1;
}

function resolveApiUrl(appEnv: AppEnv): string {
  const envValue = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envValue && envValue.length > 0) {
    return envValue.replace(/\/+$/, "");
  }

  if (appEnv === "preview" || appEnv === "production") {
    return DEFAULT_RENDER_API_URL;
  }

  return "";
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = resolveAppEnv(process.env.APP_ENV);
  const bundleIdentifier = resolveBundleIdentifier(appEnv);
  const iosBuildNumber = resolveIosBuildNumber(appEnv);
  const androidVersionCode = resolveAndroidVersionCode(appEnv);
  const apiUrl = resolveApiUrl(appEnv);

  return {
    ...config,
    name: resolveAppName(appEnv),
    slug: "sober-ai",
    icon: "./assets/icon.png",
    version: "0.9.5",
    orientation: "portrait",
    scheme: APP_SCHEME,
    userInterfaceStyle: "light",
    ios: {
      ...config.ios,
      icon: "./assets/icon.png",
      bundleIdentifier,
      buildNumber: iosBuildNumber,
      infoPlist: {
        ...config.ios?.infoPlist,
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription: "We use your location to show distance to meetings.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "We use your location to show distance to meetings and enable geofence features if you turn them on.",
        NSLocationAlwaysUsageDescription:
          "We use your location to show distance to meetings and enable geofence features if you turn them on.",
        UIBackgroundModes: ["location"],
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
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "ACCESS_BACKGROUND_LOCATION"],
    },
    assetBundlePatterns: ["**/*"],
    extra: {
      ...config.extra,
      apiUrl,
      devAuthUserId: "enduser-a1",
      devUserDisplayName: "DEV User",
      meetingFeedUrl: "",
      supervisionEnabled: false,
      enableSponsorApiSync: false,
      appEnv,
      appScheme: APP_SCHEME,
      appBundleIdentifier: bundleIdentifier,
    },
  };
};
