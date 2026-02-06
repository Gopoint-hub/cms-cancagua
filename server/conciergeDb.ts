/**
 * Funciones de base de datos para el Módulo Concierge
 */
import { eq, and, desc, sql, gte, lte, count, sum } from "drizzle-orm";
import { getDb } from "./db";
import {
  conciergeServices,
  conciergeSellers,
  conciergeSales,
  conciergeSellerMetrics,
  services,
  users,
  InsertConciergeService,
  InsertConciergeSeller,
  InsertConciergeSale,
  InsertConciergeSellerMetric,
} from "../drizzle/schema";
import { nanoid } from "nanoid";

// ============================================
// SERVICIOS CONCIERGE
// ============================================

/**
 * Obtener todos los servicios disponibles para Concierge
 */
export async function getConciergeServices(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];

  const conditions = activeOnly ? eq(conciergeServices.active, 1) : undefined;

  const result = await db
    .select({
      id: conciergeServices.id,
      serviceId: conciergeServices.serviceId,
      price: conciergeServices.price,
      availableQuantity: conciergeServices.availableQuantity,
      active: conciergeServices.active,
      sellerNotes: conciergeServices.sellerNotes,
      createdAt: conciergeServices.createdAt,
      // Datos del servicio base
      serviceName: services.name,
      serviceDescription: services.description,
      serviceDuration: services.duration,
      serviceImageUrl: services.imageUrl,
      serviceCategory: services.category,
      serviceSkeduId: services.skeduId,
    })
    .from(conciergeServices)
    .leftJoin(services, eq(conciergeServices.serviceId, services.id))
    .where(conditions)
    .orderBy(desc(conciergeServices.createdAt));

  return result;
}

/**
 * Obtener un servicio Concierge por ID
 */
export async function getConciergeServiceById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      id: conciergeServices.id,
      serviceId: conciergeServices.serviceId,
      price: conciergeServices.price,
      availableQuantity: conciergeServices.availableQuantity,
      active: conciergeServices.active,
      sellerNotes: conciergeServices.sellerNotes,
      serviceName: services.name,
      serviceDescription: services.description,
      serviceDuration: services.duration,
      serviceImageUrl: services.imageUrl,
      serviceSkeduId: services.skeduId,
    })
    .from(conciergeServices)
    .leftJoin(services, eq(conciergeServices.serviceId, services.id))
    .where(eq(conciergeServices.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Crear o actualizar un servicio Concierge
 */
export async function upsertConciergeService(data: InsertConciergeService) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (data.id) {
    // Update
    await db
      .update(conciergeServices)
      .set({
        serviceId: data.serviceId,
        price: data.price,
        availableQuantity: data.availableQuantity,
        active: data.active,
        sellerNotes: data.sellerNotes,
      })
      .where(eq(conciergeServices.id, data.id));
    return data.id;
  } else {
    // Insert
    const result = await db.insert(conciergeServices).values(data);
    return result[0].insertId;
  }
}

/**
 * Eliminar un servicio Concierge
 */
export async function deleteConciergeService(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(conciergeServices).where(eq(conciergeServices.id, id));
}

// ============================================
// VENDEDORES CONCIERGE
// ============================================

/**
 * Obtener todos los vendedores Concierge
 */
export async function getConciergeSellers(activeOnly = false) {
  const db = await getDb();
  if (!db) return [];

  const conditions = activeOnly ? eq(conciergeSellers.active, 1) : undefined;

  const result = await db
    .select({
      id: conciergeSellers.id,
      userId: conciergeSellers.userId,
      commissionRate: conciergeSellers.commissionRate,
      sellerCode: conciergeSellers.sellerCode,
      companyName: conciergeSellers.companyName,
      notes: conciergeSellers.notes,
      active: conciergeSellers.active,
      createdAt: conciergeSellers.createdAt,
      // Datos del usuario
      userName: users.name,
      userEmail: users.email,
    })
    .from(conciergeSellers)
    .leftJoin(users, eq(conciergeSellers.userId, users.id))
    .where(conditions)
    .orderBy(desc(conciergeSellers.createdAt));

  return result;
}

/**
 * Obtener un vendedor por ID de usuario
 */
export async function getConciergeSellerByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(conciergeSellers)
    .where(eq(conciergeSellers.userId, userId))
    .limit(1);

  return result[0] || null;
}

