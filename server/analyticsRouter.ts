import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { fetchDashboardData } from "./analyticsApi";
import * as db from "./db";

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

      const data = await fetchDashboardData(input.startDate, input.endDate);

      // Guardar en BD (sobreescribe si ya existe)
      await db.upsertAnalyticsCache(input.periodKey, data);

      return data;
    }),
});
