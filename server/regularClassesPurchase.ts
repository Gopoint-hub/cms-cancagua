import { eq, inArray } from "drizzle-orm";
import {
  regularClassMemberships,
  regularClassPaymentInvitations,
  regularClassPlans,
  regularClassStudents,
} from "../drizzle/schema";
import { getDb } from "./db";
import { sendEmail } from "./email";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function confirmRegularClassPayment(requestId: string) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db.select({
    id: regularClassMemberships.id,
    paymentStatus: regularClassMemberships.paymentStatus,
    pricePaidClp: regularClassMemberships.pricePaidClp,
    creditsTotal: regularClassMemberships.creditsTotal,
    periodStart: regularClassMemberships.periodStart,
    periodEnd: regularClassMemberships.periodEnd,
    studentId: regularClassMemberships.studentId,
    studentName: regularClassStudents.firstName,
    studentEmail: regularClassStudents.email,
    planName: regularClassPlans.name,
  }).from(regularClassMemberships)
    .innerJoin(regularClassStudents, eq(regularClassMemberships.studentId, regularClassStudents.id))
    .innerJoin(regularClassPlans, eq(regularClassMemberships.planId, regularClassPlans.id))
    .where(eq(regularClassMemberships.paymentReference, requestId));
  const unpaid = memberships.filter((membership) => membership.paymentStatus !== "paid");
  if (unpaid.length === 0) return memberships;

  await db.update(regularClassMemberships).set({
    paymentStatus: "paid",
    status: "active",
    paidAt: new Date(),
  }).where(inArray(regularClassMemberships.id, unpaid.map((membership) => membership.id)));
  await db.update(regularClassPaymentInvitations).set({
    status: "completed",
    completedAt: new Date(),
  }).where(inArray(
    regularClassPaymentInvitations.studentId,
    Array.from(new Set(unpaid.map((membership) => membership.studentId))),
  ));

  await Promise.all(unpaid.map(async (membership) => {
    if (!membership.studentEmail) return;
    await sendEmail({
      to: membership.studentEmail,
      subject: `Tu ${membership.planName} de Clases Regulares está activo`,
      senderType: "notification",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#253238">
          <h1 style="font-size:25px">¡Tu plan está activo, ${escapeHtml(membership.studentName)}!</h1>
          <p>Confirmamos el pago de tu <strong>${escapeHtml(membership.planName)}</strong> en Cancagua.</p>
          <p>Tu plan incluye <strong>${membership.creditsTotal} clase${membership.creditsTotal === 1 ? "" : "s"}</strong> y estará vigente desde ${membership.periodStart} hasta ${membership.periodEnd}.</p>
          <p>Monto pagado: <strong>$${membership.pricePaidClp.toLocaleString("es-CL")}</strong>.</p>
          <p>Ya puedes coordinar tus asistencias con nuestro equipo. ¡Nos vemos en Cancagua!</p>
        </div>`,
    });
  }));
  return memberships;
}

export async function cancelRegularClassPayment(requestId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(regularClassMemberships).set({ status: "cancelled" })
    .where(eq(regularClassMemberships.paymentReference, requestId));
}
