import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  massageTechniques,
  massageTherapists,
  massageTherapistTechniques,
  massageTherapistSchedules,
  massageRooms,
  massageBookings,
  massageSupplies,
  massageTechniqueRecipes,
} from "../drizzle/schema";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";

const adminOrEditor = async (role: string) => {
  if (role !== "super_admin" && role !== "admin" && role !== "editor") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
};

export const serializeDateOnly = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
};

export const normalizeDecimalInput = (value: string): string => {
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/^-?\d+(?:\.\d+)?/);
  if (!match) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ingresa una cantidad valida",
    });
  }
  return match[0];
};

type SerializedDateFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: string | null;
};

const serializeDateFields = <T extends Record<string, unknown>, K extends keyof T>(
  row: T,
  fields: K[],
): SerializedDateFields<T, K> => {
  const serialized = { ...row };
  for (const field of fields) {
    (serialized as Record<keyof T, unknown>)[field] = serializeDateOnly(row[field]);
  }
  return serialized as SerializedDateFields<T, K>;
};

// ─── TÉCNICAS ────────────────────────────────────────────────
const tecnicasRouter = router({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    await adminOrEditor(ctx.user.role);
    const db = await getDb();
    if (!db) return [];
    return db.select().from(massageTechniques).orderBy(asc(massageTechniques.name));
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      durations: z.string().default("50,80,110"),
      price50min: z.string().optional(),
      price80min: z.string().optional(),
      price110min: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { name, description, durations, price50min, price80min, price110min } = input;
      await db.insert(massageTechniques).values({
        name,
        description: description || null,
        durations,
        price50min: price50min || null,
        price80min: price80min || null,
        price110min: price110min || null,
      });
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      durations: z.string().optional(),
      price50min: z.string().optional(),
      price80min: z.string().optional(),
      price110min: z.string().optional(),
      active: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(massageTechniques).set(data).where(eq(massageTechniques.id, id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(massageTechniques).where(eq(massageTechniques.id, input.id));
      return { success: true };
    }),

  // Recetas de insumos por técnica
  getRecipes: protectedProcedure
    .input(z.object({ techniqueId: z.number() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: massageTechniqueRecipes.id,
          supplyId: massageTechniqueRecipes.supplyId,
          supplyName: massageSupplies.name,
          unit: massageSupplies.unit,
          quantityPer50min: massageTechniqueRecipes.quantityPer50min,
          quantityPer80min: massageTechniqueRecipes.quantityPer80min,
          quantityPer110min: massageTechniqueRecipes.quantityPer110min,
        })
        .from(massageTechniqueRecipes)
        .innerJoin(massageSupplies, eq(massageTechniqueRecipes.supplyId, massageSupplies.id))
        .where(eq(massageTechniqueRecipes.techniqueId, input.techniqueId));
    }),

  upsertRecipe: protectedProcedure
    .input(z.object({
      techniqueId: z.number(),
      supplyId: z.number(),
      quantityPer50min: z.string(),
      quantityPer80min: z.string().optional(),
      quantityPer110min: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const values = {
        quantityPer50min: normalizeDecimalInput(input.quantityPer50min),
        quantityPer80min: input.quantityPer80min ? normalizeDecimalInput(input.quantityPer80min) : null,
        quantityPer110min: input.quantityPer110min ? normalizeDecimalInput(input.quantityPer110min) : null,
      };
      const existing = await db
        .select()
        .from(massageTechniqueRecipes)
        .where(
          and(
            eq(massageTechniqueRecipes.techniqueId, input.techniqueId),
            eq(massageTechniqueRecipes.supplyId, input.supplyId),
          )
        )
        .limit(1);
      if (existing.length > 0) {
        await db.update(massageTechniqueRecipes)
          .set({
            quantityPer50min: values.quantityPer50min,
            quantityPer80min: values.quantityPer80min,
            quantityPer110min: values.quantityPer110min,
          })
          .where(eq(massageTechniqueRecipes.id, existing[0].id));
      } else {
        await db.insert(massageTechniqueRecipes).values({
          techniqueId: input.techniqueId,
          supplyId: input.supplyId,
          quantityPer50min: values.quantityPer50min,
          quantityPer80min: values.quantityPer80min,
          quantityPer110min: values.quantityPer110min,
        });
      }
      return { success: true };
    }),

  deleteRecipe: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(massageTechniqueRecipes).where(eq(massageTechniqueRecipes.id, input.id));
      return { success: true };
    }),
});

