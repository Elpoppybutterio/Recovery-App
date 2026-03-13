const fs = require("fs");
const path = require("path");

function patchFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  let source = fs.readFileSync(filePath, "utf8");
  let changed = false;

  for (const [from, to] of replacements) {
    if (source.includes(from)) {
      source = source.replace(from, to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, source);
  }

  return changed;
}

const expoCalendarRoot = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "node_modules",
  ".pnpm",
);

const entries = fs
  .readdirSync(expoCalendarRoot)
  .filter((entry) => entry.startsWith("expo-calendar@15.0.8"));

if (entries.length === 0) {
  console.warn("expo-calendar package not found; skipping write-only calendar patch.");
  process.exit(0);
}

for (const entry of entries) {
  const packageRoot = path.join(
    expoCalendarRoot,
    entry,
    "node_modules",
    "expo-calendar",
  );

  patchFile(path.join(packageRoot, "ios", "Requesters", "CalendarPermissionsRequester.swift"), [
    [
      'return "NSCalendarsFullAccessUsageDescription"',
      'return "NSCalendarsWriteOnlyAccessUsageDescription"',
    ],
    [
      "case .restricted, .denied, .writeOnly:",
      "case .restricted, .denied:",
    ],
    [
      "case .fullAccess:",
      "case .writeOnly, .fullAccess:",
    ],
    [
      "eventStore.requestFullAccessToEvents { [weak self] _, error in",
      "eventStore.requestWriteOnlyAccessToEvents { [weak self] _, error in",
    ],
  ]);

  patchFile(path.join(packageRoot, "plugin", "build", "withCalendar.js"), [
    [
      "        NSCalendarsUsageDescription: CALENDARS_USAGE,\n        NSRemindersUsageDescription: REMINDERS_USAGE,\n        NSCalendarsFullAccessUsageDescription: CALENDARS_USAGE,\n        NSRemindersFullAccessUsageDescription: REMINDERS_USAGE,\n",
      "        NSCalendarsWriteOnlyAccessUsageDescription: CALENDARS_USAGE,\n        NSRemindersUsageDescription: REMINDERS_USAGE,\n        NSRemindersFullAccessUsageDescription: REMINDERS_USAGE,\n",
    ],
    [
      "        NSCalendarsUsageDescription: calendarPermission,\n        NSRemindersUsageDescription: remindersPermission,\n        NSCalendarsFullAccessUsageDescription: calendarPermission,\n        NSRemindersFullAccessUsageDescription: remindersPermission,\n",
      "        NSCalendarsWriteOnlyAccessUsageDescription: calendarPermission,\n        NSRemindersUsageDescription: remindersPermission,\n        NSRemindersFullAccessUsageDescription: remindersPermission,\n",
    ],
  ]);

  patchFile(path.join(packageRoot, "plugin", "src", "withCalendar.ts"), [
    [
      "    NSCalendarsUsageDescription: CALENDARS_USAGE,\n    NSRemindersUsageDescription: REMINDERS_USAGE,\n    NSCalendarsFullAccessUsageDescription: CALENDARS_USAGE,\n    NSRemindersFullAccessUsageDescription: REMINDERS_USAGE,\n",
      "    NSCalendarsWriteOnlyAccessUsageDescription: CALENDARS_USAGE,\n    NSRemindersUsageDescription: REMINDERS_USAGE,\n    NSRemindersFullAccessUsageDescription: REMINDERS_USAGE,\n",
    ],
    [
      "    NSCalendarsUsageDescription: calendarPermission,\n    NSRemindersUsageDescription: remindersPermission,\n    NSCalendarsFullAccessUsageDescription: calendarPermission,\n    NSRemindersFullAccessUsageDescription: remindersPermission,\n",
      "    NSCalendarsWriteOnlyAccessUsageDescription: calendarPermission,\n    NSRemindersUsageDescription: remindersPermission,\n    NSRemindersFullAccessUsageDescription: remindersPermission,\n",
    ],
  ]);
}
