import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { createGetnetSession, getGetnetSessionInfo } from "./getnet";
import {
  massageTechniques,
  massageTherapists,
  massageTherapistTechniques,
  massageTherapistSchedules,
  massageRooms,
  massageBookings,
  massageSupplies,
  massageTechniqueRecipes,
  massageTherapistEvaluations,
  massageTherapistDocuments,
  massageSettings,
  newsletterSubscribers,
} from "../drizzle/schema";
import {
  sendMassageBookingConfirmationEmail,
  sendMassageBookingReceivedEmail,
  sendMassageInternalBookingNotificationEmail,
  sendMassageTherapistBookingRequestEmail,
  sendMassageTherapistNotificationEmail,
} from "./_core/email";
import { ENV } from "./_core/env";
import { notifyOwner, type NotificationPayload } from "./_core/notification";
import { sendWhatsApp } from "./_core/whapi";
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
    throw new TRPCError({ code: "BAD_REQUEST", message: "Ingresa una cantidad valida" });
  }
  return match[0];
};

type SerializedDateFields<T, K extends keyof T> = Omit<T, K> & { [P in K]: string | null };

const serializeDateFields = <T extends Record<string, unknown>, K extends keyof T>(
  row: T, fields: K[],
): SerializedDateFields<T, K> => {
  const serialized = { ...row };
  for (const field of fields) {
    (serialized as Record<keyof T, unknown>)[field] = serializeDateOnly(row[field]);
  }
  return serialized as SerializedDateFields<T, K>;
};

