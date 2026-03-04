export type LeaveTimePlanInput = {
  meetingStartAt: Date;
  earlyMinutes: number;
  travelDurationSeconds: number;
  now?: Date;
};

export type LeaveTimePlan = {
  arrivalTargetAt: Date;
  leaveAt: Date;
  notifyImmediately: boolean;
};

export function buildLeaveTimePlan(input: LeaveTimePlanInput): LeaveTimePlan {
  const now = input.now ?? new Date();
  const safeEarlyMinutes = Math.max(0, Math.floor(input.earlyMinutes));
  const safeTravelSeconds = Math.max(60, Math.floor(input.travelDurationSeconds));

  const arrivalTargetAt = new Date(input.meetingStartAt.getTime() - safeEarlyMinutes * 60_000);
  const leaveAt = new Date(arrivalTargetAt.getTime() - safeTravelSeconds * 1000);
  const notifyImmediately = leaveAt.getTime() <= now.getTime() + 60_000;

  return {
    arrivalTargetAt,
    leaveAt,
    notifyImmediately,
  };
}
