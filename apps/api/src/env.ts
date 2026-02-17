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
});

type ParsedApiEnv = z.infer<typeof apiEnvSchema>;

export type ApiEnv = ParsedApiEnv & {
  ENABLE_DEV_AUTH: boolean;
};

export function loadApiEnv(env: Record<string, unknown> = process.env): ApiEnv {
  const parsed = parseEnv(apiEnvSchema, env);
  return {
    ...parsed,
    ENABLE_DEV_AUTH: parsed.ENABLE_DEV_AUTH ?? parsed.NODE_ENV !== "production",
  };
}
