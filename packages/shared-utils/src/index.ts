import { z } from "zod";

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, service: string, message: string, context?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    service,
    message,
    context: context ?? {},
  };

  console.log(JSON.stringify(payload));
}

export function createLogger(service: string) {
  return {
    info: (message: string, context?: Record<string, unknown>) =>
      log("info", service, message, context),
    warn: (message: string, context?: Record<string, unknown>) =>
      log("warn", service, message, context),
    error: (message: string, context?: Record<string, unknown>) =>
      log("error", service, message, context),
  };
}

export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  env: Record<string, unknown> = process.env,
) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.flatten().formErrors.join(", ")}`);
  }

  return parsed.data;
}