// ─── TERAPEUTAS ───────────────────────────────────────────────
const terapeutasRouter = router({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    await adminOrEditor(ctx.user.role);
    const db = await getDb();
    if (!db) return [];
    const therapists = await db
      .select()
      .from(massageTherapists)
      .orderBy(asc(massageTherapists.callPriority), asc(massageTherapists.name));

    // Obtener técnicas por terapeuta
    const withTechniques = await Promise.all(
      therapists.map(async (t) => {
        const techniques = await db
          .select({ id: massageTechniques.id, name: massageTechniques.name })
          .from(massageTherapistTechniques)
          .innerJoin(massageTechniques, eq(massageTherapistTechniques.techniqueId, massageTechniques.id))
          .where(eq(massageTherapistTechniques.therapistId, t.id));
        return { ...t, techniques };
      })
    );
    return withTechniques;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return null;
      const [therapist] = await db
        .select()
        .from(massageTherapists)
        .where(eq(massageTherapists.id, input.id))
        .limit(1);
      if (!therapist) return null;

      const techniques = await db
        .select({ id: massageTechniques.id, name: massageTechniques.name })
        .from(massageTherapistTechniques)
        .innerJoin(massageTechniques, eq(massageTherapistTechniques.techniqueId, massageTechniques.id))
        .where(eq(massageTherapistTechniques.therapistId, input.id));

      const schedules = await db
        .select()
        .from(massageTherapistSchedules)
        .where(eq(massageTherapistSchedules.therapistId, input.id))
        .orderBy(asc(massageTherapistSchedules.dayOfWeek));

      return { ...therapist, techniques, schedules };
    }),

  getSchedules: protectedProcedure
    .input(z.object({ therapistId: z.number() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(massageTherapistSchedules)
        .where(eq(massageTherapistSchedules.therapistId, input.therapistId))
        .orderBy(asc(massageTherapistSchedules.dayOfWeek));
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      type: z.enum(["inhouse", "freelance"]),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      contractType: z.string().optional(),
      leadTimeMinutes: z.number().default(120),
      currentShift: z.enum(["am", "pm"]).optional(),
      notes: z.string().optional(),
      callPriority: z.number().default(99),
      techniqueIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { techniqueIds, ...raw } = input;
      // Sanitize: convert empty strings to null for optional fields
      const therapistData = {
        name: raw.name,
        type: raw.type,
        phone: raw.phone || null,
        email: raw.email || null,
        contractType: raw.contractType || null,
        leadTimeMinutes: raw.leadTimeMinutes,
        currentShift: raw.currentShift ?? null,
        notes: raw.notes || null,
        callPriority: raw.callPriority,
      };
      const result = await db.insert(massageTherapists).values(therapistData);
      const insertId = (result as any).insertId as number;

      if (techniqueIds && techniqueIds.length > 0) {
        await db.insert(massageTherapistTechniques).values(
          techniqueIds.map(tid => ({ therapistId: insertId, techniqueId: tid }))
        );
      }
      return { success: true, id: insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      type: z.enum(["inhouse", "freelance"]).optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      contractType: z.string().optional(),
      leadTimeMinutes: z.number().optional(),
      currentShift: z.enum(["am", "pm"]).optional(),
      notes: z.string().optional(),
      callPriority: z.number().optional(),
      active: z.number().optional(),
      techniqueIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, techniqueIds, ...raw } = input;
      // Sanitize empty strings
      const data: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw)) {
        data[k] = (typeof v === "string" && v === "") ? null : v;
      }
      await db.update(massageTherapists).set(data).where(eq(massageTherapists.id, id));

      if (techniqueIds !== undefined) {
        await db.delete(massageTherapistTechniques).where(eq(massageTherapistTechniques.therapistId, id));
        if (techniqueIds.length > 0) {
          await db.insert(massageTherapistTechniques).values(
            techniqueIds.map(tid => ({ therapistId: id, techniqueId: tid }))
          );
        }
      }
      return { success: true };
    }),

  // Actualizar horario de un día
  upsertSchedule: protectedProcedure
    .input(z.object({
      therapistId: z.number(),
      dayOfWeek: z.number().min(0).max(6),
      startTime: z.string(),
      endTime: z.string(),
      available: z.number().default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db
        .select()
        .from(massageTherapistSchedules)
        .where(
          and(
            eq(massageTherapistSchedules.therapistId, input.therapistId),
            eq(massageTherapistSchedules.dayOfWeek, input.dayOfWeek),
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db.update(massageTherapistSchedules)
          .set({ startTime: input.startTime, endTime: input.endTime, available: input.available })
          .where(eq(massageTherapistSchedules.id, existing[0].id));
      } else {
        await db.insert(massageTherapistSchedules).values(input);
      }
      return { success: true };
    }),

  // Bloquear disponibilidad por rango de fechas
  blockAvailability: protectedProcedure
    .input(z.object({
      therapistId: z.number(),
      dayOfWeek: z.number().min(0).max(6),
      blockFrom: z.string(),
      blockTo: z.string(),
      blockReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(massageTherapistSchedules)
        .set({
          blockFrom: input.blockFrom as any,
          blockTo: input.blockTo as any,
          blockReason: input.blockReason,
          available: 0,
        })
        .where(
          and(
            eq(massageTherapistSchedules.therapistId, input.therapistId),
            eq(massageTherapistSchedules.dayOfWeek, input.dayOfWeek),
          )
        );
      return { success: true };
    }),
});

// ─── SALAS ────────────────────────────────────────────────────
const salasRouter = router({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    await adminOrEditor(ctx.user.role);
    const db = await getDb();
    if (!db) return [];
    return db.select().from(massageRooms).orderBy(asc(massageRooms.id));
  }),

  seed: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const existing = await db.select().from(massageRooms);
    if (existing.length === 0) {
      await db.insert(massageRooms).values([
        { name: "Sala Doble 1", type: "double", capacity: 2 },
        { name: "Sala Doble 2", type: "double", capacity: 2 },
        { name: "Sala Individual", type: "individual", capacity: 1 },
      ]);
    }
    return { success: true };
  }),
});

