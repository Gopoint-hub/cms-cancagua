/**
 * Email service using Resend for sending invitations and password reset emails
 * All emails are sent from @cancagua.cl domain
 */
import { Resend } from "resend";
import { ENV } from "./env";

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

const FROM_EMAIL = "Cancagua <noreply@cancagua.cl>";
const SUPPORT_EMAIL = "soporte@cancagua.cl";

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
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
                Si tienes alguna pregunta, contáctanos en <a href="mailto:eventos@cancagua.cl" style="color: #0f766e;">eventos@cancagua.cl</a>
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
