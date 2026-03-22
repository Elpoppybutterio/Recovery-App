import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEDITATION_SPOTIFY_URL,
  createDefaultMorningRoutineTemplate,
} from "../lib/routines/defaults";

describe("morning routine defaults", () => {
  it("disables play for read-only recovery items", () => {
    const template = createDefaultMorningRoutineTemplate();
    const disabledPlayItemIds = new Set(
      template.items.filter((item) => item.supportsPlay === false).map((item) => item.id),
    );

    expect(disabledPlayItemIds).toEqual(
      new Set([
        "sponsor-check-in",
        "bb-60-63",
        "bb-86-88",
        "prayer-third-step",
        "prayer-seventh-step",
        "prayer-eleventh-step",
        "daily-reflections",
        "meditation",
        "additional-suggestions",
      ]),
    );
  });

  it("seeds meditation with the Spotify show link", () => {
    const template = createDefaultMorningRoutineTemplate();
    const meditationItem = template.items.find((item) => item.id === "meditation");

    expect(meditationItem?.readerMode).toBe("external");
    expect(meditationItem?.readerUrl).toBe(DEFAULT_MEDITATION_SPOTIFY_URL);
    expect(template.meditationLinks[0]?.url).toBe(DEFAULT_MEDITATION_SPOTIFY_URL);
  });
});