const sanitizePrice = (v?: string | null): string | null => {
  if (!v) return null;
  const cleaned = v.toString().replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : String(Math.round(num));
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
      name: z.string().min(2), description: z.string().optional(),
      durations: z.string().default("50,80,110"),
      price50min: z.string().optional(), price80min: z.string().optional(), price110min: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(massageTechniques).values({
        name: input.name, description: input.description || null, durations: input.durations,
        price50min: sanitizePrice(input.price50min), price80min: sanitizePrice(input.price80min), price110min: sanitizePrice(input.price110min),
      });
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(), name: z.string().optional(), description: z.string().optional(),
      durations: z.string().optional(), price50min: z.string().optional(),
      price80min: z.string().optional(), price110min: z.string().optional(), active: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, price50min, price80min, price110min, ...rest } = input;
      await db.update(massageTechniques).set({
        ...rest,
        price50min: price50min !== undefined ? sanitizePrice(price50min) : undefined,
        price80min: price80min !== undefined ? sanitizePrice(price80min) : undefined,
        price110min: price110min !== undefined ? sanitizePrice(price110min) : undefined,
      }).where(eq(massageTechniques.id, id));
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

  getRecipes: protectedProcedure
    .input(z.object({ techniqueId: z.number() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: massageTechniqueRecipes.id, supplyId: massageTechniqueRecipes.supplyId,
        supplyName: massageSupplies.name, unit: massageSupplies.unit,
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
      techniqueId: z.number(), supplyId: z.number(),
      quantityPer50min: z.string(), quantityPer80min: z.string().optional(), quantityPer110min: z.string().optional(),
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
      const existing = await db.select().from(massageTechniqueRecipes)
        .where(and(eq(massageTechniqueRecipes.techniqueId, input.techniqueId), eq(massageTechniqueRecipes.supplyId, input.supplyId)))
        .limit(1);
      if (existing.length > 0) {
        await db.update(massageTechniqueRecipes).set(values).where(eq(massageTechniqueRecipes.id, existing[0].id));
      } else {
        await db.insert(massageTechniqueRecipes).values({ techniqueId: input.techniqueId, supplyId: input.supplyId, ...values });
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
    const therapists = await db.select().from(massageTherapists)
      .orderBy(asc(massageTherapists.callPriority), asc(massageTherapists.name));
    const withTechniques = await Promise.all(therapists.map(async (t) => {
      const techniques = await db.select({ id: massageTechniques.id, name: massageTechniques.name })
        .from(massageTherapistTechniques)
        .innerJoin(massageTechniques, eq(massageTherapistTechniques.techniqueId, massageTechniques.id))
        .where(eq(massageTherapistTechniques.therapistId, t.id));
      return { ...t, techniques };
    }));
    return withTechniques;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return null;
      const [therapist] = await db.select().from(massageTherapists).where(eq(massageTherapists.id, input.id)).limit(1);
      if (!therapist) return null;
      const techniques = await db.select({ id: massageTechniques.id, name: massageTechniques.name })
        .from(massageTherapistTechniques)
        .innerJoin(massageTechniques, eq(massageTherapistTechniques.techniqueId, massageTechniques.id))
        .where(eq(massageTherapistTechniques.therapistId, input.id));
      const schedules = await db.select().from(massageTherapistSchedules)
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
      return db.select().from(massageTherapistSchedules)
        .where(eq(massageTherapistSchedules.therapistId, input.therapistId))
        .orderBy(asc(massageTherapistSchedules.dayOfWeek));
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2), type: z.enum(["inhouse", "freelance"]),
      phone: z.string().optional(), email: z.string().optional(), contractType: z.string().optional(),
      leadTimeMinutes: z.number().default(120), currentShift: z.enum(["am", "pm"]).optional(),
      notes: z.string().optional(), callPriority: z.number().default(99),
      techniqueIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { techniqueIds, ...raw } = input;
      const therapistData = {
        name: raw.name, type: raw.type, phone: raw.phone || null, email: raw.email || null,
        contractType: raw.contractType || null, leadTimeMinutes: raw.leadTimeMinutes,
        currentShift: raw.currentShift ?? null, notes: raw.notes || null, callPriority: raw.callPriority,
      };
      const result = await db.insert(massageTherapists).values(therapistData);
      const insertId = (result as any).insertId as number;
      if (techniqueIds && techniqueIds.length > 0) {
        await db.insert(massageTherapistTechniques).values(techniqueIds.map(tid => ({ therapistId: insertId, techniqueId: tid })));
      }
      return { success: true, id: insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(), name: z.string().optional(), type: z.enum(["inhouse", "freelance"]).optional(),
      phone: z.string().optional(), email: z.string().optional(), contractType: z.string().optional(),
      leadTimeMinutes: z.number().optional(), currentShift: z.enum(["am", "pm"]).optional(),
      notes: z.string().optional(), callPriority: z.number().optional(), active: z.number().optional(),
      techniqueIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, techniqueIds, ...raw } = input;
      const data: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw)) { data[k] = (typeof v === "string" && v === "") ? null : v; }
      await db.update(massageTherapists).set(data).where(eq(massageTherapists.id, id));
      if (techniqueIds !== undefined) {
        await db.delete(massageTherapistTechniques).where(eq(massageTherapistTechniques.therapistId, id));
        if (techniqueIds.length > 0) {
          await db.insert(massageTherapistTechniques).values(techniqueIds.map(tid => ({ therapistId: id, techniqueId: tid })));
        }
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(massageTherapistTechniques).where(eq(massageTherapistTechniques.therapistId, input.id));
      await db.delete(massageTherapistSchedules).where(eq(massageTherapistSchedules.therapistId, input.id));
      await db.delete(massageTherapists).where(eq(massageTherapists.id, input.id));
      return { success: true };
    }),

  upsertSchedule: protectedProcedure
    .input(z.object({
      therapistId: z.number(), dayOfWeek: z.number().min(0).max(6),
      startTime: z.string(), endTime: z.string(), available: z.number().default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select().from(massageTherapistSchedules)
        .where(and(eq(massageTherapistSchedules.therapistId, input.therapistId), eq(massageTherapistSchedules.dayOfWeek, input.dayOfWeek)))
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

  blockAvailability: protectedProcedure
    .input(z.object({
      therapistId: z.number(), dayOfWeek: z.number().min(0).max(6),
      blockFrom: z.string(), blockTo: z.string(), blockReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(massageTherapistSchedules)
        .set({ blockFrom: input.blockFrom as any, blockTo: input.blockTo as any, blockReason: input.blockReason, available: 0 })
        .where(and(eq(massageTherapistSchedules.therapistId, input.therapistId), eq(massageTherapistSchedules.dayOfWeek, input.dayOfWeek)));
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
    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
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
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({
        id: massageBookings.id, clientName: massageBookings.clientName, clientPhone: massageBookings.clientPhone,
        techniqueId: massageBookings.techniqueId, techniqueName: massageTechniques.name,
        therapistId: massageBookings.therapistId, therapistName: massageTherapists.name,
        roomId: massageBookings.roomId, roomName: massageRooms.name,
        duration: massageBookings.duration, bookingDate: massageBookings.bookingDate,
        startTime: massageBookings.startTime, endTime: massageBookings.endTime,
        status: massageBookings.status, paymentStatus: massageBookings.paymentStatus,
        amountPaid: massageBookings.amountPaid, notes: massageBookings.notes,
        crossSellServices: massageBookings.crossSellServices, rescheduleCount: massageBookings.rescheduleCount,
        createdAt: massageBookings.createdAt,
      })
      .from(massageBookings)
      .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
      .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
      .leftJoin(massageRooms, eq(massageBookings.roomId, massageRooms.id))
      .where(and(gte(massageBookings.bookingDate, input.from as any), lte(massageBookings.bookingDate, input.to as any)))
      .orderBy(asc(massageBookings.bookingDate), asc(massageBookings.startTime));
      return rows.map(row => serializeDateFields(row, ["bookingDate"]));
    }),

  getAvailableSlots: protectedProcedure
    .input(z.object({ date: z.string(), duration: z.number(), techniqueId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      const existingBookings = await db.select().from(massageBookings).where(
        and(eq(massageBookings.bookingDate, input.date as any), sql`${massageBookings.status} NOT IN ('cancelled')`)
      );
      const rooms = await db.select().from(massageRooms).where(eq(massageRooms.active, 1));
      const slots: { time: string; availableRooms: number[] }[] = [];
      const start = 10 * 60; const end = 20 * 60 + 30; const prep = 10;
      for (let t = start; t + input.duration <= end; t += 30) {
        const timeStr = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
        const slotEnd = t + input.duration;
        const availableRooms = rooms.filter(room => !existingBookings.some(b => {
          if (b.roomId !== room.id) return false;
          const bStart = parseInt(b.startTime.split(":")[0]) * 60 + parseInt(b.startTime.split(":")[1]);
          const bEnd = parseInt(b.endTime.split(":")[0]) * 60 + parseInt(b.endTime.split(":")[1]) + prep;
          return t < bEnd && slotEnd > bStart;
        }));
        if (availableRooms.length > 0) slots.push({ time: timeStr, availableRooms: availableRooms.map(r => r.id) });
      }
      return slots;
    }),

  create: protectedProcedure
    .input(z.object({
      clientName: z.string().min(2), clientEmail: z.string().optional(),
      clientPhone: z.string().optional(), clientOrigin: z.string().optional(),
      techniqueId: z.number(), therapistId: z.number().optional(), roomId: z.number(),
      duration: z.number(), bookingDate: z.string(), startTime: z.string(), endTime: z.string(),
      paymentStatus: z.enum(["pending", "paid"]).default("pending"), amountPaid: z.string().optional(),
      discountCode: z.string().optional(), notes: z.string().optional(), crossSellServices: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(massageBookings).values({ ...input, bookingDate: input.bookingDate as any });
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]) }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(massageBookings).set({ status: input.status }).where(eq(massageBookings.id, input.id));
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(), therapistId: z.number().optional(), roomId: z.number().optional(),
      bookingDate: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(),
      status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]).optional(),
      paymentStatus: z.enum(["pending", "paid", "refunded"]).optional(),
      amountPaid: z.string().optional(), notes: z.string().optional(), crossSellServices: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Detectar cambio a "paid" para enviar notificaciones
      let sendConfirmation = false;
      if (input.paymentStatus === "paid") {
        const [current] = await db.select({ paymentStatus: massageBookings.paymentStatus })
          .from(massageBookings).where(eq(massageBookings.id, input.id)).limit(1);
        if (current && current.paymentStatus !== "paid") sendConfirmation = true;
      }

      const { id, bookingDate, ...data } = input;
      await db.update(massageBookings)
        .set({ ...data, ...(bookingDate ? { bookingDate: bookingDate as any } : {}) })
        .where(eq(massageBookings.id, id));

      // Notificaciones (fire and forget)
      if (sendConfirmation) {
        (async () => {
          try {
            const [booking] = await db.select({
              clientName: massageBookings.clientName, clientEmail: massageBookings.clientEmail,
              clientPhone: massageBookings.clientPhone, bookingDate: massageBookings.bookingDate,
              startTime: massageBookings.startTime, endTime: massageBookings.endTime,
              duration: massageBookings.duration, amountPaid: massageBookings.amountPaid,
              notes: massageBookings.notes,
              techniqueName: massageTechniques.name,
              therapistName: massageTherapists.name, therapistEmail: massageTherapists.email,
              therapistPhone: massageTherapists.phone,
            })
            .from(massageBookings)
            .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
            .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
            .where(eq(massageBookings.id, id)).limit(1);

            if (!booking) return;
            const dateStr = String(booking.bookingDate).slice(0, 10);

            // Email al cliente
            if (booking.clientEmail) {
              await sendMassageBookingConfirmationEmail({
                to: booking.clientEmail, clientName: booking.clientName,
                techniqueName: booking.techniqueName ?? "Masaje",
                therapistName: booking.therapistName ?? undefined,
                bookingDate: dateStr, startTime: booking.startTime,
                duration: booking.duration, amountPaid: booking.amountPaid ? String(booking.amountPaid) : undefined,
              });
            }

            // Email al terapeuta
            if (booking.therapistEmail) {
              await sendMassageTherapistNotificationEmail({
                to: booking.therapistEmail, therapistName: booking.therapistName ?? "Terapeuta",
                clientName: booking.clientName, clientPhone: booking.clientPhone,
                techniqueName: booking.techniqueName ?? "Masaje",
                bookingDate: dateStr, startTime: booking.startTime, endTime: booking.endTime,
                duration: booking.duration, notes: booking.notes,
              });
            }

            // WhatsApp al terapeuta
            if (booking.therapistPhone) {
              const humanDate = new Intl.DateTimeFormat("es-CL", {
                weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago",
              }).format(new Date(dateStr + "T12:00:00"));
              await sendWhatsApp(
                booking.therapistPhone,
                `📅 *Nueva reserva confirmada* — Cancagua Spa\n\nHola ${booking.therapistName ?? ""}! Tienes una reserva de pago confirmado:\n\n*${booking.techniqueName ?? "Masaje"}* · ${booking.duration} min\n👤 ${booking.clientName}${booking.clientPhone ? `\n📞 ${booking.clientPhone}` : ""}\n📅 ${humanDate}\n🕐 ${booking.startTime} – ${booking.endTime} hrs`
              );
            }
          } catch (e) {
            console.error("[Notification] Error sending confirmations:", e);
          }
        })();
      }

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
    const rows = await db.select().from(massageSupplies).where(and(eq(massageSupplies.active, 1), sql`${massageSupplies.currentStock} <= ${massageSupplies.minimumStock}`));
    return rows.map(row => serializeDateFields(row, ["purchasedAt", "openedAt"]));
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2), unit: z.string(),
      categoria: z.enum(["insumo", "herramienta"]).default("insumo"),
      ubicacion: z.string().optional(), vidaUtilMeses: z.number().optional(),
      currentStock: z.string().default("0"), minimumStock: z.string().default("0"),
      purchasedAt: z.string().optional(), openedAt: z.string().optional(), notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(massageSupplies).values({
        name: input.name, unit: input.unit, categoria: input.categoria,
        ubicacion: input.ubicacion || null, vidaUtilMeses: input.vidaUtilMeses ?? null,
        currentStock: input.currentStock, minimumStock: input.minimumStock,
        purchasedAt: (input.purchasedAt || null) as any, openedAt: (input.openedAt || null) as any, notes: input.notes || null,
      });
      return { success: true };
    }),

  receiveStock: protectedProcedure
    .input(z.object({ id: z.number(), stockReceived: z.string(), purchasedAt: z.string().optional(), openedAt: z.string().optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(massageSupplies).set({
        currentStock: sql`${massageSupplies.currentStock} + ${input.stockReceived}`,
        ...(input.purchasedAt ? { purchasedAt: input.purchasedAt as any } : {}),
        ...(input.openedAt ? { openedAt: input.openedAt as any } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      }).where(eq(massageSupplies.id, input.id));
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(), name: z.string().optional(), unit: z.string().optional(),
      categoria: z.enum(["insumo", "herramienta"]).optional(), ubicacion: z.string().optional(),
      vidaUtilMeses: z.number().optional(), currentStock: z.string().optional(), minimumStock: z.string().optional(),
      purchasedAt: z.string().optional(), openedAt: z.string().optional(), notes: z.string().optional(), active: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, purchasedAt, openedAt, notes, ubicacion, ...rest } = input;
      await db.update(massageSupplies).set({
        ...rest, ubicacion: ubicacion || null,
        purchasedAt: (purchasedAt || null) as any, openedAt: (openedAt || null) as any, notes: notes || null,
      }).where(eq(massageSupplies.id, id));
      return { success: true };
    }),

  adjustStock: protectedProcedure
    .input(z.object({ id: z.number(), delta: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(massageSupplies).set({ currentStock: sql`${massageSupplies.currentStock} + ${input.delta}` }).where(eq(massageSupplies.id, input.id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(massageSupplies).where(eq(massageSupplies.id, input.id));
      return { success: true };
    }),
});

// ─── CLIENTES ─────────────────────────────────────────────────
const clientesRouter = router({
  getAll: protectedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional())
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({
        clientName: massageBookings.clientName, clientEmail: massageBookings.clientEmail,
        clientPhone: massageBookings.clientPhone, clientOrigin: massageBookings.clientOrigin,
        totalBookings: sql<number>`COUNT(*)`,
        lastBookingDate: sql<string>`MAX(${massageBookings.bookingDate})`,
        totalSpent: sql<string>`SUM(${massageBookings.amountPaid})`,
      })
      .from(massageBookings)
      .where(sql`${massageBookings.status} != 'cancelled'`)
      .groupBy(massageBookings.clientName, massageBookings.clientEmail, massageBookings.clientPhone, massageBookings.clientOrigin)
      .orderBy(desc(sql`MAX(${massageBookings.bookingDate})`))
      .limit(input?.limit ?? 50).offset(input?.offset ?? 0);
      return rows.map(row => serializeDateFields(row, ["lastBookingDate"]));
    }),

  getHistory: protectedProcedure
    .input(z.object({ clientEmail: z.string() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({
        id: massageBookings.id, bookingDate: massageBookings.bookingDate,
        startTime: massageBookings.startTime, duration: massageBookings.duration,
        techniqueName: massageTechniques.name, therapistName: massageTherapists.name,
        status: massageBookings.status, amountPaid: massageBookings.amountPaid,
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
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return null;
      const [totals] = await db.select({
        totalBookings: sql<number>`COUNT(*)`, totalRevenue: sql<string>`SUM(${massageBookings.amountPaid})`,
        completedBookings: sql<number>`SUM(CASE WHEN ${massageBookings.status} = 'completed' THEN 1 ELSE 0 END)`,
        cancelledBookings: sql<number>`SUM(CASE WHEN ${massageBookings.status} = 'cancelled' THEN 1 ELSE 0 END)`,
      }).from(massageBookings).where(and(gte(massageBookings.bookingDate, input.from as any), lte(massageBookings.bookingDate, input.to as any)));

      const byTechnique = await db.select({
        techniqueName: massageTechniques.name, count: sql<number>`COUNT(*)`, revenue: sql<string>`SUM(${massageBookings.amountPaid})`,
      }).from(massageBookings)
        .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
        .where(and(gte(massageBookings.bookingDate, input.from as any), lte(massageBookings.bookingDate, input.to as any), sql`${massageBookings.status} != 'cancelled'`))
        .groupBy(massageTechniques.name).orderBy(desc(sql`COUNT(*)`));

      const byDuration = await db.select({
        duration: massageBookings.duration, count: sql<number>`COUNT(*)`, revenue: sql<string>`SUM(${massageBookings.amountPaid})`,
      }).from(massageBookings)
        .where(and(gte(massageBookings.bookingDate, input.from as any), lte(massageBookings.bookingDate, input.to as any), sql`${massageBookings.status} != 'cancelled'`))
        .groupBy(massageBookings.duration).orderBy(asc(massageBookings.duration));

      const byTherapist = await db.select({
        therapistName: massageTherapists.name, count: sql<number>`COUNT(*)`, revenue: sql<string>`SUM(${massageBookings.amountPaid})`,
      }).from(massageBookings)
        .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
        .where(and(gte(massageBookings.bookingDate, input.from as any), lte(massageBookings.bookingDate, input.to as any), sql`${massageBookings.status} != 'cancelled'`))
        .groupBy(massageTherapists.name).orderBy(desc(sql`COUNT(*)`));

      return { totals, byTechnique, byDuration, byTherapist };
    }),
});

// ─── RRHH ────────────────────────────────────────────────────
const rrhhRouter = router({
  getEvaluations: protectedProcedure
    .input(z.object({ therapistId: z.number() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      return db.select().from(massageTherapistEvaluations)
        .where(eq(massageTherapistEvaluations.therapistId, input.therapistId))
        .orderBy(desc(massageTherapistEvaluations.period));
    }),

  upsertEvaluation: protectedProcedure
    .input(z.object({
      therapistId: z.number(), period: z.string().regex(/^\d{4}-\d{2}$/),
      puntualidad: z.number().min(0).max(10), tecnica: z.number().min(0).max(10),
      satisfaccionCliente: z.number().min(0).max(10), presentacionHigiene: z.number().min(0).max(10),
      comunicacion: z.number().min(0).max(10), usoInsumos: z.number().min(0).max(10), comentarios: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { therapistId, period, comentarios, ...scores } = input;
      const existing = await db.select({ id: massageTherapistEvaluations.id }).from(massageTherapistEvaluations)
        .where(and(eq(massageTherapistEvaluations.therapistId, therapistId), eq(massageTherapistEvaluations.period, period))).limit(1);
      if (existing.length > 0) {
        await db.update(massageTherapistEvaluations)
          .set({ ...scores, satisfaccionCliente: scores.satisfaccionCliente, presentacionHigiene: scores.presentacionHigiene, comentarios: comentarios || null })
          .where(eq(massageTherapistEvaluations.id, existing[0].id));
      } else {
        await db.insert(massageTherapistEvaluations).values({
          therapistId, period, evaluatedBy: ctx.user.id ?? 0,
          ...scores, satisfaccionCliente: scores.satisfaccionCliente, presentacionHigiene: scores.presentacionHigiene, comentarios: comentarios || null,
        });
      }
      return { success: true };
    }),

  deleteEvaluation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(massageTherapistEvaluations).where(eq(massageTherapistEvaluations.id, input.id));
      return { success: true };
    }),

  getDocuments: protectedProcedure
    .input(z.object({ therapistId: z.number() }))
    .query(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      return db.select().from(massageTherapistDocuments)
        .where(eq(massageTherapistDocuments.therapistId, input.therapistId))
        .orderBy(desc(massageTherapistDocuments.createdAt));
    }),

  addDocument: protectedProcedure
    .input(z.object({
      therapistId: z.number(), tipo: z.enum(["certificado", "boleta", "contrato", "otro"]),
      nombre: z.string().min(2), descripcion: z.string().optional(), archivoUrl: z.string().optional(), periodo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(massageTherapistDocuments).values({
        ...input, descripcion: input.descripcion || null, archivoUrl: input.archivoUrl || null,
        periodo: input.periodo || null, uploadedBy: ctx.user.id ?? 0,
      });
      return { success: true };
    }),

  deleteDocument: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await adminOrEditor(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(massageTherapistDocuments).where(eq(massageTherapistDocuments.id, input.id));
      return { success: true };
    }),
});

// ─── CONFIGURACIÓN ────────────────────────────────────────────
const DEFAULT_DISCLAIMER = "Cancagua no se responsabiliza por lesiones preexistentes ni por reacciones alérgicas a los productos utilizados durante el servicio. El cliente declara estar en condiciones físicas adecuadas para recibir el tratamiento. En caso de condiciones médicas especiales (embarazo, lesiones, enfermedades crónicas), se recomienda consultar con un médico antes de agendar.";

const configRouter = router({
  getDisclaimer: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return DEFAULT_DISCLAIMER;
    try {
      const [row] = await db.select().from(massageSettings).where(eq(massageSettings.key, "disclaimer")).limit(1);
      return row?.value ?? DEFAULT_DISCLAIMER;
    } catch {
      return DEFAULT_DISCLAIMER;
    }
  }),

  updateDisclaimer: protectedProcedure
    .input(z.object({ value: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(massageSettings)
        .values({ key: "disclaimer", value: input.value })
        .onDuplicateKeyUpdate({ set: { value: input.value } });
      return { success: true };
    }),
});