// ─── AGENDA / RESERVAS ────────────────────────────────────────
const agendaRouter = router({
  getByDateRange: protectedProcedure
    .input(z.object({
      from: z.string(), // "YYYY-MM-DD"
      to: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: massageBookings.id,
          clientName: massageBookings.clientName,
          clientPhone: massageBookings.clientPhone,
          techniqueId: massageBookings.techniqueId,
          techniqueName: massageTechniques.name,
          therapistId: massageBookings.therapistId,
          therapistName: massageTherapists.name,
          roomId: massageBookings.roomId,
          roomName: massageRooms.name,
          duration: massageBookings.duration,
          bookingDate: massageBookings.bookingDate,
          startTime: massageBookings.startTime,
          endTime: massageBookings.endTime,
          status: massageBookings.status,
          paymentStatus: massageBookings.paymentStatus,
          amountPaid: massageBookings.amountPaid,
          notes: massageBookings.notes,
          crossSellServices: massageBookings.crossSellServices,
          rescheduleCount: massageBookings.rescheduleCount,
          createdAt: massageBookings.createdAt,
        })
        .from(massageBookings)
        .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
        .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
        .leftJoin(massageRooms, eq(massageBookings.roomId, massageRooms.id))
        .where(
          and(
            gte(massageBookings.bookingDate, input.from as any),
            lte(massageBookings.bookingDate, input.to as any),
          )
        )
        .orderBy(asc(massageBookings.bookingDate), asc(massageBookings.startTime));
      return rows.map(row => serializeDateFields(row, ["bookingDate"]));
    }),

  // Slots disponibles para un día y duración
  getAvailableSlots: protectedProcedure
    .input(z.object({
      date: z.string(),     // "YYYY-MM-DD"
      duration: z.number(), // 50, 80 o 110
      techniqueId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      // Reservas del día
      const existingBookings = await db
        .select()
        .from(massageBookings)
        .where(
          and(
            eq(massageBookings.bookingDate, input.date as any),
            sql`${massageBookings.status} NOT IN ('cancelled')`,
          )
        );

      // Salas activas
      const rooms = await db.select().from(massageRooms).where(eq(massageRooms.active, 1));

      // Horario: 10:00 a 20:30, bloques cada 30 min, preparación 10 min
      const slots: { time: string; availableRooms: number[] }[] = [];
      const start = 10 * 60; // 10:00 en minutos
      const end = 20 * 60 + 30; // 20:30
      const prep = 10;

      for (let t = start; t + input.duration <= end; t += 30) {
        const timeStr = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
        const slotEnd = t + input.duration;

        const availableRooms = rooms.filter(room => {
          const overlap = existingBookings.some(b => {
            if (b.roomId !== room.id) return false;
            const bStart = parseInt(b.startTime.split(":")[0]) * 60 + parseInt(b.startTime.split(":")[1]);
            const bEnd = parseInt(b.endTime.split(":")[0]) * 60 + parseInt(b.endTime.split(":")[1]) + prep;
            return t < bEnd && slotEnd > bStart;
          });
          return !overlap;
        });

        if (availableRooms.length > 0) {
          slots.push({ time: timeStr, availableRooms: availableRooms.map(r => r.id) });
        }
      }
      return slots;
    }),

  create: protectedProcedure
    .input(z.object({
      clientName: z.string().min(2),
      clientEmail: z.string().email().optional(),
      clientPhone: z.string().optional(),
      clientOrigin: z.string().optional(),
      techniqueId: z.number(),
      therapistId: z.number().optional(),
      roomId: z.number(),
      duration: z.number(),
      bookingDate: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      paymentStatus: z.enum(["pending", "paid"]).default("pending"),
      amountPaid: z.string().optional(),
      discountCode: z.string().optional(),
      notes: z.string().optional(),
      crossSellServices: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(massageBookings).values({
        ...input,
        bookingDate: input.bookingDate as any,
      });
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(massageBookings)
        .set({ status: input.status })
        .where(eq(massageBookings.id, input.id));
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      therapistId: z.number().optional(),
      roomId: z.number().optional(),
      bookingDate: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]).optional(),
      paymentStatus: z.enum(["pending", "paid", "refunded"]).optional(),
      amountPaid: z.string().optional(),
      notes: z.string().optional(),
      crossSellServices: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, bookingDate, ...data } = input;
      await db.update(massageBookings)
        .set({ ...data, ...(bookingDate ? { bookingDate: bookingDate as any } : {}) })
        .where(eq(massageBookings.id, id));
      return { success: true };
    }),
});

