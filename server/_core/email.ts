/**
 * Email service using Resend for sending invitations and password reset emails
 * All emails are sent from @cancagua.cl domain
 */
import { Resend } from "resend";
import { readFileSync } from "fs";
import { join } from "path";
import { ENV } from "./env";

function getTerminosBase64(): string {
  // process.cwd() apunta al root del proyecto tanto en dev como en producción (Render)
  const filePath = join(process.cwd(), "server/assets/terminos-condiciones-masajes.pdf");
  try {
    return readFileSync(filePath).toString("base64");
  } catch {
    console.warn("[Email] No se pudo cargar terminos-condiciones-masajes.pdf desde:", filePath);
    return "";
  }
}

let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!resend) {
    if (!ENV.resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resend = new Resend(ENV.resendApiKey);
  }
  return resend;
}

const FROM_EMAIL = ENV.resendFromEmail;
const SUPPORT_EMAIL = "contacto@cancagua.cl";
const VERIFIED_EMAIL_DOMAIN = "cancagua.cl";

function getEmailDomain(emailOrSender: string): string {
  const match = emailOrSender.match(/<([^>]+)>/);
  const email = (match?.[1] || emailOrSender).trim();
  return email.split("@")[1]?.toLowerCase() || "";
}

function assertVerifiedSenderDomain(sender: string): void {
  const domain = getEmailDomain(sender);
  if (domain !== VERIFIED_EMAIL_DOMAIN) {
    throw new Error(`RESEND_FROM_EMAIL debe usar el dominio verificado @${VERIFIED_EMAIL_DOMAIN}. Valor actual: ${sender}`);
  }
}

