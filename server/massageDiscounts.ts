import { and, eq, sql } from "drizzle-orm";
import {
  discountCodeUsages,
  discountCodes,
  massageBookings,
  massageDiscountCodeTechniques,
  regularClassMemberships,
  regularClassStudents,
  serviceCartCheckoutItems,
  serviceCartCheckoutOrders,
  biopoolCheckoutOrders,
  saunaCheckoutOrders,
} from "../drizzle/schema";

export type MassageDiscountLine = {
  techniqueId: number;
  originalAmount: number;
};

export type MassageDiscountResult = {
  discountCodeId: number;
  code: string;
  name: string;
  discountType: "fixed" | "percentage" | "nth_free";
  discountValue: number;
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
  lineDiscounts: number[];
};

export type WellnessDiscountLine = {
  service: "masajes" | "clases" | "biopiscinas" | "sauna";
  originalAmount: number;
  // Precio de cada unidad de la línea (cada ticket, cada persona). Lo necesitan
  // las promos tipo 2x1: sin saber cuántas unidades hay y cuánto vale cada una,
  // no se puede calcular "una gratis por cada dos".
  unitAmounts?: number[];
  // Fecha de la VISITA en formato YYYY-MM-DD. Los códigos con días de vigencia
  // se validan contra este día, no contra el día en que se compra.
  bookingDate?: string;
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

// "Cada N unidades, una gratis" (un 2x1 es N=2). Regala siempre las unidades
// MÁS BARATAS, que es la práctica estándar, y las que sobran del último grupo
// incompleto pagan completo: con 3 personas se regala una, no una y media.
export function calculateNthFreeDiscount(
  unitAmounts: number[],
  everyN: number,
): number {
  if (everyN < 2 || unitAmounts.length < everyN) return 0;
  const gratis = Math.floor(unitAmounts.length / everyN);
  return [...unitAmounts]
    .sort((a, b) => a - b)
    .slice(0, gratis)
    .reduce((sum, amount) => sum + amount, 0);
}

export function calculateWellnessDiscountAmounts(
  lines: Array<{ originalAmount: number; unitAmounts?: number[] }>,
  eligible: boolean[],
  discountType: "fixed" | "percentage" | "nth_free",
  discountValue: number,
  maxDiscount?: number | null,
) {
  const eligibleSubtotal = lines.reduce((sum, line, index) => sum + (eligible[index] ? line.originalAmount : 0), 0);
  const originalTotal = lines.reduce((sum, line) => sum + line.originalAmount, 0);
  let discountTotal: number;
  if (discountType === "nth_free") {
    // Se calcula por línea y se suma: cada servicio tiene sus propias unidades.
    discountTotal = lines.reduce((sum, line, index) => {
      if (!eligible[index]) return sum;
      const unidades = line.unitAmounts?.length
        ? line.unitAmounts
        : [line.originalAmount];
      return sum + calculateNthFreeDiscount(unidades, discountValue);
    }, 0);
  } else if (discountType === "percentage") {
    discountTotal = Math.floor(eligibleSubtotal * discountValue / 100);
  } else {
    discountTotal = Math.min(discountValue, eligibleSubtotal);
  }
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

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Días permitidos de un código: "2,3,4,5" → [2,3,4,5]. Vacío = todos. */
export function parseValidWeekdays(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map(part => Number(part.trim()))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
}

/** Día de la semana de una fecha YYYY-MM-DD, leída como día local y no en UTC. */
export function weekdayOfBookingDate(bookingDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(bookingDate);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

export function describeWeekdays(days: number[]): string {
  if (days.length === 0) return "";
  const nombres = [...days].sort((a, b) => a - b).map(day => DIAS[day]);
  if (nombres.length === 1) return nombres[0];
  return nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
}

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

  // Días de vigencia: se miran contra la fecha de la VISITA de cada línea, no
  // contra el día en que se compra. Comprar el miércoles para el sábado no
  // habilita un código que solo corre de martes a viernes.
  const diasValidos = parseValidWeekdays((discount as any).validWeekdays);
  const fechaServicioDesde = (discount as any).bookingValidFrom
    ? String((discount as any).bookingValidFrom).slice(0, 10)
    : null;
  const fechaServicioHasta = (discount as any).bookingValidUntil
    ? String((discount as any).bookingValidUntil).slice(0, 10)
    : null;
  const fechaServicioValida = (bookingDate?: string) => {
    if (!fechaServicioDesde && !fechaServicioHasta) return true;
    if (!bookingDate) return false;
    const date = bookingDate.slice(0, 10);
    return (!fechaServicioDesde || date >= fechaServicioDesde)
      && (!fechaServicioHasta || date <= fechaServicioHasta);
  };
  if ((fechaServicioDesde || fechaServicioHasta) && lines.every(line => !fechaServicioValida(line.bookingDate))) {
    const range = fechaServicioDesde && fechaServicioHasta
      ? `entre el ${fechaServicioDesde} y el ${fechaServicioHasta}`
      : fechaServicioDesde
        ? `desde el ${fechaServicioDesde}`
        : `hasta el ${fechaServicioHasta}`;
    throw new Error(`Este código solo aplica a servicios agendados ${range}.`);
  }
  if (diasValidos.length > 0) {
    const fechas = lines.map(line => line.bookingDate).filter(Boolean) as string[];
    if (fechas.length > 0) {
      const fueraDeDia = fechas.filter(fecha => {
        const dia = weekdayOfBookingDate(fecha);
        return dia !== null && !diasValidos.includes(dia);
      });
      if (fueraDeDia.length === fechas.length) {
        throw new Error(
          `Este código solo aplica los días ${describeWeekdays(diasValidos)}.`
        );
      }
    }
  }

  const mappings = await db.select({ techniqueId: massageDiscountCodeTechniques.techniqueId })
    .from(massageDiscountCodeTechniques)
    .where(eq(massageDiscountCodeTechniques.discountCodeId, discount.id));
  const allowedIds = new Set<number>(mappings.map((row: any) => row.techniqueId));
  const eligible = lines.map((line) => {
    if (!isWellnessDiscountLineEligible(applicableServices, allowedIds, line)) return false;
    if (!fechaServicioValida(line.bookingDate)) return false;
    // Una línea cuya visita cae fuera de los días del código no recibe descuento,
    // aunque otra línea del mismo carrito sí lo reciba.
    if (diasValidos.length > 0 && line.bookingDate) {
      const dia = weekdayOfBookingDate(line.bookingDate);
      if (dia !== null && !diasValidos.includes(dia)) return false;
    }
    return true;
  });
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

// Registra el uso del cupón de un carrito con los montos REALES del carrito
// completo, no los del producto que se confirmó último.
//
// Sigue el mismo patrón que recordPaidWellnessDiscountUsage: en vez de sumar de
// forma incremental —que duplicaría al reprocesarse—, recalcula los totales
// desde la base cada vez. Así da igual el orden en que confirmen biopiscinas y
// sauna, y cuántas veces se reprocese el retorno de Webpay: el registro siempre
// refleja el estado real.
export async function recordWellnessCartDiscountUsage(
  db: any,
  params: {
    module: "biopools" | "sauna";
    childOrderId: number;
    discountCodeId: number;
    email?: string | null;
    fallbackRequestId: string;
    fallbackOriginalAmount: number;
    fallbackDiscountAmount: number;
    fallbackFinalAmount: number;
  },
) {
  let requestId = params.fallbackRequestId;
  let originalAmount = params.fallbackOriginalAmount;
  let discountAmount = params.fallbackDiscountAmount;
  let finalAmount = params.fallbackFinalAmount;

  try {
    const [item] = await db.select({ cartOrderId: serviceCartCheckoutItems.cartOrderId })
      .from(serviceCartCheckoutItems)
      .where(and(
        eq(serviceCartCheckoutItems.module, params.module),
        eq(serviceCartCheckoutItems.childOrderId, params.childOrderId),
      )).limit(1);

    if (item) {
      const [cart] = await db.select({
        buyOrder: serviceCartCheckoutOrders.buyOrder,
        publicToken: serviceCartCheckoutOrders.publicToken,
      })
        .from(serviceCartCheckoutOrders)
        .where(eq(serviceCartCheckoutOrders.id, item.cartOrderId))
        .limit(1);
      requestId = cart?.buyOrder || cart?.publicToken || requestId;

      // Todas las líneas del carrito, con descuento o sin él: el reporte tiene
      // que decir cuánto costaba el carrito entero.
      const lineas = await db.select({
        module: serviceCartCheckoutItems.module,
        childOrderId: serviceCartCheckoutItems.childOrderId,
      })
        .from(serviceCartCheckoutItems)
        .where(eq(serviceCartCheckoutItems.cartOrderId, item.cartOrderId));

      let original = 0;
      let descuento = 0;
      let final = 0;
      for (const linea of lineas) {
        if (linea.module === "biopools") {
          const [orden] = await db.select({
            subtotalClp: biopoolCheckoutOrders.subtotalClp,
            discountClp: biopoolCheckoutOrders.discountClp,
            totalClp: biopoolCheckoutOrders.totalClp,
          }).from(biopoolCheckoutOrders)
            .where(eq(biopoolCheckoutOrders.id, linea.childOrderId)).limit(1);
          if (orden) {
            original += Number(orden.subtotalClp ?? 0);
            descuento += Number(orden.discountClp ?? 0);
            final += Number(orden.totalClp ?? 0);
          }
        } else if (linea.module === "sauna") {
          const [orden] = await db.select({
            subtotalClp: saunaCheckoutOrders.subtotalClp,
            discountClp: saunaCheckoutOrders.discountClp,
            totalClp: saunaCheckoutOrders.totalClp,
          }).from(saunaCheckoutOrders)
            .where(eq(saunaCheckoutOrders.id, linea.childOrderId)).limit(1);
          if (orden) {
            original += Number(orden.subtotalClp ?? 0);
            descuento += Number(orden.discountClp ?? 0);
            final += Number(orden.totalClp ?? 0);
          }
        } else if (linea.module === "massages") {
          const [reserva] = await db.select({
            originalAmount: massageBookings.originalAmount,
            discountAmount: massageBookings.discountAmount,
            amountPaid: massageBookings.amountPaid,
          }).from(massageBookings)
            .where(eq(massageBookings.id, linea.childOrderId)).limit(1);
          if (reserva) {
            original += Number(reserva.originalAmount ?? 0);
            descuento += Number(reserva.discountAmount ?? 0);
            final += Number(reserva.amountPaid ?? 0);
          }
        } else {
          const [membresia] = await db.select({
            originalAmountClp: regularClassMemberships.originalAmountClp,
            discountAmountClp: regularClassMemberships.discountAmountClp,
            pricePaidClp: regularClassMemberships.pricePaidClp,
          }).from(regularClassMemberships)
            .where(eq(regularClassMemberships.id, linea.childOrderId)).limit(1);
          if (membresia) {
            original += Number(membresia.originalAmountClp ?? 0);
            descuento += Number(membresia.discountAmountClp ?? 0);
            final += Number(membresia.pricePaidClp ?? 0);
          }
        }
      }
      if (original > 0) {
        originalAmount = original;
        discountAmount = descuento;
        finalAmount = final;
      }
    }
  } catch (error) {
    // Con los montos de la orden sola el reporte queda incompleto, pero perder el
    // registro entero sería peor.
    console.error("[descuentos] No se pudieron sumar los montos del carrito", {
      module: params.module,
      childOrderId: params.childOrderId,
      error,
    });
  }

  await recordMassageDiscountUsage(db, {
    discountCodeId: params.discountCodeId,
    requestId,
    email: params.email,
    originalAmount,
    discountAmount,
    finalAmount,
  });
}
