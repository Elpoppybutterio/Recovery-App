import { describe, expect, it, vi } from "vitest";
import {
  processNotificationEvents,
  type NotificationEventRecord,
} from "../src/notification-events";

function pendingEvent(id: string): NotificationEventRecord {
  return {
    id,
    tenantId: "tenant-a",
    userId: "user-a",
    channel: "EMAIL",
    recipient: "person@example.com",
    templateKey: "incident-warning",
    payload: {},
    status: "PENDING",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("processNotificationEvents", () => {
  it("marks pending events as SENT after stub send", async () => {
    const store = {
      listPending: vi.fn().mockResolvedValue([pendingEvent("e-1"), pendingEvent("e-2")]),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const sender = {
      send: vi.fn().mockResolvedValue(undefined),
    };
    const now = () => new Date("2026-01-01T00:10:00.000Z");

    const result = await processNotificationEvents({
      store,
      sender,
      now,
      limit: 20,
    });

    expect(result).toEqual({
      scanned: 2,
      sent: 2,
      failed: 0,
    });
    expect(store.listPending).toHaveBeenCalledWith(20);
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(store.markSent).toHaveBeenCalledTimes(2);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("marks FAILED when send throws", async () => {
    const store = {
      listPending: vi.fn().mockResolvedValue([pendingEvent("e-1"), pendingEvent("e-2")]),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const sender = {
      send: vi
        .fn()
        .mockRejectedValueOnce(new Error("provider offline"))
        .mockResolvedValueOnce(undefined),
    };
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const result = await processNotificationEvents({
      store,
      sender,
      logger,
    });

    expect(result).toEqual({
      scanned: 2,
      sent: 1,
      failed: 1,
    });
    expect(store.markFailed).toHaveBeenCalledWith("e-1", "provider offline");
    expect(store.markSent).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("notification.send.failed", {
      eventId: "e-1",
      reason: "provider offline",
    });
  });
});
