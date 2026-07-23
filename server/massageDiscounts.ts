import { and, eq, sql } from "drizzle-orm";
import {
  discountCodeUsages,
  discountCodes,
  massageDiscountCodeTechniques,
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

export function calculateMassageDiscountAmounts(
  lines: MassageDiscountLine[],
  allowedIds: Set<number>,
  discountType: "fixed" | "percentage",
  discountValue: number,
  maxDiscount?: number | null,
) {
  const eligible = lines.map((line) => allowedIds.size === 0 || allowedIds.has(line.techniqueId));
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

export async function calculateMassageDiscount(
  db: any,
  rawCode: string,
  lines: MassageDiscountLine[],
): Promise<MassageDiscountResult> {
  const code = normalizeCode(rawCode);
  if (!code) throw new Error("Ingresa un código de descuento.");

  const [discount] = await db.select().from(discountCodes)
    .where(eq(discountCodes.code, code)).limit(1);
  if (!discount) throw new Error("El código de descuento no existe.");
  if (discount.active !== 1) throw new Error("Este código de descuento está inactivo.");

  const applicable = (() => {
    try { return JSON.parse(discount.applicableServices ?? "[]"); }
    catch { return []; }
  })();
  if (!Array.isArray(applicable) || !applicable.includes("masajes")) {
    throw new Error("Este código no aplica a servicios de masajes.");
  }

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
  const amounts = calculateMassageDiscountAmounts(
    lines, allowedIds, discount.discountType, discount.discountValue, discount.maxDiscount,
  );
  const { eligibleSubtotal, originalTotal, discountTotal, finalTotal, lineDiscounts } = amounts;
  if (eligibleSubtotal <= 0) throw new Error("El código no aplica a los masajes seleccionados.");
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
      eq(discountCodeUsages.orderType, "massage_cart"),
    )).limit(1);
  if (existing) return;

  await db.insert(discountCodeUsages).values({
    discountCodeId: params.discountCodeId,
    userEmail: params.email ?? null,
    orderId: params.requestId,
    orderType: "massage_cart",
    originalAmount: params.originalAmount,
    discountAmount: params.discountAmount,
    finalAmount: params.finalAmount,
  });
  await db.update(discountCodes)
    .set({ currentUses: sql`${discountCodes.currentUses} + 1` })
    .where(eq(discountCodes.id, params.discountCodeId));
}
