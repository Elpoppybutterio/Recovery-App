import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnv } from "../src";

describe("parseEnv", () => {
  it("returns parsed env values", () => {
    const env = parseEnv(
      z.object({
        APP_PORT: z.coerce.number().default(3001),
      }),
      { APP_PORT: "4001" },
    );

    expect(env.APP_PORT).toBe(4001);
  });
});
