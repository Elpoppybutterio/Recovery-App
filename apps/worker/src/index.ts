import { createLogger, parseEnv } from "@recovery/shared-utils";
import { z } from "zod";

const workerEnvSchema = z.object({
  WORKER_TEST_MODE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

const logger = createLogger("worker");

export async function runWorker(env: Record<string, unknown> = process.env): Promise<void> {
  const parsed = parseEnv(workerEnvSchema, env);

  logger.info("worker alive");

  if (parsed.WORKER_TEST_MODE) {
    logger.info("worker test mode enabled, exiting");
    return;
  }

  setInterval(() => {
    logger.info("worker heartbeat");
  }, 30_000);
}

if (require.main === module) {
  void runWorker().catch((error) => {
    logger.error("worker failed", { error: error instanceof Error ? error.message : "unknown" });
    process.exit(1);
  });
}
