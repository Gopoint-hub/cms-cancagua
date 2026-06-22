import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { generateQuoteNumber, calculateValidUntil } from "./quoteHelpers";
import { invokeLLM } from "./_core/llm";
import { isBundledDesignHtml, convertBundledHtmlToEmail } from "./newsletterHtmlProcessor";
import { conciergeRouter } from "./conciergeRouter";
import { analyticsRouter } from "./analyticsRouter";
import { masajesRouter } from "./masajesRouter";
import { clientesRouter } from "./clientesRouter";
import { marketingRouter } from "./marketingRouter";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  // Módulo Concierge - Sistema de ventas para afiliados
  concierge: conciergeRouter,
  // Módulo Analytics - Dashboard con datos de Google Ads, Meta Ads, Search Console, Skedu
  analytics: analyticsRouter,
  // Módulo Masajes - Reservas, terapeutas, inventario y analítica del área de masajes
  masajes: masajesRouter,
  clientes: clientesRouter,
  marketing: marketingRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),