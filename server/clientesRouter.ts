import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { clients } from "../drizzle/schema";
import { eq, like, or, desc, asc, sql, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const adminOrEditor = async (role: string) => {
  if (!["super_admin", "admin", "editor"].includes(role))
    throw new TRPCError({ code: "FORBIDDEN" });
};

export const clientesRouter = router({

  // ─── Lista paginada con búsqueda y filtros ───
  getAll: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
      orderBy: z.enum(["ultima_visita", "total_visitas", "total_gasto", "name", "created_at"]).default("ultima_visita"),
      orderDir: z.enum(["asc", "desc"]).default("desc"),
      genero: z.enum(["M", "F", "nd", ""]).optional(),
      esLeal: z.boolean().optional(),
      minVisitas: z.number().optional(),
      servicio: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const search = input?.search?.trim() || "";
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;

      const conditions: any[] = [];
      if (search) conditions.push(
        or(
          like(clients.name, `%${search}%`),
          like(clients.email, `%${search}%`),
          like(clients.phone, `%${search}%`),
          like(clients.origen as any, `%${search}%`),
        )
      );
      if (input?.genero) conditions.push(eq(clients.genero as any, input.genero));
      if (input?.esLeal !== undefined) conditions.push(eq(clients.esLeal as any, input.esLeal ? 1 : 0));
      if (input?.minVisitas) conditions.push(gte(clients.totalVisitas as any, input.minVisitas));
      if (input?.servicio) conditions.push(like(clients.serviciosUsados as any, `%${input.servicio}%`));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const orderCol = {
        ultima_visita: clients.ultimaVisita,
        total_visitas: clients.totalVisitas,
        total_gasto: clients.totalGasto,
        name: clients.name,
        created_at: clients.createdAt,
      }[input?.orderBy ?? "ultima_visita"] as any;

      const [items, [{ count }]] = await Promise.all([
        db.select().from(clients).where(where)
          .orderBy(input?.orderDir === "asc" ? asc(orderCol) : desc(orderCol))
          .limit(limit).offset(offset),
        db.select({ count: sql<number>`COUNT(*)` }).from(clients).where(where),
      ]);

      return { items, total: Number(count) };
    }),

  // ─── Detalle de un cliente ───
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return null;
      const [client] = await db.select().from(clients).where(eq(clients.id, input.id)).limit(1);
      return client ?? null;
    }),

  // ─── KPIs para el dashboard ───
  getBIStats: protectedProcedure.query(async ({ ctx }) => {
    await adminOrEditor(ctx.user.role);
    const db = await getDb();
    if (!db) return null;

    const [totals] = await db.select({
      totalClientes: sql<number>`COUNT(*)`,
      totalGasto: sql<string>`SUM(total_gasto)`,
      promedioGasto: sql<string>`AVG(total_gasto)`,
      promedioVisitas: sql<string>`AVG(total_visitas)`,
      clientes1visita: sql<number>`SUM(CASE WHEN total_visitas = 1 THEN 1 ELSE 0 END)`,
      clientes2_5: sql<number>`SUM(CASE WHEN total_visitas BETWEEN 2 AND 5 THEN 1 ELSE 0 END)`,
      clientes6plus: sql<number>`SUM(CASE WHEN total_visitas >= 6 THEN 1 ELSE 0 END)`,
      leales: sql<number>`SUM(es_leal)`,
      femenino: sql<number>`SUM(CASE WHEN genero = 'F' THEN 1 ELSE 0 END)`,
      masculino: sql<number>`SUM(CASE WHEN genero = 'M' THEN 1 ELSE 0 END)`,
      conEmail: sql<number>`SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END)`,
      conOrigen: sql<number>`SUM(CASE WHEN origen IS NOT NULL AND origen != '' THEN 1 ELSE 0 END)`,
    }).from(clients);

    const [nuevos30d] = await db.select({ n: sql<number>`COUNT(*)` }).from(clients)
      .where(gte(clients.createdAt, sql`DATE_SUB(NOW(), INTERVAL 30 DAY)` as any));

    return { ...(totals ?? {}), nuevos30d: nuevos30d?.n ?? 0 };
  }),

  // ─── Datos para gráficos ───
  getBICharts: protectedProcedure.query(async ({ ctx }) => {
    await adminOrEditor(ctx.user.role);
    const db = await getDb();
    if (!db) return null;

    // Ingresos y clientes nuevos por mes
    const [porMes] = await (db as any).execute(sql`
      SELECT DATE_FORMAT(ultima_visita,'%Y-%m') mes,
             COUNT(*) clientes,
             SUM(total_gasto) ingresos
      FROM clients WHERE ultima_visita IS NOT NULL
      GROUP BY mes ORDER BY mes
    `);

    // Distribución por género
    const [generos] = await (db as any).execute(sql`
      SELECT genero, COUNT(*) n FROM clients GROUP BY genero
    `);

    // Frecuencia de visitas
    const [frecuencia] = await (db as any).execute(sql`
      SELECT
        CASE
          WHEN total_visitas = 1 THEN '1 visita'
          WHEN total_visitas = 2 THEN '2 visitas'
          WHEN total_visitas BETWEEN 3 AND 5 THEN '3–5 visitas'
          WHEN total_visitas BETWEEN 6 AND 10 THEN '6–10 visitas'
          ELSE '11+ visitas'
        END as tramo,
        COUNT(*) n,
        SUM(total_gasto) gasto
      FROM clients GROUP BY tramo ORDER BY MIN(total_visitas)
    `);

    // Top 15 clientes por gasto
    const topClientes = await db.select({
      name: clients.name, email: clients.email,
      totalGasto: clients.totalGasto, totalVisitas: clients.totalVisitas,
      ultimaVisita: clients.ultimaVisita, genero: clients.genero,
    }).from(clients)
      .where(gte(clients.totalGasto as any, 1))
      .orderBy(desc(clients.totalGasto as any))
      .limit(15);

    // Registro de nuevos clientes por mes (desde created_at)
    const [crecimiento] = await (db as any).execute(sql`
      SELECT DATE_FORMAT(created_at,'%Y-%m') mes, COUNT(*) nuevos
      FROM clients GROUP BY mes ORDER BY mes
    `);

    // Top idiomas (excl. español)
    const [idiomas] = await (db as any).execute(sql`
      SELECT idioma, COUNT(*) n FROM clients
      WHERE idioma IS NOT NULL AND idioma != 'es' AND idioma != ''
      GROUP BY idioma ORDER BY n DESC LIMIT 10
    `);

    // Distribución leales vs nuevos vs reactivación
    const [retencion] = await (db as any).execute(sql`
      SELECT
        SUM(es_leal) leales,
        SUM(CASE WHEN visitas_2025 > 0 AND visitas_2026 = 0 THEN 1 ELSE 0 END) solo2025,
        SUM(CASE WHEN visitas_2025 = 0 AND visitas_2026 > 0 THEN 1 ELSE 0 END) solo2026
      FROM clients
    `);

    return {
      porMes: Array.isArray(porMes) ? porMes : [],
      generos: Array.isArray(generos) ? generos : [],
      frecuencia: Array.isArray(frecuencia) ? frecuencia : [],
      topClientes,
      crecimiento: Array.isArray(crecimiento) ? crecimiento : [],
      idiomas: Array.isArray(idiomas) ? idiomas : [],
      retencion: Array.isArray(retencion) ? retencion[0] : {},
    };
  }),

  // ─── Actualizar campo manual (origen, notas) ───
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      origen: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(clients).set(data as any).where(eq(clients.id, id));
      return { success: true };
    }),
});
