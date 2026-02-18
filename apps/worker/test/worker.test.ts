import { describe, expect, it } from "vitest";
import { runWorker } from "../src/index";
import { InMemoryNotificationEventsStore } from "../src/notification-events";

describe("runWorker", () => {
  it("exits cleanly in test mode", async () => {
    const store = new InMemoryNotificationEventsStore([
      {
        id: "notification-1",
        tenantId: "tenant-a",
        userId: "user-a",
        channel: "SMS",
        recipient: "+15555555555",
        templateKey: "violation-alert",
        payload: {},
        status: "PENDING",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await expect(runWorker({ WORKER_TEST_MODE: "true" }, { store })).resolves.toBeUndefined();

    const snapshot = store.snapshot();
    expect(snapshot[0].status).toBe("SENT");
    expect(snapshot[0].sentAt).toBeTruthy();
  });
});
