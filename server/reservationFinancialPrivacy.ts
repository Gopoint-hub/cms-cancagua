import {
  hasCmsPermission,
  hasGiftCardAccess,
  hasMassagePaymentReadAccess,
  type PermissionUser,
} from "../shared/permissions";
import type { Reservation360ServiceKey } from "../shared/reservation360";

export function canReadClientGiftCards(user: PermissionUser): boolean {
  return hasGiftCardAccess(user);
}

/**
 * Un permiso para ver clientes no implica acceso a sus pagos. Esta función es
 * el contrato común para todos los adaptadores de Operaciones 360 y para las
 * agendas nativas que devuelven la reserva completa.
 */
export function canReadReservationFinancials(
  user: PermissionUser,
  service: Reservation360ServiceKey
): boolean {
  switch (service) {
    case "massages":
      return hasMassagePaymentReadAccess(user);
    case "biopools":
      return (
        hasCmsPermission(user, "biopools.manage_agenda") ||
        hasCmsPermission(user, "biopools.view_sales")
      );
    case "sauna":
      return (
        hasCmsPermission(user, "sauna.manage_agenda") ||
        hasCmsPermission(user, "sauna.view_sales")
      );
    case "regular_classes":
      // En Clases Regulares, alumnos y sus pagos pertenecen al mismo permiso.
      return hasCmsPermission(user, "regular_classes.students");
    default: {
      const exhaustive: never = service;
      return exhaustive;
    }
  }
}

type ReservationFinancialFields = {
  service: Reservation360ServiceKey;
  paymentStatus: string | null;
  amountClp: number;
  totalAmountClp: number;
  balanceAmountClp: number;
};

export function presentReservationFinancials<
  T extends ReservationFinancialFields,
>(
  event: T,
  user: PermissionUser
): Omit<
  T,
  "paymentStatus" | "amountClp" | "totalAmountClp" | "balanceAmountClp"
> & {
  paymentStatus: string | null;
  amountClp: number | null;
  totalAmountClp: number | null;
  balanceAmountClp: number | null;
  financialRestricted: boolean;
} {
  if (canReadReservationFinancials(user, event.service)) {
    return { ...event, financialRestricted: false };
  }
  return {
    ...event,
    paymentStatus: null,
    amountClp: null,
    totalAmountClp: null,
    balanceAmountClp: null,
    financialRestricted: true,
  };
}

export function redactFinancialReservationNotes(
  notes: string | null | undefined,
  canViewPayments: boolean
): string | null {
  if (!notes) return null;
  if (canViewPayments) return notes;
  const visible = notes
    .split("\n")
    .filter(
      line =>
        !/^(?:RECONCILIACIÓN REQUERIDA:|Pago (?:Getnet|Webpay) acreditado automáticamente\b)/iu.test(
          line.trimStart()
        )
    )
    .join("\n")
    .trim();
  return visible || null;
}

export function presentClientAuditActivity<T extends { detail: string | null }>(
  rows: T[],
  financialRestricted: boolean
): T[] {
  if (!financialRestricted) return rows;
  // Las acciones del audit son operativas (edición, enlace y fusión), pero
  // `detail` puede contener notas libres del perfil. Conservamos la acción,
  // actor y fecha, y retiramos el payload libre para no crear una vía lateral.
  return rows.map(row => ({ ...row, detail: null }));
}

type SaunaBookingFinancialFields = {
  paymentStatus: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  amountClp: number;
  amountPaidClp: number;
  notes?: string | null;
};

export function presentSaunaBookingFinancials<
  T extends SaunaBookingFinancialFields,
>(
  booking: T,
  canViewPayments: boolean
): Omit<
  T,
  | "paymentStatus"
  | "paymentMethod"
  | "paymentReference"
  | "amountClp"
  | "amountPaidClp"
  | "notes"
> & {
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  amountClp: number | null;
  amountPaidClp: number | null;
  notes: string | null;
  paymentRestricted: boolean;
} {
  if (canViewPayments) {
    return {
      ...booking,
      notes: booking.notes ?? null,
      paymentRestricted: false,
    };
  }
  return {
    ...booking,
    paymentStatus: null,
    paymentMethod: null,
    paymentReference: null,
    amountClp: null,
    amountPaidClp: null,
    notes: redactFinancialReservationNotes(booking.notes, false),
    paymentRestricted: true,
  };
}

type BiopoolBookingFinancialFields = {
  paymentStatus: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  originalAmountClp: number;
  discountAmountClp: number;
  discountCodeId: number | null;
  discountCode: string | null;
  amountPaidClp: number;
  refundAmountClp: number;
  refundFeeAmountClp: number;
  refundStatus: string;
  refundFeePercent: string;
  notes?: string | null;
};

export function presentBiopoolBookingFinancials<
  T extends BiopoolBookingFinancialFields,
>(
  booking: T,
  canViewPayments: boolean
): Omit<
  T,
  | "paymentStatus"
  | "paymentMethod"
  | "paymentReference"
  | "originalAmountClp"
  | "discountAmountClp"
  | "discountCodeId"
  | "discountCode"
  | "amountPaidClp"
  | "refundAmountClp"
  | "refundFeeAmountClp"
  | "refundStatus"
  | "refundFeePercent"
  | "notes"
> & {
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  originalAmountClp: number | null;
  discountAmountClp: number | null;
  discountCodeId: number | null;
  discountCode: string | null;
  amountPaidClp: number | null;
  refundAmountClp: number | null;
  refundFeeAmountClp: number | null;
  refundStatus: string | null;
  refundFeePercent: string | null;
  notes: string | null;
  paymentRestricted: boolean;
} {
  if (canViewPayments) {
    return {
      ...booking,
      notes: booking.notes ?? null,
      paymentRestricted: false,
    };
  }
  return {
    ...booking,
    paymentStatus: null,
    paymentMethod: null,
    paymentReference: null,
    originalAmountClp: null,
    discountAmountClp: null,
    discountCodeId: null,
    discountCode: null,
    amountPaidClp: null,
    refundAmountClp: null,
    refundFeeAmountClp: null,
    refundStatus: null,
    refundFeePercent: null,
    notes: redactFinancialReservationNotes(booking.notes, false),
    paymentRestricted: true,
  };
}

export function presentBiopoolActivityFinancials<
  T extends { action: string; detail: string | null },
>(rows: T[], canViewPayments: boolean): T[] {
  if (canViewPayments) return rows;
  return rows.flatMap(row => {
    if (/^(?:payment_|discount_|refund_)/u.test(row.action)) return [];
    if (row.action.startsWith("booking_created")) {
      return [{ ...row, detail: null }];
    }
    if (!row.detail) return [row];
    try {
      const parsed = JSON.parse(row.detail) as unknown;
      const sanitize = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(sanitize);
        if (!value || typeof value !== "object") return value;
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(
              ([key]) =>
                !/^(?:refund|payment|discount|reference|authorizationCode|buyOrder|giftCardCode|webpayToken)$/iu.test(
                  key
                ) && !/(?:amount|balance|total)Clp$/iu.test(key)
            )
            .map(([key, nested]) => [key, sanitize(nested)])
        );
      };
      return [{ ...row, detail: JSON.stringify(sanitize(parsed)) }];
    } catch {
      // Los detalles de actividad son JSON generado por el servidor. Si una
      // fila histórica no cumple el contrato, es más seguro ocultarla.
      return [{ ...row, detail: null }];
    }
  });
}
