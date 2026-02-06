import { Resend } from 'resend';

// Inicializar Resend con API key del entorno
const resend = new Resend(process.env.RESEND_API_KEY);

// Configuración del remitente base
const BASE_EMAIL = 'info@cancagua.cl';
const DEFAULT_FROM_NAME = 'Cancagua';

// Nombres de remitente predefinidos por tipo de email
export const EMAIL_SENDER_NAMES = {
  newsletter: 'Cancagua',
  quote: 'Cotización Cancagua',
  notification: 'Cancagua Spa',
  general: 'Cancagua',
} as const;

export type EmailSenderType = keyof typeof EMAIL_SENDER_NAMES;

/**
 * Genera el formato de remitente "Nombre <email>"
 */
export function formatSender(name: string, email: string = BASE_EMAIL): string {
  return `${name} <${email}>`;
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  senderName?: string; // Nombre personalizado del remitente
  senderType?: EmailSenderType; // Tipo de email para usar nombre predefinido
}

interface SendBulkEmailOptions {
  emails: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }[];
  tags?: { name: string; value: string }[];
  senderName?: string; // Nombre personalizado del remitente
  senderType?: EmailSenderType; // Tipo de email para usar nombre predefinido
  replyTo?: string; // Email de respuesta (por defecto: contacto@cancagua.cl)
}

// Email de respuesta por defecto para newsletters
const DEFAULT_REPLY_TO = 'contacto@cancagua.cl';

/**
 * Envía un email individual
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY no configurada. Email no enviado.');
      return { success: false, error: 'API key no configurada' };
    }

    // Determinar el nombre del remitente
    let senderName = DEFAULT_FROM_NAME;
    if (options.senderName) {
      senderName = options.senderName;
    } else if (options.senderType) {
      senderName = EMAIL_SENDER_NAMES[options.senderType];
    }
    const fromEmail = formatSender(senderName);

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      tags: options.tags,
    });

    if (error) {
      console.error('Error enviando email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (error: any) {
    console.error('Error enviando email:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Envía emails en lote (batch)
 * Resend permite hasta 100 emails por batch
 */
export async function sendBulkEmails(options: SendBulkEmailOptions): Promise<{ 
  success: boolean; 
  sent: number; 
  failed: number; 
  errors: string[] 
}> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY no configurada. Emails no enviados.');
      return { success: false, sent: 0, failed: options.emails.length, errors: ['API key no configurada'] };
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Dividir en batches de 100 (límite de Resend)
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < options.emails.length; i += batchSize) {
      batches.push(options.emails.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      // Determinar el nombre del remitente para el batch
      let senderName = DEFAULT_FROM_NAME;
      if (options.senderName) {
        senderName = options.senderName;
      } else if (options.senderType) {
        senderName = EMAIL_SENDER_NAMES[options.senderType];
      }
      const fromEmail = formatSender(senderName);

      // Enviar batch usando la API de batch de Resend
      const batchEmails = batch.map(email => ({
        from: fromEmail,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: options.replyTo || DEFAULT_REPLY_TO,
        tags: options.tags,
      }));

      try {
        const { data, error } = await resend.batch.send(batchEmails);
        
        if (error) {
          results.failed += batch.length;
          results.errors.push(error.message);
        } else {
          results.sent += batch.length;
        }
      } catch (batchError: any) {
        results.failed += batch.length;
        results.errors.push(batchError.message || 'Error en batch');
      }

      // Pequeña pausa entre batches para evitar rate limiting
      if (batches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      success: results.failed === 0,
      sent: results.sent,
      failed: results.failed,
      errors: results.errors,
    };
  } catch (error: any) {
    console.error('Error enviando emails en batch:', error);
    return { 
      success: false, 
      sent: 0, 
      failed: options.emails.length, 
      errors: [error.message || 'Error desconocido'] 
    };
  }
}

/**
 * Envía un email de prueba
 */
export async function sendTestEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to,
    subject: `[TEST] ${subject}`,
    html,
    tags: [{ name: 'type', value: 'test' }],
  });
}

/**
 * Genera el HTML base para un email de newsletter
 */