// ─── PÚBLICO (sin autenticación) ──────────────────────────────
const parseTimeMin = (t: string) => parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1]);

const formatTimeMin = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

type AutomaticMassageTherapist = {
  id: number;
  name: string | null;
  email?: string | null;
  type: "inhouse" | "freelance";
  callPriority: number | null;
  scheduleStart: string;
  scheduleEnd: string;
};

type AutomaticMassageBooking = {
  therapistId: number | null;
  roomId: number | null;
  startTime: string;
  endTime: string;
};

type AutomaticMassageRoom = { id: number };

const overlaps = (startA: number, endA: number, startB: number, endB: number): boolean =>
  startA < endB && endA > startB;

export function selectAutomaticMassageAssignment(params: {
  therapists: AutomaticMassageTherapist[];
  bookings: AutomaticMassageBooking[];
  rooms: AutomaticMassageRoom[];
  startTime: string;
  duration: number;
  prepMinutes?: number;
}): { therapist: AutomaticMassageTherapist; room: AutomaticMassageRoom; endTime: string } | null {
  const prep = params.prepMinutes ?? 10;
  const requestedStart = parseTimeMin(params.startTime);
  const requestedEnd = requestedStart + params.duration;

  const therapists = [...params.therapists].sort((a, b) => {
    const typeA = a.type === "inhouse" ? 0 : 1;
    const typeB = b.type === "inhouse" ? 0 : 1;
    if (typeA !== typeB) return typeA - typeB;
    const priorityA = a.callPriority ?? 99;
    const priorityB = b.callPriority ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  for (const therapist of therapists) {
    const scheduleStart = parseTimeMin(therapist.scheduleStart);
    const scheduleEnd = parseTimeMin(therapist.scheduleEnd);
    if (requestedStart < scheduleStart || requestedEnd > scheduleEnd) continue;

    const therapistBusy = params.bookings.some((booking) => {
      if (booking.therapistId !== therapist.id) return false;
      return overlaps(
        requestedStart,
        requestedEnd,
        parseTimeMin(booking.startTime),
        parseTimeMin(booking.endTime) + prep,
      );
    });
    if (therapistBusy) continue;

    const room = params.rooms.find((candidateRoom) =>
      !params.bookings.some((booking) => {
        if (booking.roomId !== candidateRoom.id) return false;
        return overlaps(
          requestedStart,
          requestedEnd,
          parseTimeMin(booking.startTime),
          parseTimeMin(booking.endTime) + prep,
        );
      })
    );

    if (room) {
      return { therapist, room, endTime: formatTimeMin(requestedEnd) };
    }
  }

  return null;
}

type PublicMassageBookingNotificationInput = {
  contactEmail: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  techniqueName: string;
  therapistName?: string | null;
  therapistEmail?: string | null;
  bookingDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  notes?: string | null;
};

type PublicMassageBookingNotifications = {
  clientEmail?: Parameters<typeof sendMassageBookingReceivedEmail>[0];
  internalEmail: Parameters<typeof sendMassageInternalBookingNotificationEmail>[0];
  therapistEmail?: Parameters<typeof sendMassageTherapistBookingRequestEmail>[0];
  clientWhatsApp?: { phone: string; message: string };
  ownerNotification: NotificationPayload;
};

const formatMassageBookingHumanDate = (bookingDate: string): string =>
  new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  }).format(new Date(`${bookingDate}T12:00:00`));

