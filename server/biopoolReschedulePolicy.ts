export type ReschedulePolicyInput = {
  rescheduleCount: number;
  maxReschedules: number;
  hoursUntilStart: number;
  noticeHours: number;
  overrideRequested: boolean;
};

export function evaluateReschedulePolicy(input: ReschedulePolicyInput) {
  return {
    exceedsMaximum: input.rescheduleCount >= input.maxReschedules,
    violatesNotice: input.hoursUntilStart < input.noticeHours,
    canOverride: input.overrideRequested,
  };
}

export function validOverrideReason(reason: string): boolean {
  return reason.trim().length >= 10;
}
