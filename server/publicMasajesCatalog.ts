import { Router, Request, Response } from "express";
import { asc, eq } from "drizzle-orm";
import { massageTechniques } from "../drizzle/schema";
import { getDb } from "./db";
import { serializePublicMassageTechnique } from "./masajesRouter";
import { calculateMassageDiscount } from "./massageDiscounts";

const router = Router();

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
    if (!code || items.length === 0 || items.length > 40) {
      return res.status(400).json({ error: "Ingresa un código y agrega al menos un masaje." });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB no disponible" });
    const lines: Array<{ techniqueId: number; originalAmount: number }> = [];
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
      for (let count = 0; count < quantity; count += 1) lines.push({ techniqueId, originalAmount: price });
    }
    const result = await calculateMassageDiscount(db, code, lines);
    res.setHeader("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "El código no es válido." });
  }
});

export default router;
