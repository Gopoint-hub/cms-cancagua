import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  biopoolBookings,
  cashRegisterMovements,
  cashRegisterSettings,
  hotTubOrders,
  massageBookings,
  massageProgramBookings,
  regularClassMemberships,
  regularClassStudents,
  reservationPayments,
  saunaBookings,
  users,
} from "../drizzle/schema";
import { hasCmsPermission } from "../shared/permissions";
import { protectedProcedure, router } from "./_core/trpc";
import { calculateCashBalance } from "./cashRegister";
import { getDb } from "./db";
import { reservationPaymentDate } from "./reservationPayments";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const serviceSchema = z.enum([
  "biopools",
  "hot_tubs",
  "sauna",
  "regular_classes",
  "hot_tub_menu",
  "massages",
  "cafe",
  "gift_cards",
  "other",
]);
const withdrawalCategorySchema = z.enum([
  "bank_deposit",
  "maintenance",
  "operations",
  "other",
]);

function requireAccess(user: Parameters<typeof hasCmsPermission>[0]) {
  if (!hasCmsPermission(user, "module.admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso a Caja efectivo" });
  }
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
  return db;
}

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function paymentService(module: string) {
  if (module === "massage_programs") return "massages";
  return module;
}

async function cashRegisterOpenedAt(tx: any) {
  const [settings] = await tx
    .select({ openedAt: cashRegisterSettings.openedAt })
    .from(cashRegisterSettings)
    .where(eq(cashRegisterSettings.id, 1))
    .limit(1);
  if (!settings) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "La caja todavía no tiene una fecha de apertura",
    });
  }
  return asDate(settings.openedAt);
}

async function calculateCurrentBalance(tx: any, openedAt?: Date) {
  const opening = openedAt ?? await cashRegisterOpenedAt(tx);
  const [paymentRow] = await tx
    .select({ total: sql<number>`coalesce(sum(${reservationPayments.amountClp}), 0)` })
    .from(reservationPayments)
    .where(and(
      eq(reservationPayments.method, "cash"),
      eq(reservationPayments.status, "paid"),
      sql`coalesce(${reservationPayments.paidAt}, ${reservationPayments.createdAt}) >= ${opening}`,
    ));
  const rows: Array<typeof cashRegisterMovements.$inferSelect> = await tx
    .select()
    .from(cashRegisterMovements)
    .where(isNull(cashRegisterMovements.voidedAt));
  return calculateCashBalance({
    reservationIncomeClp: Number(paymentRow?.total ?? 0),
    manualIncomeClp: rows
      .filter(row => row.kind === "manual_income")
      .reduce((sum, row) => sum + row.amountClp, 0),
    withdrawalsClp: rows
      .filter(row => row.kind === "withdrawal")
      .reduce((sum, row) => sum + row.amountClp, 0),
  });
}

