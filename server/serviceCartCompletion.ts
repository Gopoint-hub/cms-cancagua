import { eq } from "drizzle-orm";
import {
  massageBookings,
  regularClassMemberships,
  serviceCartCheckoutOrders,
  serviceCartNotifications,
} from "../drizzle/schema";
import { finalizeApprovedBiopoolOrder } from "./biopoolWebpay";
import { getDb } from "./db";
import { sendBookingConfirmations } from "./getnetWebhook";
import { syncMassageSale } from "./massageSales";
import { finalizeApprovedSaunaOrder } from "./saunaWebpay";

export type ServiceCartChildOrder = {
  module: "biopools" | "sauna" | "massages" | "regular_classes";
  id: number;
  totalClp: number;
  fullyDiscounted?: boolean;
};

export function isFullyDiscountedServiceCart(totalClp: number, childOrders: ServiceCartChildOrder[]): boolean {
  return totalClp === 0
    && childOrders.length > 0
    && childOrders.every(child => child.totalClp === 0 && child.fullyDiscounted === true);
}

/**
 * Confirma un carrito cubierto íntegramente por un código de descuento. No se
 * crea un pago de $0 ni se contacta a Transbank/Getnet; el código queda como
 * medio de pago y se conserva el correo consolidado del carrito.
 */
export async function finalizeFullyDiscountedServiceCart(input: {
  cartOrderId: number;
  publicToken: string;
  childOrders: ServiceCartChildOrder[];
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  if (!isFullyDiscountedServiceCart(0, input.childOrders)) {
    throw new Error("El carrito no está completamente cubierto por el descuento");
  }

  for (const child of input.childOrders) {
    if (child.module === "biopools") {
      await finalizeApprovedBiopoolOrder(child.id, { kind: "discount" }, { consolidatedCart: true });
    } else if (child.module === "sauna") {
      await finalizeApprovedSaunaOrder(child.id, { kind: "discount" }, { consolidatedCart: true });
    } else if (child.module === "massages") {
      const [booking] = await db.select({ paymentStatus: massageBookings.paymentStatus })
        .from(massageBookings).where(eq(massageBookings.id, child.id)).limit(1);
      if (!booking) throw new Error(`Reserva de masaje ${child.id} no encontrada`);
      if (booking.paymentStatus !== "paid") {
        await db.update(massageBookings).set({
          paymentStatus: "paid",
          status: "pending",
          manualPaymentMethod: "discount_code",
        }).where(eq(massageBookings.id, child.id));
        try {
          await sendBookingConfirmations(child.id, { consolidatedCart: true });
        } catch (error) {
          console.error("[service-cart:discount] Reserva confirmada; falló la notificación individual", { bookingId: child.id, error });
        }
      }
      try {
        await syncMassageSale(child.id);
      } catch (error) {
        console.error("[service-cart:discount] Reserva confirmada; falló la sincronización de venta", { bookingId: child.id, error });
      }
    } else {
      const [membership] = await db.select({ paymentStatus: regularClassMemberships.paymentStatus })
        .from(regularClassMemberships).where(eq(regularClassMemberships.id, child.id)).limit(1);
      if (!membership) throw new Error(`Plan de clases ${child.id} no encontrado`);
      if (membership.paymentStatus !== "paid") {
        await db.update(regularClassMemberships).set({
          paymentStatus: "paid",
          status: "active",
          paymentMethod: "discount_code",
          paymentReference: input.publicToken,
          paidAt: new Date(),
        }).where(eq(regularClassMemberships.id, child.id));
      }
    }
  }

  await db.update(serviceCartCheckoutOrders).set({
    status: "paid",
    webpayStatus: "NOT_REQUIRED",
    responseCode: 0,
    rawResponse: JSON.stringify({ paymentRequired: false, reason: "fully_discounted" }),
    error: null,
    paidAt: new Date(),
    completedAt: new Date(),
  }).where(eq(serviceCartCheckoutOrders.id, input.cartOrderId));

  try {
    await db.insert(serviceCartNotifications).values({
      cartOrderId: input.cartOrderId,
      type: "confirmation",
      channel: "email",
      scheduledAt: new Date(),
    }).onDuplicateKeyUpdate({ set: { cartOrderId: input.cartOrderId } });
  } catch (error) {
    console.error("[service-cart:discount] Carrito confirmado; no se pudo encolar el correo consolidado", { cartOrderId: input.cartOrderId, error });
  }
}
