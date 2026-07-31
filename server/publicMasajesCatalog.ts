import { Router, Request, Response } from "express";
import { asc, eq } from "drizzle-orm";
import { massageTechniques, regularClassPlans } from "../drizzle/schema";
import { getDb } from "./db";
import { serializePublicMassageTechnique } from "./masajesRouter";
import { calculateWellnessCartDiscount, type WellnessDiscountLine } from "./massageDiscounts";
import { z } from "zod";
import { saveCheckoutStart, updateCheckoutProgress } from "./massageCheckout";

const router = Router();

const checkoutIdSchema = z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9-]+$/);
const analyticsItemSchema = z.object({
  item_id: z.string().trim().min(1).max(64),
  item_name: z.string().trim().min(1).max(200),
  item_category: z.literal("Masajes"),
  item_variant: z.string().trim().min(1).max(50),
  price: z.number().nonnegative().max(10_000_000),
  quantity: z.number().int().min(1).max(4),
});

router.post("/checkout/start", async (req: Request, res: Response) => {
  const parsed = z.object({
    checkoutId: checkoutIdSchema,
    items: z.array(analyticsItemSchema).min(1).max(40),
    currency: z.literal("CLP").default("CLP"),
    originalTotal: z.number().nonnegative().max(100_000_000),
    discountTotal: z.number().nonnegative().max(100_000_000),
    finalTotal: z.number().nonnegative().max(100_000_000),
    coupon: z.string().trim().max(50).optional(),
    gaClientId: z.string().trim().max(100).optional(),
    gaSessionId: z.string().trim().max(64).regex(/^\d+$/).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Checkout inválido" });
  try {
    await saveCheckoutStart(parsed.data);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true });
  } catch (error) {
    console.error("[Massage Checkout] Error al iniciar seguimiento:", error);
    return res.status(500).json({ error: "No se pudo registrar el checkout" });
  }
});

router.post("/checkout/progress", async (req: Request, res: Response) => {
  const parsed = z.object({
    checkoutId: checkoutIdSchema,
    step: z.enum(["scheduling", "schedule_selected", "details_completed"]),
    items: z.array(analyticsItemSchema).min(1).max(40).optional(),
    gaClientId: z.string().trim().max(100).optional(),
    gaSessionId: z.string().trim().max(64).regex(/^\d+$/).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Progreso inválido" });
  try {
    await updateCheckoutProgress(parsed.data);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ ok: true });
  } catch (error) {
    console.error("[Massage Checkout] Error al actualizar seguimiento:", error);
    return res.status(500).json({ error: "No se pudo registrar el progreso" });
  }
});

router.get("/techniques", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB no disponible" });

    const techniques = await db
      .select()
      .from(massageTechniques)
      .where(eq(massageTechniques.active, 1))
      .orderBy(asc(massageTechniques.name));

    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json({
      techniques: techniques.map(serializePublicMassageTechnique),
    });
  } catch (error) {
    console.error("[Public Masajes Catalog] Error:", error);
    return res.status(500).json({ error: "No se pudo cargar el catálogo de masajes" });
  }
});

router.post("/discount/validate", async (req: Request, res: Response) => {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const classPlanId = Number(req.body?.classPlanId);
    if (!code || (items.length === 0 && !(Number.isInteger(classPlanId) && classPlanId > 0)) || items.length > 40) {
      return res.status(400).json({ error: "Ingresa un código y agrega al menos un producto." });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB no disponible" });
    const lines: WellnessDiscountLine[] = [];
    for (const raw of items) {
      const techniqueId = Number(raw.techniqueId);
      const duration = Number(raw.duration);
      const quantity = Math.max(1, Math.min(4, Number(raw.quantity) || 1));
      const [technique] = await db.select().from(massageTechniques)
        .where(eq(massageTechniques.id, techniqueId)).limit(1);
      if (!technique || technique.active !== 1) return res.status(400).json({ error: "Uno de los masajes ya no está disponible." });
      const durations = (technique.durations ?? "").split(",").map(Number).filter(Boolean).sort((a, b) => a - b);
      const index = durations.indexOf(duration);
      const prices = [technique.price50min, technique.price80min, technique.price110min];
      const price = index >= 0 && prices[index] ? Number(prices[index]) : 0;
      if (!price) return res.status(400).json({ error: `Precio no configurado para ${technique.name}.` });
      for (let count = 0; count < quantity; count += 1) lines.push({ service: "masajes", techniqueId, originalAmount: price });
    }
    if (Number.isInteger(classPlanId) && classPlanId > 0) {
      const [plan] = await db.select().from(regularClassPlans)
        .where(eq(regularClassPlans.id, classPlanId)).limit(1);
      if (!plan || plan.active !== 1) return res.status(400).json({ error: "El plan de clases ya no está disponible." });
      lines.push({ service: "clases", originalAmount: plan.priceClp });
    }
    const result = await calculateWellnessCartDiscount(db, code, lines);
    res.setHeader("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "El código no es válido." });
  }
});

export default router;
