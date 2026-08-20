import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  biopoolBookings,
  biopoolCheckoutItems,
  biopoolCheckoutOrders,
  biopoolServices,
  biopoolTicketTypes,
  massageBookings,
  massageRooms,
  massageTechniques,
  massageTherapistAvailability,
  massageTherapists,
  massageTherapistTechniques,
  regularClassMemberships,
  regularClassPlans,
  regularClassStudents,
  saunaBookings,
  saunaCheckoutOrders,
  saunaServices,
  serviceCartCheckoutItems,
  serviceCartCheckoutOrders,
} from "../drizzle/schema";
import { validateAdultChildQuantities } from "../shared/biopoolsCapacity";
import { hasSaunaBookingLeadTime, SAUNA_CAPACITY, validateSaunaParty } from "../shared/sauna";
import { publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { chileLocalDateTimeToUtc } from "./massageNps";
import { calculateWellnessCartDiscount } from "./massageDiscounts";
import {
  acquireCapacityLock as acquireBiopoolCapacityLock,
  availabilityForDay as biopoolAvailabilityForDay,
  releaseCapacityLock as releaseBiopoolCapacityLock,
} from "./biopoolsRouter";
import {
  acquireCapacityLock as acquireSaunaCapacityLock,
  availabilityForDay as saunaAvailabilityForDay,
  settings as saunaSettings,
} from "./saunaRouter";
import { createTransaction, generateSessionId } from "./webpay";
import { serviceCartResultUrl } from "./serviceCartCheckout";
import { customerAcquisitionSchema } from "../shared/customerAcquisition";
import { saveCustomerPurchaseSurvey } from "./customerPurchaseSurvey";
import {
  isMassageTechniqueAvailableForDate,
  loadBlockingMassageBookings,
  selectAutomaticMassageAssignment,
  validateMassageCartCapacity,
  validatePublicMassageLeadTime,
} from "./masajesRouter";
import { withMassageResourceLocks } from "./massageResourceLock";
import { calendarMonthRange } from "./regularClassesPeriod";
import {
  createCustomerCheckoutHandoff,
  customerCheckoutProfileSchema,
  resolveCustomerCheckoutHandoff,
} from "./serviceCartHandoff";
import { finalizeFullyDiscountedServiceCart, isFullyDiscountedServiceCart, type ServiceCartChildOrder } from "./serviceCartCompletion";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const biopoolItemSchema = z.object({
  module: z.literal("biopools"),
  serviceId: z.number().int().positive(),
  bookingDate: dateSchema,
  startTime: timeSchema,
  adultQuantity: z.number().int().min(1).max(40),
  childQuantity: z.number().int().min(0).max(40),
  // Compatibilidad: la web todavía puede mandar el código dentro del ítem. El
  // que manda es el del carrito; este queda como respaldo para no dejar sin
  // descuento a una versión del front que aún no se actualizó.
  discountCode: z.string().trim().max(50).optional(),
});
const saunaItemSchema = z.object({
  module: z.literal("sauna"),
  serviceId: z.number().int().positive(),
  bookingDate: dateSchema,
  startTime: timeSchema,
  privateGuestCount: z.number().int().min(1).max(6).optional(),
});
const massageItemSchema = z.object({
  module: z.literal("massages"),
  techniqueId: z.number().int().positive(),
  duration: z.number().int().positive(),
  bookingDate: dateSchema,
  startTime: timeSchema,
  notes: z.string().trim().max(1000).optional(),
});
const regularClassItemSchema = z.object({
  module: z.literal("regular_classes"),
  planId: z.number().int().positive(),
});
const unifiedItemSchema = z.discriminatedUnion("module", [biopoolItemSchema, saunaItemSchema, massageItemSchema, regularClassItemSchema]);

function generateCartBuyOrder(orderId: number): string {
  return `CART-${orderId}-${Date.now().toString(36).slice(-6)}`.substring(0, 26);
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
  return db;
}

/**
 * Freno simple a la enumeracion de correos: el endpoint de prellenado responde
 * con el nombre de quien ya compro, asi que no puede quedar abierto a que
 * alguien pruebe miles de direcciones. Es en memoria y por instancia; no
 * pretende ser una defensa fuerte, solo cortar el barrido automatico.
 */
const CONSULTAS_PERFIL = new Map<string, { desde: number; total: number }>();
const PERFIL_VENTANA_MS = 10 * 60_000;
const PERFIL_TOPE = 30;

function permitirConsultaPerfil(ip: string): boolean {
  const ahora = Date.now();
  const actual = CONSULTAS_PERFIL.get(ip);
  if (!actual || ahora - actual.desde > PERFIL_VENTANA_MS) {
    CONSULTAS_PERFIL.set(ip, { desde: ahora, total: 1 });
    if (CONSULTAS_PERFIL.size > 5000) {
      for (const [clave, valor] of CONSULTAS_PERFIL) {
        if (ahora - valor.desde > PERFIL_VENTANA_MS) CONSULTAS_PERFIL.delete(clave);
      }
    }
    return true;
  }
  actual.total += 1;
  return actual.total <= PERFIL_TOPE;
}

export const serviceCartRouter = router({
  public: router({
    createCheckoutHandoff: publicProcedure
      .input(customerCheckoutProfileSchema)
      .mutation(({ input }) => ({ token: createCustomerCheckoutHandoff(input) })),
    resolveCheckoutHandoff: publicProcedure
      .input(z.object({ token: z.string().min(20).max(4096) }))
      .query(({ input }) => {
        try {
          return resolveCustomerCheckoutHandoff(input.token);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "No pudimos recuperar tus datos",
          });
        }
      }),
    // Previsualización del código: valida y devuelve el desglose SIN cobrar ni
    // tomar cupo, para que el botón "Aplicar código" del carrito pueda decir al
    // instante si el código sirve y sobre qué líneas opera.
    validateDiscount: publicProcedure
      .input(z.object({
        code: z.string().trim().min(1).max(50),
        items: z.array(unifiedItemSchema).min(1).max(44),
      }))
      .mutation(async ({ input }) => {
        const db = await database();
        const lines: Array<{
          module: "biopools" | "sauna" | "massages" | "regular_classes";
          itemName: string;
          service: "biopiscinas" | "sauna" | "masajes" | "clases";
          serviceId: number;
          originalAmount: number;
          unitAmounts?: number[];
          bookingDate: string;
        }> = [];
        for (const item of input.items) {
          if (item.module === "biopools") {
            const [service] = await db.select().from(biopoolServices).where(eq(biopoolServices.id, item.serviceId)).limit(1);
            if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "El servicio de Biopiscinas no existe" });
            const tickets = await db.select().from(biopoolTicketTypes).where(and(eq(biopoolTicketTypes.serviceId, item.serviceId), eq(biopoolTicketTypes.active, 1)));
            const adult = tickets.find((ticket: any) => ticket.code === "adult");
            const child = tickets.find((ticket: any) => ticket.code === "child");
            if (!adult) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La venta de Biopiscinas no está configurada" });
            lines.push({
              module: "biopools",
              itemName: service.name,
              service: "biopiscinas",
              serviceId: item.serviceId,
              originalAmount: adult.priceClp * item.adultQuantity + (child?.priceClp ?? 0) * item.childQuantity,
              unitAmounts: [
                ...Array.from({ length: item.adultQuantity }, () => adult.priceClp),
                ...Array.from({ length: item.childQuantity }, () => child?.priceClp ?? 0),
              ],
              bookingDate: item.bookingDate,
            });
          } else if (item.module === "sauna") {
            const [service] = await db.select().from(saunaServices).where(and(eq(saunaServices.id, item.serviceId), eq(saunaServices.published, 1))).limit(1);
            if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "La opción de Sauna no está disponible" });
            lines.push({
              module: "sauna",
              itemName: service.name,
              service: "sauna",
              serviceId: service.id,
              originalAmount: service.priceClp,
              bookingDate: item.bookingDate,
            });
          } else if (item.module === "massages") {
            const [technique] = await db.select().from(massageTechniques).where(and(eq(massageTechniques.id, item.techniqueId), eq(massageTechniques.active, 1))).limit(1);
            if (!technique) throw new TRPCError({ code: "NOT_FOUND", message: "El masaje ya no está disponible" });
            if (!isMassageTechniqueAvailableForDate(technique, item.bookingDate)) throw new TRPCError({ code: "NOT_FOUND", message: "El masaje no está disponible para el mes seleccionado" });
            const durations = (technique.durations ?? "").split(",").map(Number).filter(Boolean).sort((a, b) => a - b);
            const price = [technique.price50min, technique.price80min, technique.price110min][durations.indexOf(item.duration)];
            if (!price) throw new TRPCError({ code: "BAD_REQUEST", message: `Precio no configurado para ${technique.name}` });
            lines.push({ module: "massages", itemName: technique.name, service: "masajes", serviceId: technique.id, originalAmount: Number(price), bookingDate: item.bookingDate });
          } else {
            const [plan] = await db.select().from(regularClassPlans).where(and(eq(regularClassPlans.id, item.planId), eq(regularClassPlans.active, 1))).limit(1);
            if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "El plan de clases ya no está disponible" });
            lines.push({ module: "regular_classes", itemName: plan.name, service: "clases", serviceId: plan.id, originalAmount: plan.priceClp, bookingDate: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" }) });
          }
        }
        try {
          const discount = await calculateWellnessCartDiscount(
            db,
            input.code,
            lines.map(line => ({ service: line.service, serviceId: line.serviceId, originalAmount: line.originalAmount, unitAmounts: line.unitAmounts, bookingDate: line.bookingDate })),
          );
          return {
            valid: true as const,
            code: discount.code,
            discountTotal: discount.discountTotal,
            originalTotal: discount.originalTotal,
            finalTotal: discount.finalTotal,
            lines: lines.map((line, index) => ({
              module: line.module,
              itemName: line.itemName,
              originalAmount: line.originalAmount,
              discountClp: discount.lineDiscounts[index] ?? 0,
              totalClp: line.originalAmount - (discount.lineDiscounts[index] ?? 0),
              applied: (discount.lineDiscounts[index] ?? 0) > 0,
            })),
          };
        } catch (error) {
          // La función lanza mensajes ya redactados para el cliente ("no existe",
          // "está vencido", "no aplica a los productos seleccionados").
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Código de descuento inválido",
          });
        }
      }),
    startPayment: publicProcedure
      .input(z.object({
        clientName: z.string().trim().min(2).max(200),
        clientEmail: z.string().trim().email(),
        clientPhone: z.string().trim().min(8).max(40),
        acquisition: customerAcquisitionSchema,
        items: z.array(unifiedItemSchema).min(1).max(44),
        discountCode: z.string().trim().max(50).optional(),
        acceptedTerms: z.literal(true),
        utmSource: z.string().max(100).optional(),
        utmMedium: z.string().max(100).optional(),
        utmCampaign: z.string().max(100).optional(),
      }).superRefine(({ items }, ctx) => {
        if (!items.some(item => item.module === "biopools" || item.module === "sauna")) {
          ctx.addIssue({ code: "custom", path: ["items"], message: "Los carritos con sólo Masajes o Clases Regulares se pagan por Getnet" });
        }
        for (const module of ["biopools", "sauna", "regular_classes"] as const) {
          if (items.filter(item => item.module === module).length > 1) {
            const label = module === "biopools" ? "Biopiscinas" : module === "sauna" ? "Sauna" : "Clases Regulares";
            ctx.addIssue({ code: "custom", path: ["items"], message: `Sólo puedes agregar una selección de ${label} por pago` });
          }
        }
      }))
      .mutation(async ({ input }) => {
        const db = await database();
        const expiresAt = new Date(Date.now() + 40 * 60_000);
        const publicToken = nanoid(48);
        let cartOrderId = 0;
        let totalClp = 0;
        const childOrders: ServiceCartChildOrder[] = [];
        const biopoolItem = input.items.find(item => item.module === "biopools");
        const saunaItem = input.items.find(item => item.module === "sauna");
        const massageItems = input.items.filter((item): item is z.infer<typeof massageItemSchema> => item.module === "massages");
        const regularClassItem = input.items.find((item): item is z.infer<typeof regularClassItemSchema> => item.module === "regular_classes");
        const biopoolLockName = biopoolItem ? `biopool:shared:${biopoolItem.bookingDate}` : null;

        validatePublicMassageLeadTime(massageItems);
        validateMassageCartCapacity(massageItems);
        await withMassageResourceLocks(db, massageItems.map(item => item.bookingDate), async () => db.transaction(async tx => {
          if (saunaItem) await acquireSaunaCapacityLock(tx, saunaItem.bookingDate);
          if (biopoolLockName) await acquireBiopoolCapacityLock(tx, biopoolLockName);
          try {
            const discountLines: Array<{
              module: "biopools" | "sauna" | "massages" | "regular_classes";
              orderId: number;
              service: "biopiscinas" | "sauna" | "masajes" | "clases";
              serviceId: number;
              originalAmount: number;
              unitAmounts?: number[];
              bookingDate: string;
            }> = [];
            const prepared: Array<{
              module: "biopools" | "sauna" | "massages" | "regular_classes";
              childOrderId: number;
              itemName: string;
              bookingDate: string;
              startTime: string;
              endTime: string;
              guests: number;
              totalClp: number;
            }> = [];

            if (biopoolItem) {
              if (chileLocalDateTimeToUtc(biopoolItem.bookingDate, biopoolItem.startTime) <= new Date()) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "El horario de Biopiscinas ya pasó" });
              }
              const quantityError = validateAdultChildQuantities(biopoolItem.adultQuantity, biopoolItem.childQuantity);
              if (quantityError) throw new TRPCError({ code: "BAD_REQUEST", message: quantityError });
              const availability = await biopoolAvailabilityForDay(tx, biopoolItem.serviceId, biopoolItem.bookingDate);
              if (availability.service.status !== "published") throw new TRPCError({ code: "NOT_FOUND", message: "Biopiscinas no está publicado" });
              const slot = availability.slots.find((candidate: any) => candidate.startTime === biopoolItem.startTime);
              const guests = biopoolItem.adultQuantity + biopoolItem.childQuantity;
              if (!slot || slot.availableSeats < guests) throw new TRPCError({ code: "CONFLICT", message: "El horario de Biopiscinas ya no tiene los cupos necesarios" });
              const tickets = await tx.select().from(biopoolTicketTypes).where(and(eq(biopoolTicketTypes.serviceId, biopoolItem.serviceId), eq(biopoolTicketTypes.active, 1)));
              const adult = tickets.find((ticket: any) => ticket.code === "adult");
              const child = tickets.find((ticket: any) => ticket.code === "child");
              if (!adult || (biopoolItem.childQuantity > 0 && !child)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La venta de Biopiscinas no está configurada" });
              const subtotalClp = adult.priceClp * biopoolItem.adultQuantity + (child?.priceClp ?? 0) * biopoolItem.childQuantity;
              // El código del carrito se aplica después, cuando ya están todas
              // las líneas: así un cupón de biopiscinas no toca el sauna.
              const itemTotal = subtotalClp;
              const childToken = nanoid(48);
              const [created] = await tx.insert(biopoolCheckoutOrders).values({
                publicToken: childToken,
                serviceId: biopoolItem.serviceId,
                clientName: input.clientName,
                clientEmail: input.clientEmail.toLowerCase(),
                clientPhone: input.clientPhone,
                bookingDate: biopoolItem.bookingDate,
                startTime: biopoolItem.startTime,
                endTime: slot.endTime,
                adultQuantity: biopoolItem.adultQuantity,
                childQuantity: biopoolItem.childQuantity,
                totalGuests: guests,
                subtotalClp,
                discountClp: 0,
                discountCodeId: null,
                discountCode: null,
                totalClp: itemTotal,
                status: "initiating",
                expiresAt,
                utmSource: input.utmSource ?? null,
                utmMedium: input.utmMedium ?? null,
                utmCampaign: input.utmCampaign ?? null,
              }).$returningId();
              await tx.insert(biopoolCheckoutItems).values([
                { orderId: created.id, ticketTypeId: adult.id, code: adult.code, name: adult.name, unitPriceClp: adult.priceClp, quantity: biopoolItem.adultQuantity, subtotalClp: adult.priceClp * biopoolItem.adultQuantity },
                ...(biopoolItem.childQuantity > 0 && child ? [{ orderId: created.id, ticketTypeId: child.id, code: child.code, name: child.name, unitPriceClp: child.priceClp, quantity: biopoolItem.childQuantity, subtotalClp: child.priceClp * biopoolItem.childQuantity }] : []),
              ]);
              childOrders.push({ module: "biopools", id: created.id, totalClp: itemTotal, fullyDiscounted: false });
              discountLines.push({
                module: "biopools",
                orderId: created.id,
                service: "biopiscinas",
                serviceId: biopoolItem.serviceId,
                originalAmount: subtotalClp,
                unitAmounts: [
                  ...Array.from({ length: biopoolItem.adultQuantity }, () => adult.priceClp),
                  ...Array.from({ length: biopoolItem.childQuantity }, () => child?.priceClp ?? 0),
                ],
                bookingDate: biopoolItem.bookingDate,
              });
              prepared.push({ module: "biopools", childOrderId: created.id, itemName: availability.service.name, bookingDate: biopoolItem.bookingDate, startTime: biopoolItem.startTime, endTime: slot.endTime, guests, totalClp: itemTotal });
              totalClp += itemTotal;
            }

            if (saunaItem) {
              const config = await saunaSettings(tx);
              if (!config.checkoutEnabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La venta online de Sauna todavía no está habilitada" });
              const [service] = await tx.select().from(saunaServices).where(and(eq(saunaServices.id, saunaItem.serviceId), eq(saunaServices.published, 1))).limit(1);
              if (!service || ["staff", "program"].includes(service.kind)) throw new TRPCError({ code: "NOT_FOUND", message: "La opción de Sauna no está disponible" });
              const isPrivate = service.kind === "private" || service.partySize >= 4;
              const guests = isPrivate ? (saunaItem.privateGuestCount ?? SAUNA_CAPACITY) : service.partySize;
              const partyError = validateSaunaParty(guests, isPrivate);
              if (partyError) throw new TRPCError({ code: "BAD_REQUEST", message: partyError });
              if (saunaItem.startTime < "10:00" || saunaItem.startTime > "20:00") throw new TRPCError({ code: "BAD_REQUEST", message: "Elige un horario de Sauna entre las 10:00 y las 20:00" });
              if (!hasSaunaBookingLeadTime(chileLocalDateTimeToUtc(saunaItem.bookingDate, saunaItem.startTime), config.bookingLeadHours)) throw new TRPCError({ code: "BAD_REQUEST", message: `La reserva de Sauna exige al menos ${config.bookingLeadHours} horas de anticipación` });
              const availability = await saunaAvailabilityForDay(tx, saunaItem.bookingDate);
              const slot = availability.slots.find(candidate => candidate.startTime === saunaItem.startTime);
              if (!slot || slot.availableSeats < service.capacityUsed || (isPrivate && !slot.privateAvailable)) throw new TRPCError({ code: "CONFLICT", message: "El horario de Sauna ya no tiene los cupos necesarios" });
              const saunaItemTotal = service.priceClp;
              const [created] = await tx.insert(saunaCheckoutOrders).values({
                publicToken: nanoid(48),
                serviceId: service.id,
                clientName: input.clientName,
                clientEmail: input.clientEmail.toLowerCase(),
                clientPhone: input.clientPhone,
                bookingDate: saunaItem.bookingDate,
                startTime: saunaItem.startTime,
                endTime: slot.endTime,
                guests,
                capacityUsed: service.capacityUsed,
                isPrivate: isPrivate ? 1 : 0,
                subtotalClp: service.priceClp,
                discountClp: 0,
                discountCodeId: null,
                discountCode: null,
                totalClp: saunaItemTotal,
                status: "initiating",
                expiresAt,
              }).$returningId();
              childOrders.push({ module: "sauna", id: created.id, totalClp: saunaItemTotal });
              discountLines.push({ module: "sauna", orderId: created.id, service: "sauna", serviceId: service.id, originalAmount: service.priceClp, bookingDate: saunaItem.bookingDate });
              prepared.push({ module: "sauna", childOrderId: created.id, itemName: service.name, bookingDate: saunaItem.bookingDate, startTime: saunaItem.startTime, endTime: slot.endTime, guests, totalClp: saunaItemTotal });
              totalClp += saunaItemTotal;
            }

            const massageBookingIds: number[] = [];
            const blockingByDate = new Map<string, Awaited<ReturnType<typeof loadBlockingMassageBookings>>>();
            const roomsByDate = new Map<string, Array<{ id: number; capacity: number; allowCoupleBooking: number }>>();
            for (const item of massageItems) {
              const [technique] = await tx.select().from(massageTechniques).where(and(eq(massageTechniques.id, item.techniqueId), eq(massageTechniques.active, 1))).limit(1);
              if (!technique) throw new TRPCError({ code: "NOT_FOUND", message: "Uno de los masajes ya no está disponible" });
              if (!isMassageTechniqueAvailableForDate(technique, item.bookingDate)) throw new TRPCError({ code: "NOT_FOUND", message: "El masaje no está disponible para el mes seleccionado" });
              const durations = (technique.durations ?? "").split(",").map(Number).filter(Boolean).sort((a, b) => a - b);
              const price = Number([technique.price50min, technique.price80min, technique.price110min][durations.indexOf(item.duration)] ?? 0);
              if (!price) throw new TRPCError({ code: "BAD_REQUEST", message: `Precio no configurado para ${technique.name}` });
              const therapists = await tx.select({
                id: massageTherapists.id,
                name: massageTherapists.name,
                type: massageTherapists.type,
                callPriority: massageTherapists.callPriority,
                scheduleStart: massageTherapistAvailability.startTime,
                scheduleEnd: massageTherapistAvailability.endTime,
              }).from(massageTherapistTechniques)
                .innerJoin(massageTherapists, eq(massageTherapistTechniques.therapistId, massageTherapists.id))
                .innerJoin(massageTherapistAvailability, eq(massageTherapistAvailability.therapistId, massageTherapists.id))
                .where(and(
                  eq(massageTherapistTechniques.techniqueId, item.techniqueId),
                  eq(massageTherapists.active, 1),
                  eq(massageTherapistAvailability.date, item.bookingDate as any),
                  eq(massageTherapistAvailability.isAvailable, 1),
                ));
              let blocking = blockingByDate.get(item.bookingDate);
              if (!blocking) {
                blocking = await loadBlockingMassageBookings(tx, item.bookingDate);
                blockingByDate.set(item.bookingDate, blocking);
              }
              let rooms = roomsByDate.get(item.bookingDate);
              if (!rooms) {
                rooms = await tx.select({ id: massageRooms.id, capacity: massageRooms.capacity, allowCoupleBooking: massageRooms.allowCoupleBooking }).from(massageRooms).where(eq(massageRooms.active, 1));
                roomsByDate.set(item.bookingDate, rooms);
              }
              const assignment = selectAutomaticMassageAssignment({
                therapists: therapists.filter(row => row.scheduleStart && row.scheduleEnd) as any,
                bookings: blocking,
                rooms,
                startTime: item.startTime,
                duration: item.duration,
                bookingDate: item.bookingDate,
                groupKey: publicToken,
              });
              if (!assignment) throw new TRPCError({ code: "CONFLICT", message: `No quedan terapeuta y sala disponibles para ${technique.name} el ${item.bookingDate} a las ${item.startTime}` });
              const [created] = await tx.insert(massageBookings).values({
                techniqueId: item.techniqueId,
                duration: item.duration,
                bookingDate: item.bookingDate as any,
                startTime: item.startTime,
                endTime: assignment.endTime,
                clientName: input.clientName,
                clientPhone: input.clientPhone,
                clientEmail: input.clientEmail.toLowerCase(),
                notes: item.notes,
                therapistId: assignment.therapist.id,
                roomId: assignment.room.id,
                paymentStatus: "pending",
                originalAmount: String(price),
                discountAmount: "0",
                amountPaid: String(price),
                status: "pending",
                bookingSource: "web",
              }).$returningId();
              massageBookingIds.push(created.id);
              blocking.push({ therapistId: assignment.therapist.id, roomId: assignment.room.id, startTime: item.startTime, endTime: assignment.endTime, groupKey: publicToken });
              childOrders.push({ module: "massages", id: created.id, totalClp: price });
              discountLines.push({ module: "massages", orderId: created.id, service: "masajes", serviceId: item.techniqueId, originalAmount: price, bookingDate: item.bookingDate });
              prepared.push({ module: "massages", childOrderId: created.id, itemName: technique.name, bookingDate: item.bookingDate, startTime: item.startTime, endTime: assignment.endTime, guests: 1, totalClp: price });
              totalClp += price;
            }
            if (massageBookingIds.length > 1) {
              await tx.update(massageBookings).set({ coupleBookingId: massageBookingIds[0] }).where(inArray(massageBookings.id, massageBookingIds));
            }

            if (regularClassItem) {
              const [plan] = await tx.select().from(regularClassPlans).where(and(eq(regularClassPlans.id, regularClassItem.planId), eq(regularClassPlans.active, 1))).limit(1);
              if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "El plan de clases ya no está disponible" });
              const email = input.clientEmail.toLowerCase();
              const phone = input.clientPhone.trim();
              const nameParts = input.clientName.trim().split(/\s+/);
              const firstName = nameParts.shift() || input.clientName.trim();
              const lastName = nameParts.join(" ") || null;
              const duplicateConditions = [eq(regularClassStudents.email, email), eq(regularClassStudents.phone, phone)];
              let [student] = await tx.select().from(regularClassStudents).where(or(...duplicateConditions)).limit(1);
              if (!student) {
                const [createdStudent] = await tx.insert(regularClassStudents).values({ firstName, lastName, email, phone, status: "prospect", source: "web" }).$returningId();
                [student] = await tx.select().from(regularClassStudents).where(eq(regularClassStudents.id, createdStudent.id)).limit(1);
              } else {
                await tx.update(regularClassStudents).set({ firstName, lastName, email, phone }).where(eq(regularClassStudents.id, student.id));
              }
              const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" }).formatToParts(new Date());
              const period = calendarMonthRange(`${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}`);
              const [membership] = await tx.insert(regularClassMemberships).values({
                studentId: student.id,
                planId: plan.id,
                periodStart: period.start,
                periodEnd: period.end,
                pricePaidClp: plan.priceClp,
                originalAmountClp: plan.priceClp,
                discountAmountClp: 0,
                creditsTotal: plan.creditsPerPeriod,
                status: "pending_payment",
                paymentStatus: "pending",
                paymentMethod: "transbank_web",
                paymentReference: publicToken,
              }).$returningId();
              childOrders.push({ module: "regular_classes", id: membership.id, totalClp: plan.priceClp });
              discountLines.push({ module: "regular_classes", orderId: membership.id, service: "clases", serviceId: plan.id, originalAmount: plan.priceClp, bookingDate: period.start });
              prepared.push({ module: "regular_classes", childOrderId: membership.id, itemName: plan.name, bookingDate: period.start, startTime: "00:00", endTime: "00:00", guests: 1, totalClp: plan.priceClp });
              totalClp += plan.priceClp;
            }

            // UN código por carrito, evaluado contra TODAS las líneas: el
            // descuento se reparte solo entre los servicios a los que aplica y
            // los demás mantienen su precio original.
            const cartDiscountCode = input.discountCode?.trim() || biopoolItem?.discountCode?.trim();
            if (cartDiscountCode && discountLines.length > 0) {
              const cartDiscount = await calculateWellnessCartDiscount(
                tx,
                cartDiscountCode,
                discountLines.map(line => ({ service: line.service, serviceId: line.serviceId, originalAmount: line.originalAmount, unitAmounts: line.unitAmounts, bookingDate: line.bookingDate })),
              );
              totalClp = 0;
              for (const [index, line] of discountLines.entries()) {
                const lineDiscount = cartDiscount.lineDiscounts[index] ?? 0;
                const lineTotal = line.originalAmount - lineDiscount;
                totalClp += lineTotal;
                const patch = {
                  discountClp: lineDiscount,
                  discountCodeId: lineDiscount > 0 ? cartDiscount.discountCodeId : null,
                  discountCode: lineDiscount > 0 ? cartDiscount.code : null,
                  totalClp: lineTotal,
                };
                if (line.module === "biopools") {
                  await tx.update(biopoolCheckoutOrders).set(patch).where(eq(biopoolCheckoutOrders.id, line.orderId));
                } else if (line.module === "sauna") {
                  await tx.update(saunaCheckoutOrders).set(patch).where(eq(saunaCheckoutOrders.id, line.orderId));
                } else if (line.module === "massages") {
                  await tx.update(massageBookings).set({
                    discountAmount: String(lineDiscount),
                    discountCodeId: lineDiscount > 0 ? cartDiscount.discountCodeId : null,
                    discountCode: lineDiscount > 0 ? cartDiscount.code : null,
                    amountPaid: String(lineTotal),
                  }).where(eq(massageBookings.id, line.orderId));
                } else {
                  await tx.update(regularClassMemberships).set({
                    discountAmountClp: lineDiscount,
                    discountCodeId: lineDiscount > 0 ? cartDiscount.discountCodeId : null,
                    discountCode: lineDiscount > 0 ? cartDiscount.code : null,
                    pricePaidClp: lineTotal,
                  }).where(eq(regularClassMemberships.id, line.orderId));
                }
                const child = childOrders.find(item => item.id === line.orderId && item.module === line.module);
                if (child) {
                  child.totalClp = lineTotal;
                  child.fullyDiscounted = line.originalAmount > 0
                    && lineTotal === 0
                    && lineDiscount === line.originalAmount
                    && cartDiscount.discountCodeId > 0;
                }
                const preparedItem = prepared.find(item => item.childOrderId === line.orderId && item.module === line.module);
                if (preparedItem) preparedItem.totalClp = lineTotal;
              }
            }
            const fullyDiscountedCart = isFullyDiscountedServiceCart(totalClp, childOrders);
            if (totalClp === 0 && !fullyDiscountedCart) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "El carrito no tiene un total válido" });
            }
            const [cart] = await tx.insert(serviceCartCheckoutOrders).values({
              publicToken,
              clientName: input.clientName,
              clientEmail: input.clientEmail.toLowerCase(),
              clientPhone: input.clientPhone,
              totalClp,
              status: "initiating",
              expiresAt,
            }).$returningId();
            cartOrderId = cart.id;
            await tx.insert(serviceCartCheckoutItems).values(prepared.map(item => ({ cartOrderId, ...item })));
            await saveCustomerPurchaseSurvey(tx, {
              purchaseType: "service_cart",
              purchaseId: cartOrderId,
              clientEmail: input.clientEmail,
              acquisition: input.acquisition,
            });
          } finally {
            if (biopoolLockName) await releaseBiopoolCapacityLock(tx, biopoolLockName);
          }
        }));

        if (totalClp === 0) {
          try {
            await finalizeFullyDiscountedServiceCart({ cartOrderId, publicToken, childOrders });
            return { paymentRequired: false as const, paymentUrl: null, token: null, orderToken: publicToken, resultUrl: serviceCartResultUrl(publicToken, "pagado") };
          } catch (error) {
            await db.update(serviceCartCheckoutOrders).set({
              status: "manual_review",
              webpayStatus: "NOT_REQUIRED",
              rawResponse: JSON.stringify({ paymentRequired: false, reason: "fully_discounted" }),
              error: `No se pudieron confirmar todos los servicios cubiertos por el descuento: ${String(error)}`.slice(0, 2000),
              completedAt: new Date(),
            }).where(eq(serviceCartCheckoutOrders.id, cartOrderId));
            return { paymentRequired: false as const, paymentUrl: null, token: null, orderToken: publicToken, resultUrl: serviceCartResultUrl(publicToken, "revision") };
          }
        }

        const buyOrder = generateCartBuyOrder(cartOrderId);
        const sessionId = generateSessionId();
        const origin = (ENV.appUrl || "https://cms.cancagua.cl").replace(/\/$/, "");
        try {
          const payment = await createTransaction(buyOrder, sessionId, totalClp, `${origin}/api/servicios/webpay/return`);
          await db.transaction(async tx => {
            await tx.update(serviceCartCheckoutOrders).set({ status: "payment_pending", buyOrder, sessionId, webpayToken: payment.token }).where(eq(serviceCartCheckoutOrders.id, cartOrderId));
            for (const child of childOrders) {
              if (child.module === "biopools") await tx.update(biopoolCheckoutOrders).set({ status: "payment_pending" }).where(eq(biopoolCheckoutOrders.id, child.id));
              else if (child.module === "sauna") await tx.update(saunaCheckoutOrders).set({ status: "payment_pending" }).where(eq(saunaCheckoutOrders.id, child.id));
            }
          });
          return { paymentRequired: true as const, paymentUrl: payment.url, token: payment.token, orderToken: publicToken, resultUrl: null };
        } catch (error) {
          await db.transaction(async tx => {
            await tx.update(serviceCartCheckoutOrders).set({ status: "failed", error: String(error).slice(0, 2000) }).where(eq(serviceCartCheckoutOrders.id, cartOrderId));
            for (const child of childOrders) {
              if (child.module === "biopools") await tx.update(biopoolCheckoutOrders).set({ status: "failed", error: "No se pudo iniciar el pago del carrito" }).where(eq(biopoolCheckoutOrders.id, child.id));
              else if (child.module === "sauna") await tx.update(saunaCheckoutOrders).set({ status: "failed", error: "No se pudo iniciar el pago del carrito" }).where(eq(saunaCheckoutOrders.id, child.id));
              else if (child.module === "massages") await tx.update(massageBookings).set({ status: "cancelled", cancellationCategory: "system", cancellationReason: "No se pudo iniciar el pago del carrito.", cancelledAt: new Date() }).where(eq(massageBookings.id, child.id));
              else await tx.update(regularClassMemberships).set({ status: "cancelled" }).where(eq(regularClassMemberships.id, child.id));
            }
          });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No pudimos iniciar el pago con Webpay" });
        }
      }),

    /**
     * Prellenado del checkout: si el correo ya compro antes, devuelve el nombre
     * y el telefono con que quedo registrado. Nace de un caso real: una clienta
     * reservo como "claudia" mientras por WhatsApp pedia la reserva a nombre de
     * otra persona, y recepcion no pudo cruzarlas.
     *
     * Devuelve null cuando no hay historial: no distingue "no existe" de "no
     * compro", y nunca dice nada que no se sepa ya teniendo el correo exacto.
     */
    perfilPorEmail: publicProcedure
      .input(z.object({ email: z.string().trim().email().max(160) }))
      .query(async ({ ctx, input }) => {
        const ip = String(
          ctx.req.headers["x-forwarded-for"] ?? ctx.req.socket?.remoteAddress ?? "desconocida"
        ).split(",")[0].trim();
        if (!permitirConsultaPerfil(ip)) return { encontrado: false as const };

        const db = await database();
        const email = input.email.toLowerCase();
        // Se traen las ultimas 5 por tabla y no una sola: el telefono util puede
        // estar en una reserva anterior a la mas nueva, que es justo lo que
        // pasaba con el numero al que le faltaba un digito.
        const [bio, sauna, masaje] = await Promise.all([
          db.select({ nombre: biopoolBookings.clientName, telefono: biopoolBookings.clientPhone, creado: biopoolBookings.createdAt })
            .from(biopoolBookings).where(sql`lower(${biopoolBookings.clientEmail}) = ${email}`)
            .orderBy(desc(biopoolBookings.createdAt)).limit(5),
          db.select({ nombre: saunaBookings.clientName, telefono: saunaBookings.clientPhone, creado: saunaBookings.createdAt })
            .from(saunaBookings).where(sql`lower(${saunaBookings.clientEmail}) = ${email}`)
            .orderBy(desc(saunaBookings.createdAt)).limit(5),
          db.select({ nombre: massageBookings.clientName, telefono: massageBookings.clientPhone, creado: massageBookings.createdAt })
            .from(massageBookings).where(sql`lower(${massageBookings.clientEmail}) = ${email}`)
            .orderBy(desc(massageBookings.createdAt)).limit(5),
        ]);

        // Se queda con el registro mas reciente que traiga nombre: el ultimo
        // dato es el que el cliente corrigio, si es que alguna vez lo corrigio.
        // Se ordena por fecha de creacion y NO por id, porque los id de tres
        // tablas distintas no son comparables entre si: el de biopiscinas va
        // por los 270.000 y el de masajes por los cientos.
        const candidatos = [...bio, ...sauna, ...masaje].filter(fila => (fila.nombre ?? "").trim().length > 1);
        if (!candidatos.length) return { encontrado: false as const };
        const elegido = candidatos.sort(
          (a, b) => new Date(b.creado ?? 0).getTime() - new Date(a.creado ?? 0).getTime()
        )[0];

        // El telefono no sale del mismo registro que el nombre: se toma el mas
        // reciente que TENGA pinta de telefono. Un caso real tenia +5692784201
        // (un 9 de menos) en la reserva ultima y el numero bueno en la anterior;
        // prellenar el malo es peor que no prellenar nada.
        const telefonoUtil = candidatos
          .map(fila => (fila.telefono ?? "").trim())
          .find(valor => {
            // Un movil chileno son 9 digitos que parten en 9, con o sin el 56
            // adelante. El numero malo del caso real quedaba en 8 y asi se cae.
            const digitos = valor.replace(/\D/g, "").replace(/^56/, "");
            return digitos.length === 9 && digitos.startsWith("9");
          });

        return {
          encontrado: true as const,
          nombre: (elegido.nombre ?? "").trim(),
          telefono: telefonoUtil || null,
        };
      }),

    paymentStatus: publicProcedure.input(z.object({ orderToken: z.string().min(20) })).query(async ({ input }) => {
      const db = await database();
      const [order] = await db.select().from(serviceCartCheckoutOrders).where(eq(serviceCartCheckoutOrders.publicToken, input.orderToken)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await db.select().from(serviceCartCheckoutItems).where(eq(serviceCartCheckoutItems.cartOrderId, order.id));
      const results = await Promise.all(items.map(async item => {
        if (item.module === "biopools") {
          const [child] = await db.select().from(biopoolCheckoutOrders).where(eq(biopoolCheckoutOrders.id, item.childOrderId)).limit(1);
          const [booking] = child?.bookingId ? await db.select({ bookingCode: biopoolBookings.bookingCode }).from(biopoolBookings).where(eq(biopoolBookings.id, child.bookingId)).limit(1) : [];
          return { ...item, bookingCode: booking?.bookingCode ?? null };
        }
        if (item.module === "sauna") {
          const [child] = await db.select().from(saunaCheckoutOrders).where(eq(saunaCheckoutOrders.id, item.childOrderId)).limit(1);
          const [booking] = child?.bookingId ? await db.select({ bookingCode: saunaBookings.bookingCode }).from(saunaBookings).where(eq(saunaBookings.id, child.bookingId)).limit(1) : [];
          return { ...item, bookingCode: booking?.bookingCode ?? null };
        }
        return { ...item, bookingCode: null };
      }));
      return { status: order.status, totalClp: order.totalClp, items: results, clientEmail: order.clientEmail.replace(/^(.{2}).*(@.*)$/, "$1***$2") };
    }),
  }),
});
