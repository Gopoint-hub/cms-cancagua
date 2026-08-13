import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { clients } from "../drizzle/schema";
import { eq, like, or, desc, asc, sql, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { hasB2CAccess } from "@shared/permissions";
import { loadClientBIProfiles } from "./clientBIData";

const adminOrEditor = async (role: string) => {
  if (!hasB2CAccess(role))
    throw new TRPCError({ code: "FORBIDDEN" });
};

const requireSuperAdmin = (role: string) => {
  if (role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN" });
};

type ClientBIStats = {
  totalClientes: number;
  totalGasto: number;
  promedioGasto: number;
  promedioVisitas: number;
  clientes1visita: number;
  clientes2_5: number;
  clientes6plus: number;
  leales: number;
  femenino: number;
  masculino: number;
  conEmail: number;
  conOrigen: number;
  nuevos30d: number;
};

type ClientBICharts = {
  porMes: Array<{ mes: string; clientes: number; ingresos: number }>;
  generos: Array<{ genero: string; n: number }>;
  frecuencia: Array<{ tramo: string; n: number; gasto: number }>;
  topClientes: Array<{ name: string | null; email: string | null; totalGasto: number; totalVisitas: number; ultimaVisita: string | null; genero: string }>;
  crecimiento: Array<{ mes: string; nuevos: number }>;
  idiomas: Array<{ idioma: string; n: number }>;
  retencion: { leales: number; solo2025: number; solo2026: number };
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
  getBIStats: protectedProcedure.query(async ({ ctx }): Promise<ClientBIStats> => {
    requireSuperAdmin(ctx.user.role);
    const profiles = await loadClientBIProfiles();
    const totalGasto = profiles.reduce((sum, profile) => sum + profile.totalGasto, 0);
    const totalVisitas = profiles.reduce((sum, profile) => sum + profile.totalVisitas, 0);
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    return {
      totalClientes: profiles.length,
      totalGasto,
      promedioGasto: profiles.length ? totalGasto / profiles.length : 0,
      promedioVisitas: profiles.length ? totalVisitas / profiles.length : 0,
      clientes1visita: profiles.filter(profile => profile.totalVisitas === 1).length,
      clientes2_5: profiles.filter(profile => profile.totalVisitas >= 2 && profile.totalVisitas <= 5).length,
      clientes6plus: profiles.filter(profile => profile.totalVisitas >= 6).length,
      leales: profiles.filter(profile => profile.visitas2025 > 0 && profile.visitas2026 > 0).length,
      femenino: profiles.filter(profile => profile.genero === "F").length,
      masculino: profiles.filter(profile => profile.genero === "M").length,
      conEmail: profiles.filter(profile => Boolean(profile.email)).length,
      conOrigen: profiles.filter(profile => Boolean(profile.origen)).length,
      nuevos30d: profiles.filter(profile => profile.createdAt >= cutoff).length,
    };
  }),

  // ─── Datos para gráficos ───
  getBICharts: protectedProcedure.query(async ({ ctx }): Promise<ClientBICharts> => {
    requireSuperAdmin(ctx.user.role);
    const profiles = await loadClientBIProfiles();
    const groupBy = (keyFor: (profile: typeof profiles[number]) => string | null) => {
      const groups = new Map<string, typeof profiles>();
      for (const profile of profiles) {
        const key = keyFor(profile);
        if (!key) continue;
        const current = groups.get(key) ?? [];
        current.push(profile);
        groups.set(key, current);
      }
      return groups;
    };
    const porMes = Array.from(groupBy(profile => profile.ultimaVisita?.slice(0, 7) ?? null))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([mes, matches]) => ({
        mes,
        clientes: matches.length,
        ingresos: matches.reduce((sum, profile) => sum + profile.totalGasto, 0),
      }));
    const generos = Array.from(groupBy(profile => profile.genero))
      .map(([genero, matches]) => ({ genero, n: matches.length }));
    const tramo = (visits: number) => visits <= 1
      ? "1 visita"
      : visits === 2
        ? "2 visitas"
        : visits <= 5
          ? "3–5 visitas"
          : visits <= 10
            ? "6–10 visitas"
            : "11+ visitas";
    const frequencyOrder = ["1 visita", "2 visitas", "3–5 visitas", "6–10 visitas", "11+ visitas"];
    const frecuencia = frequencyOrder.map(label => {
      const matches = profiles.filter(profile => tramo(profile.totalVisitas) === label);
      return { tramo: label, n: matches.length, gasto: matches.reduce((sum, profile) => sum + profile.totalGasto, 0) };
    });
    const topClientes = profiles
      .filter(profile => profile.totalGasto > 0)
      .sort((left, right) => right.totalGasto - left.totalGasto)
      .slice(0, 15)
      .map(profile => ({
        name: profile.name,
        email: profile.email,
        totalGasto: profile.totalGasto,
        totalVisitas: profile.totalVisitas,
        ultimaVisita: profile.ultimaVisita,
        genero: profile.genero,
      }));
    const crecimiento = Array.from(groupBy(profile => profile.createdAt.slice(0, 7)))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([mes, matches]) => ({ mes, nuevos: matches.length }));
    const idiomas = Array.from(groupBy(profile => profile.idioma && profile.idioma !== "es" ? profile.idioma : null))
      .map(([idioma, matches]) => ({ idioma, n: matches.length }))
      .sort((left, right) => right.n - left.n)
      .slice(0, 10);
    const retencion = {
      leales: profiles.filter(profile => profile.visitas2025 > 0 && profile.visitas2026 > 0).length,
      solo2025: profiles.filter(profile => profile.visitas2025 > 0 && profile.visitas2026 === 0).length,
      solo2026: profiles.filter(profile => profile.visitas2025 === 0 && profile.visitas2026 > 0).length,
    };
    return {
      porMes,
      generos,
      frecuencia,
      topClientes,
      crecimiento,
      idiomas,
      retencion,
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
