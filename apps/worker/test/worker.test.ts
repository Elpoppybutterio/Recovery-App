import { describe, expect, it } from "vitest";
import { runWorker } from "../src/index";

describe("runWorker", () => {
  it("exits cleanly in test mode", async () => {
    await expect(runWorker({ WORKER_TEST_MODE: "true" })).resolves.toBeUndefined();
  });
});