// ─── INVENTARIO ───────────────────────────────────────────────
const inventarioRouter = router({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    await adminOrEditor(ctx.user.role);
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(massageSupplies).orderBy(asc(massageSupplies.name));
    return rows.map(row => serializeDateFields(row, ["purchasedAt", "openedAt"]));
  }),

  getLowStock: protectedProcedure.query(async ({ ctx }) => {
    await adminOrEditor(ctx.user.role);
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(massageSupplies)
      .where(
        and(
          eq(massageSupplies.active, 1),
          sql`${massageSupplies.currentStock} <= ${massageSupplies.minimumStock}`,
        )
      );
    return rows.map(row => serializeDateFields(row, ["purchasedAt", "openedAt"]));
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      unit: z.string(),
      currentStock: z.string().default("0"),
      minimumStock: z.string().default("0"),
      purchasedAt: z.string().optional(),
      openedAt: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(massageSupplies).values({
        name: input.name,
        unit: input.unit,
        currentStock: input.currentStock,
        minimumStock: input.minimumStock,
        purchasedAt: (input.purchasedAt || null) as any,
        openedAt: (input.openedAt || null) as any,
        notes: input.notes || null,
      });
      return { success: true };
    }),

  receiveStock: protectedProcedure
    .input(z.object({
      id: z.number(),
      stockReceived: z.string(),
      purchasedAt: z.string().optional(),
      openedAt: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(massageSupplies)
        .set({
          currentStock: sql`${massageSupplies.currentStock} + ${input.stockReceived}`,
          ...(input.purchasedAt ? { purchasedAt: input.purchasedAt as any } : {}),
          ...(input.openedAt ? { openedAt: input.openedAt as any } : {}),
          ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        })
        .where(eq(massageSupplies.id, input.id));
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      unit: z.string().optional(),
      currentStock: z.string().optional(),
      minimumStock: z.string().optional(),
      purchasedAt: z.string().optional(),
      openedAt: z.string().optional(),
      notes: z.string().optional(),
      active: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, purchasedAt, openedAt, notes, ...rest } = input;
      await db.update(massageSupplies).set({
        ...rest,
        purchasedAt: (purchasedAt || null) as any,
        openedAt: (openedAt || null) as any,
        notes: notes || null,
      }).where(eq(massageSupplies.id, id));
      return { success: true };
    }),

  adjustStock: protectedProcedure
    .input(z.object({
      id: z.number(),
      delta: z.string(), // positivo = ingreso, negativo = egreso
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(massageSupplies)
        .set({ currentStock: sql`${massageSupplies.currentStock} + ${input.delta}` })
        .where(eq(massageSupplies.id, input.id));
      return { success: true };
    }),
});

