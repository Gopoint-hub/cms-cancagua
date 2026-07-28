import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  regularClassAttendances,
  regularClassAudit,
  regularClassBenefitEntitlements,
  regularClassCampaignDeliveries,
  regularClassCampaigns,
  regularClassClosures,
  regularClassDisciplines,
  regularClassMemberships,
  regularClassPaymentInvitations,
  regularClassPlans,
  regularClassSchedules,
  regularClassSessions,
  regularClassSettings,
  regularClassStudents,
  regularClassTeacherAgreements,
  regularClassTeachers,
  users,
} from "../drizzle/schema";
import {
  hasRegularClassesAccess,
  hasRegularClassesAdminAccess,
  hasRegularClassesReceptionAccess,
} from "@shared/permissions";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  calculateCommissionLine,
  summarizeCommissions,
  type CommissionInput,
  type RegularClassDocumentType,
} from "./regularClassesCalculations";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const documentTypeSchema = z.enum([
  "pending",
  "honorarium_receipt",
  "exempt_invoice",
  "taxable_invoice",
  "none",
]);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
  return db;
}
function requireModuleAccess(user: { role: string; regularClassesTeacher?: number | null }) {
  if (!hasRegularClassesAccess(user.role, user.regularClassesTeacher)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes acceso a Clases Regulares" });
  }
}

