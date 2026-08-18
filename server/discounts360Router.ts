import { TRPCError } from "@trpc/server";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  biopoolServices,
  discountCodeUsages,
  discountCodes,
  massageDiscountCodeTechniques,
  massageTechniques,
  regularClassPlans,
  saunaServices,
} from "../drizzle/schema";
import { parseValidWeekdays } from "./massageDiscounts";
import { hasCmsPermission } from "@shared/permissions";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";

export const DISCOUNT_MODULES = ["masajes", "clases", "biopiscinas", "sauna"] as const;
type DiscountModule = typeof DISCOUNT_MODULES[number];

const scopeSchema = z.object({
  module: z.enum(DISCOUNT_MODULES),
  all: z.boolean(),
  serviceIds: z.array(z.string().trim().min(1)).default([]),
});

const discountInput = z.object({
  code: z.string().trim().min(3).max(50),
  name: z.string().trim().min(2).max(250),
  description: z.string().trim().max(4000).optional(),
  discountType: z.enum(["percentage", "fixed", "nth_free"]),
  // Días de la semana en que corre el código (0=domingo). Vacío = todos.
  validWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  discountValue: z.number().int().positive(),
  startsAt: z.date().nullable().optional(),
  expiresAt: z.date().nullable().optional(),
  active: z.number().int().min(0).max(1).default(1),
  scopes: z.array(scopeSchema).min(1, "Selecciona al menos un módulo de servicios."),
});

function requireAdminDiscountAccess(user: any) {
  if (!hasCmsPermission(user, "module.admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permiso para gestionar códigos de descuento." });
  }
}

