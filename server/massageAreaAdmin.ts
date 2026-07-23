import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  massageBookings,
  massageHrLeaves,
  massageMonthlyClosureAdjustments,
  massageMonthlyClosureAudit,
  massageMonthlyClosures,
  massageProgramBookings,
  massageTechniques,
  massageTherapists,
} from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

const CHILE_TIME_ZONE = "America/Santiago";
const VAT_FACTOR = 1.19;

export const MASSAGE_CLOSE_DEFAULTS = {
  supplyUnitCost: 707,
  laundryUnitCost: 3103.8,
  regularTransportCost: 398_000,
  freelanceTripUnitCost: 5_000,
  freelanceTripCount: 0,
  electricityCost: 123_573,
  accountingCost: 63_333,
  tamaraBaseSalary: 811_261,
  barbaraBaseSalary: null as number | null,
  danielaBaseSalary: null as number | null,
  previredRate: 0.2,
  freelanceCommissionRate: 0.5,
  inhouseCommissionRate: 0.2,
  tamaraBonusRate: 0.1,
  notes: "",
};

type MassageDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const normalizeName = (value: string | null | undefined) =>
  (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const isTamara = (value: string | null | undefined) => {
  const normalized = normalizeName(value);
  return normalized.includes("tamara") && normalized.includes("munoz");
};

const isBarbara = (value: string | null | undefined) => {
  const normalized = normalizeName(value);
  return normalized.includes("barbara") && normalized.includes("fri");
};

const isDaniela = (value: string | null | undefined) => {
  const normalized = normalizeName(value);
  return normalized.includes("daniela") && (normalized.includes("caerol") || normalized.includes("carol"));
};

export function getMassageClosePeriod(closeMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(closeMonth)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Mes de cierre inválido" });
  }
  const [year, month] = closeMonth.split("-").map(Number);
  if (month < 1 || month > 12) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Mes de cierre inválido" });
  }
  const previous = new Date(Date.UTC(year, month - 2, 1));
  const previousMonth = String(previous.getUTCMonth() + 1).padStart(2, "0");
  return {
    start: `${previous.getUTCFullYear()}-${previousMonth}-25`,
    end: `${year}-${String(month).padStart(2, "0")}-24`,
  };
}

function chileNowParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

export function isMassageConsideredCompleted(
  status: string,
  bookingDate: string,
  endTime: string,
  now = new Date(),
) {
  if (status === "completed") return true;
  if (status !== "confirmed") return false;
  const current = chileNowParts(now);
  return bookingDate < current.date || (bookingDate === current.date && endTime <= current.time);
}

async function hasAreaAdminAccess(db: MassageDb, user: { id: number; role: string }) {
  if (user.role === "super_admin") return true;
  const [therapist] = await db.select({
    name: massageTherapists.name,
    isManager: massageTherapists.isManager,
  }).from(massageTherapists)
    .where(eq(massageTherapists.cmsUserId, user.id))
    .limit(1);
  return !!therapist && isTamara(therapist.name) && therapist.isManager === 1;
}

async function assertAreaAdmin(db: MassageDb, user: { id: number; role: string }) {
  if (!await hasAreaAdminAccess(db, user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Este cierre está disponible solamente para Tamara Muñoz y superadministradores.",
    });
  }
}

const serializeDate = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
};

const numberValue = (value: unknown) => Number(value ?? 0);
const roundClp = (value: number) => Math.round(value);
const roundMoney = (value: number) => Math.round(value * 100) / 100;

type CloseParameters = typeof MASSAGE_CLOSE_DEFAULTS;

