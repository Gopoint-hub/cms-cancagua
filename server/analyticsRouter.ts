import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { fetchDashboardData } from "./analyticsApi";
import * as db from "./db";
import { getDb } from "./db";
import { analyticsCache } from "../drizzle/schema";
import { like } from "drizzle-orm";

export const analyticsRouter = router({
  /** Carga datos desde la BD (instantáneo, sin llamar APIs) */
  getCached: protectedProcedure
    .input(z.object({
      periodKey: z.string(), // "2026-04"
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const cached = await db.getAnalyticsCache(input.periodKey);
      if (!cached) return null;
      return {
        data: cached.data,
        updatedAt: cached.updatedAt,
      };
    }),

  /** Consulta APIs externas, guarda en BD y devuelve datos frescos */
  refresh: protectedProcedure
    .input(z.object({
      startDate: z.string(), // YYYY-MM-DD
      endDate: z.string(),   // YYYY-MM-DD
      periodKey: z.string(), // "2026-04"
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Obtener datos anteriores de la BD para preservar lo que falle
      const previous = await db.getAnalyticsCache(input.periodKey);
      const prevData = previous?.data || null;

      // Consultar APIs externas
      const freshData = await fetchDashboardData(input.startDate, input.endDate);

      // Merge: si una fuente retorna null, mantener dato anterior
      const merged = {
        ...freshData,
        googleAds: freshData.googleAds || prevData?.googleAds || null,
        metaAds: freshData.metaAds || prevData?.metaAds || null,
        searchConsole: freshData.searchConsole || prevData?.searchConsole || null,
        searchPages: freshData.searchPages.length > 0 ? freshData.searchPages : (prevData?.searchPages || []),
        skedu: freshData.skedu || prevData?.skedu || null,
        keywordTrends: freshData.keywordTrends.length > 0 ? freshData.keywordTrends : (prevData?.keywordTrends || []),
      };

      // Recalcular summary con datos mergeados
      const totalInvestment = (merged.googleAds?.totalCost || 0) + (merged.metaAds?.totalSpend || 0);
      const totalRevenue = merged.skedu?.totalRevenue || 0;
      const totalConversions = (merged.googleAds?.totalConversions || 0) + (merged.metaAds?.totalPurchases || 0);

      merged.summary = {
        totalInvestment,
        totalRevenue,
        roas: totalInvestment > 0 ? totalRevenue / totalInvestment : 0,
        totalConversions,
        costPerConversion: totalConversions > 0 ? totalInvestment / totalConversions : 0,
      };

      // Guardar en BD (sobreescribe)
      await db.upsertAnalyticsCache(input.periodKey, merged);

      return merged;
    }),

  /** Datos anuales: todos los meses de un año desde la BD */
  getAnnual: protectedProcedure
    .input(z.object({
      year: z.string(), // "2026"
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const database = await getDb();
      if (!database) return [];
      const rows = await database
        .select()
        .from(analyticsCache)
        .where(like(analyticsCache.periodKey, `${input.year}-%`));

      return rows
        .map(r => ({
          periodKey: r.periodKey,
          data: JSON.parse(r.data),
          updatedAt: r.updatedAt,
        }))
        .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
    }),
});
