export type MeetingCardAction = {
  key: "details" | "attend";
  label: "Details" | "Attend";
  variant: "primary" | "secondary";
};

export function getMeetingCardActions(
  isInProgress: boolean,
): [MeetingCardAction, MeetingCardAction] {
  return [
    { key: "details", label: "Details", variant: "secondary" },
    { key: "attend", label: "Attend", variant: isInProgress ? "primary" : "secondary" },
  ];
}
