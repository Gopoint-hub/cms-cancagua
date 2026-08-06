import { and, eq, sql } from "drizzle-orm";
import {
  discountCodeUsages,
  discountCodes,
  massageBookings,
  massageDiscountCodeTechniques,
  regularClassMemberships,
  regularClassStudents,
} from "../drizzle/schema";

export type MassageDiscountLine = {
  techniqueId: number;
  originalAmount: number;
};

export type MassageDiscountResult = {
  discountCodeId: number;
  code: string;
  name: string;
  discountType: "fixed" | "percentage";
  discountValue: number;
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
  lineDiscounts: number[];
};

export type WellnessDiscountLine = {
  service: "masajes" | "clases" | "biopiscinas";
  originalAmount: number;
  serviceId?: number | string;
  techniqueId?: number;
};

export function calculateMassageDiscountAmounts(
  lines: MassageDiscountLine[],
  allowedIds: Set<number>,
  discountType: "fixed" | "percentage",
  discountValue: number,
  maxDiscount?: number | null,
) {
  const eligible = lines.map((line) => allowedIds.size === 0 || allowedIds.has(line.techniqueId));
  return calculateWellnessDiscountAmounts(lines, eligible, discountType, discountValue, maxDiscount);
}

export function calculateWellnessDiscountAmounts(
  lines: Array<{ originalAmount: number }>,
  eligible: boolean[],
  discountType: "fixed" | "percentage",
  discountValue: number,
  maxDiscount?: number | null,
) {
  const eligibleSubtotal = lines.reduce((sum, line, index) => sum + (eligible[index] ? line.originalAmount : 0), 0);
  const originalTotal = lines.reduce((sum, line) => sum + line.originalAmount, 0);
  let discountTotal = discountType === "percentage"
    ? Math.floor(eligibleSubtotal * discountValue / 100)
    : Math.min(discountValue, eligibleSubtotal);
  if (discountType === "percentage" && maxDiscount) discountTotal = Math.min(discountTotal, maxDiscount);
  discountTotal = Math.max(0, Math.min(discountTotal, eligibleSubtotal));
  let allocated = 0;
  const lastEligible = eligible.lastIndexOf(true);
  const lineDiscounts = lines.map((line, index) => {
    if (!eligible[index]) return 0;
    const amount = index === lastEligible
      ? discountTotal - allocated
      : Math.floor(discountTotal * line.originalAmount / eligibleSubtotal);
    allocated += amount;
    return amount;
  });
  return { eligibleSubtotal, originalTotal, discountTotal, finalTotal: originalTotal - discountTotal, lineDiscounts };
}

const normalizeCode = (code: string) => code.trim().toUpperCase();

export function isWellnessDiscountLineEligible(
  applicableServices: string[],
  allowedLegacyMassageTechniqueIds: Set<number>,
  line: WellnessDiscountLine,
) {
  const appliesToAll = applicableServices.length === 0 || applicableServices.includes("all");
  const selectedServiceId = line.serviceId ?? line.techniqueId;
  const canonicalWildcard = applicableServices.includes(`${line.service}:*`);
  const canonicalSpecific = selectedServiceId != null
    && applicableServices.includes(`${line.service}:${selectedServiceId}`);
  const legacyModule = applicableServices.includes(line.service);
  const serviceAllowed = appliesToAll || canonicalWildcard || canonicalSpecific || legacyModule;
  if (!serviceAllowed) return false;
  if (
    line.service === "masajes"
    && legacyModule
    && !canonicalWildcard
    && !canonicalSpecific
    && allowedLegacyMassageTechniqueIds.size > 0
  ) {
    return line.techniqueId != null && allowedLegacyMassageTechniqueIds.has(line.techniqueId);
  }
  return true;
}

export async function calculateMassageDiscount(
  db: any,
  rawCode: string,
  lines: MassageDiscountLine[],
): Promise<MassageDiscountResult> {
  return calculateWellnessCartDiscount(db, rawCode, lines.map((line) => ({
    service: "masajes",
    serviceId: line.techniqueId,
    techniqueId: line.techniqueId,
    originalAmount: line.originalAmount,
  })));
}

