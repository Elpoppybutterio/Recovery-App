import { parseEnv } from "@recovery/shared-utils";
import { z } from "zod";

function parseBooleanString(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.toLowerCase().trim();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  return value;
}

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/recovery_app"),
  ENABLE_DEV_AUTH: z.preprocess(parseBooleanString, z.boolean().optional()),
  LOG_LEVEL: z.enum(["info", "warn", "error"]).default("info"),
  MEETING_FEEDS_AA: z.string().default(""),
  MEETING_FEEDS_NA: z.string().default(""),
  MEETING_IMPORT_RADIUS_MILES: z.coerce.number().positive().default(20),
  MEETING_GUIDE_FEEDS_JSON: z.string().default("[]"),
  MEETING_GUIDE_DEFAULT_TENANT_ID: z.string().optional(),
  MEETING_GUIDE_REFRESH_INTERVAL_MS: z.coerce.number().positive().default(43_200_000),
  MEETING_GUIDE_AUTO_INGEST: z.preprocess(parseBooleanString, z.boolean().optional()),
});

type ParsedApiEnv = z.infer<typeof apiEnvSchema>;

export type ApiEnv = ParsedApiEnv & {
  ENABLE_DEV_AUTH: boolean;
  MEETING_GUIDE_AUTO_INGEST: boolean;
};

export function loadApiEnv(env: Record<string, unknown> = process.env): ApiEnv {
  const parsed = parseEnv(apiEnvSchema, env);
  return {
    ...parsed,
    ENABLE_DEV_AUTH: parsed.ENABLE_DEV_AUTH ?? parsed.NODE_ENV !== "production",
    MEETING_GUIDE_AUTO_INGEST: parsed.MEETING_GUIDE_AUTO_INGEST ?? parsed.NODE_ENV !== "test",
  };
}
