export type ReschedulePolicyInput = {
  rescheduleCount: number;
  maxReschedules: number;
  hoursUntilStart: number;
  noticeHours: number;
  overrideRequested: boolean;
};

export function evaluateReschedulePolicy(input: ReschedulePolicyInput) {
  const exceedsMaximum = input.rescheduleCount >= input.maxReschedules;
  const violatesNotice = input.hoursUntilStart < input.noticeHours;
  return {
    exceedsMaximum,
    violatesNotice,
    canOverride: input.overrideRequested && (exceedsMaximum || violatesNotice),
  };
}

export function validOverrideReason(reason: string): boolean {
  return reason.trim().length >= 10;
}
