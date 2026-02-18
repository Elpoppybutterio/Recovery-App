import { createLogger, parseEnv } from "@recovery/shared-utils";
import { z } from "zod";
import {
  InMemoryNotificationEventsStore,
  processNotificationEvents,
  type NotificationEventsStore,
  type NotificationSender,
} from "./notification-events";

const workerEnvSchema = z.object({
  WORKER_TEST_MODE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().default(30_000),
});

const logger = createLogger("worker");

export async function runWorker(
  env: Record<string, unknown> = process.env,
  options: {
    store?: NotificationEventsStore;
    sender?: NotificationSender;
    now?: () => Date;
  } = {},
): Promise<void> {
  const parsed = parseEnv(workerEnvSchema, env);
  const store = options.store ?? new InMemoryNotificationEventsStore();

  logger.info("worker alive");

  const poll = async () => {
    const result = await processNotificationEvents({
      store,
      sender: options.sender,
      now: options.now,
      logger,
    });
    logger.info("notification.poll.complete", result);
  };

  if (parsed.WORKER_TEST_MODE) {
    await poll();
    logger.info("worker test mode enabled, exiting");
    return;
  }

  await poll();
  setInterval(() => {
    void poll();
  }, parsed.WORKER_POLL_INTERVAL_MS);
}

if (require.main === module) {
  void runWorker().catch((error) => {
    logger.error("worker failed", { error: error instanceof Error ? error.message : "unknown" });
    process.exit(1);
  });
}
