/**
 * Router tRPC para el Módulo Concierge
 * Maneja todas las operaciones de vendedores, servicios y ventas del canal Concierge
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as conciergeDb from "./conciergeDb";
import { getSkeduBookingUrl } from "./skedu";

// Procedimiento protegido solo para admins
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes permisos para acceder a esta función",
    });
  }
  return next();
});

// Procedimiento protegido para vendedores concierge
const conciergeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "concierge") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No tienes permisos para acceder a esta función",
    });
  }
  return next();
});

export const conciergeRouter = router({
  // ============================================
  // SERVICIOS (Admin)
  // ============================================
  services: router({
    /**
     * Obtener todos los servicios Concierge (Admin)
     */
    getAll: adminProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        return await conciergeDb.getConciergeServices(input?.activeOnly ?? false);
      }),

    /**
     * Obtener un servicio por ID
     */
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const service = await conciergeDb.getConciergeServiceById(input.id);
        if (!service) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Servicio no encontrado" });
        }
        return service;
      }),

    /**
     * Crear o actualizar un servicio Concierge
     */
    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        serviceId: z.number(),
        price: z.number().min(0),
        availableQuantity: z.number().default(-1),
        active: z.number().min(0).max(1).default(1),
        sellerNotes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await conciergeDb.upsertConciergeService(input);
        return { success: true, id };
      }),

    /**
     * Eliminar un servicio Concierge
     */
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await conciergeDb.deleteConciergeService(input.id);
        return { success: true };
      }),
  }),

  // ============================================
  // VENDEDORES (Admin)
  // ============================================
  sellers: router({
    /**
     * Obtener todos los vendedores
     */
    getAll: adminProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        return await conciergeDb.getConciergeSellers(input?.activeOnly ?? false);
      }),

    /**
     * Crear o actualizar un vendedor
     */
    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        userId: z.number(),
        commissionRate: z.number().min(0).max(100).default(10),
        companyName: z.string().optional(),
        notes: z.string().optional(),
        active: z.number().min(0).max(1).default(1),
      }))
      .mutation(async ({ input }) => {
        const id = await conciergeDb.upsertConciergeSeller(input);
        return { success: true, id };
      }),

    /**
     * Actualizar comisión de un vendedor
     */
    updateCommission: adminProcedure
      .input(z.object({
        sellerId: z.number(),
        commissionRate: z.number().min(0).max(100),
      }))
      .mutation(async ({ input }) => {
        await conciergeDb.updateSellerCommission(input.sellerId, input.commissionRate);
        return { success: true };
      }),

    /**
     * Obtener métricas de un vendedor
     */
    getMetrics: adminProcedure
      .input(z.object({
        sellerId: z.number(),
        periodType: z.enum(["daily", "weekly", "monthly"]),
        startKey: z.string(),
        endKey: z.string(),
      }))
      .query(async ({ input }) => {
        return await conciergeDb.getSellerMetrics(
          input.sellerId,
          input.periodType,
          input.startKey,
          input.endKey
        );
      }),

    /**
     * Obtener métricas en tiempo real de un vendedor
     */
    getRealtimeMetrics: adminProcedure
      .input(z.object({
        sellerId: z.number(),
        startDate: z.string().transform((s) => new Date(s)),
        endDate: z.string().transform((s) => new Date(s)),
      }))
      .query(async ({ input }) => {
        return await conciergeDb.calculateSellerMetricsRealtime(
          input.sellerId,
          input.startDate,
          input.endDate
        );
      }),
  }),

  // ============================================
  // COMISIONES (Admin)
  // ============================================
  commissions: router({
    /**
     * Obtener resumen de comisiones por período
     */
    getSummary: adminProcedure
      .input(z.object({
        startDate: z.string().transform((s) => new Date(s)),
        endDate: z.string().transform((s) => new Date(s)),
      }))
      .query(async ({ input }) => {
        return await conciergeDb.getCommissionsSummary(input.startDate, input.endDate);
      }),

    /**
     * Obtener todas las ventas (para detalle de comisiones)
     */
    getAllSales: adminProcedure
      .input(z.object({
        startDate: z.string().transform((s) => new Date(s)).optional(),
        endDate: z.string().transform((s) => new Date(s)).optional(),
        sellerId: z.number().optional(),
        status: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await conciergeDb.getAllConciergeSales(input);
      }),
  }),

  // ============================================
  // HERRAMIENTA DE VENTA (Vendedor Concierge)
  // ============================================
  sales: router({
    /**
     * Obtener servicios disponibles para venta (Vendedor)
     */
    getAvailableServices: conciergeProcedure.query(async () => {
      return await conciergeDb.getConciergeServices(true);
    }),

    /**
     * Obtener información del vendedor actual
     */
    getMySellerInfo: conciergeProcedure.query(async ({ ctx }) => {
      const seller = await conciergeDb.getConciergeSellerByUserId(ctx.user.id);
      if (!seller) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No tienes configuración de vendedor. Contacta al administrador.",
        });
      }
      return seller;
    }),

    /**
     * Iniciar una venta - Genera el enlace de pago
     */
    initiateSale: conciergeProcedure
      .input(z.object({
        conciergeServiceId: z.number(),
        customerName: z.string().min(2),
        customerEmail: z.string().email().optional(),
        customerPhone: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Obtener información del vendedor
        const seller = await conciergeDb.getConciergeSellerByUserId(ctx.user.id);
        if (!seller) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No tienes configuración de vendedor",
          });
        }

        if (!seller.active) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Tu cuenta de vendedor está desactivada",
          });
        }

        // Obtener información del servicio
        const service = await conciergeDb.getConciergeServiceById(input.conciergeServiceId);
        if (!service) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Servicio no encontrado",
          });
        }

        if (!service.active) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este servicio no está disponible actualmente",
          });
        }

        // Calcular comisión
        const amount = service.price;
        const commissionRate = seller.commissionRate;
        const commissionAmount = Math.round((amount * commissionRate) / 100);

        // Crear registro de venta pendiente
        const { id, saleReference } = await conciergeDb.createConciergeSale({
          sellerId: seller.id,
          conciergeServiceId: input.conciergeServiceId,
          amount,
          commissionRate,
          commissionAmount,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          notes: input.notes,
          status: "pending",
        });

        // Generar enlace de Skedu con la referencia
        // El parámetro utm_content contendrá la referencia de la venta
        const skeduBookingUrl = getSkeduBookingUrl(service.serviceSkeduId || "", {
          utm_source: "concierge",
          utm_medium: "seller",
          utm_campaign: seller.sellerCode,
          utm_content: saleReference,
        });

        // Actualizar la venta con el enlace
        // (En una implementación real, guardaríamos el enlace en la BD)

        return {
          success: true,
          saleId: id,
          saleReference,
          paymentLink: skeduBookingUrl,
          amount,
          serviceName: service.serviceName,
          commissionAmount,
        };
      }),

    /**
     * Obtener mis ventas (Vendedor)
     */
    getMySales: conciergeProcedure
      .input(z.object({
        startDate: z.string().transform((s) => new Date(s)).optional(),
        endDate: z.string().transform((s) => new Date(s)).optional(),
        status: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const seller = await conciergeDb.getConciergeSellerByUserId(ctx.user.id);
        if (!seller) {
          return [];
        }

        return await conciergeDb.getConciergeSalesBySeller(seller.id, input);
      }),

    /**
     * Obtener mis métricas (Vendedor)
     */
    getMyMetrics: conciergeProcedure
      .input(z.object({
        startDate: z.string().transform((s) => new Date(s)),
        endDate: z.string().transform((s) => new Date(s)),
      }))
      .query(async ({ ctx, input }) => {
        const seller = await conciergeDb.getConciergeSellerByUserId(ctx.user.id);
        if (!seller) {
          return { totalSales: 0, totalCommission: 0, transactionCount: 0 };
        }

        return await conciergeDb.calculateSellerMetricsRealtime(
          seller.id,
          input.startDate,
          input.endDate
        );
      }),
  }),

  // ============================================
  // WEBHOOK (Público - llamado por Skedu)
  // ============================================
  webhook: router({
    /**
     * Recibir notificación de nueva reserva desde Skedu
     */
    appointmentCreated: publicProcedure
      .input(z.object({
        BusinessUUID: z.string(),
        Secret: z.string(),
        Action: z.string(),
        AppointmentsCreated: z.object({
          AppointmentGroupUUID: z.string(),
          CreatedAt: z.string(),
          StoreUUID: z.string().optional(),
          ServiceUUID: z.string().optional(),
          UserUUID: z.string().optional(),
          AppointmentUUIDs: z.array(z.string()).optional(),
        }).optional(),
        // Campos UTM que Skedu puede enviar
        utm_source: z.string().optional(),
        utm_medium: z.string().optional(),
        utm_campaign: z.string().optional(),
        utm_content: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Verificar que es una acción de reserva creada
        if (input.Action !== "APPOINTMENTS_CREATED") {
          return { success: true, message: "Ignored: not an appointment creation" };
        }

        // Buscar si hay una referencia de venta Concierge en utm_content
        const saleReference = input.utm_content;
        if (!saleReference || !saleReference.startsWith("CONC-")) {
          return { success: true, message: "Ignored: not a concierge sale" };
        }

        // Buscar la venta pendiente
        const sale = await conciergeDb.getConciergeSaleByReference(saleReference);
        if (!sale) {
          console.warn(`[Concierge Webhook] Sale not found: ${saleReference}`);
          return { success: false, message: "Sale not found" };
        }

        if (sale.status !== "pending") {
          return { success: true, message: "Sale already processed" };
        }

        // Actualizar la venta como completada
        await conciergeDb.updateConciergeSaleStatus(sale.id, "completed", {
          skeduGroupUuid: input.AppointmentsCreated?.AppointmentGroupUUID,
          skeduAppointmentUuid: input.AppointmentsCreated?.AppointmentUUIDs?.[0],
          confirmedAt: new Date(),
        });

        console.log(`[Concierge Webhook] Sale completed: ${saleReference}`);

        return { success: true, message: "Sale confirmed" };
      }),
  }),
});

export type ConciergeRouter = typeof conciergeRouter;
