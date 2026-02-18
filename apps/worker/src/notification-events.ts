import { createLogger } from "@recovery/shared-utils";

export type NotificationEventStatus = "PENDING" | "SENT" | "FAILED";

export interface NotificationEventRecord {
  id: string;
  tenantId: string;
  userId: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  templateKey: string;
  payload: Record<string, unknown>;
  status: NotificationEventStatus;
  createdAt: string;
  sentAt?: string;
  failedAt?: string;
  failureReason?: string;
}

export interface NotificationEventsStore {
  listPending(limit: number): Promise<NotificationEventRecord[]>;
  markSent(id: string, sentAt: Date): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
}

export interface NotificationSender {
  send(event: NotificationEventRecord): Promise<void>;
}

interface WorkerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const logger = createLogger("worker");

export class InMemoryNotificationEventsStore implements NotificationEventsStore {
  private events: NotificationEventRecord[];

  constructor(seedEvents: NotificationEventRecord[] = []) {
    this.events = seedEvents.map((event) => ({ ...event }));
  }

  async listPending(limit: number): Promise<NotificationEventRecord[]> {
    return this.events
      .filter((event) => event.status === "PENDING")
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  async markSent(id: string, sentAt: Date): Promise<void> {
    const event = this.events.find((item) => item.id === id);
    if (!event) {
      return;
    }
    event.status = "SENT";
    event.sentAt = sentAt.toISOString();
  }

  async markFailed(id: string, reason: string): Promise<void> {
    const event = this.events.find((item) => item.id === id);
    if (!event) {
      return;
    }
    event.status = "FAILED";
    event.failedAt = new Date().toISOString();
    event.failureReason = reason;
  }

  snapshot(): NotificationEventRecord[] {
    return this.events.map((event) => ({ ...event }));
  }
}

export const stubNotificationSender: NotificationSender = {
  async send(event) {
    logger.info("notification.send.stub", {
      eventId: event.id,
      tenantId: event.tenantId,
      channel: event.channel,
      recipient: event.recipient,
      templateKey: event.templateKey,
    });
  },
};

export async function processNotificationEvents(options: {
  store: NotificationEventsStore;
  sender?: NotificationSender;
  now?: () => Date;
  limit?: number;
  logger?: WorkerLogger;
}) {
  const store = options.store;
  const sender = options.sender ?? stubNotificationSender;
  const now = options.now ?? (() => new Date());
  const limit = options.limit ?? 50;
  const log = options.logger ?? logger;

  const pending = await store.listPending(limit);

  let sent = 0;
  let failed = 0;
  for (const event of pending) {
    try {
      await sender.send(event);
      await store.markSent(event.id, now());
      sent += 1;
    } catch (error) {
      failed += 1;
      const reason = error instanceof Error ? error.message : "unknown send error";
      await store.markFailed(event.id, reason);
      log.error("notification.send.failed", {
        eventId: event.id,
        reason,
      });
    }
  }

  return {
    scanned: pending.length,
    sent,
    failed,
  };
}