function parametersFromClosure(closure: typeof massageMonthlyClosures.$inferSelect | null): CloseParameters {
  if (!closure) return { ...MASSAGE_CLOSE_DEFAULTS };
  return {
    supplyUnitCost: numberValue(closure.supplyUnitCost),
    laundryUnitCost: numberValue(closure.laundryUnitCost),
    regularTransportCost: numberValue(closure.regularTransportCost),
    freelanceTripUnitCost: numberValue(closure.freelanceTripUnitCost),
    freelanceTripCount: closure.freelanceTripCount,
    electricityCost: numberValue(closure.electricityCost),
    accountingCost: numberValue(closure.accountingCost),
    tamaraBaseSalary: numberValue(closure.tamaraBaseSalary),
    barbaraBaseSalary: closure.barbaraBaseSalary == null ? null : numberValue(closure.barbaraBaseSalary),
    danielaBaseSalary: closure.danielaBaseSalary == null ? null : numberValue(closure.danielaBaseSalary),
    previredRate: numberValue(closure.previredRate),
    freelanceCommissionRate: numberValue(closure.freelanceCommissionRate),
    inhouseCommissionRate: numberValue(closure.inhouseCommissionRate),
    tamaraBonusRate: numberValue(closure.tamaraBonusRate),
    notes: closure.notes ?? "",
  };
}

type AdjustmentInput = {
  category: "courtesy" | "refund" | "extra_cost" | "correction" | "other";
  description: string;
  amount: number;
};

type MassageCloseDetail = {
  key: string;
  source: "massage" | "skedu_program";
  bookingId: number;
  serviceDate: string;
  startTime: string;
  endTime: string;
  clientName: string;
  serviceName: string;
  duration: number;
  therapistId: number | null;
  therapistName: string;
  therapistType: "inhouse" | "freelance" | null;
  grossRevenue: number;
  netRevenue: number;
  originalAmount: number;
  discountAmount: number;
  paymentMethod: "getnet" | "cms_manual" | "skedu_program";
  paymentStatus: string;
  commission: number;
  commissionBasis: "gross" | "net" | "none";
  status: string;
  inferredCompleted: boolean;
};

export type MassageCloseCalculation = Awaited<ReturnType<typeof calculateMassageClose>>;

export function calculateMassageCloseTotals(
  details: MassageCloseDetail[],
  parameters: CloseParameters,
  adjustments: AdjustmentInput[],
) {
  const totalMassages = details.length;
  const revenue = roundClp(details.reduce((sum, row) => sum + row.grossRevenue, 0));
  const grossOriginalRevenue = roundClp(details.reduce((sum, row) => sum + row.originalAmount, 0));
  const discounts = roundClp(details.reduce((sum, row) => sum + row.discountAmount, 0));
  const inhouseCommissions = roundClp(details
    .filter((row) => row.therapistType === "inhouse")
    .reduce((sum, row) => sum + row.commission, 0));
  const freelanceCommissions = roundClp(details
    .filter((row) => row.therapistType === "freelance")
    .reduce((sum, row) => sum + row.commission, 0));

  const supplies = roundMoney(totalMassages * parameters.supplyUnitCost);
  const laundry = roundMoney(totalMassages * parameters.laundryUnitCost);
  const additionalTrips = roundMoney(parameters.freelanceTripCount * parameters.freelanceTripUnitCost);
  const manualAdjustments = roundMoney(adjustments.reduce((sum, item) => sum + item.amount, 0));
  const generalCosts = roundMoney(
    supplies
    + laundry
    + parameters.regularTransportCost
    + additionalTrips
    + parameters.electricityCost
    + parameters.accountingCost
    + manualAdjustments,
  );
  const salaries = roundMoney(
    parameters.tamaraBaseSalary
    + (parameters.barbaraBaseSalary ?? 0)
    + (parameters.danielaBaseSalary ?? 0),
  );
  const previredBase = roundMoney(salaries + inhouseCommissions);
  const previred = roundClp(previredBase * parameters.previredRate);
  const hrCosts = roundMoney(salaries + previred);
  const operationalResult = roundMoney(
    revenue - generalCosts - hrCosts - inhouseCommissions - freelanceCommissions,
  );
  const tamaraBonus = operationalResult > 0
    ? roundClp(operationalResult * parameters.tamaraBonusRate)
    : 0;
  const unitResult = roundMoney(operationalResult - tamaraBonus);

  return {
    totalMassages,
    revenue,
    grossOriginalRevenue,
    discounts,
    inhouseCommissions,
    freelanceCommissions,
    costs: {
      supplies,
      laundry,
      regularTransport: parameters.regularTransportCost,
      additionalTrips,
      electricity: parameters.electricityCost,
      accounting: parameters.accountingCost,
      manualAdjustments,
      generalCosts,
      salaries,
      previredBase,
      previred,
      hrCosts,
    },
    operationalResult,
    tamaraBonus,
    unitResult,
  };
}

