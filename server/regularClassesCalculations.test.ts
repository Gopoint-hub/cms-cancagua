import { describe, expect, it } from "vitest";
import {
  calculateCommissionLine,
  calculateTaxBreakdown,
  summarizeCommissions,
} from "./regularClassesCalculations";

describe("regular classes commission engine", () => {
  it("uses contracted credits instead of actual monthly attendance", () => {
    const line = calculateCommissionLine({
      studentId: 1,
      studentName: "Alumna",
      membershipId: 1,
      planName: "5 veces por semana",
      pricePaidClp: 99_000,
      creditsTotal: 20,
      teacherId: 3,
      teacherName: "Claudia Silva",
      teacherShareBps: 7_000,
      documentType: "honorarium_receipt",
      withholdingBps: 1_525,
      vatBps: 1_900,
      attendanceCount: 1,
    });

    expect(line.unitValueClp).toBe(4_950);
    expect(line.attributedRevenueClp).toBe(4_950);
    expect(line.teacherCommissionClp).toBe(3_465);
    expect(summarizeCommissions([line], 99_000).totalCancaguaClp).toBe(95_535);
  });

  it("does not assign commission when the student did not attend", () => {
    const summary = summarizeCommissions([], 99_000);
    expect(summary.totalTeacherCommissionsClp).toBe(0);
    expect(summary.totalCancaguaClp).toBe(99_000);
  });

  it("keeps tax inside the teacher commission", () => {
    expect(calculateTaxBreakdown(100_000, "honorarium_receipt", 1_525, 1_900))
      .toEqual({
        taxBaseClp: 100_000,
        taxClp: 0,
        withholdingClp: 15_250,
        liquidPayableClp: 84_750,
      });

    expect(calculateTaxBreakdown(100_000, "taxable_invoice", 1_525, 1_900))
      .toEqual({
        taxBaseClp: 84_034,
        taxClp: 15_966,
        withholdingClp: 0,
        liquidPayableClp: 100_000,
      });
  });
});
