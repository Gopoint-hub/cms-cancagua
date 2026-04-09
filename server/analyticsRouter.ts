import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { fetchDashboardData } from "./analyticsApi";

export const analyticsRouter = router({
  getDashboard: protectedProcedure
    .input(z.object({
      startDate: z.string(), // YYYY-MM-DD
      endDate: z.string(),   // YYYY-MM-DD
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return await fetchDashboardData(input.startDate, input.endDate);
    }),
});