async function calculateMassageClose(
  db: MassageDb,
  closeMonth: string,
  parameters: CloseParameters,
  adjustments: AdjustmentInput[],
  now = new Date(),
) {
  const period = getMassageClosePeriod(closeMonth);
  const [standardRows, programRows, therapists, leaves] = await Promise.all([
    db.select({
      id: massageBookings.id,
      clientName: massageBookings.clientName,
      bookingDate: massageBookings.bookingDate,
      startTime: massageBookings.startTime,
      endTime: massageBookings.endTime,
      duration: massageBookings.duration,
      status: massageBookings.status,
      paymentStatus: massageBookings.paymentStatus,
      amountPaid: massageBookings.amountPaid,
      originalAmount: massageBookings.originalAmount,
      discountAmount: massageBookings.discountAmount,
      getnetRequestId: massageBookings.getnetRequestId,
      therapistId: massageBookings.therapistId,
      therapistName: massageTherapists.name,
      therapistType: massageTherapists.type,
      techniqueName: massageTechniques.name,
    }).from(massageBookings)
      .leftJoin(massageTherapists, eq(massageBookings.therapistId, massageTherapists.id))
      .leftJoin(massageTechniques, eq(massageBookings.techniqueId, massageTechniques.id))
      .where(and(
        gte(massageBookings.bookingDate, period.start as any),
        lte(massageBookings.bookingDate, period.end as any),
      )),
    db.select({
      id: massageProgramBookings.id,
      program: massageProgramBookings.program,
      duration: massageProgramBookings.duration,
      modality: massageProgramBookings.modality,
      clientName: massageProgramBookings.clientName,
      secondClientName: massageProgramBookings.secondClientName,
      bookingDate: massageProgramBookings.bookingDate,
      startTime: massageProgramBookings.startTime,
      endTime: massageProgramBookings.endTime,
      status: massageProgramBookings.status,
      therapistId: massageProgramBookings.therapistId,
      secondTherapistId: massageProgramBookings.secondTherapistId,
    }).from(massageProgramBookings)
      .where(and(
        gte(massageProgramBookings.bookingDate, period.start as any),
        lte(massageProgramBookings.bookingDate, period.end as any),
      )),
    db.select({
      id: massageTherapists.id,
      name: massageTherapists.name,
      type: massageTherapists.type,
    }).from(massageTherapists).orderBy(asc(massageTherapists.name)),
    db.select({
      therapistId: massageHrLeaves.therapistId,
      startDate: massageHrLeaves.startDate,
      endDate: massageHrLeaves.endDate,
      type: massageHrLeaves.type,
      status: massageHrLeaves.status,
      notes: massageHrLeaves.notes,
    }).from(massageHrLeaves).where(and(
      eq(massageHrLeaves.status, "approved"),
      lte(massageHrLeaves.startDate, period.end as any),
      gte(massageHrLeaves.endDate, period.start as any),
    )),
  ]);

  const therapistById = new Map(therapists.map((therapist) => [therapist.id, therapist]));
  const details: MassageCloseDetail[] = [];
  const missingAssignments: Array<{
    source: "massage" | "skedu_program";
    bookingId: number;
    serviceDate: string;
    startTime: string;
    clientName: string;
    serviceName: string;
  }> = [];
  const pendingPayments: Array<{ bookingId: number; serviceDate: string; clientName: string }> = [];

  for (const row of standardRows) {
    const serviceDate = serializeDate(row.bookingDate);
    if (!isMassageConsideredCompleted(row.status, serviceDate, row.endTime, now)) continue;
    const grossRevenue = row.paymentStatus === "paid" ? roundClp(numberValue(row.amountPaid)) : 0;
    const originalAmount = row.paymentStatus === "paid"
      ? roundClp(numberValue(row.originalAmount) || grossRevenue)
      : 0;
    const discountAmount = row.paymentStatus === "paid"
      ? roundClp(numberValue(row.discountAmount))
      : 0;
    const therapistName = row.therapistName ?? "Sin asignar";
    const therapistType = row.therapistType ?? null;
    const netRevenue = roundClp(grossRevenue / VAT_FACTOR);
    let commission = 0;
    let commissionBasis: MassageCloseDetail["commissionBasis"] = "none";
    if (therapistType === "freelance") {
      commission = roundClp(grossRevenue * parameters.freelanceCommissionRate);
      commissionBasis = "gross";
    } else if (therapistType === "inhouse" && (isBarbara(therapistName) || isDaniela(therapistName))) {
      commission = roundClp(netRevenue * parameters.inhouseCommissionRate);
      commissionBasis = "net";
    }
    const detail: MassageCloseDetail = {
      key: `massage-${row.id}`,
      source: "massage",
      bookingId: row.id,
      serviceDate,
      startTime: row.startTime,
      endTime: row.endTime,
      clientName: row.clientName,
      serviceName: row.techniqueName ?? "Masaje",
      duration: row.duration,
      therapistId: row.therapistId,
      therapistName,
      therapistType,
      grossRevenue,
      netRevenue,
      originalAmount,
      discountAmount,
      paymentMethod: row.getnetRequestId ? "getnet" : "cms_manual",
      paymentStatus: row.paymentStatus,
      commission,
      commissionBasis,
      status: row.status,
      inferredCompleted: row.status === "confirmed",
    };
    details.push(detail);
    if (!row.therapistId || !row.therapistName) {
      missingAssignments.push({
        source: "massage",
        bookingId: row.id,
        serviceDate,
        startTime: row.startTime,
        clientName: row.clientName,
        serviceName: detail.serviceName,
      });
    }
    if (row.paymentStatus !== "paid") {
      pendingPayments.push({ bookingId: row.id, serviceDate, clientName: row.clientName });
    }
  }

  const programLabels: Record<string, string> = {
    reconecta: "Reconecta",
    reconecta_detox: "Reconecta Detox",
    bio_reconecta: "Bio Reconecta",
    bio_reconecta_detox: "Bio Reconecta Detox",
    reset: "Reset",
  };
  for (const row of programRows) {
    const serviceDate = serializeDate(row.bookingDate);
    if (!isMassageConsideredCompleted(row.status, serviceDate, row.endTime, now)) continue;
    const unitPrice = row.duration === 30 ? 35_000 : row.duration === 50 ? 45_000 : 0;
    const units = [
      { clientName: row.clientName, therapistId: row.therapistId, unit: 1 },
      ...(row.modality === "double"
        ? [{ clientName: row.secondClientName ?? "Segundo cliente", therapistId: row.secondTherapistId, unit: 2 }]
        : []),
    ];
    for (const unit of units) {
      const therapist = unit.therapistId ? therapistById.get(unit.therapistId) : null;
      const therapistName = therapist?.name ?? "Sin asignar";
      const therapistType = therapist?.type ?? null;
      const netRevenue = roundClp(unitPrice / VAT_FACTOR);
      let commission = 0;
      let commissionBasis: MassageCloseDetail["commissionBasis"] = "none";
      if (therapistType === "freelance") {
        commission = roundClp(unitPrice * parameters.freelanceCommissionRate);
        commissionBasis = "gross";
      } else if (therapistType === "inhouse" && (isBarbara(therapistName) || isDaniela(therapistName))) {
        commission = roundClp(netRevenue * parameters.inhouseCommissionRate);
        commissionBasis = "net";
      }
      const serviceName = `Programa ${programLabels[row.program] ?? row.program.replaceAll("_", " ")}`;
      details.push({
        key: `skedu-${row.id}-${unit.unit}`,
        source: "skedu_program",
        bookingId: row.id,
        serviceDate,
        startTime: row.startTime,
        endTime: row.endTime,
        clientName: unit.clientName,
        serviceName,
        duration: row.duration,
        therapistId: unit.therapistId ?? null,
        therapistName,
        therapistType,
        grossRevenue: unitPrice,
        netRevenue,
        originalAmount: unitPrice,
        discountAmount: 0,
        paymentMethod: "skedu_program",
        paymentStatus: "paid",
        commission,
        commissionBasis,
        status: row.status,
        inferredCompleted: row.status === "confirmed",
      });
      if (!unit.therapistId || !therapist) {
        missingAssignments.push({
          source: "skedu_program",
          bookingId: row.id,
          serviceDate,
          startTime: row.startTime,
          clientName: unit.clientName,
          serviceName,
        });
      }
    }
  }

  details.sort((a, b) =>
    a.serviceDate.localeCompare(b.serviceDate)
    || a.startTime.localeCompare(b.startTime)
    || a.key.localeCompare(b.key));

  const totals = calculateMassageCloseTotals(details, parameters, adjustments);
  const therapistMap = new Map<number | null, {
    therapistId: number | null;
    therapistName: string;
    therapistType: "inhouse" | "freelance" | null;
    massages: number;
    revenue: number;
    netRevenue: number;
    commission: number;
    workDates: Set<string>;
  }>();
  for (const detail of details) {
    const current = therapistMap.get(detail.therapistId) ?? {
      therapistId: detail.therapistId,
      therapistName: detail.therapistName,
      therapistType: detail.therapistType,
      massages: 0,
      revenue: 0,
      netRevenue: 0,
      commission: 0,
      workDates: new Set<string>(),
    };
    current.massages += 1;
    current.revenue += detail.grossRevenue;
    current.netRevenue += detail.netRevenue;
    current.commission += detail.commission;
    current.workDates.add(detail.serviceDate);
    therapistMap.set(detail.therapistId, current);
  }
  // Las terapeutas inhouse deben figurar en la liquidación aunque no hayan
  // realizado masajes durante el período (su sueldo y licencias siguen siendo
  // parte del cierre).
  for (const therapist of therapists.filter((item) => item.type === "inhouse")) {
    if (therapistMap.has(therapist.id)) continue;
    therapistMap.set(therapist.id, {
      therapistId: therapist.id,
      therapistName: therapist.name,
      therapistType: therapist.type,
      massages: 0,
      revenue: 0,
      netRevenue: 0,
      commission: 0,
      workDates: new Set<string>(),
    });
  }

  const byTherapist = Array.from(therapistMap.values()).map((item) => ({
    therapistId: item.therapistId,
    therapistName: item.therapistName,
    therapistType: item.therapistType,
    massages: item.massages,
    revenue: roundClp(item.revenue),
    netRevenue: roundClp(item.netRevenue),
    commission: roundClp(item.commission),
    daysWorked: item.workDates.size,
    sundaysWorked: Array.from(item.workDates).filter((date) =>
      new Date(`${date}T12:00:00Z`).getUTCDay() === 0).length,
    leaves: leaves.filter((leave) => leave.therapistId === item.therapistId).map((leave) => ({
      startDate: serializeDate(leave.startDate),
      endDate: serializeDate(leave.endDate),
      type: leave.type,
      notes: leave.notes,
    })),
  })).sort((a, b) => a.therapistName.localeCompare(b.therapistName, "es"));

  const serviceMap = new Map<string, { serviceName: string; massages: number; revenue: number }>();
  for (const detail of details) {
    const current = serviceMap.get(detail.serviceName) ?? {
      serviceName: detail.serviceName,
      massages: 0,
      revenue: 0,
    };
    current.massages += 1;
    current.revenue += detail.grossRevenue;
    serviceMap.set(detail.serviceName, current);
  }

  return {
    closeMonth,
    period,
    calculatedAt: new Date().toISOString(),
    parameters,
    adjustments,
    totals,
    alerts: {
      missingAssignments,
      pendingPayments,
    },
    details,
    byService: Array.from(serviceMap.values()).sort((a, b) => b.revenue - a.revenue),
    byTherapist,
  };
}

const closeMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const adjustmentSchema = z.object({
  category: z.enum(["courtesy", "refund", "extra_cost", "correction", "other"]),
  description: z.string().trim().min(3).max(255),
  amount: z.number().finite(),
});
const saveSchema = z.object({
  closeMonth: closeMonthSchema,
  freelanceTripCount: z.number().int().min(0).max(10_000),
  barbaraBaseSalary: z.number().min(0).nullable(),
  danielaBaseSalary: z.number().min(0).nullable(),
  notes: z.string().max(5000).default(""),
  adjustments: z.array(adjustmentSchema).max(100).default([]),
});

async function getClosure(db: MassageDb, closeMonth: string) {
  const [closure] = await db.select().from(massageMonthlyClosures)
    .where(eq(massageMonthlyClosures.closeMonth, closeMonth)).limit(1);
  return closure ?? null;
}

async function getAdjustments(db: MassageDb, closureId: number | null): Promise<AdjustmentInput[]> {
  if (!closureId) return [];
  const rows = await db.select().from(massageMonthlyClosureAdjustments)
    .where(eq(massageMonthlyClosureAdjustments.closureId, closureId))
    .orderBy(asc(massageMonthlyClosureAdjustments.id));
  return rows.map((row) => ({
    category: row.category,
    description: row.description,
    amount: numberValue(row.amount),
  }));
}