// ─── CLIENTES ─────────────────────────────────────────────────
const clientesRouter = router({
  getAll: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          clientName: massageBookings.clientName,
          clientEmail: massageBookings.clientEmail,
          clientPhone: massageBookings.clientPhone,
          clientOrigin: massageBookings.clientOrigin,
          totalBookings: sql<number>`COUNT(*)`,
          lastBookingDate: sql<string>`MAX(${massageBookings.bookingDate})`,
          totalSpent: sql<string>`SUM(${massageBookings.amountPaid})`,
        })
        .from(massageBookings)
        .where(sql`${massageBookings.status} != 'cancelled'`)
        .groupBy(
          massageBookings.clientName,
          massageBookings.clientEmail,
          massageBookings.clientPhone,
          massageBookings.clientOrigin,
        )
        .orderBy(desc(sql`MAX(${massageBookings.bookingDate})`))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);
      return rows.map(row => serializeDateFields(row, ["lastBookingDate"]));
    }),

  getHistory: protectedProcedure
    .input(z.object({ clientEmail: z.string() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: massageBookings.id,
          bookingDate: massageBookings.bookingDate,
          startTime: massageBookings.startTime,
          duration: massageBookings.duration,
          techniqueName: massageTechniques.name,
          therapistName: massageTherapists.name,
          status: massageBookings.status,
          amountPaid: massageBookings.amountPaid,
          crossSellServices: massageBookings.crossSellServices,
        })
        .from(massageBookings)
        .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
        .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
        .where(eq(massageBookings.clientEmail, input.clientEmail))
        .orderBy(desc(massageBookings.bookingDate));
      return rows.map(row => serializeDateFields(row, ["bookingDate"]));
    }),
});

// ─── ANALYTICS ────────────────────────────────────────────────
const analyticsRouter = router({
  summary: protectedProcedure
    .input(z.object({
      from: z.string(),
      to: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return null;

      const [totals] = await db
        .select({
          totalBookings: sql<number>`COUNT(*)`,
          totalRevenue: sql<string>`SUM(${massageBookings.amountPaid})`,
          completedBookings: sql<number>`SUM(CASE WHEN ${massageBookings.status} = 'completed' THEN 1 ELSE 0 END)`,
          cancelledBookings: sql<number>`SUM(CASE WHEN ${massageBookings.status} = 'cancelled' THEN 1 ELSE 0 END)`,
        })
        .from(massageBookings)
        .where(
          and(
            gte(massageBookings.bookingDate, input.from as any),
            lte(massageBookings.bookingDate, input.to as any),
          )
        );

      const byTechnique = await db
        .select({
          techniqueName: massageTechniques.name,
          count: sql<number>`COUNT(*)`,
          revenue: sql<string>`SUM(${massageBookings.amountPaid})`,
        })
        .from(massageBookings)
        .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
        .where(
          and(
            gte(massageBookings.bookingDate, input.from as any),
            lte(massageBookings.bookingDate, input.to as any),
            sql`${massageBookings.status} != 'cancelled'`,
          )
        )
        .groupBy(massageTechniques.name)
        .orderBy(desc(sql`COUNT(*)`));

      const byDuration = await db
        .select({
          duration: massageBookings.duration,
          count: sql<number>`COUNT(*)`,
          revenue: sql<string>`SUM(${massageBookings.amountPaid})`,
        })
        .from(massageBookings)
        .where(
          and(
            gte(massageBookings.bookingDate, input.from as any),
            lte(massageBookings.bookingDate, input.to as any),
            sql`${massageBookings.status} != 'cancelled'`,
          )
        )
        .groupBy(massageBookings.duration)
        .orderBy(asc(massageBookings.duration));

      const byTherapist = await db
        .select({
          therapistName: massageTherapists.name,
          count: sql<number>`COUNT(*)`,
          revenue: sql<string>`SUM(${massageBookings.amountPaid})`,
        })
        .from(massageBookings)
        .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
        .where(
          and(
            gte(massageBookings.bookingDate, input.from as any),
            lte(massageBookings.bookingDate, input.to as any),
            sql`${massageBookings.status} != 'cancelled'`,
          )
        )
        .groupBy(massageTherapists.name)
        .orderBy(desc(sql`COUNT(*)`));

      return { totals, byTechnique, byDuration, byTherapist };
    }),
});

// ─── ROUTER PRINCIPAL ─────────────────────────────────────────
export const masajesRouter = router({
  tecnicas: tecnicasRouter,
  terapeutas: terapeutasRouter,
  salas: salasRouter,
  agenda: agendaRouter,
  inventario: inventarioRouter,
  clientes: clientesRouter,
  analytics: analyticsRouter,
});
