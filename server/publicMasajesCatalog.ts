import { Router, Request, Response } from "express";
import { asc, eq } from "drizzle-orm";
import { massageTechniques } from "../drizzle/schema";
import { getDb } from "./db";
import { serializePublicMassageTechnique } from "./masajesRouter";

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

export default router;
