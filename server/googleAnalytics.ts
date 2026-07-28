import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { massageBookings, massageCheckoutSessions, massageTechniques } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { affectedRows } from "./massageCheckout";

function syntheticClientId(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${parseInt(hash.slice(0, 8), 16)}.${parseInt(hash.slice(8, 16), 16)}`;
}

export async function emitMassagePurchase(requestId: string): Promise<void> {
  if (!ENV.ga4MeasurementId || !ENV.ga4ApiSecret) return;
  const db = await getDb();
  if (!db) return;

  const [checkout] = await db.select().from(massageCheckoutSessions)
    .where(eq(massageCheckoutSessions.getnetRequestId, requestId))
    .limit(1);
  if (!checkout || checkout.purchaseEventSentAt) return;

  const now = new Date();
  const staleClaim = new Date(now.getTime() - 10 * 60 * 1000);
  const claimResult = await db.execute(sql`
    UPDATE massage_checkout_sessions
    SET purchase_event_claimed_at = ${now}
    WHERE checkout_id = ${checkout.checkoutId}
      AND purchase_event_sent_at IS NULL
      AND (purchase_event_claimed_at IS NULL OR purchase_event_claimed_at < ${staleClaim})
  `);
  if (affectedRows(claimResult) !== 1) return;

  try {
    const bookings = await db.select({
      techniqueId: massageBookings.techniqueId,
      techniqueName: massageTechniques.name,
      duration: massageBookings.duration,
      amount: massageBookings.amountPaid,
      discountCode: massageBookings.discountCode,
    })
      .from(massageBookings)
      .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
      .where(eq(massageBookings.getnetRequestId, requestId));
    if (bookings.length === 0) throw new Error("No bookings found for approved transaction");

    const value = bookings.reduce((sum, booking) => sum + Number(booking.amount ?? 0), 0);
    const endpoint = new URL("https://www.google-analytics.com/mp/collect");
    endpoint.searchParams.set("measurement_id", ENV.ga4MeasurementId);
    endpoint.searchParams.set("api_secret", ENV.ga4ApiSecret);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: checkout.gaClientId || syntheticClientId(checkout.checkoutId),
        events: [{
          name: "purchase",
          params: {
            transaction_id: requestId,
            currency: checkout.currency || "CLP",
            value,
            coupon: checkout.coupon || undefined,
            checkout_id: checkout.checkoutId,
            session_id: checkout.gaSessionId ? Number(checkout.gaSessionId) : undefined,
            engagement_time_msec: 1,
            items: bookings.map((booking) => ({
              item_id: String(booking.techniqueId),
              item_name: booking.techniqueName ?? "Masaje",
              item_category: "Masajes",
              item_variant: `${booking.duration} min`,
              price: Number(booking.amount ?? 0),
              quantity: 1,
            })),
          },
        }],
      }),
    });
    if (!response.ok) {
      throw new Error(`GA4 Measurement Protocol respondió ${response.status}`);
    }
    await db.update(massageCheckoutSessions).set({
      purchaseEventSentAt: new Date(),
    }).where(eq(massageCheckoutSessions.checkoutId, checkout.checkoutId));
  } catch (error) {
    await db.update(massageCheckoutSessions).set({
      purchaseEventClaimedAt: null,
    }).where(eq(massageCheckoutSessions.checkoutId, checkout.checkoutId));
    console.error("[GA4] No se pudo emitir purchase para Getnet:", requestId, error);
  }
}
