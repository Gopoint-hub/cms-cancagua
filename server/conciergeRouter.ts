/**
 * Router tRPC para el Módulo Concierge
 * Maneja operaciones de vendedores, servicios y ventas con WebPay
 * Info de servicios viene de Skedu, precios diferenciados se configuran en CMS.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as conciergeDb from "./conciergeDb";
import * as webpay from "./webpay";
import * as conciergeEmails from "./conciergeEmails";
import { ENV } from "./_core/env";
import { getUserByOpenId } from "./db";

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

// Procedimiento protegido para vendedores concierge (y admins)
const conciergeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (
    ctx.user.role !== "super_admin" &&
    ctx.user.role !== "admin" &&
    ctx.user.role !== "concierge"
  ) {
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
    /** Obtener todos los servicios Concierge con precios (Admin) */
    getAll: adminProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        return await conciergeDb.getConciergeServicesWithPrices(
          input?.activeOnly ?? false
        );
      }),

    /** Obtener un servicio por ID con sus precios */
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const service = await conciergeDb.getConciergeServiceWithPrices(
          input.id
        );
        if (!service) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Servicio no encontrado",
          });
        }
        return service;
      }),

    /** Crear o actualizar un servicio Concierge (sin precios, solo metadata) */
    upsert: adminProcedure
      .input(
        z.object({
          id: z.number().optional(),
          serviceId: z.number(),
          availableQuantity: z.number().default(-1),
          active: z.number().min(0).max(1).default(1),
          sellerNotes: z.string().optional(),
          prices: z
            .array(
              z.object({
                label: z.string().min(1),
                price: z.number().min(0),
                sortOrder: z.number().optional(),
                active: z.number().min(0).max(1).optional(),
              })
            )
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { prices, ...serviceData } = input;
        const id = await conciergeDb.upsertConciergeService(serviceData);

        // If prices were provided, replace them
        if (prices && prices.length > 0) {
          await conciergeDb.replaceServicePrices(id, prices);
        }

        return { success: true, id };
      }),

    /** Eliminar un servicio Concierge (cascade deletes prices) */
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await conciergeDb.deleteConciergeService(input.id);
        return { success: true };
      }),

    /** Obtener precios de un servicio */
    getPrices: adminProcedure
      .input(z.object({ conciergeServiceId: z.number() }))
      .query(async ({ input }) => {
        return await conciergeDb.getServicePrices(input.conciergeServiceId);
      }),

    /** Agregar o actualizar un precio individual */
    upsertPrice: adminProcedure
      .input(
        z.object({
          id: z.number().optional(),
          serviceId: z.number(), // concierge service id
          label: z.string().min(1),
          price: z.number().min(0),
          sortOrder: z.number().optional(),
          active: z.number().min(0).max(1).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const id = await conciergeDb.upsertServicePrice(input);
        return { success: true, id };
      }),

    /** Eliminar un precio */
    deletePrice: adminProcedure
      .input(z.object({ priceId: z.number() }))
      .mutation(async ({ input }) => {
        await conciergeDb.deleteServicePrice(input.priceId);
        return { success: true };
      }),
  }),

  // ============================================
  // VENDEDORES (Admin)
  // ============================================
  sellers: router({
    /** Obtener todos los vendedores */
    getAll: adminProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        return await conciergeDb.getConciergeSellers(input?.activeOnly ?? false);
      }),

    /** Crear o actualizar un vendedor */
    upsert: adminProcedure
      .input(
        z.object({
          id: z.number().optional(),
          userId: z.number(),
          commissionRate: z.number().min(0).max(100).default(10),
          companyName: z.string().optional(),
          notes: z.string().optional(),
          active: z.number().min(0).max(1).default(1),
        })
      )
      .mutation(async ({ input }) => {
        const id = await conciergeDb.upsertConciergeSeller(input);
        return { success: true, id };
      }),

    /** Actualizar comisión de un vendedor */
    updateCommission: adminProcedure
      .input(
        z.object({
          sellerId: z.number(),
          commissionRate: z.number().min(0).max(100),
        })
      )
      .mutation(async ({ input }) => {
        await conciergeDb.updateSellerCommission(
          input.sellerId,
          input.commissionRate
        );
        return { success: true };
      }),

    /** Obtener métricas de un vendedor */
    getMetrics: adminProcedure
      .input(
        z.object({
          sellerId: z.number(),
          periodType: z.enum(["daily", "weekly", "monthly"]),
          startKey: z.string(),
          endKey: z.string(),
        })
      )
      .query(async ({ input }) => {
        return await conciergeDb.getSellerMetrics(
          input.sellerId,
          input.periodType,
          input.startKey,
          input.endKey
        );
      }),

    /** Obtener métricas en tiempo real de un vendedor */
    getRealtimeMetrics: adminProcedure
      .input(
        z.object({
          sellerId: z.number(),
          startDate: z.string().transform((s) => new Date(s)),
          endDate: z.string().transform((s) => new Date(s)),
        })
      )
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
    /** Obtener resumen de comisiones por período */
    getSummary: adminProcedure
      .input(
        z.object({
          startDate: z.string().transform((s) => new Date(s)),
          endDate: z.string().transform((s) => new Date(s)),
        })
      )
      .query(async ({ input }) => {
        return await conciergeDb.getCommissionsSummary(
          input.startDate,
          input.endDate
        );
      }),

    /** Obtener todas las ventas (para detalle de comisiones) */
    getAllSales: adminProcedure
      .input(
        z
          .object({
            startDate: z
              .string()
              .transform((s) => new Date(s))
              .optional(),
            endDate: z
              .string()
              .transform((s) => new Date(s))
              .optional(),
            sellerId: z.number().optional(),
            status: z.string().optional(),
            limit: z.number().optional(),
            offset: z.number().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return await conciergeDb.getAllConciergeSales(input);
      }),
  }),

  // ============================================
  // HERRAMIENTA DE VENTA (Vendedor Concierge)
  // ============================================
  sales: router({
    /** Obtener servicios disponibles para venta con precios (Vendedor) */
    getAvailableServices: conciergeProcedure.query(async () => {
      return await conciergeDb.getConciergeServicesWithPrices(true);
    }),

    /** Obtener información del vendedor actual */
    getMySellerInfo: conciergeProcedure.query(async ({ ctx }) => {
      const seller = await conciergeDb.getConciergeSellerByUserId(ctx.user.id);
      if (!seller) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "No tienes configuración de vendedor. Contacta al administrador.",
        });
      }
      return seller;
    }),

    /**
     * Iniciar una venta - Crea la transacción WebPay y envía el link de pago al cliente
     * Ahora recibe priceId para saber qué precio diferenciado se eligió
     */
    initiateSale: conciergeProcedure
      .input(
        z.object({
          conciergeServiceId: z.number(),
          priceId: z.number(), // ID del precio diferenciado seleccionado
          customerName: z.string().min(2),
          customerEmail: z.string().email(),
          customerPhone: z.string().optional(),
          notes: z.string().optional(),
          quantity: z.number().min(1).default(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 1. Obtener información del vendedor
        const seller = await conciergeDb.getConciergeSellerByUserId(
          ctx.user.id
        );
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

        // 2. Obtener información del servicio
        const service = await conciergeDb.getConciergeServiceById(
          input.conciergeServiceId
        );
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

        // 3. Obtener el precio seleccionado
        const selectedPrice = await conciergeDb.getServicePriceById(
          input.priceId
        );
        if (!selectedPrice) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Precio no encontrado",
          });
        }

        if (selectedPrice.serviceId !== input.conciergeServiceId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "El precio no corresponde al servicio seleccionado",
          });
        }

        // 4. Calcular monto total y comisión
        const amount = selectedPrice.price * input.quantity;
        const commissionRate = seller.commissionRate;
        const commissionAmount = Math.round((amount * commissionRate) / 100);
        const priceLabel = `${selectedPrice.label}${input.quantity > 1 ? ` x${input.quantity}` : ""}`;

        // 5. Crear registro de venta pendiente
        const { id: saleId, saleReference } =
          await conciergeDb.createConciergeSale({
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
            serviceName: service.serviceName || "Servicio Cancagua",
            priceLabel,
          });

        // 6. Crear transacción WebPay
        const buyOrder = webpay.generateBuyOrder(saleId);
        const sessionId = webpay.generateSessionId();
        const frontendUrl = ENV.frontendUrl || "https://cancagua.cl";
        const returnUrl = `${frontendUrl}/concierge/payment-result`;

        try {
          const wpResponse = await webpay.createTransaction(
            buyOrder,
            sessionId,
            amount,
            returnUrl
          );

          // 7. Construir la URL de pago completa (WebPay redirect URL)
          const paymentUrl = `${wpResponse.url}?token_ws=${wpResponse.token}`;

          // 8. Guardar token y link en la venta
          await conciergeDb.updateConciergeSaleWebpay(saleId, {
            webpayToken: wpResponse.token,
            paymentLink: paymentUrl,
          });

          // 9. Enviar email al cliente con el link de pago
          const sellerName = ctx.user.name || "Vendedor Cancagua";
          await conciergeEmails.sendPaymentLinkEmail({
            customerName: input.customerName,
            customerEmail: input.customerEmail,
            serviceName: service.serviceName || "Servicio Cancagua",
            amount,
            paymentUrl,
            sellerName,
          });

          return {
            success: true,
            saleId,
            saleReference,
            paymentUrl,
            amount,
            serviceName: service.serviceName,
            priceLabel,
            commissionAmount,
            emailSent: true,
          };
        } catch (error: any) {
          // Si falla WebPay, eliminar la venta pendiente
          await conciergeDb.deleteConciergeSale(saleId);
          console.error("[Concierge] WebPay error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Error al crear transacción de pago: ${error.message}`,
          });
        }
      }),

    /** Obtener mis ventas (Vendedor) */
    getMySales: conciergeProcedure
      .input(
        z
          .object({
            startDate: z
              .string()
              .transform((s) => new Date(s))
              .optional(),
            endDate: z
              .string()
              .transform((s) => new Date(s))
              .optional(),
            status: z.string().optional(),
            limit: z.number().optional(),
            offset: z.number().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const seller = await conciergeDb.getConciergeSellerByUserId(
          ctx.user.id
        );
        if (!seller) {
          return [];
        }

        return await conciergeDb.getConciergeSalesBySeller(seller.id, input);
      }),

    /** Obtener mis métricas (Vendedor) */
    getMyMetrics: conciergeProcedure
      .input(
        z.object({
          startDate: z.string().transform((s) => new Date(s)),
          endDate: z.string().transform((s) => new Date(s)),
        })
      )
      .query(async ({ ctx, input }) => {
        const seller = await conciergeDb.getConciergeSellerByUserId(
          ctx.user.id
        );
        if (!seller) {
          return { totalSales: 0, totalCommission: 0, transactionCount: 0 };
        }

        return await conciergeDb.calculateSellerMetricsRealtime(
          seller.id,
          input.startDate,
          input.endDate
        );
      }),

    /** Obtener resumen de comisiones del vendedor actual */
    getMyCommissionSummary: conciergeProcedure.query(async ({ ctx }) => {
      const seller = await conciergeDb.getConciergeSellerByUserId(ctx.user.id);
      if (!seller) {
        return {
          totalSales: 0,
          totalCommission: 0,
          completedCount: 0,
          pendingCount: 0,
          commissionRate: 0,
        };
      }

      const summary = await conciergeDb.getSellerCommissionSummary(seller.id);
      return {
        ...summary,
        commissionRate: seller.commissionRate,
      };
    }),
  }),

  // ============================================
  // CONFIRMACIÓN DE PAGO (Público - llamado desde el frontend)
  // ============================================
  payment: router({
    /**
     * Confirmar pago de WebPay
     * Llamado desde el frontend (cancagua.cl) cuando WebPay redirige al cliente
     */
    confirm: publicProcedure
      .input(
        z.object({
          token_ws: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const { token_ws } = input;

        // 1. Buscar la venta por el token de WebPay
        const sale =
          await conciergeDb.getConciergeSaleByWebpayToken(token_ws);
        if (!sale) {
          console.warn(
            "[Concierge Payment] Sale not found for token:",
            token_ws
          );
          return {
            success: false,
            status: "not_found",
            message: "Transacción no encontrada",
          };
        }

        // Si ya fue procesada, retornar el estado actual
        if (sale.status === "completed") {
          return {
            success: true,
            status: "already_completed",
            message: "Este pago ya fue confirmado anteriormente",
            saleReference: sale.saleReference,
          };
        }

        if (sale.status !== "pending") {
          return {
            success: false,
            status: sale.status,
            message: "Esta transacción ya no está pendiente",
          };
        }

        try {
          // 2. Confirmar con Transbank
          const wpResult = await webpay.commitTransaction(token_ws);

          // 3. Verificar si el pago fue aprobado
          const isApproved = webpay.isTransactionApproved(
            wpResult.responseCode,
            wpResult.status
          );

          if (isApproved) {
            // 4a. PAGO EXITOSO
            await conciergeDb.updateConciergeSaleStatus(
              sale.id,
              "completed",
              {
                confirmedAt: new Date(),
                webpayAuthCode: wpResult.authorizationCode,
                webpayResponseCode: wpResult.responseCode,
                webpayCardNumber: wpResult.cardNumber,
              }
            );

            // Obtener datos del vendedor para emails
            const seller = await conciergeDb.getConciergeSellerByUserId(
              sale.sellerId
            );
            const { getDb } = await import("./db");
            const db = await getDb();
            let sellerName = "Vendedor";
            let sellerEmail = "";
            let sellerCode = "";

            if (seller && db) {
              const { users } = await import("../drizzle/schema");
              const { eq } = await import("drizzle-orm");
              const userResult = await db
                .select()
                .from(users)
                .where(eq(users.id, seller.userId))
                .limit(1);
              if (userResult[0]) {
                sellerName = userResult[0].name || "Vendedor";
                sellerEmail = userResult[0].email || "";
              }
              sellerCode = seller.sellerCode;
            }

            const serviceName = sale.serviceName || "Servicio Cancagua";

            // Enviar email al cliente
            if (sale.customerEmail) {
              await conciergeEmails.sendPaymentSuccessToCustomer({
                customerName: sale.customerName,
                customerEmail: sale.customerEmail,
                serviceName,
                amount: sale.amount,
                saleReference: sale.saleReference,
              });
            }

            // Enviar email al vendedor
            if (sellerEmail) {
              await conciergeEmails.sendPaymentSuccessToSeller({
                sellerName,
                sellerEmail,
                customerName: sale.customerName,
                customerEmail: sale.customerEmail || "",
                customerPhone: sale.customerPhone || "",
                serviceName,
                amount: sale.amount,
                commissionAmount: sale.commissionAmount,
                saleReference: sale.saleReference,
              });
            }

            // Enviar notificación a contacto@cancagua.cl para gestionar reserva
            await conciergeEmails.sendReservationNotification({
              customerName: sale.customerName,
              customerEmail: sale.customerEmail || "",
              customerPhone: sale.customerPhone || "",
              serviceName,
              amount: sale.amount,
              saleReference: sale.saleReference,
              sellerName,
              sellerCode,
            });

            return {
              success: true,
              status: "completed",
              message: "Pago confirmado exitosamente",
              saleReference: sale.saleReference,
              serviceName,
              amount: sale.amount,
              customerName: sale.customerName,
            };
          } else {
            // 4b. PAGO RECHAZADO
            const seller = await conciergeDb.getConciergeSellerByUserId(
              sale.sellerId
            );
            const { getDb } = await import("./db");
            const db = await getDb();
            let sellerName = "Vendedor";
            let sellerEmail = "";

            if (seller && db) {
              const { users } = await import("../drizzle/schema");
              const { eq } = await import("drizzle-orm");
              const userResult = await db
                .select()
                .from(users)
                .where(eq(users.id, seller.userId))
                .limit(1);
              if (userResult[0]) {
                sellerName = userResult[0].name || "Vendedor";
                sellerEmail = userResult[0].email || "";
              }
            }

            const serviceName = sale.serviceName || "Servicio Cancagua";

            // Enviar email de fallo al cliente
            if (sale.customerEmail) {
              await conciergeEmails.sendPaymentFailedToCustomer({
                customerName: sale.customerName,
                customerEmail: sale.customerEmail,
                serviceName,
                amount: sale.amount,
              });
            }

            // Enviar email de fallo al vendedor
            if (sellerEmail) {
              await conciergeEmails.sendPaymentFailedToSeller({
                sellerName,
                sellerEmail,
                customerName: sale.customerName,
                serviceName,
                amount: sale.amount,
                saleReference: sale.saleReference,
              });
            }

            // Eliminar la venta fallida
            await conciergeDb.deleteConciergeSale(sale.id);

            return {
              success: false,
              status: "rejected",
              message: "El pago fue rechazado por WebPay",
              responseCode: wpResult.responseCode,
            };
          }
        } catch (error: any) {
          console.error("[Concierge Payment] Error confirming:", error);

          // Si hay error de confirmación, marcar como cancelada
          await conciergeDb.updateConciergeSaleStatus(sale.id, "cancelled");

          return {
            success: false,
            status: "error",
            message: "Error al confirmar el pago con WebPay",
          };
        }
      }),

    /** Obtener estado de una venta por referencia (público) */
    getStatus: publicProcedure
      .input(z.object({ saleReference: z.string() }))
      .query(async ({ input }) => {
        const sale = await conciergeDb.getConciergeSaleByReference(
          input.saleReference
        );
        if (!sale) {
          return { found: false, status: null };
        }
        return {
          found: true,
          status: sale.status,
          serviceName: sale.serviceName,
          amount: sale.amount,
          customerName: sale.customerName,
          priceLabel: sale.priceLabel,
        };
      }),
  }),
});

export type ConciergeRouter = typeof conciergeRouter;
