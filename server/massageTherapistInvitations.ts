import { asc, eq, sql } from "drizzle-orm";
import type { RowDataPacket } from "mysql2";
import {
  massageSettings,
  massageTherapists,
  users,
  type User,
} from "../drizzle/schema";
import { generateOpenId, generateToken } from "./_core/auth";
import { sendInvitationEmail } from "./_core/email";
import { ENV } from "./_core/env";
import { sendWhatsApp } from "./_core/whapi";
import { createUser, getDb } from "./db";

const INITIAL_INVITATIONS_SETTING = "massage_therapist_initial_invites_v1";
const INVITATION_DAYS = 7;

export type MassageTherapistInvitationSummary = {
  therapists: number;
  accountsCreated: number;
  accountsLinked: number;
  alreadyActive: number;
  emailSent: number;
  whatsappSent: number;
  missingEmail: number;
  missingPhone: number;
  conflictingUsers: number;
  channelFailures: number;
};

function invitationExpiresAt() {
  return new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
}

function buildInvitationLink(token: string) {
  const baseUrl = (ENV.appUrl || "https://cms.cancagua.cl").replace(/\/$/, "");
  return `${baseUrl}/cms/activar-cuenta?token=${token}`;
}

export function buildMassageTherapistWhatsAppMessage(
  therapistName: string,
  email: string,
  invitationToken: string,
) {
  const firstName = therapistName.trim().split(/\s+/)[0] || "Terapeuta";
  return [
    `Hola ${firstName} 👋`,
    "",
    "Te invitamos al CMS de Cancagua para que puedas revisar el dashboard y la agenda de masajes en modo solo lectura.",
    `Tu usuario es: ${email}`,
    `Crea tu contraseña aquí: ${buildInvitationLink(invitationToken)}`,
    "",
    "El enlace vence en 7 días.",
  ].join("\n");
}

function emptySummary(): MassageTherapistInvitationSummary {
  return {
    therapists: 0,
    accountsCreated: 0,
    accountsLinked: 0,
    alreadyActive: 0,
    emailSent: 0,
    whatsappSent: 0,
    missingEmail: 0,
    missingPhone: 0,
    conflictingUsers: 0,
    channelFailures: 0,
  };
}

/**
 * Crea y vincula cuentas de solo lectura para todos los terapeutas activos.
 * Los timestamps por canal hacen que sea seguro reintentar sin duplicar envíos exitosos.
 */