function requireAdmin(user: { role: string }) {
  if (!hasRegularClassesAdminAccess(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Esta acción requiere administración" });
  }
}

function requireReception(user: { role: string }) {
  if (!hasRegularClassesReceptionAccess(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Esta acción requiere recepción o administración" });
  }
}

async function getTeacherForUser(userId: number) {
  const db = await requireDb();
  const [teacher] = await db.select().from(regularClassTeachers)
    .where(and(eq(regularClassTeachers.cmsUserId, userId), eq(regularClassTeachers.active, 1)))
    .limit(1);
  return teacher;
}

async function writeAudit(
  entityType: string,
  entityId: number,
  action: string,
  userId: number,
  detail?: unknown,
) {
  const db = await requireDb();
  await db.insert(regularClassAudit).values({
    entityType,
    entityId,
    action,
    userId,
    detail: detail == null ? null : JSON.stringify(detail),
  });
}

function asDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function dateString(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function ensureSessions(from: string, to: string) {
  const db = await requireDb();
  const start = asDate(from);
  const end = asDate(to);
  if ((end.getTime() - start.getTime()) / 86_400_000 > 93) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El rango máximo es de 93 días" });
  }

  const schedules = await db.select().from(regularClassSchedules)
    .where(and(
      eq(regularClassSchedules.active, 1),
      lte(regularClassSchedules.validFrom, to),
      or(isNull(regularClassSchedules.validTo), gte(regularClassSchedules.validTo, from)),
    ));

  const rows: Array<typeof regularClassSessions.$inferInsert> = [];
  for (const schedule of schedules) {
    const cursor = new Date(start);
    while (cursor <= end) {
      const current = dateString(cursor);
      if (
        cursor.getDay() === schedule.dayOfWeek
        && current >= schedule.validFrom
        && (!schedule.validTo || current <= schedule.validTo)
      ) {
        rows.push({
          scheduleId: schedule.id,
          disciplineId: schedule.disciplineId,
          teacherId: schedule.teacherId,
          sessionDate: current,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  if (rows.length) {
    // La pantalla de asistencia consulta un rango móvil. Evitamos reescribir en
    // cada apertura las sesiones que ya fueron creadas por el dashboard o por
    // una consulta anterior, porque ese upsert innecesario puede competir con
    // otras solicitudes y dejar la lectura esperando.
    const existing = await db.select({
      scheduleId: regularClassSessions.scheduleId,
      sessionDate: regularClassSessions.sessionDate,
    }).from(regularClassSessions).where(and(
      gte(regularClassSessions.sessionDate, from),
      lte(regularClassSessions.sessionDate, to),
    ));
    const existingKeys = new Set(existing
      .filter((row) => row.scheduleId != null)
      .map((row) => `${row.scheduleId}:${row.sessionDate}`));
    const missingRows = rows.filter((row) =>
      row.scheduleId != null
      && !existingKeys.has(`${row.scheduleId}:${row.sessionDate}`));

    if (!missingRows.length) return;
    await db.insert(regularClassSessions).values(missingRows).onDuplicateKeyUpdate({
      set: { updatedAt: new Date() },
    });
  }
}

async function getPeriodSettings() {
  const db = await requireDb();
  const rows = await db.select().from(regularClassSettings);
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    periodStartDay: Number(values.period_start_day ?? 26),
    withholdingBps: Number(values.honorarium_withholding_bps ?? 1525),
    vatBps: Number(values.vat_bps ?? 1900),
    paymentBaseUrl: values.payment_base_url ?? "https://cancagua.cl/clases",
  };
}

function currentPeriod(startDay: number, reference = new Date()) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), startDay, 12);
  if (reference.getDate() < startDay) start.setMonth(start.getMonth() - 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, startDay - 1, 12);
  return { start: dateString(start), end: dateString(end) };
}

function previousDate(value: string) {
  const date = asDate(value);
  date.setDate(date.getDate() - 1);
  return dateString(date);
}

const planRank = (code: string) => {
  if (code === "drop_in") return 0;
  return Number(code.replace("x", "")) || 0;
};

function consecutiveMembershipCount(
  memberships: Array<{ periodStart: string; periodEnd: string }>,
) {
  if (!memberships.length) return 0;
  const sorted = [...memberships].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  let streak = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const previousEnd = asDate(sorted[index - 1].periodEnd);
    const currentStart = asDate(sorted[index].periodStart);
    const gap = (currentStart.getTime() - previousEnd.getTime()) / 86_400_000;
    streak = gap >= 0 && gap <= 7 ? streak + 1 : 1;
  }
  return streak;
}

async function refreshBenefitEntitlements() {
  const db = await requireDb();
  const memberships = await db.select({
    id: regularClassMemberships.id,
    studentId: regularClassMemberships.studentId,
    periodStart: regularClassMemberships.periodStart,
    periodEnd: regularClassMemberships.periodEnd,
    planCode: regularClassPlans.code,
  }).from(regularClassMemberships)
    .innerJoin(regularClassPlans, eq(regularClassMemberships.planId, regularClassPlans.id))
    .where(and(
      eq(regularClassMemberships.paymentStatus, "paid"),
      inArray(regularClassMemberships.status, ["active", "completed"]),
    ))
    .orderBy(asc(regularClassMemberships.studentId), asc(regularClassMemberships.periodStart));

  const inserts: Array<typeof regularClassBenefitEntitlements.$inferInsert> = [];
  const byStudent = new Map<number, typeof memberships>();
  for (const membership of memberships) {
    const list = byStudent.get(membership.studentId) ?? [];
    list.push(membership);
    byStudent.set(membership.studentId, list);
    const rank = planRank(membership.planCode);
    if (rank >= 2) inserts.push({
      studentId: membership.studentId,
      membershipId: membership.id,
      benefitCode: "biopiscina_15",
      benefitName: "15% de descuento en tickets de biopiscina",
      eligibleAt: membership.periodStart,
    });
    if (rank >= 3) inserts.push({
      studentId: membership.studentId,
      membershipId: membership.id,
      benefitCode: "sauna_jueves",
      benefitName: "Sauna jueves 10:00–12:00",
      eligibleAt: membership.periodStart,
    });
  }
  for (const [studentId, studentMemberships] of Array.from(byStudent.entries())) {
    const latest = studentMemberships[studentMemberships.length - 1];
    const eligibleMemberships = studentMemberships.filter((item) => planRank(item.planCode) >= 4);
    const streak = consecutiveMembershipCount(eligibleMemberships);
    const rank = planRank(latest.planCode);
    if (rank >= 4 && streak >= 6) inserts.push({
      studentId,
      membershipId: latest.id,
      benefitCode: rank >= 5 ? "pulso_5_6m" : "pulso_3_6m",
      benefitName: rank >= 5 ? "Pulso 5 por 6 meses de permanencia" : "Pulso 3 por 6 meses de permanencia",
      eligibleAt: latest.periodStart,
    });
    if (rank >= 4 && streak >= 12) inserts.push({
      studentId,
      membershipId: latest.id,
      benefitCode: rank >= 5 ? "pulso_10_12m" : "pulso_5_12m",
      benefitName: rank >= 5 ? "Pulso 10 por 12 meses de permanencia" : "Pulso 5 por 12 meses de permanencia",
      eligibleAt: latest.periodStart,
    });
  }
  if (inserts.length) {
    await db.insert(regularClassBenefitEntitlements).values(inserts).onDuplicateKeyUpdate({
      set: { updatedAt: new Date() },
    });
  }
  return inserts.length;
}

async function settlementPreview(periodStart: string, periodEnd: string) {
  const db = await requireDb();
  const memberships = await db.select({
    id: regularClassMemberships.id,
    studentId: regularClassMemberships.studentId,
    planId: regularClassMemberships.planId,
    periodStart: regularClassMemberships.periodStart,
    periodEnd: regularClassMemberships.periodEnd,
    pricePaidClp: regularClassMemberships.pricePaidClp,
    creditsTotal: regularClassMemberships.creditsTotal,
    studentFirstName: regularClassStudents.firstName,
    studentLastName: regularClassStudents.lastName,
    planName: regularClassPlans.name,
  }).from(regularClassMemberships)
    .innerJoin(regularClassStudents, eq(regularClassMemberships.studentId, regularClassStudents.id))
    .innerJoin(regularClassPlans, eq(regularClassMemberships.planId, regularClassPlans.id))
    .where(and(
      eq(regularClassMemberships.paymentStatus, "paid"),
      inArray(regularClassMemberships.status, ["active", "completed"]),
      lte(regularClassMemberships.periodStart, periodEnd),
      gte(regularClassMemberships.periodEnd, periodStart),
    ));

  const membershipIds = memberships.map((row) => row.id);
  const attendanceRows = membershipIds.length
    ? await db.select({
      membershipId: regularClassAttendances.membershipId,
      teacherId: regularClassSessions.teacherId,
      sessionDate: regularClassSessions.sessionDate,
      teacherName: regularClassTeachers.name,
    }).from(regularClassAttendances)
      .innerJoin(regularClassSessions, eq(regularClassAttendances.sessionId, regularClassSessions.id))
      .innerJoin(regularClassTeachers, eq(regularClassSessions.teacherId, regularClassTeachers.id))
      .where(and(
        inArray(regularClassAttendances.membershipId, membershipIds),
        eq(regularClassAttendances.status, "present"),
        gte(regularClassSessions.sessionDate, periodStart),
        lte(regularClassSessions.sessionDate, periodEnd),
      ))
    : [];

  const agreements = await db.select().from(regularClassTeacherAgreements)
    .orderBy(asc(regularClassTeacherAgreements.validFrom));
  const membershipMap = new Map(memberships.map((row) => [row.id, row]));
  const groups = new Map<string, CommissionInput>();

  for (const attendance of attendanceRows) {
    if (!attendance.membershipId) continue;
    const membership = membershipMap.get(attendance.membershipId);
    if (!membership) continue;
    const agreement = [...agreements].reverse().find((item) =>
      item.teacherId === attendance.teacherId
      && item.validFrom <= attendance.sessionDate
      && (!item.validTo || item.validTo >= attendance.sessionDate));
    if (!agreement) continue;
    const key = `${membership.id}:${attendance.teacherId}:${agreement.id}`;
    const current = groups.get(key);
    if (current) {
      current.attendanceCount += 1;
    } else {
      groups.set(key, {
        studentId: membership.studentId,
        studentName: `${membership.studentFirstName} ${membership.studentLastName ?? ""}`.trim(),
        membershipId: membership.id,
        planName: membership.planName,
        pricePaidClp: membership.pricePaidClp,
        creditsTotal: membership.creditsTotal,
        teacherId: attendance.teacherId,
        teacherName: attendance.teacherName,
        teacherShareBps: agreement.teacherShareBps,
        documentType: agreement.documentType as RegularClassDocumentType,
        withholdingBps: agreement.withholdingBps,
        vatBps: agreement.vatBps,
        attendanceCount: 1,
      });
    }
  }

  const lines = Array.from(groups.values()).map(calculateCommissionLine);
  const totalIncomeClp = memberships.reduce((sum, row) => sum + row.pricePaidClp, 0);
  const totals = summarizeCommissions(lines, totalIncomeClp);
  const byTeacher = Array.from(new Set(lines.map((line) => line.teacherId))).map((teacherId) => {
    const teacherLines = lines.filter((line) => line.teacherId === teacherId);
    return {
      teacherId,
      teacherName: teacherLines[0].teacherName,
      documentType: teacherLines[0].documentType,
      attendances: teacherLines.reduce((sum, line) => sum + line.attendanceCount, 0),
      attributedRevenueClp: teacherLines.reduce((sum, line) => sum + line.attributedRevenueClp, 0),
      commissionClp: teacherLines.reduce((sum, line) => sum + line.teacherCommissionClp, 0),
      withholdingClp: teacherLines.reduce((sum, line) => sum + line.withholdingClp, 0),
      vatIncludedClp: teacherLines.reduce((sum, line) => sum + line.taxClp, 0),
      liquidPayableClp: teacherLines.reduce((sum, line) => sum + line.liquidPayableClp, 0),
    };
  });
  const membershipUsage = memberships.map((membership) => {
    const used = attendanceRows.filter((row) => row.membershipId === membership.id).length;
    return {
      membershipId: membership.id,
      studentId: membership.studentId,
      studentName: `${membership.studentFirstName} ${membership.studentLastName ?? ""}`.trim(),
      planName: membership.planName,
      paidClp: membership.pricePaidClp,
      creditsTotal: membership.creditsTotal,
      creditsUsed: used,
      creditsUnused: Math.max(0, membership.creditsTotal - used),
    };
  });

  return {
    period: { start: periodStart, end: periodEnd },
    calculatedAt: new Date().toISOString(),
    totals,
    byTeacher,
    membershipUsage,
    lines,
  };
}

const studentInput = z.object({
  firstName: z.string().trim().min(2).max(120),
  lastName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  communicationsConsent: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
});

export const regularClassesRouter = router({
  access: protectedProcedure.query(async ({ ctx }) => {
    const teacher = await getTeacherForUser(ctx.user.id);
    const allowed = hasRegularClassesAccess(ctx.user.role, ctx.user.regularClassesTeacher)
      || Boolean(teacher);
    return {
      allowed,
      isAdmin: hasRegularClassesAdminAccess(ctx.user.role),
      isReception: hasRegularClassesReceptionAccess(ctx.user.role),
      isTeacher: Boolean(teacher),
      teacherId: teacher?.id ?? null,
    };
  }),

  dashboard: protectedProcedure.query(async ({ ctx }) => {
    requireModuleAccess(ctx.user);
    const db = await requireDb();
    const settings = await getPeriodSettings();
    const period = currentPeriod(settings.periodStartDay);
    await ensureSessions(period.start, period.end);
    const [students, paidMemberships, sessions, attendances] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(regularClassStudents)
        .where(eq(regularClassStudents.status, "active")),
      db.select({
        count: sql<number>`count(*)`,
        income: sql<number>`coalesce(sum(${regularClassMemberships.pricePaidClp}), 0)`,
      }).from(regularClassMemberships).where(and(
        eq(regularClassMemberships.paymentStatus, "paid"),
        lte(regularClassMemberships.periodStart, period.end),
        gte(regularClassMemberships.periodEnd, period.start),
      )),
      db.select({ count: sql<number>`count(*)` }).from(regularClassSessions)
        .where(and(gte(regularClassSessions.sessionDate, period.start), lte(regularClassSessions.sessionDate, period.end))),
      db.select({ count: sql<number>`count(*)` }).from(regularClassAttendances)
        .innerJoin(regularClassSessions, eq(regularClassAttendances.sessionId, regularClassSessions.id))
        .where(and(
          eq(regularClassAttendances.status, "present"),
          gte(regularClassSessions.sessionDate, period.start),
          lte(regularClassSessions.sessionDate, period.end),
        )),
    ]);
    return {
      period,
      activeStudents: hasRegularClassesAdminAccess(ctx.user.role) ? Number(students[0]?.count ?? 0) : 0,
      paidMemberships: hasRegularClassesAdminAccess(ctx.user.role) ? Number(paidMemberships[0]?.count ?? 0) : 0,
      incomeClp: hasRegularClassesAdminAccess(ctx.user.role) ? Number(paidMemberships[0]?.income ?? 0) : 0,
      sessions: hasRegularClassesAdminAccess(ctx.user.role) ? Number(sessions[0]?.count ?? 0) : 0,
      attendances: hasRegularClassesAdminAccess(ctx.user.role) ? Number(attendances[0]?.count ?? 0) : 0,
    };
  }),

  plans: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requireModuleAccess(ctx.user);
      const db = await requireDb();
      return db.select().from(regularClassPlans).orderBy(asc(regularClassPlans.displayOrder));
    }),
    update: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(2),
      priceClp: z.number().int().nonnegative(),
      creditsPerPeriod: z.number().int().positive(),
      benefits: z.string().optional(),
      active: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      const { id, active, ...values } = input;
      await db.update(regularClassPlans).set({ ...values, active: active ? 1 : 0 }).where(eq(regularClassPlans.id, id));
      await writeAudit("plan", id, "updated", ctx.user.id, input);
      return { success: true };
    }),
  }),

  teachers: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requireModuleAccess(ctx.user);
      const db = await requireDb();
      const rows = await db.select({
        id: regularClassTeachers.id,
        cmsUserId: regularClassTeachers.cmsUserId,
        name: regularClassTeachers.name,
        email: regularClassTeachers.email,
        phone: regularClassTeachers.phone,
        bio: regularClassTeachers.bio,
        imageUrl: regularClassTeachers.imageUrl,
        color: regularClassTeachers.color,
        active: regularClassTeachers.active,
        teacherShareBps: regularClassTeacherAgreements.teacherShareBps,
        documentType: regularClassTeacherAgreements.documentType,
        withholdingBps: regularClassTeacherAgreements.withholdingBps,
        vatBps: regularClassTeacherAgreements.vatBps,
      }).from(regularClassTeachers)
        .leftJoin(regularClassTeacherAgreements, and(
          eq(regularClassTeacherAgreements.teacherId, regularClassTeachers.id),
          isNull(regularClassTeacherAgreements.validTo),
        ))
        .orderBy(asc(regularClassTeachers.name));
      if (hasRegularClassesAdminAccess(ctx.user.role)) return rows;
      const teacher = await getTeacherForUser(ctx.user.id);
      return rows.filter((row) => row.id === teacher?.id);
    }),
    save: protectedProcedure.input(z.object({
      id: z.number().int().positive().optional(),
      name: z.string().trim().min(2).max(160),
      email: z.string().trim().email().optional().or(z.literal("")),
      phone: z.string().trim().max(40).optional(),
      bio: z.string().trim().max(5000).optional(),
      imageUrl: z.string().trim().url().optional().or(z.literal("")),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      active: z.boolean(),
      teacherShareBps: z.number().int().min(0).max(10_000),
      documentType: documentTypeSchema,
      withholdingBps: z.number().int().min(0).max(10_000).default(1_525),
      vatBps: z.number().int().min(0).max(10_000).default(1_900),
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      const { id, teacherShareBps, documentType, withholdingBps, vatBps, active, ...teacherValues } = input;
      let teacherId = id;
      if (teacherId) {
        await db.update(regularClassTeachers).set({
          ...teacherValues,
          email: teacherValues.email || null,
          imageUrl: teacherValues.imageUrl || null,
          active: active ? 1 : 0,
        }).where(eq(regularClassTeachers.id, teacherId));
        const [agreement] = await db.select().from(regularClassTeacherAgreements)
          .where(and(eq(regularClassTeacherAgreements.teacherId, teacherId), isNull(regularClassTeacherAgreements.validTo)))
          .limit(1);
        if (agreement) {
          const changed = agreement.teacherShareBps !== teacherShareBps
            || agreement.documentType !== documentType
            || agreement.withholdingBps !== withholdingBps
            || agreement.vatBps !== vatBps;
          if (changed && agreement.validFrom === dateString(new Date())) {
            await db.update(regularClassTeacherAgreements).set({
              teacherShareBps, documentType, withholdingBps, vatBps,
            }).where(eq(regularClassTeacherAgreements.id, agreement.id));
          } else if (changed) {
            await db.update(regularClassTeacherAgreements).set({
              validTo: previousDate(dateString(new Date())),
            }).where(eq(regularClassTeacherAgreements.id, agreement.id));
            await db.insert(regularClassTeacherAgreements).values({
              teacherId,
              teacherShareBps,
              documentType,
              withholdingBps,
              vatBps,
              validFrom: dateString(new Date()),
              createdByUserId: ctx.user.id,
            });
          }
        } else {
          await db.insert(regularClassTeacherAgreements).values({
            teacherId,
            teacherShareBps,
            documentType,
            withholdingBps,
            vatBps,
            validFrom: dateString(new Date()),
            createdByUserId: ctx.user.id,
          });
        }
      } else {
        const [result] = await db.insert(regularClassTeachers).values({
          ...teacherValues,
          email: teacherValues.email || null,
          imageUrl: teacherValues.imageUrl || null,
          active: active ? 1 : 0,
        }).$returningId();
        teacherId = result.id;
        await db.insert(regularClassTeacherAgreements).values({
          teacherId,
          teacherShareBps,
          documentType,
          withholdingBps,
          vatBps,
          validFrom: dateString(new Date()),
          createdByUserId: ctx.user.id,
        });
      }
      await writeAudit("teacher", teacherId!, id ? "updated" : "created", ctx.user.id, input);
      return { success: true, id: teacherId! };
    }),
    linkOrInviteUser: protectedProcedure.input(z.object({
      teacherId: z.number().int().positive(),
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      const [teacher] = await db.select().from(regularClassTeachers)
        .where(eq(regularClassTeachers.id, input.teacherId)).limit(1);
      if (!teacher?.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Primero registra el correo del profesor" });
      }
      let [account] = await db.select().from(users)
        .where(eq(users.email, teacher.email)).limit(1);
      let emailSent = false;
      if (!account) {
        const { generateOpenId, generateToken } = await import("./_core/auth");
        const invitationToken = generateToken();
        const invitationExpiresAt = new Date();
        invitationExpiresAt.setDate(invitationExpiresAt.getDate() + 7);
        const [created] = await db.insert(users).values({
          openId: generateOpenId(),
          email: teacher.email,
          name: teacher.name,
          role: "user",
          status: "pending",
          regularClassesTeacher: 1,
          invitationToken,
          invitationExpiresAt,
          invitedBy: ctx.user.id,
        }).$returningId();
        [account] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
        const { sendInvitationEmail } = await import("./_core/email");
        const result = await sendInvitationEmail(
          teacher.email,
          invitationToken,
          ctx.user.name || ctx.user.email || "Administración Cancagua",
          "user",
        );
        emailSent = result.success;
      } else {
        await db.update(users).set({ regularClassesTeacher: 1 }).where(eq(users.id, account.id));
      }
      await db.update(regularClassTeachers).set({ cmsUserId: account.id })
        .where(eq(regularClassTeachers.id, teacher.id));
      await writeAudit("teacher", teacher.id, "user_linked", ctx.user.id, { cmsUserId: account.id });
      return { success: true, emailSent, cmsUserId: account.id };
    }),
  }),

  classes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requireModuleAccess(ctx.user);
      const db = await requireDb();
      const disciplines = await db.select().from(regularClassDisciplines)
        .orderBy(asc(regularClassDisciplines.name));
      const schedules = await db.select({
        id: regularClassSchedules.id,
        disciplineId: regularClassSchedules.disciplineId,
        teacherId: regularClassSchedules.teacherId,
        teacherName: regularClassTeachers.name,
        dayOfWeek: regularClassSchedules.dayOfWeek,
        startTime: regularClassSchedules.startTime,
        endTime: regularClassSchedules.endTime,
        active: regularClassSchedules.active,
      }).from(regularClassSchedules)
        .innerJoin(regularClassTeachers, eq(regularClassSchedules.teacherId, regularClassTeachers.id))
        .where(eq(regularClassSchedules.active, 1))
        .orderBy(asc(regularClassSchedules.dayOfWeek), asc(regularClassSchedules.startTime));
      return disciplines.map((discipline) => ({
        ...discipline,
        schedules: schedules.filter((schedule) => schedule.disciplineId === discipline.id),
      }));
    }),
    save: protectedProcedure.input(z.object({
      id: z.number().int().positive().optional(),
      name: z.string().trim().min(2).max(180),
      shortDescription: z.string().trim().max(300).optional(),
      description: z.string().trim().max(10_000).optional(),
      imageUrl: z.string().trim().url().optional().or(z.literal("")),
      location: z.string().trim().max(180).optional(),
      capacity: z.number().int().positive().optional(),
      active: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      const { id, active, ...values } = input;
      let disciplineId = id;
      if (id) {
        await db.update(regularClassDisciplines).set({
          ...values, imageUrl: values.imageUrl || null, active: active ? 1 : 0,
        }).where(eq(regularClassDisciplines.id, id));
      } else {
        const [created] = await db.insert(regularClassDisciplines).values({
          ...values, imageUrl: values.imageUrl || null, active: active ? 1 : 0,
        }).$returningId();
        disciplineId = created.id;
      }
      await writeAudit("discipline", disciplineId!, id ? "updated" : "created", ctx.user.id, input);
      return { success: true, id: disciplineId! };
    }),
    addSchedule: protectedProcedure.input(z.object({
      disciplineId: z.number().int().positive(),
      teacherId: z.number().int().positive(),
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: timeSchema,
      endTime: timeSchema,
      validFrom: dateSchema,
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      const [created] = await db.insert(regularClassSchedules).values(input).$returningId();
      await writeAudit("schedule", created.id, "created", ctx.user.id, input);
      return { success: true, id: created.id };
    }),
    removeSchedule: protectedProcedure.input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireAdmin(ctx.user);
        const db = await requireDb();
        await db.update(regularClassSchedules).set({
          active: 0,
          validTo: dateString(new Date()),
        }).where(eq(regularClassSchedules.id, input.id));
        await writeAudit("schedule", input.id, "deactivated", ctx.user.id);
        return { success: true };
      }),
  }),

  students: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requireReception(ctx.user);
      const db = await requireDb();
      const students = await db.select().from(regularClassStudents)
        .orderBy(asc(regularClassStudents.firstName), asc(regularClassStudents.lastName));
      const memberships = await db.select({
        id: regularClassMemberships.id,
        studentId: regularClassMemberships.studentId,
        planId: regularClassMemberships.planId,
        planName: regularClassPlans.name,
        periodStart: regularClassMemberships.periodStart,
        periodEnd: regularClassMemberships.periodEnd,
        pricePaidClp: regularClassMemberships.pricePaidClp,
        creditsTotal: regularClassMemberships.creditsTotal,
        status: regularClassMemberships.status,
        paymentStatus: regularClassMemberships.paymentStatus,
      }).from(regularClassMemberships)
        .innerJoin(regularClassPlans, eq(regularClassMemberships.planId, regularClassPlans.id))
        .orderBy(desc(regularClassMemberships.periodEnd));
      const usage = await db.select({
        membershipId: regularClassAttendances.membershipId,
        count: sql<number>`count(*)`,
      }).from(regularClassAttendances)
        .where(eq(regularClassAttendances.status, "present"))
        .groupBy(regularClassAttendances.membershipId);
      return students.map((student) => {
        const membership = memberships.find((item) => item.studentId === student.id);
        const creditsUsed = Number(usage.find((item) => item.membershipId === membership?.id)?.count ?? 0);
        return {
          ...student,
          membership: membership ? {
            ...membership,
            creditsUsed,
            creditsRemaining: Math.max(0, membership.creditsTotal - creditsUsed),
          } : null,
        };
      });
    }),
    create: protectedProcedure.input(studentInput.extend({
      source: z.enum(["teacher", "reception", "admin"]).optional(),
      sendPaymentInvitation: z.boolean().default(false),
    })).mutation(async ({ ctx, input }) => {
      requireModuleAccess(ctx.user);
      const db = await requireDb();
      const email = input.email || null;
      const phone = input.phone || null;
      const duplicates = await db.select().from(regularClassStudents).where(or(
        email ? eq(regularClassStudents.email, email) : sql`false`,
        phone ? eq(regularClassStudents.phone, phone) : sql`false`,
      )).limit(1);
      if (duplicates[0]) {
        throw new TRPCError({ code: "CONFLICT", message: "Ya existe un alumno con ese correo o teléfono" });
      }
      const { sendPaymentInvitation, ...values } = input;
      const [created] = await db.insert(regularClassStudents).values({
        ...values,
        email,
        phone,
        lastName: values.lastName || null,
        source: values.source ?? (ctx.user.regularClassesTeacher ? "teacher" : "admin"),
        communicationsConsent: values.communicationsConsent ? 1 : 0,
        createdByUserId: ctx.user.id,
      }).$returningId();
      await writeAudit("student", created.id, "created", ctx.user.id, values);
      let invitationSent = false;
      if (sendPaymentInvitation && email) {
        const result = await createAndSendPaymentInvitation(created.id, ctx.user.id);
        invitationSent = result.sent;
      }
      return { success: true, id: created.id, invitationSent };
    }),
    enroll: protectedProcedure.input(z.object({
      studentId: z.number().int().positive(),
      planId: z.number().int().positive(),
      periodStart: dateSchema,
      periodEnd: dateSchema,
      pricePaidClp: z.number().int().nonnegative().optional(),
      paymentStatus: z.enum(["pending", "paid"]).default("paid"),
      paymentMethod: z.string().trim().max(60).optional(),
      paymentReference: z.string().trim().max(160).optional(),
    })).mutation(async ({ ctx, input }) => {
      requireReception(ctx.user);
      const db = await requireDb();
      const [plan] = await db.select().from(regularClassPlans)
        .where(eq(regularClassPlans.id, input.planId)).limit(1);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan no encontrado" });
      const [created] = await db.insert(regularClassMemberships).values({
        studentId: input.studentId,
        planId: input.planId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        pricePaidClp: input.pricePaidClp ?? plan.priceClp,
        creditsTotal: plan.creditsPerPeriod,
        status: input.paymentStatus === "paid" ? "active" : "pending_payment",
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference,
        paidAt: input.paymentStatus === "paid" ? new Date() : null,
        createdByUserId: ctx.user.id,
      }).$returningId();
      if (input.paymentStatus === "paid") {
        await db.update(regularClassStudents).set({ status: "active" })
          .where(eq(regularClassStudents.id, input.studentId));
        await db.update(regularClassPaymentInvitations).set({
          status: "completed",
          completedAt: new Date(),
        }).where(eq(regularClassPaymentInvitations.studentId, input.studentId));
        await db.update(regularClassAttendances).set({
          membershipId: created.id,
          status: "present",
        }).where(and(
          eq(regularClassAttendances.studentId, input.studentId),
          eq(regularClassAttendances.status, "pending_payment"),
        ));
      }
      await writeAudit("membership", created.id, "created", ctx.user.id, input);
      return { success: true, id: created.id };
    }),
    carryForward: protectedProcedure.input(z.object({
      membershipId: z.number().int().positive(),
      nextPeriodStart: dateSchema,
      nextPeriodEnd: dateSchema,
      reason: z.string().trim().min(5).max(1000),
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      const [membership] = await db.select().from(regularClassMemberships)
        .where(eq(regularClassMemberships.id, input.membershipId)).limit(1);
      if (!membership || membership.paymentStatus !== "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La mensualidad debe estar pagada" });
      }
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(regularClassAttendances)
        .where(and(
          eq(regularClassAttendances.membershipId, membership.id),
          eq(regularClassAttendances.status, "present"),
        ));
      if (Number(count) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Sólo se puede postergar un período sin asistencias" });
      }
      const [created] = await db.insert(regularClassMemberships).values({
        studentId: membership.studentId,
        planId: membership.planId,
        periodStart: input.nextPeriodStart,
        periodEnd: input.nextPeriodEnd,
        pricePaidClp: membership.pricePaidClp,
        creditsTotal: membership.creditsTotal,
        status: "active",
        paymentStatus: "paid",
        paymentMethod: membership.paymentMethod,
        paymentReference: membership.paymentReference,
        paidAt: membership.paidAt,
        carriedFromMembershipId: membership.id,
        notes: `Postergado: ${input.reason}`,
        createdByUserId: ctx.user.id,
      }).$returningId();
      await db.update(regularClassMemberships).set({
        status: "postponed",
        carriedToMembershipId: created.id,
        notes: `Postergado al ${input.nextPeriodStart}: ${input.reason}`,
      }).where(eq(regularClassMemberships.id, membership.id));
      await writeAudit("membership", membership.id, "carried_forward", ctx.user.id, {
        nextMembershipId: created.id,
        reason: input.reason,
      });
      return { success: true, nextMembershipId: created.id };
    }),
    sendPaymentInvitation: protectedProcedure.input(z.object({ studentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireModuleAccess(ctx.user);
        return createAndSendPaymentInvitation(input.studentId, ctx.user.id);
      }),
  }),

  attendance: router({
    sessions: protectedProcedure.input(z.object({
      from: dateSchema,
      to: dateSchema,
    })).query(async ({ ctx, input }) => {
      requireModuleAccess(ctx.user);
      const db = await requireDb();
      await ensureSessions(input.from, input.to);
      const teacher = await getTeacherForUser(ctx.user.id);
      if (!hasRegularClassesAdminAccess(ctx.user.role) && !teacher) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sólo profesores y administración pueden marcar asistencia" });
      }
      const condition = teacher && !hasRegularClassesAdminAccess(ctx.user.role)
        ? and(
          gte(regularClassSessions.sessionDate, input.from),
          lte(regularClassSessions.sessionDate, input.to),
          eq(regularClassSessions.teacherId, teacher.id),
        )
        : and(
          gte(regularClassSessions.sessionDate, input.from),
          lte(regularClassSessions.sessionDate, input.to),
        );
      const sessionRows = await db.select({
        id: regularClassSessions.id,
        sessionDate: regularClassSessions.sessionDate,
        startTime: regularClassSessions.startTime,
        endTime: regularClassSessions.endTime,
        status: regularClassSessions.status,
        disciplineId: regularClassSessions.disciplineId,
        disciplineName: regularClassDisciplines.name,
        capacity: regularClassDisciplines.capacity,
        teacherId: regularClassSessions.teacherId,
        teacherName: regularClassTeachers.name,
        teacherColor: regularClassTeachers.color,
      }).from(regularClassSessions)
        .innerJoin(regularClassDisciplines, eq(regularClassSessions.disciplineId, regularClassDisciplines.id))
        .innerJoin(regularClassTeachers, eq(regularClassSessions.teacherId, regularClassTeachers.id))
        .where(condition)
        .orderBy(asc(regularClassSessions.sessionDate), asc(regularClassSessions.startTime));
      const sessionIds = sessionRows.map((session) => session.id);
      const attendanceCounts = sessionIds.length
        ? await db.select({
          sessionId: regularClassAttendances.sessionId,
          count: sql<number>`count(*)`,
        }).from(regularClassAttendances)
          .where(and(
            inArray(regularClassAttendances.sessionId, sessionIds),
            eq(regularClassAttendances.status, "present"),
          ))
          .groupBy(regularClassAttendances.sessionId)
        : [];
      const countBySession = new Map(attendanceCounts.map((row) => [
        row.sessionId,
        Number(row.count),
      ]));
      return sessionRows.map((session) => ({
        ...session,
        attendanceCount: countBySession.get(session.id) ?? 0,
      }));
    }),
    roster: protectedProcedure.input(z.object({ sessionId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        requireModuleAccess(ctx.user);
        const db = await requireDb();
        const [session] = await db.select().from(regularClassSessions)
          .where(eq(regularClassSessions.id, input.sessionId)).limit(1);
        if (!session) throw new TRPCError({ code: "NOT_FOUND" });
        const teacher = await getTeacherForUser(ctx.user.id);
        if (!hasRegularClassesAdminAccess(ctx.user.role) && !teacher) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sólo profesores y administración pueden marcar asistencia" });
        }
        if (teacher && !hasRegularClassesAdminAccess(ctx.user.role) && session.teacherId !== teacher.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const students = await db.select({
          id: regularClassStudents.id,
          firstName: regularClassStudents.firstName,
          lastName: regularClassStudents.lastName,
          email: regularClassStudents.email,
          phone: regularClassStudents.phone,
          status: regularClassStudents.status,
        }).from(regularClassStudents)
          .where(inArray(regularClassStudents.status, ["active", "prospect"]))
          .orderBy(asc(regularClassStudents.firstName));
        const memberships = await db.select({
          id: regularClassMemberships.id,
          studentId: regularClassMemberships.studentId,
          creditsTotal: regularClassMemberships.creditsTotal,
          planCode: regularClassPlans.code,
          planName: regularClassPlans.name,
          paymentStatus: regularClassMemberships.paymentStatus,
        }).from(regularClassMemberships)
          .innerJoin(regularClassPlans, eq(regularClassMemberships.planId, regularClassPlans.id))
          .where(and(
            lte(regularClassMemberships.periodStart, session.sessionDate),
            gte(regularClassMemberships.periodEnd, session.sessionDate),
            inArray(regularClassMemberships.status, ["active", "pending_payment"]),
          ));
        const membershipIds = memberships.map((row) => row.id);
        const usage = membershipIds.length ? await db.select({
          membershipId: regularClassAttendances.membershipId,
          count: sql<number>`count(*)`,
        }).from(regularClassAttendances)
          .where(and(
            inArray(regularClassAttendances.membershipId, membershipIds),
            eq(regularClassAttendances.status, "present"),
          ))
          .groupBy(regularClassAttendances.membershipId) : [];
        const attendances = await db.select().from(regularClassAttendances)
          .where(eq(regularClassAttendances.sessionId, input.sessionId));
        return {
          session,
          students: students.map((student) => {
            const membership = memberships.find((row) => row.studentId === student.id);
            const creditsUsed = Number(usage.find((row) => row.membershipId === membership?.id)?.count ?? 0);
            return {
              ...student,
              membership: membership ? {
                ...membership,
                creditsUsed,
                creditsRemaining: Math.max(0, membership.creditsTotal - creditsUsed),
              } : null,
              attendance: attendances.find((row) => row.studentId === student.id) ?? null,
            };
          }),
        };
      }),
    mark: protectedProcedure.input(z.object({
      sessionId: z.number().int().positive(),
      studentId: z.number().int().positive(),
      present: z.boolean(),
      notes: z.string().trim().max(1000).optional(),
    })).mutation(async ({ ctx, input }) => {
      requireModuleAccess(ctx.user);
      const db = await requireDb();
      const [session] = await db.select().from(regularClassSessions)
        .where(eq(regularClassSessions.id, input.sessionId)).limit(1);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const teacher = await getTeacherForUser(ctx.user.id);
      if (!hasRegularClassesAdminAccess(ctx.user.role) && !teacher) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sólo profesores y administración pueden marcar asistencia" });
      }
      if (teacher && !hasRegularClassesAdminAccess(ctx.user.role) && session.teacherId !== teacher.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [membership] = await db.select().from(regularClassMemberships)
        .where(and(
          eq(regularClassMemberships.studentId, input.studentId),
          eq(regularClassMemberships.paymentStatus, "paid"),
          eq(regularClassMemberships.status, "active"),
          lte(regularClassMemberships.periodStart, session.sessionDate),
          gte(regularClassMemberships.periodEnd, session.sessionDate),
        )).orderBy(desc(regularClassMemberships.createdAt)).limit(1);
      let hasAvailableCredit = false;
      if (membership) {
        const [{ count }] = await db.select({ count: sql<number>`count(*)` })
          .from(regularClassAttendances)
          .where(and(
            eq(regularClassAttendances.membershipId, membership.id),
            eq(regularClassAttendances.status, "present"),
            sql`${regularClassAttendances.sessionId} <> ${input.sessionId}`,
          ));
        hasAvailableCredit = Number(count) < membership.creditsTotal;
      }
      const status = !input.present
        ? "void"
        : membership && hasAvailableCredit
          ? "present"
          : "pending_payment";
      await db.insert(regularClassAttendances).values({
        sessionId: input.sessionId,
        studentId: input.studentId,
        membershipId: membership?.id ?? null,
        status,
        notes: input.notes,
        markedByUserId: ctx.user.id,
      }).onDuplicateKeyUpdate({
        set: {
          membershipId: membership?.id ?? null,
          status,
          notes: input.notes,
          markedByUserId: ctx.user.id,
          updatedAt: new Date(),
        },
      });
      if (input.present) {
        await db.update(regularClassSessions).set({
          status: "completed",
          closedAt: new Date(),
          closedByUserId: ctx.user.id,
        }).where(eq(regularClassSessions.id, input.sessionId));
      }
      await writeAudit("attendance", input.sessionId, status, ctx.user.id, input);
      return { success: true, status };
    }),
  }),

  settlements: router({
    mine: protectedProcedure.input(z.object({
      periodStart: dateSchema,
      periodEnd: dateSchema,
    })).query(async ({ ctx, input }) => {
      const teacher = await getTeacherForUser(ctx.user.id);
      if (!teacher) throw new TRPCError({ code: "FORBIDDEN", message: "No hay un perfil de profesor vinculado" });
      const db = await requireDb();
      const [closure] = await db.select().from(regularClassClosures).where(and(
        eq(regularClassClosures.periodStart, input.periodStart),
        eq(regularClassClosures.periodEnd, input.periodEnd),
      )).limit(1);
      const calculation: Awaited<ReturnType<typeof settlementPreview>> = closure?.status === "closed" && closure.snapshot
        ? JSON.parse(closure.snapshot)
        : await settlementPreview(input.periodStart, input.periodEnd);
      const lines = calculation.lines.filter((line) => line.teacherId === teacher.id);
      return {
        period: calculation.period,
        teacher: { id: teacher.id, name: teacher.name },
        attendances: lines.reduce((sum, line) => sum + line.attendanceCount, 0),
        commissionClp: lines.reduce((sum, line) => sum + line.teacherCommissionClp, 0),
        withholdingClp: lines.reduce((sum, line) => sum + line.withholdingClp, 0),
        vatIncludedClp: lines.reduce((sum, line) => sum + line.taxClp, 0),
        liquidPayableClp: lines.reduce((sum, line) => sum + line.liquidPayableClp, 0),
        lines,
      };
    }),
    preview: protectedProcedure.input(z.object({
      periodStart: dateSchema,
      periodEnd: dateSchema,
    })).query(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      const [closure] = await db.select().from(regularClassClosures).where(and(
        eq(regularClassClosures.periodStart, input.periodStart),
        eq(regularClassClosures.periodEnd, input.periodEnd),
      )).limit(1);
      const calculation = closure?.status === "closed" && closure.snapshot
        ? JSON.parse(closure.snapshot)
        : await settlementPreview(input.periodStart, input.periodEnd);
      return { closure: closure ?? null, calculation };
    }),
    close: protectedProcedure.input(z.object({
      periodStart: dateSchema,
      periodEnd: dateSchema,
      notes: z.string().trim().max(2000).optional(),
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      const calculation = await settlementPreview(input.periodStart, input.periodEnd);
      await db.insert(regularClassClosures).values({
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: "closed",
        snapshot: JSON.stringify(calculation),
        notes: input.notes,
        createdByUserId: ctx.user.id,
        closedByUserId: ctx.user.id,
        closedAt: new Date(),
      }).onDuplicateKeyUpdate({
        set: {
          status: "closed",
          snapshot: JSON.stringify(calculation),
          notes: input.notes,
          closedByUserId: ctx.user.id,
          closedAt: new Date(),
        },
      });
      const [closure] = await db.select().from(regularClassClosures).where(and(
        eq(regularClassClosures.periodStart, input.periodStart),
        eq(regularClassClosures.periodEnd, input.periodEnd),
      )).limit(1);
      await writeAudit("closure", closure.id, "closed", ctx.user.id);
      return { success: true, calculation };
    }),
    reopen: protectedProcedure.input(z.object({
      periodStart: dateSchema,
      periodEnd: dateSchema,
      reason: z.string().trim().min(5).max(1000),
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      const [closure] = await db.select().from(regularClassClosures).where(and(
        eq(regularClassClosures.periodStart, input.periodStart),
        eq(regularClassClosures.periodEnd, input.periodEnd),
      )).limit(1);
      if (!closure) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(regularClassClosures).set({
        status: "draft",
        snapshot: null,
        reopenedByUserId: ctx.user.id,
        reopenedAt: new Date(),
        reopenReason: input.reason,
      }).where(eq(regularClassClosures.id, closure.id));
      await writeAudit("closure", closure.id, "reopened", ctx.user.id, { reason: input.reason });
      return { success: true };
    }),
  }),

  benefits: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requireAdmin(ctx.user);
      await refreshBenefitEntitlements();
      const db = await requireDb();
      return db.select({
        id: regularClassBenefitEntitlements.id,
        studentId: regularClassBenefitEntitlements.studentId,
        studentName: sql<string>`concat(${regularClassStudents.firstName}, ' ', coalesce(${regularClassStudents.lastName}, ''))`,
        studentEmail: regularClassStudents.email,
        benefitCode: regularClassBenefitEntitlements.benefitCode,
        benefitName: regularClassBenefitEntitlements.benefitName,
        eligibleAt: regularClassBenefitEntitlements.eligibleAt,
        status: regularClassBenefitEntitlements.status,
        notifiedAt: regularClassBenefitEntitlements.notifiedAt,
        redeemedAt: regularClassBenefitEntitlements.redeemedAt,
      }).from(regularClassBenefitEntitlements)
        .innerJoin(regularClassStudents, eq(regularClassBenefitEntitlements.studentId, regularClassStudents.id))
        .orderBy(desc(regularClassBenefitEntitlements.eligibleAt));
    }),
    refresh: protectedProcedure.mutation(async ({ ctx }) => {
      requireAdmin(ctx.user);
      const evaluated = await refreshBenefitEntitlements();
      return { success: true, evaluated };
    }),
    notify: protectedProcedure.input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        requireAdmin(ctx.user);
        const db = await requireDb();
        const [row] = await db.select({
          id: regularClassBenefitEntitlements.id,
          benefitName: regularClassBenefitEntitlements.benefitName,
          studentId: regularClassStudents.id,
          firstName: regularClassStudents.firstName,
          email: regularClassStudents.email,
        }).from(regularClassBenefitEntitlements)
          .innerJoin(regularClassStudents, eq(regularClassBenefitEntitlements.studentId, regularClassStudents.id))
          .where(eq(regularClassBenefitEntitlements.id, input.id)).limit(1);
        if (!row?.email) throw new TRPCError({ code: "BAD_REQUEST", message: "El alumno no tiene correo" });
        const { sendEmail } = await import("./email");
        const result = await sendEmail({
          to: row.email,
          subject: `Tienes un beneficio disponible: ${row.benefitName}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#253238">
            <h1>Hola ${escapeHtml(row.firstName)}</h1>
            <p>Tu constancia en Clases Regulares Cancagua desbloqueó este beneficio:</p>
            <div style="padding:18px;background:#eef3f1;border-radius:10px;font-size:18px;font-weight:bold">${escapeHtml(row.benefitName)}</div>
            <p>Contáctanos o acércate a recepción para coordinar su uso.</p>
          </div>`,
          senderType: "notification",
        });
        if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
        await db.update(regularClassBenefitEntitlements).set({
          status: "notified",
          notifiedAt: new Date(),
        }).where(eq(regularClassBenefitEntitlements.id, row.id));
        await writeAudit("benefit", row.id, "notified", ctx.user.id);
        return { success: true };
      }),
    redeem: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      notes: z.string().trim().max(1000).optional(),
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      await db.update(regularClassBenefitEntitlements).set({
        status: "redeemed",
        redeemedAt: new Date(),
        notes: input.notes,
      }).where(eq(regularClassBenefitEntitlements.id, input.id));
      await writeAudit("benefit", input.id, "redeemed", ctx.user.id, input);
      return { success: true };
    }),
  }),

  campaigns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      return db.select().from(regularClassCampaigns).orderBy(desc(regularClassCampaigns.createdAt));
    }),
    send: protectedProcedure.input(z.object({
      name: z.string().trim().min(2).max(180),
      subject: z.string().trim().min(2).max(250),
      message: z.string().trim().min(5).max(20_000),
      audience: z.enum(["all_active", "2x_plus", "3x_plus", "4x_plus", "5x", "pending_payment"]),
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      const [campaignId] = await db.insert(regularClassCampaigns).values({
        ...input,
        status: "sending",
        createdByUserId: ctx.user.id,
      }).$returningId();
      const students = await db.select({
        id: regularClassStudents.id,
        firstName: regularClassStudents.firstName,
        email: regularClassStudents.email,
        status: regularClassStudents.status,
        communicationsConsent: regularClassStudents.communicationsConsent,
        planCode: regularClassPlans.code,
        paymentStatus: regularClassMemberships.paymentStatus,
        periodEnd: regularClassMemberships.periodEnd,
      }).from(regularClassStudents)
        .leftJoin(regularClassMemberships, eq(regularClassMemberships.studentId, regularClassStudents.id))
        .leftJoin(regularClassPlans, eq(regularClassMemberships.planId, regularClassPlans.id))
        .where(or(eq(regularClassStudents.status, "active"), eq(regularClassStudents.status, "prospect")))
        .orderBy(asc(regularClassStudents.id), desc(regularClassMemberships.periodEnd));
      const latestByStudent = new Map<number, typeof students[number]>();
      for (const student of students) {
        if (!latestByStudent.has(student.id)) latestByStudent.set(student.id, student);
      }
      const recipients = Array.from(latestByStudent.values()).filter((student) => {
        if (!student.email) return false;
        if (!student.communicationsConsent) return false;
        if (input.audience === "pending_payment") return student.paymentStatus !== "paid";
        if (student.status !== "active" || student.paymentStatus !== "paid") return false;
        if (input.audience === "all_active") return true;
        const rank = planRank(student.planCode ?? "");
        if (input.audience === "5x") return rank === 5;
        return rank >= Number(input.audience[0]);
      });
      let sentCount = 0;
      let failedCount = 0;
      const { sendEmail } = await import("./email");
      for (const student of recipients.slice(0, 500)) {
        const result = await sendEmail({
          to: student.email!,
          subject: input.subject,
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#253238">
            <h1>Hola ${escapeHtml(student.firstName)}</h1>
            <div style="white-space:pre-line;line-height:1.6">${escapeHtml(input.message)}</div>
            <p style="margin-top:28px;font-size:12px;color:#6b7280">Cancagua Restore Spa & Nature</p>
          </div>`,
          senderType: "notification",
        });
        sentCount += result.success ? 1 : 0;
        failedCount += result.success ? 0 : 1;
        await db.insert(regularClassCampaignDeliveries).values({
          campaignId: campaignId.id,
          studentId: student.id,
          recipientEmail: student.email!,
          status: result.success ? "sent" : "failed",
          providerId: result.id,
          error: result.error,
          sentAt: result.success ? new Date() : null,
        });
      }
      await db.update(regularClassCampaigns).set({
        status: failedCount > 0 && sentCount === 0 ? "failed" : "sent",
        sentCount,
        failedCount,
        sentAt: new Date(),
      }).where(eq(regularClassCampaigns.id, campaignId.id));
      await writeAudit("campaign", campaignId.id, "sent", ctx.user.id, { sentCount, failedCount });
      return { success: true, sentCount, failedCount };
    }),
  }),

  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      requireAdmin(ctx.user);
      return getPeriodSettings();
    }),
    update: protectedProcedure.input(z.object({
      periodStartDay: z.number().int().min(1).max(28),
      paymentBaseUrl: z.string().url(),
    })).mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user);
      const db = await requireDb();
      for (const [key, value] of [
        ["period_start_day", String(input.periodStartDay)],
        ["payment_base_url", input.paymentBaseUrl],
      ] as const) {
        await db.insert(regularClassSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
      }
      await writeAudit("settings", 0, "updated", ctx.user.id, input);
      return { success: true };
    }),
  }),
});

async function createAndSendPaymentInvitation(studentId: number, userId: number) {
  const db = await requireDb();
  const [student] = await db.select().from(regularClassStudents)
    .where(eq(regularClassStudents.id, studentId)).limit(1);
  if (!student?.email) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El alumno necesita un correo para recibir el enlace" });
  }
  const plans = await db.select().from(regularClassPlans)
    .where(eq(regularClassPlans.active, 1)).orderBy(asc(regularClassPlans.displayOrder));
  const settings = await getPeriodSettings();
  const token = randomUUID().replaceAll("-", "");
  const separator = settings.paymentBaseUrl.includes("?") ? "&" : "?";
  const paymentUrl = `${settings.paymentBaseUrl}${separator}inscripcion=${token}`;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  const [created] = await db.insert(regularClassPaymentInvitations).values({
    studentId,
    token,
    status: "pending",
    paymentUrl,
    expiresAt,
    createdByUserId: userId,
  }).$returningId();
  const planRows = plans.map((plan) =>
    `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${plan.name}</td>`
    + `<td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">$${plan.priceClp.toLocaleString("es-CL")}</td></tr>`,
  ).join("");
  const { sendEmail } = await import("./email");
  const result = await sendEmail({
    to: student.email,
    subject: "Elige tu plan de Clases Regulares Cancagua",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#253238">
        <h1 style="font-size:25px">Hola ${student.firstName}</h1>
        <p>Gracias por participar en una clase de Cancagua. Puedes elegir el plan que mejor se adapte a ti y asistir a cualquiera de nuestras disciplinas durante el período.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">${planRows}</table>
        <p style="text-align:center;margin:28px 0">
          <a href="${paymentUrl}" style="background:#4f6f78;color:white;text-decoration:none;padding:13px 22px;border-radius:8px;display:inline-block">Elegir mi plan</a>
        </p>
        <p style="font-size:12px;color:#6b7280">Este enlace vence en 14 días. Cancagua Restore Spa & Nature.</p>
      </div>`,
    senderType: "notification",
  });
  await db.update(regularClassPaymentInvitations).set({
    status: result.success ? "sent" : "pending",
    sentAt: result.success ? new Date() : null,
  }).where(eq(regularClassPaymentInvitations.id, created.id));
  await writeAudit("payment_invitation", created.id, result.success ? "sent" : "failed", userId, {
    studentId,
    error: result.error,
  });
  return { success: true, sent: result.success, paymentUrl, error: result.error };
}
