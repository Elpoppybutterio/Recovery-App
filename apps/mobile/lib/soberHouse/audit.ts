import { MAX_SOBER_HOUSE_AUDIT_LOG_ENTRIES, createEntityId } from "./defaults";
import type {
  AuditActor,
  AuditLogEntry,
  SoberHouseEntityType,
  SoberHouseSettingsStore,
} from "./types";

const AUDIT_IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt", "organizationId"]);

function stableSerialize(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (typeof value === "object") {
    const sorted = Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = valueAsStableObjectValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
    return JSON.stringify(sorted);
  }

  return String(value);
}

function valueAsStableObjectValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => valueAsStableObjectValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = valueAsStableObjectValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function flattenFields(
  value: Record<string, unknown> | null,
  prefix = "",
  output: Record<string, string | null> = {},
): Record<string, string | null> {
  if (!value) {
    return output;
  }

  for (const [key, rawValue] of Object.entries(value)) {
    if (AUDIT_IGNORED_FIELDS.has(key)) {
      continue;
    }

    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (
      rawValue &&
      typeof rawValue === "object" &&
      !Array.isArray(rawValue) &&
      !(rawValue instanceof Date)
    ) {
      flattenFields(rawValue as Record<string, unknown>, fieldPath, output);
      continue;
    }

    output[fieldPath] = stableSerialize(rawValue);
  }

  return output;
}

export function buildAuditEntriesForChange(
  actor: AuditActor,
  entityType: SoberHouseEntityType,
  entityId: string,
  previousValue: Record<string, unknown> | null,
  nextValue: Record<string, unknown> | null,
  timestamp: string,
): AuditLogEntry[] {
  const previousFields = flattenFields(previousValue);
  const nextFields = flattenFields(nextValue);
  const allKeys = new Set([...Object.keys(previousFields), ...Object.keys(nextFields)]);
  const entries: AuditLogEntry[] = [];

  for (const key of Array.from(allKeys).sort()) {
    const oldValue = previousFields[key] ?? null;
    const newValue = nextFields[key] ?? null;
    if (oldValue === newValue) {
      continue;
    }

    entries.push({
      id: createEntityId("audit"),
      actor,
      timestamp,
      entityType,
      entityId,
      fieldChanged: key,
      oldValue,
      newValue,
    });
  }

  return entries;
}

export function appendAuditEntries(
  store: SoberHouseSettingsStore,
  entries: AuditLogEntry[],
): SoberHouseSettingsStore {
  if (entries.length === 0) {
    return store;
  }

  const nextEntries = [...entries, ...store.auditLogEntries].slice(
    0,
    MAX_SOBER_HOUSE_AUDIT_LOG_ENTRIES,
  );
  return {
    ...store,
    auditLogEntries: nextEntries,
  };
}