export function buildPublicMassageBookingNotifications(
  params: PublicMassageBookingNotificationInput,
): PublicMassageBookingNotifications {
  const contactEmail = params.contactEmail.trim() || "contacto@cancagua.cl";
  const clientEmail = params.clientEmail?.trim() || null;
  const clientPhone = params.clientPhone?.trim() || null;
  const therapistEmail = params.therapistEmail?.trim() || null;
  const therapistName = params.therapistName || "Terapeuta";
  const humanDate = formatMassageBookingHumanDate(params.bookingDate);
  const baseEmailData = {
    clientName: params.clientName,
    techniqueName: params.techniqueName,
    bookingDate: params.bookingDate,
    startTime: params.startTime,
    endTime: params.endTime,
    duration: params.duration,
  };
  const ownerContent = [
    `Cliente: ${params.clientName}`,
    clientEmail ? `Email: ${clientEmail}` : null,
    clientPhone ? `Telefono: ${clientPhone}` : null,
    `Servicio: ${params.techniqueName}`,
    `Terapeuta asignado: ${therapistName}`,
    `Fecha: ${params.bookingDate}`,
    `Horario: ${params.startTime} - ${params.endTime} hrs`,
    `Duracion: ${params.duration} min`,
    params.notes ? `Notas: ${params.notes}` : null,
  ].filter((line): line is string => Boolean(line));

  return {
    clientEmail: clientEmail
      ? {
          to: clientEmail,
          ...baseEmailData,
        }
      : undefined,
    internalEmail: {
      to: contactEmail,
      ...baseEmailData,
      clientEmail,
      clientPhone,
      therapistName,
      notes: params.notes,
    },
    therapistEmail: therapistEmail
      ? {
          to: therapistEmail,
          therapistName,
          clientName: params.clientName,
          clientPhone,
          techniqueName: params.techniqueName,
          bookingDate: params.bookingDate,
          startTime: params.startTime,
          endTime: params.endTime,
          duration: params.duration,
          notes: params.notes,
        }
      : undefined,
    clientWhatsApp: clientPhone
      ? {
          phone: clientPhone,
          message: `Hola ${params.clientName}.\n\nTu solicitud de reserva en Cancagua Spa fue recibida.\n\n${params.techniqueName} · ${params.duration} min\n${humanDate}\n${params.startTime} hrs\n\nTe contactaremos pronto para confirmar y coordinar el pago.`,
        }
      : undefined,
    ownerNotification: {
      title: `Nueva reserva de masaje de ${params.clientName}`,
      content: ownerContent.join("\n"),
    },
  };
}