export function generateNewsletterWrapper(content: string, unsubscribeUrl?: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Newsletter de Cancagua</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f5f5f5;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .email-header {
      background-color: #44580E;
      padding: 24px;
      text-align: center;
    }
    .email-header img {
      max-width: 180px;
      height: auto;
    }
    .email-header h1 {
      color: #ffffff;
      margin: 16px 0 0 0;
      font-size: 24px;
    }
    .email-content {
      padding: 32px 24px;
    }
    .email-footer {
      background-color: #f5f5f5;
      padding: 24px;
      text-align: center;
      font-size: 12px;
      color: #666666;
    }
    .email-footer a {
      color: #44580E;
      text-decoration: none;
    }
    .unsubscribe {
      margin-top: 16px;
    }
    @media only screen and (max-width: 600px) {
      .email-content {
        padding: 24px 16px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <img src="https://res.cloudinary.com/dhuln9b1n/image/upload/v1769960664/cancagua/images/logo-cancagua-white.webp" alt="Cancagua" style="max-width: 200px; height: auto;" />
    </div>
    <div class="email-content">
      ${content}
    </div>
    <div class="email-footer">
      <p>
        Cancagua Spa & Retreat Center<br>
        Puerto Varas, Chile
      </p>
      <p>
        <a href="https://cancagua.cl">Visitar sitio web</a> | 
        <a href="mailto:contacto@cancagua.cl">Contacto</a>
      </p>
      ${unsubscribeUrl ? `
      <p class="unsubscribe">
        <a href="${unsubscribeUrl}">Darse de baja de este newsletter</a>
      </p>
      ` : ''}
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Configuración específica para cotizaciones B2B
 */
const QUOTE_FROM_EMAIL = 'Cotización Cancagua <cotizacion@cancagua.cl>';
const QUOTE_CC_EMAIL = 'eventos@cancagua.cl';

interface SendQuoteEmailOptions {
  to: string;
  clientName: string;
  quoteNumber: string;
  pdfBuffer: Buffer;
  customMessage?: string;
}

/**
 * Envía una cotización por email con PDF adjunto
 * Remitente: cotizacion@cancagua.cl
 * Copia: eventos@cancagua.cl
 */
export async function sendQuoteEmail(options: SendQuoteEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY no configurada. Email no enviado.');
      return { success: false, error: 'API key no configurada' };
    }

    const htmlContent = generateQuoteEmailHtml(options.clientName, options.quoteNumber, options.customMessage);
    const textContent = `Estimado/a ${options.clientName},\n\nAdjunto encontrará la cotización ${options.quoteNumber} de Cancagua Spa & Retreat Center.\n\n${options.customMessage || 'Quedamos atentos a sus consultas.'}\n\nSaludos cordiales,\nEquipo Cancagua Eventos\ncotizacion@cancagua.cl\n+56 9 1234 5678`;

    const { data, error } = await resend.emails.send({
      from: QUOTE_FROM_EMAIL,
      to: [options.to],
      cc: [QUOTE_CC_EMAIL],
      subject: `Cotización ${options.quoteNumber} - Cancagua Spa & Retreat`,
      html: htmlContent,
      text: textContent,
      replyTo: 'eventos@cancagua.cl',
      attachments: [
        {
          filename: `Cotizacion_${options.quoteNumber}.pdf`,
          content: options.pdfBuffer,
        },
      ],
      tags: [{ name: 'type', value: 'quote' }],
    });

    if (error) {
      console.error('Error enviando cotización:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (error: any) {
    console.error('Error enviando cotización:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

/**
 * Genera el HTML para el email de cotización
 */
function generateQuoteEmailHtml(clientName: string, quoteNumber: string, customMessage?: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cotización ${quoteNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F1E7D9;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #3a3a3a; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-family: 'Josefin Sans', Arial, sans-serif; font-size: 28px; font-weight: 300; letter-spacing: 4px; color: #D3BC8D;">CANCAGUA</h1>
              <p style="margin: 8px 0 0 0; font-family: 'Georgia', serif; font-size: 12px; font-style: italic; color: #AAAAAA;">Spa & Retreat Center</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; font-family: 'Josefin Sans', Arial, sans-serif; font-size: 24px; font-weight: 400; color: #3a3a3a;">Cotización ${quoteNumber}</h2>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">Estimado/a <strong>${clientName}</strong>,</p>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">Es un placer hacerle llegar la cotización solicitada para su evento en Cancagua Spa & Retreat Center. Encontrará el documento adjunto en formato PDF.</p>
              
              ${customMessage ? `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">${customMessage}</p>` : ''}
              
              <div style="background-color: #F1E7D9; padding: 20px; border-radius: 8px; margin: 30px 0;">
                <p style="margin: 0; font-size: 14px; color: #4a4a4a;">
                  <strong>Documento adjunto:</strong> Cotizacion_${quoteNumber}.pdf
                </p>
              </div>
              
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">Quedamos atentos a sus consultas y comentarios. Será un placer atenderle.</p>
              
              <p style="margin: 30px 0 0 0; font-size: 16px; color: #4a4a4a;">
                Saludos cordiales,<br>
                <strong style="color: #D3BC8D;">Equipo Cancagua Eventos</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #3a3a3a; padding: 30px; text-align: center;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #AAAAAA;">Cancagua Spa & Retreat Center</p>
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #AAAAAA;">Frutillar, Región de Los Lagos, Chile</p>
              <p style="margin: 0 0 20px 0; font-size: 14px;">
                <a href="mailto:eventos@cancagua.cl" style="color: #D3BC8D; text-decoration: none;">eventos@cancagua.cl</a> | 
                <a href="tel:+56912345678" style="color: #D3BC8D; text-decoration: none;">+56 9 1234 5678</a>
              </p>
              <p style="margin: 0; font-size: 12px;">
                <a href="https://www.instagram.com/cancaguachile/" style="color: #AAAAAA; text-decoration: none; margin: 0 10px;">Instagram</a>
                <a href="https://www.facebook.com/Cancaguachile-100421855205587" style="color: #AAAAAA; text-decoration: none; margin: 0 10px;">Facebook</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Genera texto plano a partir de HTML
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}


/**
 * Configuración para formularios de contacto
 */
const CONTACT_TO_EMAIL = 'contacto@cancagua.cl';

interface ContactFormData {
  nombre: string;
  email: string;
  telefono: string;
  mensaje: string;
  origen?: string;
}

/**
 * Envía un email con los datos del formulario de contacto
 */
export async function sendContactFormEmail(data: ContactFormData): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY no configurada. Email no enviado.');
      return { success: false, error: 'API key no configurada' };
    }

    const fecha = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
    
    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuevo mensaje de contacto</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F1E7D9;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #44580E; padding: 24px; text-align: center;">
              <h1 style="margin: 0; font-family: Arial, sans-serif; font-size: 20px; font-weight: 600; color: #ffffff;">📬 Nuevo Mensaje de Contacto</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; font-size: 14px; color: #666666;">
                <strong>Fecha:</strong> ${fecha}<br>
                <strong>Origen:</strong> ${data.origen || 'Sitio web'}
              </p>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="margin: 0 0 15px 0; font-size: 16px; color: #44580E;">Datos del Contacto</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; font-size: 14px; color: #666666; width: 100px;"><strong>Nombre:</strong></td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; font-size: 14px; color: #333333;">${data.nombre}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; font-size: 14px; color: #666666;"><strong>Email:</strong></td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; font-size: 14px; color: #333333;">
                      <a href="mailto:${data.email}" style="color: #44580E; text-decoration: none;">${data.email}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #666666;"><strong>Teléfono:</strong></td>
                    <td style="padding: 8px 0; font-size: 14px; color: #333333;">
                      <a href="tel:${data.telefono}" style="color: #44580E; text-decoration: none;">${data.telefono}</a>
                    </td>
                  </tr>
                </table>
              </div>
              
              <div style="background-color: #fff8e1; padding: 20px; border-radius: 8px; border-left: 4px solid #D3BC8D;">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #44580E;">Mensaje:</h3>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #333333; white-space: pre-wrap;">${data.mensaje}</p>
              </div>
              
              <div style="margin-top: 20px; padding: 15px; background-color: #e8f5e9; border-radius: 8px;">
                <p style="margin: 0; font-size: 13px; color: #2e7d32;">
                  <strong>Acciones rápidas:</strong><br>
                  <a href="mailto:${data.email}?subject=Re: Consulta desde cancagua.cl" style="color: #2e7d32;">Responder por email</a> | 
                  <a href="https://wa.me/${data.telefono.replace(/[^0-9]/g, '')}" style="color: #2e7d32;">Contactar por WhatsApp</a>
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f5f5; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999999;">
                Este mensaje fue enviado desde el formulario de contacto de cancagua.cl
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const textContent = `Nuevo mensaje de contacto

Fecha: ${fecha}
Origen: ${data.origen || 'Sitio web'}

DATOS DEL CONTACTO
------------------
Nombre: ${data.nombre}
Email: ${data.email}
Teléfono: ${data.telefono}

MENSAJE
-------
${data.mensaje}

---
Este mensaje fue enviado desde el formulario de contacto de cancagua.cl`;

    const { data: emailData, error } = await resend.emails.send({
      from: formatSender('Formulario Cancagua'),
      to: [CONTACT_TO_EMAIL],
      subject: `📬 Nuevo mensaje de ${data.nombre} - Formulario de Contacto`,
      html: htmlContent,
      text: textContent,
      replyTo: CONTACT_TO_EMAIL, // Responder a contacto@cancagua.cl, no al usuario
      tags: [{ name: 'type', value: 'contact_form' }],
    });

    if (error) {
      console.error('Error enviando formulario de contacto:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: emailData?.id };
  } catch (error: any) {
    console.error('Error enviando formulario de contacto:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}
