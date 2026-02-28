import type { ConfigContext, ExpoConfig } from "expo/config";

type AppEnv = "development" | "preview" | "production";

const PROD_BUNDLE_ID = "com.recovery.accountability";
const APP_SCHEME = "soberai";

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
  if (appEnv === "production") {
    return PROD_BUNDLE_ID;
  }
  if (appEnv === "preview") {
    return `${PROD_BUNDLE_ID}.preview`;
  }
  return `${PROD_BUNDLE_ID}.dev`;
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

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = resolveAppEnv(process.env.APP_ENV);
  const bundleIdentifier = resolveBundleIdentifier(appEnv);
  const iosBuildNumber = resolveIosBuildNumber(appEnv);
  const androidVersionCode = resolveAndroidVersionCode(appEnv);

  return {
    ...config,
    name: resolveAppName(appEnv),
    slug: "sober-ai",
    icon: "./assets/icon.png",
    version: "0.1.0",
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
        NSLocationWhenInUseUsageDescription:
          "Location is used to show nearby meetings and arrival prompts.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "Always location is used to auto-log meeting attendance when you arrive at a meeting geofence.",
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
      apiUrl: "",
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
