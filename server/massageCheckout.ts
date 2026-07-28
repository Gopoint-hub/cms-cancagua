import { and, eq, inArray, lt } from "drizzle-orm";
import { massageCheckoutSessions } from "../drizzle/schema";
import { getDb } from "./db";

export type CheckoutAnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category: "Masajes";
  item_variant: string;
  price: number;
  quantity: number;
};

const TERMINAL_STATUSES = new Set(["paid", "payment_failed", "abandoned"]);
const ABANDONMENT_POLL_MS = 15 * 60 * 1000;

export async function saveCheckoutStart(input: {
  checkoutId: string;
  items: CheckoutAnalyticsItem[];
  currency: string;
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
  coupon?: string;
  gaClientId?: string;
  gaSessionId?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const [existing] = await db.select({ status: massageCheckoutSessions.status })
    .from(massageCheckoutSessions)
    .where(eq(massageCheckoutSessions.checkoutId, input.checkoutId))
    .limit(1);
  if (existing && TERMINAL_STATUSES.has(existing.status)) return;

  await db.insert(massageCheckoutSessions).values({
    checkoutId: input.checkoutId,
    status: "started",
    items: JSON.stringify(input.items),
    currency: input.currency,
    originalTotal: String(input.originalTotal),
    discountTotal: String(input.discountTotal),
    finalTotal: String(input.finalTotal),
    coupon: input.coupon,
    gaClientId: input.gaClientId,
    gaSessionId: input.gaSessionId,
    startedAt: now,
    lastActivityAt: now,
  }).onDuplicateKeyUpdate({
    set: {
      items: JSON.stringify(input.items),
      currency: input.currency,
      originalTotal: String(input.originalTotal),
      discountTotal: String(input.discountTotal),
      finalTotal: String(input.finalTotal),
      coupon: input.coupon ?? null,
      gaClientId: input.gaClientId ?? null,
      gaSessionId: input.gaSessionId ?? null,
      lastActivityAt: now,
    },
  });
}

export async function updateCheckoutProgress(input: {
  checkoutId: string;
  step: "scheduling" | "schedule_selected" | "details_completed";
  items?: CheckoutAnalyticsItem[];
  gaClientId?: string;
  gaSessionId?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [existing] = await db.select({ status: massageCheckoutSessions.status })
    .from(massageCheckoutSessions)
    .where(eq(massageCheckoutSessions.checkoutId, input.checkoutId))
    .limit(1);
  const now = new Date();
  const status = input.step === "details_completed" ? "details_completed" : "scheduling";
  if (!existing) {
    await db.insert(massageCheckoutSessions).values({
      checkoutId: input.checkoutId,
      status,
      items: JSON.stringify(input.items ?? []),
      gaClientId: input.gaClientId,
      gaSessionId: input.gaSessionId,
      lastActivityAt: now,
      schedulingStartedAt: input.step === "scheduling" ? now : undefined,
      scheduleSelectedAt: input.step === "schedule_selected" ? now : undefined,
      detailsCompletedAt: input.step === "details_completed" ? now : undefined,
    }).onDuplicateKeyUpdate({ set: { lastActivityAt: now } });
    return;
  }
  if (TERMINAL_STATUSES.has(existing.status) || existing.status === "payment_started") return;

  await db.update(massageCheckoutSessions).set({
    status,
    lastActivityAt: now,
    gaClientId: input.gaClientId ?? undefined,
    gaSessionId: input.gaSessionId ?? undefined,
    items: input.items ? JSON.stringify(input.items) : undefined,
    schedulingStartedAt: input.step === "scheduling" ? now : undefined,
    scheduleSelectedAt: input.step === "schedule_selected" ? now : undefined,
    detailsCompletedAt: input.step === "details_completed" ? now : undefined,
  }).where(eq(massageCheckoutSessions.checkoutId, input.checkoutId));
}

export async function attachCheckoutPayment(input: {
  checkoutId?: string;
  requestId: string;
  bookingIds: number[];
  originalTotal: number;
  discountTotal: number;
  finalTotal: number;
}): Promise<void> {
  if (!input.checkoutId) return;
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const paymentValues = {
    status: "payment_started",
    getnetRequestId: input.requestId,
    bookingIds: JSON.stringify(input.bookingIds),
    originalTotal: String(input.originalTotal),
    discountTotal: String(input.discountTotal),
    finalTotal: String(input.finalTotal),
    paymentStartedAt: now,
    lastActivityAt: now,
  } as const;
  await db.insert(massageCheckoutSessions).values({
    checkoutId: input.checkoutId,
    items: "[]",
    ...paymentValues,
  }).onDuplicateKeyUpdate({ set: paymentValues });
}

export async function markCheckoutPaid(requestId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db.update(massageCheckoutSessions).set({
    status: "paid",
    paidAt: now,
    lastActivityAt: now,
    failedAt: null,
    abandonedAt: null,
  }).where(eq(massageCheckoutSessions.getnetRequestId, requestId));
}

export async function markCheckoutPaymentFailed(requestId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db.update(massageCheckoutSessions).set({
    status: "payment_failed",
    failedAt: now,
    lastActivityAt: now,
  }).where(eq(massageCheckoutSessions.getnetRequestId, requestId));
}

export async function markCheckoutInitializationFailed(checkoutId?: string): Promise<void> {
  if (!checkoutId) return;
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db.update(massageCheckoutSessions).set({
    status: "payment_failed",
    failedAt: now,
    lastActivityAt: now,
  }).where(eq(massageCheckoutSessions.checkoutId, checkoutId));
}

export async function markAbandonedMassageCheckouts(now = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const checkoutCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const paymentCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  await db.update(massageCheckoutSessions).set({
    status: "abandoned",
    abandonedAt: now,
  }).where(and(
    inArray(massageCheckoutSessions.status, ["started", "scheduling", "details_completed"]),
    lt(massageCheckoutSessions.lastActivityAt, checkoutCutoff),
  ));
  await db.update(massageCheckoutSessions).set({
    status: "abandoned",
    abandonedAt: now,
  }).where(and(
    eq(massageCheckoutSessions.status, "payment_started"),
    lt(massageCheckoutSessions.lastActivityAt, paymentCutoff),
  ));
}

let schedulerStarted = false;

export function startMassageCheckoutScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  void markAbandonedMassageCheckouts().catch((error) =>
    console.error("[Massage Checkout] No se pudieron marcar abandonos:", error)
  );
  const timer = setInterval(() => {
    void markAbandonedMassageCheckouts().catch((error) =>
      console.error("[Massage Checkout] No se pudieron marcar abandonos:", error)
    );
  }, ABANDONMENT_POLL_MS);
  timer.unref();
  console.log("[Massage Checkout] Seguimiento de abandonos activo");
}

export function affectedRows(result: unknown): number {
  const candidate = result as any;
  return Number(candidate?.[0]?.affectedRows ?? candidate?.affectedRows ?? 0);
}
