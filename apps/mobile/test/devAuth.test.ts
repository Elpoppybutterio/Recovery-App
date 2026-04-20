import { describe, expect, it } from "vitest";
import {
  resolveRuntimeDevUserDisplayName,
  resolveRuntimeDevUserId,
  resolveStorageScopedDevUserId,
} from "../lib/devAuth";

describe("dev auth runtime resolution", () => {
  it("uses the selected override identity for runtime and storage scope", () => {
    const runtimeUserId = resolveRuntimeDevUserId({
      configuredUserId: "enduser-a1",
      overrideUserId: "kacy-admin",
      signedOut: false,
    });

    expect(runtimeUserId).toBe("kacy-admin");
    expect(
      resolveStorageScopedDevUserId({
        configuredUserId: "enduser-a1",
        runtimeUserId,
      }),
    ).toBe("kacy-admin");
  });

  it("keeps the configured identity only when no override is active", () => {
    expect(
      resolveRuntimeDevUserId({
        configuredUserId: "enduser-a1",
        overrideUserId: null,
        signedOut: false,
      }),
    ).toBe("enduser-a1");
  });

  it("uses the active runtime user id for fallback display labels", () => {
    expect(
      resolveRuntimeDevUserDisplayName({
        explicitDisplayName: "",
        seededDisplayName: null,
        runtimeUserId: "unknown-user",
        configuredUserId: "enduser-a1",
      }),
    ).toBe("unknown-user");
  });
});
