/**
 * Funciones de base de datos para el Módulo Concierge
 * Integración con WebPay para pagos.
 * Info de servicios viene de Skedu (tabla services), precios diferenciados en CMS.
 */
import { eq, and, desc, sql, gte, lte, asc } from "drizzle-orm";
import { getDb } from "./db";
import {
  conciergeServices,
  conciergeServicePrices,
  conciergeSellers,
  conciergeSales,
  conciergeSellerMetrics,
  services,
  users,
  InsertConciergeService,
  InsertConciergeServicePrice,
  InsertConciergeSeller,
  InsertConciergeSale,
} from "../drizzle/schema";
import { nanoid } from "nanoid";

// ============================================
// SERVICIOS CONCIERGE
// ============================================

export async function getConciergeServices(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];

  const conditions = activeOnly ? eq(conciergeServices.active, 1) : undefined;

  const result = await db
    .select({
      id: conciergeServices.id,
      serviceId: conciergeServices.serviceId,
      availableQuantity: conciergeServices.availableQuantity,
      active: conciergeServices.active,
      sellerNotes: conciergeServices.sellerNotes,
      createdAt: conciergeServices.createdAt,
      updatedAt: conciergeServices.updatedAt,
      serviceName: services.name,
      serviceDescription: services.description,
      serviceDuration: services.duration,
      serviceImageUrl: services.imageUrl,
      serviceCategory: services.category,
    })
    .from(conciergeServices)
    .leftJoin(services, eq(conciergeServices.serviceId, services.id))
    .where(conditions)
    .orderBy(desc(conciergeServices.createdAt));

  return result;
}

/** Get a concierge service with its prices */
export async function getConciergeServiceById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      id: conciergeServices.id,
      serviceId: conciergeServices.serviceId,
      availableQuantity: conciergeServices.availableQuantity,
      active: conciergeServices.active,
      sellerNotes: conciergeServices.sellerNotes,
      serviceName: services.name,
      serviceDescription: services.description,
      serviceDuration: services.duration,
      serviceImageUrl: services.imageUrl,
    })
    .from(conciergeServices)
    .leftJoin(services, eq(conciergeServices.serviceId, services.id))
    .where(eq(conciergeServices.id, id))
    .limit(1);

  return result[0] || null;
}