export async function inviteActiveMassageTherapists(
  inviterName = "Administración Cancagua",
): Promise<MassageTherapistInvitationSummary> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const therapists = await database.select()
    .from(massageTherapists)
    .where(eq(massageTherapists.active, 1))
    .orderBy(asc(massageTherapists.type), asc(massageTherapists.name));

  const summary = emptySummary();
  summary.therapists = therapists.length;

  for (const therapist of therapists) {
    const email = therapist.email?.trim().toLowerCase();
    const phone = therapist.phone?.trim();

    if (!email) {
      summary.missingEmail += 1;
      continue;
    }

    const [existing] = await database.select()
      .from(users)
      .where(sql`LOWER(${users.email}) = ${email}`)
      .limit(1);

    if (existing && existing.role !== "massage_therapist") {
      // Nunca rebajar ni reemplazar los permisos de una cuenta existente.
      summary.conflictingUsers += 1;
      continue;
    }

    let account: User | undefined = existing;
    let invitationToken = account?.invitationToken || "";
    let emailSentAt = therapist.cmsInvitationEmailSentAt;
    let whatsappSentAt = therapist.cmsInvitationWhatsappSentAt;

    if (!account) {
      invitationToken = generateToken();
      account = await createUser({
        openId: generateOpenId(),
        email,
        name: therapist.name,
        role: "massage_therapist",
        status: "pending",
        invitationToken,
        invitationExpiresAt: invitationExpiresAt(),
        allowedModules: JSON.stringify(["masajes"]),
      });
      if (!account) throw new Error(`No se pudo crear el usuario del terapeuta ${therapist.id}`);
      summary.accountsCreated += 1;
    } else if (account.status === "active") {
      summary.alreadyActive += 1;
    } else {
      const expired = !account.invitationExpiresAt || account.invitationExpiresAt.getTime() <= Date.now();
      if (!invitationToken || expired) {
        invitationToken = generateToken();
        await database.update(users).set({
          invitationToken,
          invitationExpiresAt: invitationExpiresAt(),
        }).where(eq(users.id, account.id));
        emailSentAt = null;
        whatsappSentAt = null;
        await database.update(massageTherapists).set({
          cmsInvitationEmailSentAt: null,
          cmsInvitationWhatsappSentAt: null,
        }).where(eq(massageTherapists.id, therapist.id));
      }
    }

    if (therapist.cmsUserId !== account.id) {
      await database.update(massageTherapists)
        .set({ cmsUserId: account.id })
        .where(eq(massageTherapists.id, therapist.id));
      summary.accountsLinked += 1;
    }

    if (account.status === "active") continue;

    if (!emailSentAt) {
      const emailResult = await sendInvitationEmail(
        email,
        invitationToken,
        inviterName,
        "massage_therapist",
      );
      if (emailResult.success) {
        await database.update(massageTherapists)
          .set({ cmsInvitationEmailSentAt: new Date() })
          .where(eq(massageTherapists.id, therapist.id));
        summary.emailSent += 1;
      } else {
        summary.channelFailures += 1;
      }
    }

    if (!phone) {
      summary.missingPhone += 1;
    } else if (!whatsappSentAt) {
      const whatsappResult = await sendWhatsApp(
        phone,
        buildMassageTherapistWhatsAppMessage(therapist.name, email, invitationToken),
      );
      if (whatsappResult.success) {
        await database.update(massageTherapists)
          .set({ cmsInvitationWhatsappSentAt: new Date() })
          .where(eq(massageTherapists.id, therapist.id));
        summary.whatsappSent += 1;
      } else {
        summary.channelFailures += 1;
      }
    }
  }

  return summary;
}

/**
 * Envío inicial de esta implementación. El lock evita duplicados si arrancan
 * varias instancias; si falla algún canal se reintentará en el próximo deploy.
 */
export async function runInitialMassageTherapistInvitations() {
  if (!ENV.isProduction) return null;
  const database = await getDb();
  if (!database) return null;

  const lockConnection = await database.$client.promise().getConnection();
  try {
    const [lockRows] = await lockConnection.query<RowDataPacket[]>(
      "SELECT GET_LOCK(?, 30) AS acquired",
      [INITIAL_INVITATIONS_SETTING],
    );
    if (Number(lockRows[0]?.acquired) !== 1) {
      throw new Error("No se pudo adquirir el lock para invitar terapeutas");
    }

    const [completed] = await database.select({ key: massageSettings.key })
      .from(massageSettings)
      .where(eq(massageSettings.key, INITIAL_INVITATIONS_SETTING))
      .limit(1);
    if (completed) return null;

    const summary = await inviteActiveMassageTherapists();
    const fullyDelivered = summary.channelFailures === 0
      && summary.missingEmail === 0
      && summary.missingPhone === 0
      && summary.conflictingUsers === 0;
    if (fullyDelivered) {
      await database.insert(massageSettings).values({
        key: INITIAL_INVITATIONS_SETTING,
        value: JSON.stringify({ completedAt: new Date().toISOString(), ...summary }),
      }).onDuplicateKeyUpdate({
        set: { value: JSON.stringify({ completedAt: new Date().toISOString(), ...summary }) },
      });
    }
    console.log("[massage-therapist-invitations]", JSON.stringify(summary));
    return summary;
  } finally {
    try {
      await lockConnection.query("SELECT RELEASE_LOCK(?)", [INITIAL_INVITATIONS_SETTING]);
    } finally {
      lockConnection.release();
    }
  }
}
