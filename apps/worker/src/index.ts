import { createLogger, parseEnv } from "@recovery/shared-utils";
import { z } from "zod";
import {
  InMemoryNotificationEventsStore,
  processNotificationEvents,
  type NotificationEventsStore,
  type NotificationSender,
} from "./notification-events";
import {
  InMemoryMeetingsIngestStore,
  ingestMeetingsFeeds,
  parseMeetingFeedUrls,
  type MeetingsIngestStore,
} from "./meetings-ingest";

const workerEnvSchema = z.object({
  WORKER_TEST_MODE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().default(30_000),
  MEETING_FEEDS_AA: z.string().default(""),
  MEETING_FEEDS_NA: z.string().default(""),
});

const logger = createLogger("worker");

export async function runWorker(
  env: Record<string, unknown> = process.env,
  options: {
    store?: NotificationEventsStore;
    sender?: NotificationSender;
    meetingsStore?: MeetingsIngestStore;
    now?: () => Date;
  } = {},
): Promise<void> {
  const parsed = parseEnv(workerEnvSchema, env);
  const store = options.store ?? new InMemoryNotificationEventsStore();
  const meetingsStore = options.meetingsStore ?? new InMemoryMeetingsIngestStore();
  const meetingFeedUrls = Array.from(
    new Set([
      ...parseMeetingFeedUrls(parsed.MEETING_FEEDS_AA),
      ...parseMeetingFeedUrls(parsed.MEETING_FEEDS_NA),
    ]),
  );

  logger.info("worker alive");

  const poll = async () => {
    const notificationResult = await processNotificationEvents({
      store,
      sender: options.sender,
      now: options.now,
      logger,
    });
    logger.info("notification.poll.complete", notificationResult);

    if (meetingFeedUrls.length > 0) {
      await ingestMeetingsFeeds({
        feedUrls: meetingFeedUrls,
        store: meetingsStore,
        now: options.now,
        logger,
      });
    }
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