/** Get all concierge services with their prices included */
export async function getConciergeServicesWithPrices(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];

  const conditions = activeOnly ? eq(conciergeServices.active, 1) : undefined;

  const serviceRows = await db
    .select({
      id: conciergeServices.id,
      serviceId: conciergeServices.serviceId,
      availableQuantity: conciergeServices.availableQuantity,
      active: conciergeServices.active,
      sellerNotes: conciergeServices.sellerNotes,
      createdAt: conciergeServices.createdAt,
      updatedAt: conciergeServices.updatedAt,
      serviceName: services.name,
      serviceDescription: services.description,
      serviceDuration: services.duration,
      serviceImageUrl: services.imageUrl,
      serviceCategory: services.category,
    })
    .from(conciergeServices)
    .leftJoin(services, eq(conciergeServices.serviceId, services.id))
    .where(conditions)
    .orderBy(desc(conciergeServices.createdAt));

  if (serviceRows.length === 0) return [];

  // Fetch all prices for these services
  const serviceIds = serviceRows.map((s) => s.id);
  const allPrices = await db
    .select()
    .from(conciergeServicePrices)
    .where(
      sql`${conciergeServicePrices.serviceId} IN (${sql.join(
        serviceIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    )
    .orderBy(asc(conciergeServicePrices.sortOrder));

  // Map prices to services
  const pricesByService = new Map<number, typeof allPrices>();
  for (const price of allPrices) {
    const existing = pricesByService.get(price.serviceId) || [];
    existing.push(price);
    pricesByService.set(price.serviceId, existing);
  }

  return serviceRows.map((service) => ({
    ...service,
    prices: pricesByService.get(service.id) || [],
  }));
}

/** Get a single concierge service with its prices */
export async function getConciergeServiceWithPrices(id: number) {
  const service = await getConciergeServiceById(id);
  if (!service) return null;

  const db = await getDb();
  if (!db) return { ...service, prices: [] };

  const prices = await db
    .select()
    .from(conciergeServicePrices)
    .where(eq(conciergeServicePrices.serviceId, id))
    .orderBy(asc(conciergeServicePrices.sortOrder));

  return { ...service, prices };
}

export async function upsertConciergeService(data: {
  id?: number;
  serviceId: number;
  availableQuantity?: number;
  active?: number;
  sellerNotes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (data.id) {
    await db
      .update(conciergeServices)
      .set({
        serviceId: data.serviceId,
        availableQuantity: data.availableQuantity ?? -1,
        active: data.active ?? 1,
        sellerNotes: data.sellerNotes,
      })
      .where(eq(conciergeServices.id, data.id));
    return data.id;
  } else {
    const result = await db.insert(conciergeServices).values({
      serviceId: data.serviceId,
      availableQuantity: data.availableQuantity ?? -1,
      active: data.active ?? 1,
      sellerNotes: data.sellerNotes,
    });
    return result[0].insertId;
  }
}

export async function deleteConciergeService(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Prices are cascade-deleted via FK
  await db.delete(conciergeServices).where(eq(conciergeServices.id, id));
}

// ============================================
// PRECIOS DIFERENCIADOS
// ============================================

export async function getServicePrices(conciergeServiceId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(conciergeServicePrices)
    .where(eq(conciergeServicePrices.serviceId, conciergeServiceId))
    .orderBy(asc(conciergeServicePrices.sortOrder));
}

export async function getServicePriceById(priceId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(conciergeServicePrices)
    .where(eq(conciergeServicePrices.id, priceId))
    .limit(1);

  return result[0] || null;
}

export async function upsertServicePrice(data: {
  id?: number;
  serviceId: number; // concierge_service_id
  label: string;
  price: number;
  sortOrder?: number;
  active?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (data.id) {
    await db
      .update(conciergeServicePrices)
      .set({
        label: data.label,
        price: data.price,
        sortOrder: data.sortOrder ?? 0,
        active: data.active ?? 1,
      })
      .where(eq(conciergeServicePrices.id, data.id));
    return data.id;
  } else {
    const result = await db.insert(conciergeServicePrices).values({
      serviceId: data.serviceId,
      label: data.label,
      price: data.price,
      sortOrder: data.sortOrder ?? 0,
      active: data.active ?? 1,
    });
    return result[0].insertId;
  }
}

export async function deleteServicePrice(priceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(conciergeServicePrices)
    .where(eq(conciergeServicePrices.id, priceId));
}

/** Replace all prices for a service (used when saving the whole form) */
export async function replaceServicePrices(
  conciergeServiceId: number,
  prices: Array<{ label: string; price: number; sortOrder?: number; active?: number }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete existing prices
  await db
    .delete(conciergeServicePrices)
    .where(eq(conciergeServicePrices.serviceId, conciergeServiceId));

  // Insert new prices
  if (prices.length > 0) {
    await db.insert(conciergeServicePrices).values(
      prices.map((p, i) => ({
        serviceId: conciergeServiceId,
        label: p.label,
        price: p.price,
        sortOrder: p.sortOrder ?? i,
        active: p.active ?? 1,
      }))
    );
  }
}

// ============================================
// VENDEDORES CONCIERGE
// ============================================

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
      userName: users.name,
      userEmail: users.email,
    })
    .from(conciergeSellers)
    .leftJoin(users, eq(conciergeSellers.userId, users.id))
    .where(conditions)
    .orderBy(desc(conciergeSellers.createdAt));

  return result;
}

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

export async function upsertConciergeSeller(
  data: Omit<InsertConciergeSeller, "sellerCode"> & { sellerCode?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const sellerCode = data.sellerCode || `SELL-${nanoid(8).toUpperCase()}`;

  if (data.id) {
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
    const result = await db.insert(conciergeSellers).values({
      ...data,
      sellerCode,
    });
    return result[0].insertId;
  }
}

export async function updateSellerCommission(
  sellerId: number,
  commissionRate: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(conciergeSellers)
    .set({ commissionRate })
    .where(eq(conciergeSellers.id, sellerId));
}

// ============================================
// VENTAS CONCIERGE (WebPay)
// ============================================

export function generateSaleReference(): string {
  return `CONC-${Date.now()}-${nanoid(6).toUpperCase()}`;
}

export async function createConciergeSale(
  data: Omit<InsertConciergeSale, "saleReference"> & {
    saleReference?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const saleReference = data.saleReference || generateSaleReference();

  const result = await db.insert(conciergeSales).values({
    ...data,
    saleReference,
  });

  return { id: result[0].insertId, saleReference };
}

export async function getConciergeSaleById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(conciergeSales)
    .where(eq(conciergeSales.id, id))
    .limit(1);

  return result[0] || null;
}

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

export async function getConciergeSaleByWebpayToken(token: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(conciergeSales)
    .where(eq(conciergeSales.webpayToken, token))
    .limit(1);

  return result[0] || null;
}

export async function updateConciergeSaleWebpay(
  saleId: number,
  data: {
    webpayToken?: string;
    paymentLink?: string;
    status?: "pending" | "completed" | "cancelled" | "refunded";
    webpayAuthCode?: string;
    webpayResponseCode?: number;
    webpayCardNumber?: string;
    confirmedAt?: Date;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(conciergeSales)
    .set(data)
    .where(eq(conciergeSales.id, saleId));
}

export async function updateConciergeSaleStatus(
  saleId: number,
  status: "pending" | "completed" | "cancelled" | "refunded",
  additionalData?: {
    confirmedAt?: Date;
    webpayAuthCode?: string;
    webpayResponseCode?: number;
    webpayCardNumber?: string;
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

export async function deleteConciergeSale(saleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(conciergeSales).where(eq(conciergeSales.id, saleId));
}

// ============================================
// CONSULTAS DE VENTAS
// ============================================

/** Get sales for a specific seller (vendedor view) */
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

  if (options?.startDate)
    conditions.push(gte(conciergeSales.createdAt, options.startDate));
  if (options?.endDate)
    conditions.push(lte(conciergeSales.createdAt, options.endDate));
  if (options?.status)
    conditions.push(eq(conciergeSales.status, options.status as any));

  const result = await db
    .select({
      id: conciergeSales.id,
      amount: conciergeSales.amount,
      commissionRate: conciergeSales.commissionRate,
      commissionAmount: conciergeSales.commissionAmount,
      customerName: conciergeSales.customerName,
      customerEmail: conciergeSales.customerEmail,
      customerPhone: conciergeSales.customerPhone,
      status: conciergeSales.status,
      saleReference: conciergeSales.saleReference,
      serviceName: conciergeSales.serviceName,
      priceLabel: conciergeSales.priceLabel,
      notes: conciergeSales.notes,
      createdAt: conciergeSales.createdAt,
      confirmedAt: conciergeSales.confirmedAt,
    })
    .from(conciergeSales)
    .where(and(...conditions))
    .orderBy(desc(conciergeSales.createdAt))
    .limit(options?.limit || 100)
    .offset(options?.offset || 0);

  return result;
}

/** Get all sales (admin view) */
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

  if (options?.sellerId)
    conditions.push(eq(conciergeSales.sellerId, options.sellerId));
  if (options?.startDate)
    conditions.push(gte(conciergeSales.createdAt, options.startDate));
  if (options?.endDate)
    conditions.push(lte(conciergeSales.createdAt, options.endDate));
  if (options?.status)
    conditions.push(eq(conciergeSales.status, options.status as any));

  const result = await db
    .select({
      id: conciergeSales.id,
      amount: conciergeSales.amount,
      commissionRate: conciergeSales.commissionRate,
      commissionAmount: conciergeSales.commissionAmount,
      customerName: conciergeSales.customerName,
      customerEmail: conciergeSales.customerEmail,
      customerPhone: conciergeSales.customerPhone,
      status: conciergeSales.status,
      saleReference: conciergeSales.saleReference,
      serviceName: conciergeSales.serviceName,
      priceLabel: conciergeSales.priceLabel,
      notes: conciergeSales.notes,
      createdAt: conciergeSales.createdAt,
      confirmedAt: conciergeSales.confirmedAt,
      sellerName: users.name,
      sellerCode: conciergeSellers.sellerCode,
      sellerCompany: conciergeSellers.companyName,
    })
    .from(conciergeSales)
    .leftJoin(conciergeSellers, eq(conciergeSales.sellerId, conciergeSellers.id))
    .leftJoin(users, eq(conciergeSellers.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(conciergeSales.createdAt))
    .limit(options?.limit || 100)
    .offset(options?.offset || 0);

  return result;
}

// ============================================
// MÉTRICAS Y COMISIONES
// ============================================

/** Get commission summary for a specific seller */
export async function getSellerCommissionSummary(sellerId: number) {
  const db = await getDb();
  if (!db)
    return {
      totalSales: 0,
      totalCommission: 0,
      completedCount: 0,
      pendingCount: 0,
    };

  const result = await db
    .select({
      totalSales: sql<number>`COALESCE(SUM(CASE WHEN ${conciergeSales.status} = 'completed' THEN ${conciergeSales.amount} ELSE 0 END), 0)`,
      totalCommission: sql<number>`COALESCE(SUM(CASE WHEN ${conciergeSales.status} = 'completed' THEN ${conciergeSales.commissionAmount} ELSE 0 END), 0)`,
      completedCount: sql<number>`COALESCE(SUM(CASE WHEN ${conciergeSales.status} = 'completed' THEN 1 ELSE 0 END), 0)`,
      pendingCount: sql<number>`COALESCE(SUM(CASE WHEN ${conciergeSales.status} = 'pending' THEN 1 ELSE 0 END), 0)`,
    })
    .from(conciergeSales)
    .where(eq(conciergeSales.sellerId, sellerId));

  return (
    result[0] || {
      totalSales: 0,
      totalCommission: 0,
      completedCount: 0,
      pendingCount: 0,
    }
  );
}

/** Get commission summary for all sellers (admin view) */
export async function getCommissionsSummary(
  startDate?: Date,
  endDate?: Date
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(conciergeSales.status, "completed")];
  if (startDate)
    conditions.push(gte(conciergeSales.createdAt, startDate));
  if (endDate) conditions.push(lte(conciergeSales.createdAt, endDate));

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
    .leftJoin(
      conciergeSellers,
      eq(conciergeSales.sellerId, conciergeSellers.id)
    )
    .leftJoin(users, eq(conciergeSellers.userId, users.id))
    .where(and(...conditions))
    .groupBy(
      conciergeSales.sellerId,
      users.name,
      conciergeSellers.sellerCode,
      conciergeSellers.companyName,
      conciergeSellers.commissionRate
    );

  return result;
}

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

  return (
    result[0] || { totalSales: 0, totalCommission: 0, transactionCount: 0 }
  );
}

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