function parseServices(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function normalizeScopes(scopes: z.infer<typeof scopeSchema>[]) {
  const byModule = new Map<DiscountModule, { module: DiscountModule; all: boolean; serviceIds: string[] }>();
  for (const scope of scopes) {
    const serviceIds = Array.from(new Set(scope.serviceIds.map(String).filter(Boolean)));
    if (!scope.all && serviceIds.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Selecciona al menos un servicio de ${scope.module}.`,
      });
    }
    byModule.set(scope.module, { module: scope.module, all: scope.all, serviceIds: scope.all ? [] : serviceIds });
  }
  return Array.from(byModule.values());
}

function scopesToTokens(scopes: ReturnType<typeof normalizeScopes>) {
  return scopes.flatMap((scope) => scope.all
    ? [`${scope.module}:*`]
    : scope.serviceIds.map((serviceId) => `${scope.module}:${serviceId}`));
}

function tokensToScopes(tokens: string[], legacyTechniqueIds: number[]) {
  const result: Array<{ module: DiscountModule; all: boolean; serviceIds: string[] }> = [];
  for (const module of DISCOUNT_MODULES) {
    const wildcard = tokens.includes(`${module}:*`);
    const ids = tokens
      .filter((token) => token.startsWith(`${module}:`) && token !== `${module}:*`)
      .map((token) => token.slice(module.length + 1));
    const legacyAll = tokens.includes(module);
    if (wildcard || legacyAll || ids.length) {
      result.push({
        module,
        all: wildcard || (legacyAll && !(module === "masajes" && legacyTechniqueIds.length)),
        serviceIds: module === "masajes" && legacyAll && legacyTechniqueIds.length
          ? legacyTechniqueIds.map(String)
          : ids,
      });
    }
  }
  if (tokens.length === 0 || tokens.includes("all")) {
    return DISCOUNT_MODULES.map((module) => ({ module, all: true, serviceIds: [] }));
  }
  return result;
}

async function listCodes(db: any) {
  const rows = await db.select({
    id: discountCodes.id,
    code: discountCodes.code,
    name: discountCodes.name,
    description: discountCodes.description,
    discountType: discountCodes.discountType,
    validWeekdays: discountCodes.validWeekdays,
    discountValue: discountCodes.discountValue,
    startsAt: discountCodes.startsAt,
    expiresAt: discountCodes.expiresAt,
    active: discountCodes.active,
    currentUses: discountCodes.currentUses,
    applicableServices: discountCodes.applicableServices,
    createdAt: discountCodes.createdAt,
  }).from(discountCodes)
    .orderBy(asc(discountCodes.code));
  const [mappings, usageTotals] = await Promise.all([
    db.select().from(massageDiscountCodeTechniques),
    db.select({
      discountCodeId: discountCodeUsages.discountCodeId,
      totalDiscounted: sql<string>`COALESCE(SUM(${discountCodeUsages.discountAmount}), 0)`,
    }).from(discountCodeUsages)
      .groupBy(discountCodeUsages.discountCodeId),
  ]);
  const usageByCode = new Map(
    usageTotals.map((usage: any) => [usage.discountCodeId, usage.totalDiscounted]),
  );
  return rows.map((row: any) => {
    const techniqueIds = mappings
      .filter((mapping: any) => mapping.discountCodeId === row.id)
      .map((mapping: any) => mapping.techniqueId);
    return {
      ...row,
      totalDiscounted: usageByCode.get(row.id) ?? "0",
      scopes: tokensToScopes(parseServices(row.applicableServices), techniqueIds),
      validWeekdays: parseValidWeekdays((row as any).validWeekdays),
    };
  });
}

export const discounts360Router = router({
  catalog: protectedProcedure.query(async ({ ctx }) => {
    requireAdminDiscountAccess(ctx.user);
    const db = await getDb();
    if (!db) return [];
    const [techniques, plans, pools, saunas] = await Promise.all([
      db.select({ id: massageTechniques.id, name: massageTechniques.name })
        .from(massageTechniques).where(eq(massageTechniques.active, 1)).orderBy(asc(massageTechniques.name)),
      db.select({ id: regularClassPlans.id, name: regularClassPlans.name })
        .from(regularClassPlans).where(eq(regularClassPlans.active, 1)).orderBy(asc(regularClassPlans.displayOrder)),
      db.select({ id: biopoolServices.id, name: biopoolServices.name })
        .from(biopoolServices).where(ne(biopoolServices.status, "archived")).orderBy(asc(biopoolServices.name)),
      db.select({ id: saunaServices.id, name: saunaServices.name })
        .from(saunaServices).where(eq(saunaServices.published, 1)).orderBy(asc(saunaServices.partySize)),
    ]);
    return [
      { id: "masajes" as const, name: "Masajes", itemName: "técnicas", services: techniques.map((item) => ({ id: String(item.id), name: item.name })) },
      { id: "clases" as const, name: "Clases regulares", itemName: "planes", services: plans.map((item) => ({ id: String(item.id), name: item.name })) },
      { id: "biopiscinas" as const, name: "Biopiscinas", itemName: "servicios", services: pools.map((item) => ({ id: String(item.id), name: item.name })) },
      { id: "sauna" as const, name: "Sauna", itemName: "servicios", services: saunas.map((item) => ({ id: String(item.id), name: item.name })) },
    ];
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    requireAdminDiscountAccess(ctx.user);
    const db = await getDb();
    return db ? listCodes(db) : [];
  }),

  create: protectedProcedure.input(discountInput).mutation(async ({ ctx, input }) => {
    requireAdminDiscountAccess(ctx.user);
    if (input.discountType === "percentage" && input.discountValue > 100) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "El porcentaje no puede superar 100%." });
    }
    if (input.startsAt && input.expiresAt && input.startsAt >= input.expiresAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "La fecha de término debe ser posterior al inicio." });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const normalized = input.code.toUpperCase();
    const [existing] = await db.select({ id: discountCodes.id }).from(discountCodes)
      .where(eq(discountCodes.code, normalized)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Ese código ya existe." });
    const scopes = normalizeScopes(input.scopes);
    const [created] = await db.insert(discountCodes).values({
      code: normalized,
      name: input.name,
      description: input.description || null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      applicableServices: JSON.stringify(scopesToTokens(scopes)),
      validWeekdays: input.validWeekdays?.length ? input.validWeekdays.slice().sort().join(",") : null,
      maxUsesPerUser: 1,
      startsAt: input.startsAt ?? null,
      expiresAt: input.expiresAt ?? null,
      active: input.active,
      createdBy: ctx.user.id,
    }).$returningId();
    return { id: created.id };
  }),

  update: protectedProcedure.input(discountInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireAdminDiscountAccess(ctx.user);
      if (input.discountType === "percentage" && input.discountValue > 100) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El porcentaje no puede superar 100%." });
      }
      if (input.startsAt && input.expiresAt && input.startsAt >= input.expiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La fecha de término debe ser posterior al inicio." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const normalized = input.code.toUpperCase();
      const [duplicate] = await db.select({ id: discountCodes.id }).from(discountCodes)
        .where(and(eq(discountCodes.code, normalized), sql`${discountCodes.id} <> ${input.id}`)).limit(1);
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "Ese código ya existe." });
      const [current] = await db.select({ applicableServices: discountCodes.applicableServices })
        .from(discountCodes).where(eq(discountCodes.id, input.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      const preserved = parseServices(current.applicableServices).filter((token) =>
        token !== "all" && !DISCOUNT_MODULES.some((module) => token === module || token.startsWith(`${module}:`))
      );
      const scopes = normalizeScopes(input.scopes);
      await db.transaction(async (tx) => {
        await tx.update(discountCodes).set({
          code: normalized,
          name: input.name,
          description: input.description || null,
          discountType: input.discountType,
          discountValue: input.discountValue,
          applicableServices: JSON.stringify([...preserved, ...scopesToTokens(scopes)]),
          validWeekdays: input.validWeekdays?.length ? input.validWeekdays.slice().sort().join(",") : null,
          startsAt: input.startsAt ?? null,
          expiresAt: input.expiresAt ?? null,
          active: input.active,
        }).where(eq(discountCodes.id, input.id));
        // La tabla antigua queda vacía una vez que el código usa el alcance 360.
        await tx.delete(massageDiscountCodeTechniques)
          .where(eq(massageDiscountCodeTechniques.discountCodeId, input.id));
      });
      return { success: true };
    }),

  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireAdminDiscountAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [usage] = await db.select({ count: sql<number>`COUNT(*)` }).from(discountCodeUsages)
        .where(eq(discountCodeUsages.discountCodeId, input.id));
      if (Number(usage?.count ?? 0) > 0) {
        await db.update(discountCodes).set({ active: 0 }).where(eq(discountCodes.id, input.id));
        return { archived: true };
      }
      await db.delete(discountCodes).where(eq(discountCodes.id, input.id));
      return { archived: false };
    }),
});