assertVerifiedSenderDomain(FROM_EMAIL);

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatClp(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Send invitation email to new user
 */
export async function sendInvitationEmail(
  to: string,
  invitationToken: string,
  inviterName: string,
  role: string
): Promise<EmailResult> {
  try {
    const client = getResendClient();
    const baseUrl = ENV.appUrl || "https://cancagua.cl";
    const invitationLink = `${baseUrl}/cms/activar-cuenta?token=${invitationToken}`;
    
    const roleLabels: Record<string, string> = {
      super_admin: "Super Administrador",
      admin: "Administrador",
      cancagua_staff: "Usuario Personal Cancagua",
      user: "Usuario",
      seller: "Vendedor",
    };

    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: "Invitación al CMS de Cancagua",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación al CMS</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #0f766e; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Cancagua</h1>
              <p style="margin: 8px 0 0; color: #99f6e4; font-size: 14px;">Sistema de Gestión</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px; font-weight: 600;">¡Has sido invitado!</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>${inviterName}</strong> te ha invitado a unirte al sistema de gestión de Cancagua como <strong>${roleLabels[role] || role}</strong>.
              </p>
              
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Para activar tu cuenta y crear tu contraseña, haz clic en el siguiente botón:
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${invitationLink}" style="display: inline-block; padding: 14px 32px; background-color: #0f766e; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px;">
                      Activar mi cuenta
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin: 8px 0 0; color: #0f766e; font-size: 14px; word-break: break-all;">
                ${invitationLink}
              </p>
              
              <hr style="margin: 32px 0; border: none; border-top: 1px solid #e4e4e7;">
              
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.6;">
                Este enlace expirará en 7 días. Si no solicitaste esta invitación, puedes ignorar este correo.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #71717a; font-size: 12px;">
                © ${new Date().getFullYear()} Cancagua. Todos los derechos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send invitation:", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("[Email] Error sending invitation:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  userName?: string
): Promise<EmailResult> {
  try {
    const client = getResendClient();
    const baseUrl = ENV.appUrl || "https://cancagua.cl";
    const resetLink = `${baseUrl}/cms/restablecer-contrasena?token=${resetToken}`;

    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: "Restablecer contraseña - Cancagua CMS",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restablecer contraseña</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #0f766e; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Cancagua</h1>
              <p style="margin: 8px 0 0; color: #99f6e4; font-size: 14px;">Sistema de Gestión</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px; font-weight: 600;">Restablecer contraseña</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Hola${userName ? ` ${userName}` : ""},
              </p>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el siguiente botón para crear una nueva contraseña:
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background-color: #0f766e; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px;">
                      Restablecer contraseña
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin: 8px 0 0; color: #0f766e; font-size: 14px; word-break: break-all;">
                ${resetLink}
              </p>
              
              <hr style="margin: 32px 0; border: none; border-top: 1px solid #e4e4e7;">
              
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.6;">
                Este enlace expirará en 1 hora. Si no solicitaste restablecer tu contraseña, puedes ignorar este correo de forma segura.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #71717a; font-size: 12px;">
                © ${new Date().getFullYear()} Cancagua. Todos los derechos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send password reset:", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("[Email] Error sending password reset:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send welcome email after account activation
 */
export async function sendWelcomeEmail(
  to: string,
  userName?: string
): Promise<EmailResult> {
  try {
    const client = getResendClient();
    const baseUrl = ENV.appUrl || "https://cancagua.cl";
    const loginLink = `${baseUrl}/cms/login`;

    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: "¡Bienvenido al CMS de Cancagua!",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #0f766e; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Cancagua</h1>
              <p style="margin: 8px 0 0; color: #99f6e4; font-size: 14px;">Sistema de Gestión</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px; font-weight: 600;">¡Bienvenido${userName ? `, ${userName}` : ""}!</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Tu cuenta ha sido activada exitosamente. Ya puedes acceder al sistema de gestión de Cancagua.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${loginLink}" style="display: inline-block; padding: 14px 32px; background-color: #0f766e; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px;">
                      Iniciar sesión
                    </a>
                  </td>
                </tr>
              </table>
              
              <hr style="margin: 32px 0; border: none; border-top: 1px solid #e4e4e7;">
              
              <p style="margin: 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si tienes alguna pregunta, no dudes en contactarnos.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #71717a; font-size: 12px;">
                © ${new Date().getFullYear()} Cancagua. Todos los derechos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send welcome email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("[Email] Error sending welcome email:", error);
    return { success: false, error: String(error) };
  }
}


/**
 * Send gift card email with PDF attachment
 */
export const GIFT_CARD_CONTACT_EMAIL = "contacto@cancagua.cl";

export function buildGiftCardContactHtml(): string {
  return `Si tienes alguna pregunta, contáctanos en <a href="mailto:${GIFT_CARD_CONTACT_EMAIL}" style="color: #0f766e;">${GIFT_CARD_CONTACT_EMAIL}</a>`;
}

export async function sendGiftCardEmail(params: {
  to: string;
  cc?: string[];
  recipientName: string;
  senderName?: string | null;
  amount: number;
  code: string;
  message?: string | null;
  pdfBuffer: Buffer;
}): Promise<EmailResult> {
  try {
    const client = getResendClient();
    const formattedAmount = new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(params.amount);

    const senderText = params.senderName 
      ? `<strong>${params.senderName}</strong> te ha enviado` 
      : "Has recibido";

    const ccRecipients = Array.from(new Set([
      "contacto@cancagua.cl",
      ...(params.cc || []),
    ].filter((email): email is string => Boolean(email) && email !== params.to)));

    const messageSection = params.message 
      ? `
        <div style="margin: 24px 0; padding: 20px; background-color: #f0fdf4; border-left: 4px solid #0f766e; border-radius: 4px;">
          <p style="margin: 0 0 8px; color: #0f766e; font-size: 12px; font-weight: 600; text-transform: uppercase;">Mensaje personal</p>
          <p style="margin: 0; color: #18181b; font-size: 16px; line-height: 1.6; font-style: italic;">"${params.message}"</p>
        </div>
      ` 
      : "";

    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      cc: ccRecipients,
      subject: `🎁 ¡Has recibido una Gift Card de Cancagua por ${formattedAmount}!`,
      attachments: [
        {
          filename: `giftcard-${params.code}.pdf`,
          content: params.pdfBuffer.toString("base64"),
        },
      ],
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tu Gift Card de Cancagua</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #0f766e; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">🎁 Gift Card</h1>
              <p style="margin: 8px 0 0; color: #99f6e4; font-size: 14px;">Cancagua - Experiencias de Bienestar</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px; font-weight: 600;">¡Hola ${params.recipientName}!</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                ${senderText} una <strong>Gift Card de Cancagua</strong> por un valor de:
              </p>
              
              <!-- Amount Box -->
              <div style="margin: 24px 0; padding: 24px; background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%); border-radius: 12px; text-align: center;">
                <p style="margin: 0; color: #ffffff; font-size: 36px; font-weight: 700;">${formattedAmount}</p>
                <p style="margin: 8px 0 0; color: #99f6e4; font-size: 14px;">Código: <strong>${params.code}</strong></p>
              </div>
              
              ${messageSection}
              
              <p style="margin: 24px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Tu Gift Card está adjunta a este correo en formato PDF. Puedes imprimirla o mostrarla desde tu teléfono al momento de canjearla.
              </p>
              
              <div style="margin: 24px 0; padding: 16px; background-color: #fef3c7; border-radius: 8px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                  <strong>📍 ¿Dónde canjearla?</strong><br>
                  Presenta tu Gift Card en Cancagua para disfrutar de nuestros servicios de spa, hot tubs, masajes y más.
                </p>
              </div>
              
              <hr style="margin: 32px 0; border: none; border-top: 1px solid #e4e4e7;">
              
              <p style="margin: 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                ${buildGiftCardContactHtml()}
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 8px; color: #52525b; font-size: 14px;">
                <a href="https://cancagua.cl" style="color: #0f766e; text-decoration: none;">www.cancagua.cl</a>
              </p>
              <p style="margin: 0; color: #71717a; font-size: 12px;">
                © ${new Date().getFullYear()} Cancagua. Todos los derechos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send gift card email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("[Email] Error sending gift card email:", error);
    return { success: false, error: String(error) };
  }
}

type MassageNoticeEmailParams = {
  to: string;
  subject: string;
  eyebrow: string;
  heading: string;
  intro: string;
  details: { label: string; value?: unknown }[];
  notes?: string | null;
};

async function sendMassageNoticeEmail(params: MassageNoticeEmailParams): Promise<EmailResult> {
  try {
    const client = getResendClient();
    const detailRows = params.details
      .filter((detail) => detail.value !== undefined && detail.value !== null && String(detail.value).trim() !== "")
      .map((detail) => `
                <p style="margin: 0 0 8px; color: #52525b;">${escapeHtml(detail.label)}: <strong>${escapeHtml(detail.value)}</strong></p>
      `)
      .join("");
    const notesLine = params.notes
      ? `<p style="margin: 16px 0 0; color: #52525b;">Notas: ${escapeHtml(params.notes)}</p>`
      : "";

    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(params.eyebrow)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 32px 40px; text-align: center; background-color: #0f766e; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Cancagua Spa</h1>
              <p style="margin: 8px 0 0; color: #ccfbf1; font-size: 14px;">${escapeHtml(params.eyebrow)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">${escapeHtml(params.heading)}</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                ${escapeHtml(params.intro)}
              </p>
              <div style="padding: 20px; background-color: #f0fdfa; border-radius: 8px; border: 1px solid #99f6e4;">
                ${detailRows}
                ${notesLine}
              </div>
              <p style="margin: 24px 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si necesitas ayuda, escríbenos a ${SUPPORT_EMAIL}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send massage notice:", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("[Email] Error sending massage notice:", error);
    return { success: false, error: String(error) };
  }
}

export async function sendMassageBookingReceivedEmail(params: {
  to: string;
  clientName: string;
  techniqueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  duration: number;
}): Promise<EmailResult> {
  return sendMassageNoticeEmail({
    to: params.to,
    subject: "Solicitud de reserva recibida - Cancagua",
    eyebrow: "Solicitud de reserva recibida",
    heading: `Hola ${params.clientName}`,
    intro: "Recibimos tu solicitud de reserva. Te contactaremos pronto para confirmar la disponibilidad final y coordinar el pago.",
    details: [
      { label: "Servicio", value: params.techniqueName },
      { label: "Fecha", value: params.bookingDate },
      { label: "Horario", value: `${params.startTime} - ${params.endTime} hrs` },
      { label: "Duración", value: `${params.duration} min` },
    ],
  });
}

export async function sendMassageInternalBookingNotificationEmail(params: {
  to: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  techniqueName: string;
  therapistName?: string | null;
  bookingDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  notes?: string | null;
}): Promise<EmailResult> {
  return sendMassageNoticeEmail({
    to: params.to,
    subject: `Nueva solicitud de masaje - ${params.clientName}`,
    eyebrow: "Nueva solicitud de masaje",
    heading: "Nueva solicitud de masaje",
    intro: "Se recibió una reserva desde el sitio. El sistema ya asignó terapeuta según técnica, disponibilidad y prioridad.",
    details: [
      { label: "Cliente", value: params.clientName },
      { label: "Email cliente", value: params.clientEmail },
      { label: "Teléfono cliente", value: params.clientPhone },
      { label: "Servicio", value: params.techniqueName },
      { label: "Terapeuta asignado", value: params.therapistName },
      { label: "Fecha", value: params.bookingDate },
      { label: "Horario", value: `${params.startTime} - ${params.endTime} hrs` },
      { label: "Duración", value: `${params.duration} min` },
    ],
    notes: params.notes,
  });
}

export async function sendMassageTherapistBookingRequestEmail(params: {
  to: string;
  therapistName: string;
  clientName: string;
  clientPhone?: string | null;
  techniqueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  notes?: string | null;
}): Promise<EmailResult> {
  return sendMassageNoticeEmail({
    to: params.to,
    subject: "Nueva solicitud de masaje asignada - Cancagua",
    eyebrow: "Nueva solicitud asignada",
    heading: `Hola ${params.therapistName}`,
    intro: "Tienes una solicitud de masaje asignada. Está pendiente de confirmación y pago por parte del equipo.",
    details: [
      { label: "Cliente", value: params.clientName },
      { label: "Teléfono cliente", value: params.clientPhone },
      { label: "Servicio", value: params.techniqueName },
      { label: "Fecha", value: params.bookingDate },
      { label: "Horario", value: `${params.startTime} - ${params.endTime} hrs` },
      { label: "Duración", value: `${params.duration} min` },
    ],
    notes: params.notes,
  });
}

export async function sendMassageBookingConfirmationEmail(params: {
  to: string;
  clientName: string;
  techniqueName: string;
  therapistName?: string;
  bookingDate: string;
  startTime: string;
  duration: number;
  amountPaid?: string;
}): Promise<EmailResult> {
  try {
    const client = getResendClient();
    const formattedAmount = formatClp(params.amountPaid);
    const therapistLine = params.therapistName
      ? `<p style="margin: 0 0 8px; color: #52525b;">Terapeuta: <strong>${escapeHtml(params.therapistName)}</strong></p>`
      : "";
    const amountLine = formattedAmount
      ? `<p style="margin: 0 0 8px; color: #52525b;">Monto pagado: <strong>${formattedAmount}</strong></p>`
      : "";

    const terminosBase64 = getTerminosBase64();
    const attachments = terminosBase64
      ? [{ filename: "Terminos-y-Condiciones-Cancagua.pdf", content: terminosBase64 }]
      : [];

    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: "Reserva de masaje confirmada - Cancagua",
      attachments,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reserva confirmada</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 32px 40px; text-align: center; background-color: #0f766e; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Cancagua Spa</h1>
              <p style="margin: 8px 0 0; color: #ccfbf1; font-size: 14px;">Reserva de masaje confirmada</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Hola ${escapeHtml(params.clientName)}</h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Tu reserva fue confirmada correctamente. Te esperamos en Cancagua.
              </p>
              <div style="padding: 20px; background-color: #f0fdfa; border-radius: 8px; border: 1px solid #99f6e4;">
                <p style="margin: 0 0 8px; color: #52525b;">Servicio: <strong>${escapeHtml(params.techniqueName)}</strong></p>
                ${therapistLine}
                <p style="margin: 0 0 8px; color: #52525b;">Fecha: <strong>${escapeHtml(params.bookingDate)}</strong></p>
                <p style="margin: 0 0 8px; color: #52525b;">Hora: <strong>${escapeHtml(params.startTime)} hrs</strong></p>
                <p style="margin: 0 0 8px; color: #52525b;">Duración: <strong>${params.duration} min</strong></p>
                ${amountLine}
              </div>
              <div style="margin: 24px 0; padding: 20px; background-color: #fefce8; border-radius: 8px; border: 1px solid #fde68a;">
                <p style="margin: 0 0 12px; color: #92400e; font-size: 15px; font-weight: 600;">📋 Antes de tu visita</p>
                <p style="margin: 0 0 12px; color: #78350f; font-size: 14px; line-height: 1.6;">
                  Para que todo fluya sin contratiempos, estas son las condiciones de tu reserva:
                </p>
                <ul style="margin: 0 0 12px; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.8;">
                  <li>Al momento del check-in te solicitaremos tu <strong>cédula de identidad</strong>.</li>
                  <li>Te pedimos llegar <strong>10 minutos antes</strong> de tu hora reservada.</li>
                  <li>Si necesitas acceso para movilidad reducida, contáctanos por teléfono con al menos <strong>24 horas de anticipación</strong>, así preparamos un salón accesible para ti (sujeto a disponibilidad).</li>
                  <li>Contamos con un equipo de masajistas mixto, por lo que tu sesión puede ser realizada tanto por un terapeuta hombre como mujer. Si tienes alguna preferencia o inconveniente con esto, escríbenos al WhatsApp <strong>+56 9 4007 3999</strong> y lo conversamos antes de tu visita.</li>
                </ul>
                <p style="margin: 0 0 8px; color: #92400e; font-size: 14px; font-weight: 600;">Cancelaciones y reagendamientos</p>
                <p style="margin: 0 0 8px; color: #78350f; font-size: 14px; line-height: 1.6;">
                  Entendemos que los planes cambian. Estas son las condiciones según tu tiempo de aviso:
                </p>
                <ul style="margin: 0 0 12px; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.8;">
                  <li><strong>Con 48 horas o más:</strong> puedes cancelar y acceder a reembolso (se descuenta un 0,25% por cobro de transacción Transbank).</li>
                  <li><strong>Con 24 horas de anticipación:</strong> puedes reagendar, sin derecho a reembolso. Máximo 2 veces por reserva.</li>
                  <li><strong>Con menos de 24 horas de aviso:</strong> no es posible acceder a reembolso ni reagendamiento.</li>
                  <li>Si cuentas con una GiftCard o cupón, tienes <strong>3 meses desde la fecha de compra</strong> para hacerlo efectivo.</li>
                </ul>
                <p style="margin: 0; color: #78350f; font-size: 13px; line-height: 1.6;">
                  📄 Te adjuntamos el documento completo de Términos y Condiciones para tu referencia.
                </p>
              </div>
              <p style="margin: 24px 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                Si necesitas modificar tu reserva, contáctanos respondiendo este correo o escribiendo a ${SUPPORT_EMAIL}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send massage booking confirmation:", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("[Email] Error sending massage booking confirmation:", error);
    return { success: false, error: String(error) };
  }
}

export async function sendMassageTherapistNotificationEmail(params: {
  to: string;
  therapistName: string;
  clientName: string;
  clientPhone?: string | null;
  techniqueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  notes?: string | null;
}): Promise<EmailResult> {
  try {
    const client = getResendClient();
    const formattedDate = new Intl.DateTimeFormat("es-CL", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "America/Santiago",
    }).format(new Date(params.bookingDate + "T12:00:00"));

    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: `📅 Nueva reserva confirmada — ${params.techniqueName} · ${formattedDate}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f4f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" style="width:100%;max-width:520px;border-collapse:collapse;background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="padding:28px 36px 20px;background:#0f766e;border-radius:12px 12px 0 0;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Cancagua Spa</h1>
            <p style="margin:4px 0 0;color:#99f6e4;font-size:13px;">Aviso para terapeuta</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 36px;">
            <h2 style="margin:0 0 6px;color:#18181b;font-size:17px;font-weight:600;">Hola ${params.therapistName},</h2>
            <p style="margin:0 0 20px;color:#52525b;font-size:14px;line-height:1.6;">
              Tienes una nueva reserva confirmada. Aquí están los detalles:
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px 22px;margin-bottom:20px;">
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:5px 0;color:#15803d;font-size:12px;font-weight:600;width:110px;">Servicio</td><td style="padding:5px 0;color:#14532d;font-size:13px;font-weight:500;">${params.techniqueName} · ${params.duration} min</td></tr>
                <tr><td style="padding:5px 0;color:#15803d;font-size:12px;font-weight:600;">Cliente</td><td style="padding:5px 0;color:#14532d;font-size:13px;">${params.clientName}</td></tr>
                ${params.clientPhone ? `<tr><td style="padding:5px 0;color:#15803d;font-size:12px;font-weight:600;">Teléfono</td><td style="padding:5px 0;color:#14532d;font-size:13px;">${params.clientPhone}</td></tr>` : ""}
                <tr><td style="padding:5px 0;color:#15803d;font-size:12px;font-weight:600;">Fecha</td><td style="padding:5px 0;color:#14532d;font-size:13px;text-transform:capitalize;">${formattedDate}</td></tr>
                <tr><td style="padding:5px 0;color:#15803d;font-size:12px;font-weight:600;">Horario</td><td style="padding:5px 0;color:#14532d;font-size:13px;font-weight:600;">${params.startTime} – ${params.endTime} hrs</td></tr>
                ${params.notes ? `<tr><td style="padding:5px 0;color:#15803d;font-size:12px;font-weight:600;">Notas</td><td style="padding:5px 0;color:#14532d;font-size:13px;font-style:italic;">${params.notes}</td></tr>` : ""}
              </table>
            </div>
            <p style="margin:0;color:#71717a;font-size:12px;">Si tienes dudas, escríbenos a <a href="mailto:contacto@cancagua.cl" style="color:#0f766e;">contacto@cancagua.cl</a></p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 36px;background:#fafafa;border-radius:0 0 12px 12px;text-align:center;">
            <p style="margin:0;color:#71717a;font-size:11px;">© ${new Date().getFullYear()} Cancagua Spa · Frutillar, Chile</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
      `,
    });

    if (error) {
      console.error("[Email] Failed to send massage therapist notification:", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("[Email] Error sending massage therapist notification:", error);
    return { success: false, error: String(error) };
  }
}

export async function sendFreelanceApprovalRequestEmail(params: {
  to: string;
  managerName?: string;
  clientName: string;
  techniqueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  therapistName: string;
  approveUrl: string;
  rejectUrl: string;
}): Promise<EmailResult> {
  try {
    const client = getResendClient();
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [params.to],
      subject: `Aprobación requerida — Terapeuta freelance asignado`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table role="presentation" style="width:100%;border-collapse:collapse">
    <tr><td align="center" style="padding:40px 0">
      <table role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;background:#fff;border-radius:8px">
        <tr>
          <td style="padding:32px 40px;text-align:center;background:#0f766e;border-radius:8px 8px 0 0">
            <h1 style="margin:0;color:#fff;font-size:24px;font-weight:600">Cancagua Spa</h1>
            <p style="margin:8px 0 0;color:#ccfbf1;font-size:14px">Aprobación de terapeuta freelance</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px">
            <h2 style="margin:0 0 16px;color:#18181b;font-size:20px">Hola ${escapeHtml(params.managerName ?? "Tamara")}</h2>
            <p style="margin:0 0 24px;color:#52525b;font-size:16px;line-height:1.6">
              Se asignó un terapeuta <strong>FREELANCE</strong> a una reserva confirmada y requiere tu aprobación antes de notificarle.
            </p>
            <div style="padding:20px;background:#f0fdfa;border-radius:8px;border:1px solid #99f6e4;margin-bottom:24px">
              <p style="margin:0 0 8px;color:#52525b">Cliente: <strong>${escapeHtml(params.clientName)}</strong></p>
              <p style="margin:0 0 8px;color:#52525b">Servicio: <strong>${escapeHtml(params.techniqueName)} · ${params.duration} min</strong></p>
              <p style="margin:0 0 8px;color:#52525b">Fecha: <strong>${escapeHtml(params.bookingDate)}</strong></p>
              <p style="margin:0 0 8px;color:#52525b">Horario: <strong>${escapeHtml(params.startTime)} – ${escapeHtml(params.endTime)} hrs</strong></p>
              <p style="margin:0;color:#52525b">Terapeuta propuesto: <strong>${escapeHtml(params.therapistName)}</strong></p>
            </div>
            <p style="margin:0 0 20px;color:#52525b;font-size:15px">¿Apruebas esta asignación?</p>
            <table role="presentation" style="width:100%;border-collapse:collapse">
              <tr>
                <td style="padding-right:8px">
                  <a href="${params.approveUrl}" style="display:block;text-align:center;padding:14px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">
                    ✅ Sí, aprobar
                  </a>
                </td>
                <td style="padding-left:8px">
                  <a href="${params.rejectUrl}" style="display:block;text-align:center;padding:14px;background:#ef4444;color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">
                    ❌ No, rechazar
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    if (error) {
      console.error("[Email] Failed to send freelance approval email:", error);
      return { success: false, error: error.message };
    }
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("[Email] Error sending freelance approval email:", error);
    return { success: false, error: String(error) };
  }
}