async function runPublicMassageNotification(
  label: string,
  run: () => Promise<{ success: boolean; error?: string }>,
): Promise<void> {
  try {
    const result = await run();
    if (!result.success) {
      console.error(`[Notification] ${label} failed: ${result.error ?? "unknown error"}`);
    }
  } catch (error) {
    console.error(`[Notification] ${label} error:`, error);
  }
}

async function sendPublicMassageBookingNotifications(
  notifications: PublicMassageBookingNotifications,
): Promise<void> {
  const tasks: Promise<void>[] = [
    notifications.clientEmail
      ? runPublicMassageNotification("massage client email", () =>
          sendMassageBookingReceivedEmail(notifications.clientEmail!)
        )
      : undefined,
    runPublicMassageNotification("massage internal email", () =>
      sendMassageInternalBookingNotificationEmail(notifications.internalEmail)
    ),
    notifications.therapistEmail
      ? runPublicMassageNotification("massage therapist email", () =>
          sendMassageTherapistBookingRequestEmail(notifications.therapistEmail!)
        )
      : undefined,
    notifications.clientWhatsApp
      ? runPublicMassageNotification("massage client WhatsApp", () =>
          sendWhatsApp(notifications.clientWhatsApp!.phone, notifications.clientWhatsApp!.message)
        )
      : undefined,
    runPublicMassageNotification("massage owner notification", async () => {
      const delivered = await notifyOwner(notifications.ownerNotification);
      return {
        success: delivered,
        error: delivered ? undefined : "Notification service rejected the request",
      };
    }),
  ].filter((task): task is Promise<void> => Boolean(task));

  await Promise.all(tasks);
}