export const massageAreaAdminRouter = router({
  access: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { allowed: false };
    return { allowed: await hasAreaAdminAccess(db, ctx.user) };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    await assertAreaAdmin(db, ctx.user);
    const rows = await db.select({
      id: massageMonthlyClosures.id,
      closeMonth: massageMonthlyClosures.closeMonth,
      periodStart: massageMonthlyClosures.periodStart,
      periodEnd: massageMonthlyClosures.periodEnd,
      status: massageMonthlyClosures.status,
      closedAt: massageMonthlyClosures.closedAt,
      updatedAt: massageMonthlyClosures.updatedAt,
    }).from(massageMonthlyClosures).orderBy(desc(massageMonthlyClosures.closeMonth));
    return rows.map((row) => ({
      ...row,
      periodStart: serializeDate(row.periodStart),
      periodEnd: serializeDate(row.periodEnd),
    }));
  }),

  preview: protectedProcedure.input(z.object({ closeMonth: closeMonthSchema }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertAreaAdmin(db, ctx.user);
      const closure = await getClosure(db, input.closeMonth);
      if (closure?.status === "closed" && closure.snapshot) {
        return {
          closure: {
            id: closure.id,
            status: closure.status,
            closedAt: closure.closedAt,
            reopenReason: closure.reopenReason,
          },
          calculation: JSON.parse(closure.snapshot),
          audit: await db.select().from(massageMonthlyClosureAudit)
            .where(eq(massageMonthlyClosureAudit.closureId, closure.id))
            .orderBy(desc(massageMonthlyClosureAudit.createdAt)),
        };
      }
      const parameters = parametersFromClosure(closure);
      const adjustments = await getAdjustments(db, closure?.id ?? null);
      const calculation = await calculateMassageClose(db, input.closeMonth, parameters, adjustments);
      return {
        closure: closure ? {
          id: closure.id,
          status: closure.status,
          closedAt: closure.closedAt,
          reopenReason: closure.reopenReason,
        } : null,
        calculation,
        audit: closure ? await db.select().from(massageMonthlyClosureAudit)
          .where(eq(massageMonthlyClosureAudit.closureId, closure.id))
          .orderBy(desc(massageMonthlyClosureAudit.createdAt)) : [],
      };
    }),

  save: protectedProcedure.input(saveSchema).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await assertAreaAdmin(db, ctx.user);
    const period = getMassageClosePeriod(input.closeMonth);
    const existing = await getClosure(db, input.closeMonth);
    if (existing?.status === "closed") {
      throw new TRPCError({ code: "CONFLICT", message: "El cierre está bloqueado. Un superadmin debe reabrirlo." });
    }
    return db.transaction(async (tx) => {
      let closureId = existing?.id;
      if (existing) {
        await tx.update(massageMonthlyClosures).set({
          freelanceTripCount: input.freelanceTripCount,
          barbaraBaseSalary: input.barbaraBaseSalary == null ? null : String(input.barbaraBaseSalary),
          danielaBaseSalary: input.danielaBaseSalary == null ? null : String(input.danielaBaseSalary),
          notes: input.notes || null,
          snapshot: null,
        }).where(eq(massageMonthlyClosures.id, existing.id));
      } else {
        const [created] = await tx.insert(massageMonthlyClosures).values({
          closeMonth: input.closeMonth,
          periodStart: period.start as any,
          periodEnd: period.end as any,
          freelanceTripCount: input.freelanceTripCount,
          barbaraBaseSalary: input.barbaraBaseSalary == null ? null : String(input.barbaraBaseSalary),
          danielaBaseSalary: input.danielaBaseSalary == null ? null : String(input.danielaBaseSalary),
          notes: input.notes || null,
          createdByUserId: ctx.user.id,
        }).$returningId();
        closureId = created.id;
      }
      if (!closureId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await tx.delete(massageMonthlyClosureAdjustments)
        .where(eq(massageMonthlyClosureAdjustments.closureId, closureId));
      if (input.adjustments.length > 0) {
        await tx.insert(massageMonthlyClosureAdjustments).values(input.adjustments.map((adjustment) => ({
          closureId,
          category: adjustment.category,
          description: adjustment.description,
          amount: String(adjustment.amount),
          createdByUserId: ctx.user.id,
        })));
      }
      await tx.insert(massageMonthlyClosureAudit).values({
        closureId,
        action: existing ? "updated" : "created",
        detail: JSON.stringify({
          freelanceTripCount: input.freelanceTripCount,
          barbaraBaseSalary: input.barbaraBaseSalary,
          danielaBaseSalary: input.danielaBaseSalary,
          adjustments: input.adjustments.length,
        }),
        userId: ctx.user.id,
      });
      return { success: true, closureId };
    });
  }),

  close: protectedProcedure.input(z.object({ closeMonth: closeMonthSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertAreaAdmin(db, ctx.user);
      const closure = await getClosure(db, input.closeMonth);
      if (!closure) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Guarda el borrador antes de cerrar el período." });
      }
      if (closure.status === "closed") return { success: true };
      const parameters = parametersFromClosure(closure);
      if (parameters.barbaraBaseSalary == null || parameters.danielaBaseSalary == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Debes ingresar los sueldos base informados por la contadora para Bárbara y Daniela.",
        });
      }
      const adjustments = await getAdjustments(db, closure.id);
      const calculation = await calculateMassageClose(db, input.closeMonth, parameters, adjustments);
      await db.transaction(async (tx) => {
        await tx.update(massageMonthlyClosures).set({
          status: "closed",
          snapshot: JSON.stringify(calculation),
          closedByUserId: ctx.user.id,
          closedAt: new Date(),
        }).where(eq(massageMonthlyClosures.id, closure.id));
        await tx.insert(massageMonthlyClosureAudit).values({
          closureId: closure.id,
          action: "closed",
          detail: JSON.stringify({
            totalMassages: calculation.totals.totalMassages,
            revenue: calculation.totals.revenue,
            unitResult: calculation.totals.unitResult,
            missingAssignments: calculation.alerts.missingAssignments.length,
          }),
          userId: ctx.user.id,
        });
      });
      return { success: true, missingAssignments: calculation.alerts.missingAssignments.length };
    }),

  reopen: protectedProcedure.input(z.object({
    closeMonth: closeMonthSchema,
    reason: z.string().trim().min(5).max(1000),
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "super_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Solo un superadministrador puede reabrir un cierre." });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const closure = await getClosure(db, input.closeMonth);
    if (!closure) throw new TRPCError({ code: "NOT_FOUND" });
    await db.transaction(async (tx) => {
      await tx.update(massageMonthlyClosures).set({
        status: "draft",
        snapshot: null,
        reopenedByUserId: ctx.user.id,
        reopenedAt: new Date(),
        reopenReason: input.reason,
      }).where(eq(massageMonthlyClosures.id, closure.id));
      await tx.insert(massageMonthlyClosureAudit).values({
        closureId: closure.id,
        action: "reopened",
        detail: input.reason,
        userId: ctx.user.id,
      });
    });
    return { success: true };
  }),

  markExported: protectedProcedure.input(z.object({ closeMonth: closeMonthSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertAreaAdmin(db, ctx.user);
      const closure = await getClosure(db, input.closeMonth);
      if (closure) {
        await db.insert(massageMonthlyClosureAudit).values({
          closureId: closure.id,
          action: "exported",
          detail: "Excel de cierre descargado",
          userId: ctx.user.id,
        });
      }
      return { success: true };
    }),
});