export async function calculateWellnessCartDiscount(
  db: any,
  rawCode: string,
  lines: WellnessDiscountLine[],
): Promise<MassageDiscountResult> {
  const code = normalizeCode(rawCode);
  if (!code) throw new Error("Ingresa un código de descuento.");
  if (lines.length === 0) throw new Error("Agrega al menos un producto para aplicar el código.");

  const [discount] = await db.select().from(discountCodes)
    .where(eq(discountCodes.code, code)).limit(1);
  if (!discount) throw new Error("El código de descuento no existe.");
  if (discount.active !== 1) throw new Error("Este código de descuento está inactivo.");

  const applicable = (() => {
    try { return JSON.parse(discount.applicableServices ?? "[]"); }
    catch { return []; }
  })();
  const applicableServices = Array.isArray(applicable) ? applicable : [];
  const now = new Date();
  if (discount.startsAt && new Date(discount.startsAt) > now) {
    throw new Error("Este código todavía no está vigente.");
  }
  if (discount.expiresAt && new Date(discount.expiresAt) < now) {
    throw new Error("Este código de descuento está vencido.");
  }
  if (discount.maxUses && discount.currentUses >= discount.maxUses) {
    throw new Error("Este código alcanzó su límite de usos.");
  }

  const mappings = await db.select({ techniqueId: massageDiscountCodeTechniques.techniqueId })
    .from(massageDiscountCodeTechniques)
    .where(eq(massageDiscountCodeTechniques.discountCodeId, discount.id));
  const allowedIds = new Set<number>(mappings.map((row: any) => row.techniqueId));
  const eligible = lines.map((line) => isWellnessDiscountLineEligible(applicableServices, allowedIds, line));
  const { eligibleSubtotal, originalTotal, discountTotal, finalTotal, lineDiscounts } = calculateWellnessDiscountAmounts(
    lines,
    eligible,
    discount.discountType,
    discount.discountValue,
    discount.maxDiscount,
  );
  if (eligibleSubtotal <= 0) throw new Error("Este código no aplica a los productos seleccionados.");
  if (eligibleSubtotal < discount.minPurchase) throw new Error(
    `La compra mínima para este código es $${discount.minPurchase.toLocaleString("es-CL")}.`,
  );

  return {
    discountCodeId: discount.id,
    code: discount.code,
    name: discount.name,
    discountType: discount.discountType,
    discountValue: discount.discountValue,
    originalTotal,
    discountTotal,
    finalTotal,
    lineDiscounts,
  };
}

export async function recordMassageDiscountUsage(
  db: any,
  params: {
    discountCodeId: number;
    requestId: string;
    email?: string | null;
    originalAmount: number;
    discountAmount: number;
    finalAmount: number;
  },
) {
  const [existing] = await db.select({ id: discountCodeUsages.id })
    .from(discountCodeUsages)
    .where(and(
      eq(discountCodeUsages.discountCodeId, params.discountCodeId),
      eq(discountCodeUsages.orderId, params.requestId),
      eq(discountCodeUsages.orderType, "wellness_cart"),
    )).limit(1);
  if (existing) {
    await db.update(discountCodeUsages).set({
      userEmail: params.email ?? null,
      originalAmount: params.originalAmount,
      discountAmount: params.discountAmount,
      finalAmount: params.finalAmount,
    }).where(eq(discountCodeUsages.id, existing.id));
    return;
  }

  await db.insert(discountCodeUsages).values({
    discountCodeId: params.discountCodeId,
    userEmail: params.email ?? null,
    orderId: params.requestId,
    orderType: "wellness_cart",
    originalAmount: params.originalAmount,
    discountAmount: params.discountAmount,
    finalAmount: params.finalAmount,
  });
  await db.update(discountCodes)
    .set({ currentUses: sql`${discountCodes.currentUses} + 1` })
    .where(eq(discountCodes.id, params.discountCodeId));
}

export async function recordPaidWellnessDiscountUsage(db: any, requestId: string) {
  const [massageTotals] = await db.select({
    originalAmount: sql<string>`COALESCE(SUM(${massageBookings.originalAmount}), 0)`,
    discountAmount: sql<string>`COALESCE(SUM(${massageBookings.discountAmount}), 0)`,
    finalAmount: sql<string>`COALESCE(SUM(${massageBookings.amountPaid}), 0)`,
    discountCodeId: sql<number | null>`MAX(${massageBookings.discountCodeId})`,
    email: sql<string | null>`MAX(${massageBookings.clientEmail})`,
  }).from(massageBookings).where(eq(massageBookings.getnetRequestId, requestId));
  const [classTotals] = await db.select({
    originalAmount: sql<string>`COALESCE(SUM(${regularClassMemberships.originalAmountClp}), 0)`,
    discountAmount: sql<string>`COALESCE(SUM(${regularClassMemberships.discountAmountClp}), 0)`,
    finalAmount: sql<string>`COALESCE(SUM(${regularClassMemberships.pricePaidClp}), 0)`,
    discountCodeId: sql<number | null>`MAX(${regularClassMemberships.discountCodeId})`,
    email: sql<string | null>`MAX(${regularClassStudents.email})`,
  }).from(regularClassMemberships)
    .leftJoin(regularClassStudents, eq(regularClassMemberships.studentId, regularClassStudents.id))
    .where(eq(regularClassMemberships.paymentReference, requestId));
  const discountCodeId = Number(massageTotals?.discountCodeId ?? classTotals?.discountCodeId ?? 0);
  if (!discountCodeId) return;
  await recordMassageDiscountUsage(db, {
    discountCodeId,
    requestId,
    email: massageTotals?.email ?? classTotals?.email,
    originalAmount: Number(massageTotals?.originalAmount ?? 0) + Number(classTotals?.originalAmount ?? 0),
    discountAmount: Number(massageTotals?.discountAmount ?? 0) + Number(classTotals?.discountAmount ?? 0),
    finalAmount: Number(massageTotals?.finalAmount ?? 0) + Number(classTotals?.finalAmount ?? 0),
  });
}