const masajesPublicRouter = router({
  getTechnique: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [t] = await db.select().from(massageTechniques)
        .where(and(eq(massageTechniques.id, input.id), eq(massageTechniques.active, 1))).limit(1);
      return t ?? null;
    }),

  getTherapists: publicProcedure
    .input(z.object({ techniqueId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: massageTherapists.id, name: massageTherapists.name,
        type: massageTherapists.type, contractType: massageTherapists.contractType,
      })
      .from(massageTherapistTechniques)
      .innerJoin(massageTherapists, eq(massageTherapistTechniques.therapistId, massageTherapists.id))
      .where(and(eq(massageTherapistTechniques.techniqueId, input.techniqueId), eq(massageTherapists.active, 1)))
      // Inhouse primero, luego freelance; dentro de cada grupo, por prioridad de llamado
      .orderBy(
        sql`CASE WHEN ${massageTherapists.type} = 'inhouse' THEN 0 ELSE 1 END`,
        asc(massageTherapists.callPriority),
        asc(massageTherapists.name)
      );
    }),

  getSlots: publicProcedure
    .input(z.object({ date: z.string(), duration: z.number().positive(), techniqueId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const dayOfWeek = new Date(input.date + "T12:00:00").getDay();
      const therapists = await db.select({
        id: massageTherapists.id,
        name: massageTherapists.name,
        type: massageTherapists.type,
        callPriority: massageTherapists.callPriority,
        scheduleStart: massageTherapistSchedules.startTime,
        scheduleEnd: massageTherapistSchedules.endTime,
      })
        .from(massageTherapistTechniques)
        .innerJoin(massageTherapists, eq(massageTherapistTechniques.therapistId, massageTherapists.id))
        .innerJoin(massageTherapistSchedules, eq(massageTherapistSchedules.therapistId, massageTherapists.id))
        .where(and(
          eq(massageTherapistTechniques.techniqueId, input.techniqueId),
          eq(massageTherapists.active, 1),
          eq(massageTherapistSchedules.dayOfWeek, dayOfWeek),
          eq(massageTherapistSchedules.available, 1)
        ));
      if (therapists.length === 0) return [];

      const allBookings = await db.select().from(massageBookings).where(
        and(eq(massageBookings.bookingDate, input.date as any), sql`${massageBookings.status} NOT IN ('cancelled')`)
      );
      const rooms = await db.select().from(massageRooms).where(eq(massageRooms.active, 1));
      if (rooms.length === 0) return [];

      const schedStart = Math.min(...therapists.map((t) => parseTimeMin(t.scheduleStart)));
      const schedEnd = Math.max(...therapists.map((t) => parseTimeMin(t.scheduleEnd)));
      const slots: { time: string }[] = [];
      for (let t = schedStart; t + input.duration <= schedEnd; t += 30) {
        const timeStr = formatTimeMin(t);
        const assignment = selectAutomaticMassageAssignment({
          therapists,
          bookings: allBookings,
          rooms,
          startTime: timeStr,
          duration: input.duration,
        });
        if (assignment) slots.push({ time: timeStr });
      }
      return slots;
    }),

  book: publicProcedure
    .input(z.object({
      techniqueId: z.number(), duration: z.number().positive(),
      bookingDate: z.string(), startTime: z.string(),
      clientName: z.string().min(2), clientPhone: z.string().optional(),
      clientEmail: z.string().optional(), notes: z.string().optional(),
      subscribeNewsletter: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { subscribeNewsletter, ...bookingData } = input;
      const dayOfWeek = new Date(input.bookingDate + "T12:00:00").getDay();
      const therapists = await db.select({
        id: massageTherapists.id,
        name: massageTherapists.name,
        email: massageTherapists.email,
        type: massageTherapists.type,
        callPriority: massageTherapists.callPriority,
        scheduleStart: massageTherapistSchedules.startTime,
        scheduleEnd: massageTherapistSchedules.endTime,
      })
        .from(massageTherapistTechniques)
        .innerJoin(massageTherapists, eq(massageTherapistTechniques.therapistId, massageTherapists.id))
        .innerJoin(massageTherapistSchedules, eq(massageTherapistSchedules.therapistId, massageTherapists.id))
        .where(and(
          eq(massageTherapistTechniques.techniqueId, input.techniqueId),
          eq(massageTherapists.active, 1),
          eq(massageTherapistSchedules.dayOfWeek, dayOfWeek),
          eq(massageTherapistSchedules.available, 1)
        ));
      const allBookings = await db.select().from(massageBookings).where(
        and(eq(massageBookings.bookingDate, input.bookingDate as any), sql`${massageBookings.status} NOT IN ('cancelled')`)
      );
      const rooms = await db.select().from(massageRooms).where(eq(massageRooms.active, 1));
      const assignment = selectAutomaticMassageAssignment({
        therapists,
        bookings: allBookings,
        rooms,
        startTime: input.startTime,
        duration: input.duration,
      });

      if (!assignment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No hay terapeutas disponibles para ese horario. Elige otro bloque.",
        });
      }

      await db.insert(massageBookings).values({
        ...bookingData,
        therapistId: assignment.therapist.id,
        roomId: assignment.room.id,
        endTime: assignment.endTime,
        bookingDate: input.bookingDate as any,
        paymentStatus: "pending", status: "pending",
      });

      const [technique] = await db.select({ name: massageTechniques.name })
        .from(massageTechniques)
        .where(eq(massageTechniques.id, input.techniqueId))
        .limit(1);
      const notifications = buildPublicMassageBookingNotifications({
        contactEmail: ENV.contactEmail,
        clientName: input.clientName,
        clientEmail: input.clientEmail,
        clientPhone: input.clientPhone,
        techniqueName: technique?.name ?? "Masaje",
        therapistName: assignment.therapist.name,
        therapistEmail: assignment.therapist.email,
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: assignment.endTime,
        duration: input.duration,
        notes: input.notes,
      });
      await sendPublicMassageBookingNotifications(notifications);

      // Suscribir al newsletter
      if (subscribeNewsletter && input.clientEmail) {
        try {
          await db.insert(newsletterSubscribers).values({
            email: input.clientEmail, name: input.clientName,
            source: "masajes_booking", status: "active",
          });
        } catch { /* email duplicado */ }
      }
      return { success: true };
    }),

  initPayment: publicProcedure
    .input(z.object({
      techniqueId: z.number(),
      duration: z.number().positive(),
      bookingDate: z.string(),
      startTime: z.string(),
      clientName: z.string().min(2),
      clientPhone: z.string().optional(),
      clientEmail: z.string().optional(),
      notes: z.string().optional(),
      subscribeNewsletter: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [technique] = await db.select().from(massageTechniques)
        .where(and(eq(massageTechniques.id, input.techniqueId), eq(massageTechniques.active, 1)))
        .limit(1);
      if (!technique) throw new TRPCError({ code: "NOT_FOUND", message: "Técnica no encontrada" });

      const durations = (technique.durations ?? "").split(",").map((d: string) => Number(d.trim())).filter(Boolean).sort((a: number, b: number) => a - b);
      const durIdx = durations.indexOf(input.duration);
      const priceFields = [technique.price50min, technique.price80min, technique.price110min];
      const price = durIdx >= 0 && priceFields[durIdx] ? Number(priceFields[durIdx]) : null;
      if (!price) throw new TRPCError({ code: "BAD_REQUEST", message: "Precio no configurado para esta duración" });

      const dayOfWeek = new Date(input.bookingDate + "T12:00:00").getDay();
      const therapists = await db.select({
        id: massageTherapists.id,
        name: massageTherapists.name,
        email: massageTherapists.email,
        type: massageTherapists.type,
        callPriority: massageTherapists.callPriority,
        scheduleStart: massageTherapistSchedules.startTime,
        scheduleEnd: massageTherapistSchedules.endTime,
      })
        .from(massageTherapistTechniques)
        .innerJoin(massageTherapists, eq(massageTherapistTechniques.therapistId, massageTherapists.id))
        .innerJoin(massageTherapistSchedules, eq(massageTherapistSchedules.therapistId, massageTherapists.id))
        .where(and(
          eq(massageTherapistTechniques.techniqueId, input.techniqueId),
          eq(massageTherapists.active, 1),
          eq(massageTherapistSchedules.dayOfWeek, dayOfWeek),
          eq(massageTherapistSchedules.available, 1),
        ));

      const allBookings = await db.select().from(massageBookings).where(
        and(eq(massageBookings.bookingDate, input.bookingDate as any), sql`${massageBookings.status} NOT IN ('cancelled')`)
      );
      const rooms = await db.select().from(massageRooms).where(eq(massageRooms.active, 1));

      const assignment = selectAutomaticMassageAssignment({
        therapists,
        bookings: allBookings,
        rooms,
        startTime: input.startTime,
        duration: input.duration,
      });

      if (!assignment) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No hay terapeutas disponibles para ese horario. Elige otro bloque.",
        });
      }

      const { subscribeNewsletter, ...bookingData } = input;
      const [inserted] = await db.insert(massageBookings).values({
        ...bookingData,
        therapistId: assignment.therapist.id,
        roomId: assignment.room.id,
        endTime: assignment.endTime,
        bookingDate: input.bookingDate as any,
        paymentStatus: "pending",
        status: "pending",
      }).$returningId();
      const bookingId = inserted.id;

      if (subscribeNewsletter && input.clientEmail) {
        try {
          await db.insert(newsletterSubscribers).values({
            email: input.clientEmail, name: input.clientName,
            source: "masajes_booking", status: "active",
          });
        } catch { /* email duplicado */ }
      }

      let processUrl: string;
      let requestId: string;
      try {
        const session = await createGetnetSession({
          bookingId,
          description: technique.name.replace(/[^\x20-\x7E]/g, "").trim().slice(0, 80) || "Reserva de masaje",
          amountCLP: price,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          clientPhone: input.clientPhone,
        });
        processUrl = session.processUrl;
        requestId = session.requestId;
      } catch (err) {
        console.error("[initPayment] Getnet session error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo iniciar el pago. Intenta más tarde." });
      }

      await db.update(massageBookings)
        .set({ getnetRequestId: requestId })
        .where(eq(massageBookings.id, bookingId));

      return { processUrl, bookingId };
    }),

  checkPaymentStatus: publicProcedure
    .input(z.object({ requestId: z.string() }))
    .query(async ({ input }) => {
      if (!input.requestId) throw new TRPCError({ code: "BAD_REQUEST", message: "requestId requerido" });
      const result = await getGetnetSessionInfo(input.requestId);
      return { status: result.status, amount: result.amount, currency: result.currency };
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
  rrhh: rrhhRouter,
  public: masajesPublicRouter,
  config: configRouter,
});