async function sourceLabels(db: any, payments: Array<{ module: string; reservationId: number }>) {
  const result = new Map<string, string>();
  const ids = (module: string) => payments.filter(row => row.module === module).map(row => row.reservationId);
  const bioIds = ids("biopools");
  const massageIds = ids("massages");
  const programIds = ids("massage_programs");
  const saunaIds = ids("sauna");
  const classIds = ids("regular_classes");
  const menuIds = ids("hot_tub_menu");
  const [bio, massages, programs, sauna, memberships, menu] = await Promise.all([
    bioIds.length
      ? db.select({ id: biopoolBookings.id, name: biopoolBookings.clientName, code: biopoolBookings.bookingCode }).from(biopoolBookings).where(inArray(biopoolBookings.id, bioIds))
      : [],
    massageIds.length
      ? db.select({ id: massageBookings.id, name: massageBookings.clientName }).from(massageBookings).where(inArray(massageBookings.id, massageIds))
      : [],
    programIds.length
      ? db.select({ id: massageProgramBookings.id, name: massageProgramBookings.clientName, program: massageProgramBookings.program }).from(massageProgramBookings).where(inArray(massageProgramBookings.id, programIds))
      : [],
    saunaIds.length
      ? db.select({ id: saunaBookings.id, name: saunaBookings.clientName, code: saunaBookings.bookingCode }).from(saunaBookings).where(inArray(saunaBookings.id, saunaIds))
      : [],
    classIds.length
      ? db.select({ id: regularClassMemberships.id, firstName: regularClassStudents.firstName, lastName: regularClassStudents.lastName })
          .from(regularClassMemberships)
          .innerJoin(regularClassStudents, eq(regularClassMemberships.studentId, regularClassStudents.id))
          .where(inArray(regularClassMemberships.id, classIds))
      : [],
    menuIds.length
      ? db.select({ id: hotTubOrders.id, name: hotTubOrders.customerName, code: hotTubOrders.orderNumber }).from(hotTubOrders).where(inArray(hotTubOrders.id, menuIds))
      : [],
  ]);
  for (const row of bio) result.set(`biopools:${row.id}`, `${row.name} · ${row.code}`);
  for (const row of massages) result.set(`massages:${row.id}`, `${row.name} · Masaje #${row.id}`);
  for (const row of programs) result.set(`massage_programs:${row.id}`, `${row.name} · Programa ${row.program.replaceAll("_", " ")}`);
  for (const row of sauna) result.set(`sauna:${row.id}`, `${row.name ?? "Cliente"} · ${row.code}`);
  for (const row of memberships) result.set(`regular_classes:${row.id}`, `${row.firstName} ${row.lastName ?? ""}`.trim());
  for (const row of menu) result.set(`hot_tub_menu:${row.id}`, `${row.name} · ${row.code}`);
  return result;
}

