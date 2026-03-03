#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const expectedApiUrl = "https://sober-ai-api.onrender.com";
const expectedVersion = process.env.RELEASE_EXPECTED_VERSION || "1.0.0";
const expectedChannels = {
  development: "development",
  preview: "preview",
  production: "production",
};

const errors = [];
const notes = [];

function fail(message) {
  errors.push(message);
}

function note(message) {
  notes.push(message);
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    fail(`${filePath}: unable to read/parse JSON (${String(error)})`);
    return null;
  }
}

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertProfileEnv(configLabel, buildConfig, profileName) {
  const profile = buildConfig[profileName];
  if (!profile || typeof profile !== "object") {
    fail(`${configLabel}: missing build.${profileName}`);
    return;
  }

  const env = profile.env;
  if (!env || typeof env !== "object") {
    fail(`${configLabel}: build.${profileName}.env must exist`);
    return;
  }

  if (!hasNonEmptyString(env.APP_ENV)) {
    fail(`${configLabel}: build.${profileName}.env.APP_ENV is required`);
  }

  if (!hasNonEmptyString(env.EXPO_PUBLIC_API_URL)) {
    fail(`${configLabel}: build.${profileName}.env.EXPO_PUBLIC_API_URL is required`);
  } else if (env.EXPO_PUBLIC_API_URL.trim() !== expectedApiUrl) {
    fail(`${configLabel}: build.${profileName}.env.EXPO_PUBLIC_API_URL must be ${expectedApiUrl}`);
  }

  const expectedChannel = expectedChannels[profileName];
  if (!hasNonEmptyString(profile.channel) || profile.channel !== expectedChannel) {
    fail(`${configLabel}: build.${profileName}.channel must be "${expectedChannel}"`);
  }
}

function auditEasJson(filePath, label) {
  const config = readJson(filePath);
  if (!config) {
    return;
  }

  if (!config.build || typeof config.build !== "object") {
    fail(`${label}: missing build object`);
    return;
  }

  assertProfileEnv(label, config.build, "development");
  assertProfileEnv(label, config.build, "preview");
  assertProfileEnv(label, config.build, "production");

  const production = config.build.production;
  if (!production || typeof production !== "object") {
    fail(`${label}: missing build.production`);
  } else {
    if (production.distribution !== "store") {
      fail(`${label}: build.production.distribution must be "store"`);
    }
    if (production.autoIncrement !== true) {
      fail(`${label}: build.production.autoIncrement must be true`);
    }

    const devOnlyEnvKeys = [
      "EXPO_PUBLIC_ENABLE_DEV_UI",
      "EXPO_PUBLIC_DEV_AUTH_ENABLED",
      "EXPO_PUBLIC_USE_DEV_DATA",
      "EXPO_PUBLIC_BYPASS_AUTH",
    ];
    for (const key of devOnlyEnvKeys) {
      const value = production.env?.[key];
      if (value === true || value === "true" || value === "1" || value === 1) {
        fail(`${label}: production env must not enable dev-only flag ${key}`);
      }
    }
  }

  note(`${label}: checked build profiles and env parity`);
}

function auditAppConfig() {
  const appJsonPath = path.join("apps", "mobile", "app.json");
  const appConfigTsPath = path.join("apps", "mobile", "app.config.ts");
  const featureFlagsPath = path.join("apps", "mobile", "lib", "config", "featureFlags.ts");

  const appJson = readJson(appJsonPath);
  if (!appJson || typeof appJson !== "object") {
    return;
  }

  const expo = appJson.expo || {};
  const version = expo.version;
  if (!hasNonEmptyString(version)) {
    fail(`${appJsonPath}: expo.version must be set`);
  } else if (version !== expectedVersion) {
    fail(`${appJsonPath}: expo.version must be ${expectedVersion} for this RC gate`);
  }

  const iosInfoPlist = expo.ios?.infoPlist || {};
  const iosBackgroundModes = Array.isArray(iosInfoPlist.UIBackgroundModes)
    ? iosInfoPlist.UIBackgroundModes
    : [];
  const androidPermissions = Array.isArray(expo.android?.permissions)
    ? expo.android.permissions
    : [];
  const shipsLocationFeatures =
    iosBackgroundModes.includes("location") ||
    androidPermissions.includes("ACCESS_FINE_LOCATION") ||
    androidPermissions.includes("ACCESS_BACKGROUND_LOCATION");

  if (shipsLocationFeatures) {
    const requiredKeys = [
      "NSLocationWhenInUseUsageDescription",
      "NSLocationAlwaysAndWhenInUseUsageDescription",
      "NSLocationAlwaysUsageDescription",
    ];
    for (const key of requiredKeys) {
      if (!hasNonEmptyString(iosInfoPlist[key])) {
        fail(`${appJsonPath}: ios.infoPlist.${key} is required when location features are enabled`);
      }
    }
  }

  try {
    const appConfigSource = fs.readFileSync(appConfigTsPath, "utf8");
    const versionMatch = appConfigSource.match(/version:\s*"([^"]+)"/);
    if (!versionMatch) {
      fail(`${appConfigTsPath}: could not find static version string`);
    } else if (versionMatch[1] !== expectedVersion) {
      fail(`${appConfigTsPath}: version must be ${expectedVersion} for this RC gate`);
    }

    const requiredLocationKeys = [
      "NSLocationWhenInUseUsageDescription",
      "NSLocationAlwaysAndWhenInUseUsageDescription",
      "NSLocationAlwaysUsageDescription",
    ];
    for (const key of requiredLocationKeys) {
      if (!appConfigSource.includes(key)) {
        fail(`${appConfigTsPath}: missing ${key}`);
      }
    }
  } catch (error) {
    fail(`${appConfigTsPath}: unable to read (${String(error)})`);
  }

  try {
    const featureFlagsSource = fs.readFileSync(featureFlagsPath, "utf8");
    const devFlagEnabled = [
      ...featureFlagsSource.matchAll(/([A-Za-z0-9_]*dev[A-Za-z0-9_]*)\s*:\s*true/gi),
    ];
    if (devFlagEnabled.length > 0) {
      const keys = devFlagEnabled.map((match) => match[1]).join(", ");
      fail(`${featureFlagsPath}: dev-only flags enabled: ${keys}`);
    }
  } catch (error) {
    fail(`${featureFlagsPath}: unable to read (${String(error)})`);
  }

  note("App config: checked location usage descriptions, dev-only flags, and RC version");
}

function main() {
  auditEasJson(path.join("eas.json"), "root eas.json");
  auditEasJson(path.join("apps", "mobile", "eas.json"), "apps/mobile/eas.json");
  auditAppConfig();

  if (errors.length > 0) {
    console.error("\nrelease:audit FAILED\n");
    for (const message of errors) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }

  console.log("\nrelease:audit PASSED\n");
  for (const message of notes) {
    console.log(`- ${message}`);
  }
}

main();
