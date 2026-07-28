export type RegularClassDocumentType =
  | "pending"
  | "honorarium_receipt"
  | "exempt_invoice"
  | "taxable_invoice"
  | "none";

export type CommissionInput = {
  studentId: number;
  studentName: string;
  membershipId: number;
  planName: string;
  pricePaidClp: number;
  creditsTotal: number;
  teacherId: number;
  teacherName: string;
  teacherShareBps: number;
  documentType: RegularClassDocumentType;
  withholdingBps: number;
  vatBps: number;
  attendanceCount: number;
};

export type CommissionLine = CommissionInput & {
  unitValueClp: number;
  attributedRevenueClp: number;
  teacherCommissionClp: number;
  cancaguaShareFromUsedCreditsClp: number;
  taxBaseClp: number;
  taxClp: number;
  withholdingClp: number;
  liquidPayableClp: number;
};

export function roundClp(value: number): number {
  return Math.round(value);
}

export function calculateTaxBreakdown(
  commissionClp: number,
  documentType: RegularClassDocumentType,
  withholdingBps: number,
  vatBps: number,
) {
  if (documentType === "honorarium_receipt") {
    const withholdingClp = roundClp(commissionClp * withholdingBps / 10_000);
    return {
      taxBaseClp: commissionClp,
      taxClp: 0,
      withholdingClp,
      liquidPayableClp: commissionClp - withholdingClp,
    };
  }

  if (documentType === "taxable_invoice") {
    // La comisión ya incluye IVA: nunca se suma por encima del porcentaje acordado.
    const taxBaseClp = roundClp(commissionClp * 10_000 / (10_000 + vatBps));
    return {
      taxBaseClp,
      taxClp: commissionClp - taxBaseClp,
      withholdingClp: 0,
      liquidPayableClp: commissionClp,
    };
  }

  return {
    taxBaseClp: commissionClp,
    taxClp: 0,
    withholdingClp: 0,
    liquidPayableClp: commissionClp,
  };
}

export function calculateCommissionLine(input: CommissionInput): CommissionLine {
  if (input.pricePaidClp < 0 || input.creditsTotal <= 0 || input.attendanceCount < 0) {
    throw new Error("Datos de comisión inválidos");
  }
  const unitValueClp = input.pricePaidClp / input.creditsTotal;
  const attributedRevenueClp = roundClp(
    input.pricePaidClp * input.attendanceCount / input.creditsTotal,
  );
  const teacherCommissionClp = roundClp(
    input.pricePaidClp
      * input.attendanceCount
      * input.teacherShareBps
      / input.creditsTotal
      / 10_000,
  );
  const taxes = calculateTaxBreakdown(
    teacherCommissionClp,
    input.documentType,
    input.withholdingBps,
    input.vatBps,
  );

  return {
    ...input,
    unitValueClp,
    attributedRevenueClp,
    teacherCommissionClp,
    cancaguaShareFromUsedCreditsClp: attributedRevenueClp - teacherCommissionClp,
    ...taxes,
  };
}

export function summarizeCommissions(lines: CommissionLine[], totalIncomeClp: number) {
  const totalTeacherCommissionsClp = lines.reduce(
    (sum, line) => sum + line.teacherCommissionClp,
    0,
  );
  return {
    totalIncomeClp,
    totalTeacherCommissionsClp,
    totalCancaguaClp: totalIncomeClp - totalTeacherCommissionsClp,
    totalLiquidPayableClp: lines.reduce((sum, line) => sum + line.liquidPayableClp, 0),
    totalWithholdingClp: lines.reduce((sum, line) => sum + line.withholdingClp, 0),
    totalVatIncludedClp: lines.reduce((sum, line) => sum + line.taxClp, 0),
  };
}