/**
 * Obtener un vendedor por código
 */
export async function getConciergeSellerByCode(code: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(conciergeSellers)
    .where(eq(conciergeSellers.sellerCode, code))
    .limit(1);

  return result[0] || null;
}

/**
 * Crear o actualizar un vendedor Concierge
 */
export async function upsertConciergeSeller(data: Omit<InsertConciergeSeller, "sellerCode"> & { sellerCode?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Generar código único si no existe
  const sellerCode = data.sellerCode || `SELL-${nanoid(8).toUpperCase()}`;

  if (data.id) {
    // Update
    await db
      .update(conciergeSellers)
      .set({
        commissionRate: data.commissionRate,
        companyName: data.companyName,
        notes: data.notes,
        active: data.active,
      })
      .where(eq(conciergeSellers.id, data.id));
    return data.id;
  } else {
    // Insert
    const result = await db.insert(conciergeSellers).values({
      ...data,
      sellerCode,
    });
    return result[0].insertId;
  }
}

/**
 * Actualizar comisión de un vendedor
 */
export async function updateSellerCommission(sellerId: number, commissionRate: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(conciergeSellers)
    .set({ commissionRate })
    .where(eq(conciergeSellers.id, sellerId));
}

// ============================================
// VENTAS CONCIERGE
// ============================================

/**
 * Crear una nueva venta
 */
export async function createConciergeSale(data: Omit<InsertConciergeSale, "saleReference"> & { saleReference?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Generar referencia única
  const saleReference = data.saleReference || `CONC-${Date.now()}-${nanoid(6).toUpperCase()}`;

  const result = await db.insert(conciergeSales).values({
    ...data,
    saleReference,
  });

  return { id: result[0].insertId, saleReference };
}

/**
 * Obtener una venta por referencia
 */
export async function getConciergeSaleByReference(reference: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(conciergeSales)
    .where(eq(conciergeSales.saleReference, reference))
    .limit(1);

  return result[0] || null;
}

/**
 * Actualizar estado de una venta
 */
export async function updateConciergeSaleStatus(
  saleId: number,
  status: "pending" | "completed" | "cancelled" | "refunded",
  additionalData?: {
    skeduAppointmentUuid?: string;
    skeduGroupUuid?: string;
    confirmedAt?: Date;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(conciergeSales)
    .set({
      status,
      ...additionalData,
    })
    .where(eq(conciergeSales.id, saleId));
}

/**
 * Obtener ventas de un vendedor
 */
export async function getConciergeSalesBySeller(
  sellerId: number,
  options?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    limit?: number;
    offset?: number;
  }
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(conciergeSales.sellerId, sellerId)];

  if (options?.startDate) {
    conditions.push(gte(conciergeSales.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(conciergeSales.createdAt, options.endDate));
  }
  if (options?.status) {
    conditions.push(eq(conciergeSales.status, options.status as any));
  }

  const result = await db
    .select({
      id: conciergeSales.id,
      amount: conciergeSales.amount,
      commissionRate: conciergeSales.commissionRate,
      commissionAmount: conciergeSales.commissionAmount,
      customerName: conciergeSales.customerName,
      customerEmail: conciergeSales.customerEmail,
      status: conciergeSales.status,
      saleReference: conciergeSales.saleReference,
      createdAt: conciergeSales.createdAt,
      confirmedAt: conciergeSales.confirmedAt,
      // Datos del servicio
      serviceName: services.name,
    })
    .from(conciergeSales)
    .leftJoin(conciergeServices, eq(conciergeSales.conciergeServiceId, conciergeServices.id))
    .leftJoin(services, eq(conciergeServices.serviceId, services.id))
    .where(and(...conditions))
    .orderBy(desc(conciergeSales.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);

  return result;
}

/**
 * Obtener todas las ventas (para admin)
 */
export async function getAllConciergeSales(options?: {
  startDate?: Date;
  endDate?: Date;
  sellerId?: number;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (options?.sellerId) {
    conditions.push(eq(conciergeSales.sellerId, options.sellerId));
  }
  if (options?.startDate) {
    conditions.push(gte(conciergeSales.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(conciergeSales.createdAt, options.endDate));
  }
  if (options?.status) {
    conditions.push(eq(conciergeSales.status, options.status as any));
  }

  const result = await db
    .select({
      id: conciergeSales.id,
      amount: conciergeSales.amount,
      commissionRate: conciergeSales.commissionRate,
      commissionAmount: conciergeSales.commissionAmount,
      customerName: conciergeSales.customerName,
      customerEmail: conciergeSales.customerEmail,
      status: conciergeSales.status,
      saleReference: conciergeSales.saleReference,
      createdAt: conciergeSales.createdAt,
      confirmedAt: conciergeSales.confirmedAt,
      // Datos del vendedor
      sellerName: users.name,
      sellerCode: conciergeSellers.sellerCode,
      // Datos del servicio
      serviceName: services.name,
    })
    .from(conciergeSales)
    .leftJoin(conciergeSellers, eq(conciergeSales.sellerId, conciergeSellers.id))
    .leftJoin(users, eq(conciergeSellers.userId, users.id))
    .leftJoin(conciergeServices, eq(conciergeSales.conciergeServiceId, conciergeServices.id))
    .leftJoin(services, eq(conciergeServices.serviceId, services.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(conciergeSales.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);

  return result;
}

// ============================================
// MÉTRICAS
// ============================================

/**
 * Obtener métricas de un vendedor
 */
export async function getSellerMetrics(
  sellerId: number,
  periodType: "daily" | "weekly" | "monthly",
  startKey: string,
  endKey: string
) {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(conciergeSellerMetrics)
    .where(
      and(
        eq(conciergeSellerMetrics.sellerId, sellerId),
        eq(conciergeSellerMetrics.periodType, periodType),
        gte(conciergeSellerMetrics.periodKey, startKey),
        lte(conciergeSellerMetrics.periodKey, endKey)
      )
    )
    .orderBy(conciergeSellerMetrics.periodKey);

  return result;
}

/**
 * Calcular métricas en tiempo real para un vendedor
 */
export async function calculateSellerMetricsRealtime(
  sellerId: number,
  startDate: Date,
  endDate: Date
) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      totalSales: sql<number>`COALESCE(SUM(${conciergeSales.amount}), 0)`,
      totalCommission: sql<number>`COALESCE(SUM(${conciergeSales.commissionAmount}), 0)`,
      transactionCount: sql<number>`COUNT(*)`,
    })
    .from(conciergeSales)
    .where(
      and(
        eq(conciergeSales.sellerId, sellerId),
        eq(conciergeSales.status, "completed"),
        gte(conciergeSales.createdAt, startDate),
        lte(conciergeSales.createdAt, endDate)
      )
    );

  return result[0] || { totalSales: 0, totalCommission: 0, transactionCount: 0 };
}

/**
 * Obtener resumen de comisiones por vendedor para un período
 */
export async function getCommissionsSummary(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      sellerId: conciergeSales.sellerId,
      sellerName: users.name,
      sellerCode: conciergeSellers.sellerCode,
      companyName: conciergeSellers.companyName,
      commissionRate: conciergeSellers.commissionRate,
      totalSales: sql<number>`COALESCE(SUM(${conciergeSales.amount}), 0)`,
      totalCommission: sql<number>`COALESCE(SUM(${conciergeSales.commissionAmount}), 0)`,
      transactionCount: sql<number>`COUNT(*)`,
    })
    .from(conciergeSales)
    .leftJoin(conciergeSellers, eq(conciergeSales.sellerId, conciergeSellers.id))
    .leftJoin(users, eq(conciergeSellers.userId, users.id))
    .where(
      and(
        eq(conciergeSales.status, "completed"),
        gte(conciergeSales.createdAt, startDate),
        lte(conciergeSales.createdAt, endDate)
      )
    )
    .groupBy(conciergeSales.sellerId);

  return result;
}