export const cashRegisterRouter = router({
  summary: protectedProcedure
    .input(z.object({
      from: dateSchema,
      to: dateSchema,
      services: z.array(serviceSchema).optional(),
    }))
    .query(async ({ ctx, input }) => {
      requireAccess(ctx.user);
      const db = await database();
      const from = reservationPaymentDate(`${input.from}T00:00`)!;
      const to = reservationPaymentDate(`${input.to}T23:59`)!;
      const openedAt = await cashRegisterOpenedAt(db);
      const [payments, movements, current] = await Promise.all([
        db.select().from(reservationPayments).where(and(
          eq(reservationPayments.method, "cash"),
          eq(reservationPayments.status, "paid"),
          sql`coalesce(${reservationPayments.paidAt}, ${reservationPayments.createdAt}) >= ${openedAt}`,
        )),
        db.select().from(cashRegisterMovements),
        calculateCurrentBalance(db, openedAt),
      ]);
      const services = new Set(input.services ?? []);
      const withinPeriod = (value: unknown) => {
        const time = asDate(value).getTime();
        return time >= from.getTime() && time <= to.getTime();
      };
      const filteredPayments = payments.filter(payment => {
        const service = paymentService(payment.module);
        return withinPeriod(payment.paidAt ?? payment.createdAt)
          && (!services.size || services.has(service as any));
      });
      const filteredMovements = movements.filter(movement =>
        withinPeriod(movement.occurredAt)
        && (!services.size || movement.kind === "withdrawal" || services.has((movement.service ?? "other") as any)),
      );
      const labels = await sourceLabels(db, filteredPayments);
      const userIds = Array.from(new Set(filteredMovements.flatMap(row => [row.createdByUserId, row.voidedByUserId].filter(Boolean) as number[])));
      const userRows = userIds.length
        ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds))
        : [];
      const userNames = new Map(userRows.map(row => [row.id, row.name || row.email || `Usuario ${row.id}`]));
      const activeMovements = filteredMovements.filter(row => !row.voidedAt);
      const period = calculateCashBalance({
        reservationIncomeClp: filteredPayments.reduce((sum, row) => sum + row.amountClp, 0),
        manualIncomeClp: activeMovements.filter(row => row.kind === "manual_income").reduce((sum, row) => sum + row.amountClp, 0),
        withdrawalsClp: activeMovements.filter(row => row.kind === "withdrawal").reduce((sum, row) => sum + row.amountClp, 0),
      });
      const transactions = [
        ...filteredPayments.map(payment => ({
          id: `payment:${payment.id}`,
          recordId: payment.id,
          kind: "reservation_income" as const,
          service: paymentService(payment.module),
          amountClp: payment.amountClp,
          reason: labels.get(`${payment.module}:${payment.reservationId}`) ?? `Reserva #${payment.reservationId}`,
          category: null,
          occurredAt: payment.paidAt ?? payment.createdAt,
          createdBy: null,
          voidedAt: null,
          voidReason: null,
          canVoid: false,
        })),
        ...filteredMovements.map(movement => ({
          id: `movement:${movement.id}`,
          recordId: movement.id,
          kind: movement.kind,
          service: movement.service ?? null,
          amountClp: movement.amountClp,
          reason: movement.reason,
          category: movement.category,
          occurredAt: movement.occurredAt,
          createdBy: userNames.get(movement.createdByUserId) ?? `Usuario ${movement.createdByUserId}`,
          voidedAt: movement.voidedAt,
          voidReason: movement.voidReason,
          canVoid: !movement.voidedAt,
        })),
      ].sort((left, right) => asDate(right.occurredAt).getTime() - asDate(left.occurredAt).getTime());
      return { current, period, transactions, openedAt };
    }),

  addManualIncome: protectedProcedure
    .input(z.object({
      service: serviceSchema,
      amountClp: z.number().int().positive(),
      reason: z.string().trim().min(3).max(500),
      occurredAt: localDateTimeSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      requireAccess(ctx.user);
      const db = await database();
      const [created] = await db.insert(cashRegisterMovements).values({
        kind: "manual_income",
        service: input.service,
        amountClp: input.amountClp,
        reason: input.reason,
        occurredAt: reservationPaymentDate(input.occurredAt)!,
        createdByUserId: ctx.user.id,
      }).$returningId();
      return { success: true, id: created.id };
    }),

  withdraw: protectedProcedure
    .input(z.object({
      amountClp: z.number().int().positive(),
      category: withdrawalCategorySchema,
      reason: z.string().trim().min(3).max(500),
      occurredAt: localDateTimeSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      requireAccess(ctx.user);
      const db = await database();
      return db.transaction(async tx => {
        await tx.execute(sql`SELECT GET_LOCK('cancagua_cash_register', 10)`);
        try {
          const current = await calculateCurrentBalance(tx);
          if (input.amountClp > current.balanceClp) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `El retiro supera el efectivo disponible ($${current.balanceClp.toLocaleString("es-CL")})`,
            });
          }
          const [created] = await tx.insert(cashRegisterMovements).values({
            kind: "withdrawal",
            amountClp: input.amountClp,
            category: input.category,
            reason: input.reason,
            occurredAt: reservationPaymentDate(input.occurredAt)!,
            createdByUserId: ctx.user.id,
          }).$returningId();
          return { success: true, id: created.id, balanceClp: current.balanceClp - input.amountClp };
        } finally {
          await tx.execute(sql`SELECT RELEASE_LOCK('cancagua_cash_register')`);
        }
      });
    }),

  voidMovement: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      reason: z.string().trim().min(5).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAccess(ctx.user);
      const db = await database();
      return db.transaction(async tx => {
        await tx.execute(sql`SELECT GET_LOCK('cancagua_cash_register', 10)`);
        try {
          const [movement] = await tx
            .select()
            .from(cashRegisterMovements)
            .where(and(
              eq(cashRegisterMovements.id, input.id),
              isNull(cashRegisterMovements.voidedAt)
            ))
            .limit(1);
          if (!movement) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "El movimiento ya fue anulado o no existe",
            });
          }
          if (movement.kind === "manual_income") {
            const current = await calculateCurrentBalance(tx);
            if (movement.amountClp > current.balanceClp) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "No se puede anular este ingreso porque parte de ese efectivo ya fue retirado",
              });
            }
          }
          await tx
            .update(cashRegisterMovements)
            .set({
              voidedAt: new Date(),
              voidedByUserId: ctx.user.id,
              voidReason: input.reason,
            })
            .where(eq(cashRegisterMovements.id, input.id));
          return { success: true };
        } finally {
          await tx.execute(sql`SELECT RELEASE_LOCK('cancagua_cash_register')`);
        }
      });
    }),
});
