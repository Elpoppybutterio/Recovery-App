import { describe, expect, it } from "vitest";
import { getMeetingCardActions } from "../lib/meetings/meetingCardActions";

describe("getMeetingCardActions", () => {
  it("keeps Details and a single Attend action while meeting is in progress", () => {
    const actions = getMeetingCardActions(true);
    const attendCount = actions.filter((action) => action.label === "Attend").length;
    const detailsCount = actions.filter((action) => action.label === "Details").length;

    expect(actions).toHaveLength(2);
    expect(attendCount).toBe(1);
    expect(detailsCount).toBe(1);
    expect(actions[0].label).toBe("Details");
    expect(actions[1].label).toBe("Attend");
    expect(actions[1].variant).toBe("primary");
  });

  it("keeps one Attend action for non in-progress meetings", () => {
    const actions = getMeetingCardActions(false);
    const attendCount = actions.filter((action) => action.label === "Attend").length;

    expect(actions).toHaveLength(2);
    expect(attendCount).toBe(1);
    expect(actions[0].label).toBe("Details");
    expect(actions[1].label).toBe("Attend");
    expect(actions[1].variant).toBe("secondary");
  });
});
