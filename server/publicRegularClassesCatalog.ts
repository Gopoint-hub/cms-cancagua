import { Router, type Request, type Response } from "express";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  regularClassDisciplines,
  regularClassPlans,
  regularClassSchedules,
  regularClassTeachers,
} from "../drizzle/schema";
import { getDb } from "./db";

export async function loadPublicRegularClassesCatalog() {
  const db = await getDb();
  if (!db) throw new Error("DB no disponible");

  const [plans, disciplines, teachers] = await Promise.all([
    db.select({
      id: regularClassPlans.id,
      code: regularClassPlans.code,
      name: regularClassPlans.name,
      priceClp: regularClassPlans.priceClp,
      creditsPerPeriod: regularClassPlans.creditsPerPeriod,
      benefits: regularClassPlans.benefits,
      displayOrder: regularClassPlans.displayOrder,
    }).from(regularClassPlans)
      .where(eq(regularClassPlans.active, 1))
      .orderBy(asc(regularClassPlans.displayOrder)),
    db.select({
      id: regularClassDisciplines.id,
      name: regularClassDisciplines.name,
      shortDescription: regularClassDisciplines.shortDescription,
      description: regularClassDisciplines.description,
      imageUrl: regularClassDisciplines.imageUrl,
      location: regularClassDisciplines.location,
      capacity: regularClassDisciplines.capacity,
    }).from(regularClassDisciplines)
      .where(eq(regularClassDisciplines.active, 1))
      .orderBy(asc(regularClassDisciplines.name)),
    db.select({
      id: regularClassTeachers.id,
      name: regularClassTeachers.name,
      bio: regularClassTeachers.bio,
      imageUrl: regularClassTeachers.imageUrl,
      color: regularClassTeachers.color,
    }).from(regularClassTeachers)
      .where(eq(regularClassTeachers.active, 1))
      .orderBy(asc(regularClassTeachers.name)),
  ]);

  const disciplineIds = disciplines.map((discipline) => discipline.id);
  const schedules = disciplineIds.length === 0 ? [] : await db.select({
    id: regularClassSchedules.id,
    disciplineId: regularClassSchedules.disciplineId,
    teacherId: regularClassSchedules.teacherId,
    teacherName: regularClassTeachers.name,
    teacherBio: regularClassTeachers.bio,
    teacherImageUrl: regularClassTeachers.imageUrl,
    teacherColor: regularClassTeachers.color,
    dayOfWeek: regularClassSchedules.dayOfWeek,
    startTime: regularClassSchedules.startTime,
    endTime: regularClassSchedules.endTime,
    validFrom: regularClassSchedules.validFrom,
    validTo: regularClassSchedules.validTo,
  }).from(regularClassSchedules)
    .innerJoin(regularClassTeachers, and(
      eq(regularClassSchedules.teacherId, regularClassTeachers.id),
      eq(regularClassTeachers.active, 1),
    ))
    .where(and(
      eq(regularClassSchedules.active, 1),
      inArray(regularClassSchedules.disciplineId, disciplineIds),
      lte(regularClassSchedules.validFrom, sql`CURRENT_DATE`),
      or(isNull(regularClassSchedules.validTo), gte(regularClassSchedules.validTo, sql`CURRENT_DATE`)),
    ))
    .orderBy(asc(regularClassSchedules.dayOfWeek), asc(regularClassSchedules.startTime));

  return {
    plans,
    classes: disciplines.map((discipline) => ({
      ...discipline,
      schedules: schedules.filter((schedule) => schedule.disciplineId === discipline.id),
    })),
    teachers,
    updatedAt: new Date().toISOString(),
  };
}

const router = Router();

router.get("/catalog", async (_req: Request, res: Response) => {
  try {
    const catalog = await loadPublicRegularClassesCatalog();
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(catalog);
  } catch (error) {
    console.error("[Public Regular Classes Catalog] Error:", error);
    return res.status(500).json({ error: "No se pudo cargar el catálogo de clases" });
  }
});

export default router;
