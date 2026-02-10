/**
 * Emails del Módulo Concierge
 * Templates y funciones para enviar emails de pagos, confirmaciones y notificaciones
 * Diseño estilo Cancagua: fondo crema, header oscuro con logo dorado, tipografía elegante
 */
import { sendEmail } from "./email";

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "contacto@cancagua.cl";
const LOGO_WHITE_URL = "https://res.cloudinary.com/dhuln9b1n/image/upload/v1769960664/cancagua/images/logo-cancagua-white.webp";

// ============================================
// SHARED EMAIL WRAPPER (Cancagua Style)
// ============================================

function cancaguaEmailWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cancagua</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Georgia', 'Times New Roman', serif; background-color: #F1E7D9;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: #3a3a3a; padding: 30px; text-align: center;">
              <img src="${LOGO_WHITE_URL}" alt="Cancagua" style="max-width: 180px; height: auto;" />
              <p style="margin: 8px 0 0 0; font-family: 'Georgia', serif; font-size: 12px; font-style: italic; color: #AAAAAA;">Spa & Retreat Center</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #3a3a3a; padding: 30px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-family: 'Georgia', serif; font-size: 14px; color: #D3BC8D; letter-spacing: 1px;">Cancagua Spa & Retreat Center</p>
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #AAAAAA;">Frutillar, Región de Los Lagos, Chile</p>
              <p style="margin: 0 0 16px 0; font-size: 13px;">
                <a href="https://cancagua.cl" style="color: #D3BC8D; text-decoration: none;">cancagua.cl</a>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <a href="mailto:${CONTACT_EMAIL}" style="color: #D3BC8D; text-decoration: none;">${CONTACT_EMAIL}</a>
              </p>
              <p style="margin: 0; font-size: 12px;">
                <a href="https://www.instagram.com/cancaguachile/" style="color: #888; text-decoration: none; margin: 0 8px;">Instagram</a>
                <a href="https://www.facebook.com/Cancaguachile-100421855205587" style="color: #888; text-decoration: none; margin: 0 8px;">Facebook</a>
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

// ============================================
// HELPER: Formatear moneda CLP
// ============================================
function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(amount);
}

// ============================================
// HELPER: Generar filas de desglose
// ============================================
function buildItemRows(items: { label: string; quantity: number; unitPrice: number; subtotal: number }[]): string {
  return items.map((item, i) => {
    const bg = i % 2 === 0 ? "#FAF7F2" : "#ffffff";
    return `
      <tr>
        <td style="padding: 12px 16px; background-color: ${bg}; font-size: 14px; color: #4a4a4a; border-bottom: 1px solid #EDE8E0;">
          ${item.label}
        </td>
        <td style="padding: 12px 16px; background-color: ${bg}; font-size: 14px; color: #4a4a4a; text-align: center; border-bottom: 1px solid #EDE8E0;">
          ${item.quantity}
        </td>
        <td style="padding: 12px 16px; background-color: ${bg}; font-size: 14px; color: #4a4a4a; text-align: right; border-bottom: 1px solid #EDE8E0;">
          ${formatCLP(item.unitPrice)}
        </td>
        <td style="padding: 12px 16px; background-color: ${bg}; font-size: 14px; color: #3a3a3a; text-align: right; font-weight: bold; border-bottom: 1px solid #EDE8E0;">
          ${formatCLP(item.subtotal)}
        </td>
      </tr>
    `;
  }).join("");
}

// ============================================
// TEMPLATES HTML
// ============================================

function paymentLinkEmailHtml(data: {
  customerName: string;
  serviceName: string;
  amount: number;
  paymentUrl: string;
  sellerName: string;
  items?: { label: string; quantity: number; unitPrice: number; subtotal: number }[];
}): string {
  const hasItems = data.items && data.items.length > 0;

  const itemsTable = hasItems ? `
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Tipo</td>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Cant.</td>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: right;">Precio</td>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: right;">Subtotal</td>
      </tr>
      ${buildItemRows(data.items!)}
    </table>
  ` : "";

  return `
    <p style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #D3BC8D;">Enlace de Pago</p>
    <h2 style="margin: 0 0 24px 0; font-family: 'Georgia', serif; font-size: 22px; font-weight: normal; color: #3a3a3a;">${data.serviceName}</h2>
    
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      Hola <strong>${data.customerName}</strong>,
    </p>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      ${data.sellerName} de Cancagua te ha generado un enlace de pago por el siguiente servicio:
    </p>

    <!-- Servicio Card -->
    <div style="background-color: #FAF7F2; border-radius: 8px; padding: 24px; margin: 0 0 24px 0; border-left: 4px solid #D3BC8D;">
      <p style="margin: 0 0 4px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #999;">Servicio</p>
      <p style="margin: 0; font-size: 17px; font-weight: bold; color: #3a3a3a;">${data.serviceName}</p>
    </div>

    ${itemsTable}

    <!-- Total -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 32px 0;">
      <tr>
        <td style="padding: 16px 20px; background-color: #3a3a3a; border-radius: 8px;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="font-size: 14px; color: #AAAAAA; text-transform: uppercase; letter-spacing: 1px;">Total a pagar</td>
              <td style="text-align: right; font-size: 28px; font-weight: bold; color: #D3BC8D; font-family: 'Georgia', serif;">${formatCLP(data.amount)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 0 0 32px 0;">
      <a href="${data.paymentUrl}" 
         style="display: inline-block; background-color: #D3BC8D; color: #3a3a3a; 
                padding: 16px 48px; text-decoration: none; border-radius: 6px; 
                font-size: 16px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">
        Pagar Ahora
      </a>
    </div>

    <p style="font-size: 12px; color: #999; text-align: center;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
      <a href="${data.paymentUrl}" style="color: #D3BC8D; word-break: break-all;">${data.paymentUrl}</a>
    </p>
    <p style="font-size: 12px; color: #999; margin-top: 24px; text-align: center;">
      Este enlace de pago es válido por un tiempo limitado. Si tienes alguna duda, 
      contacta a tu vendedor o escríbenos a <a href="mailto:${CONTACT_EMAIL}" style="color: #D3BC8D;">${CONTACT_EMAIL}</a>.
    </p>
  `;
}

function paymentSuccessCustomerHtml(data: {
  customerName: string;
  serviceName: string;
  amount: number;
  saleReference: string;
  items?: { label: string; quantity: number; unitPrice: number; subtotal: number }[];
}): string {
  const hasItems = data.items && data.items.length > 0;

  const itemsTable = hasItems ? `
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Tipo</td>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Cant.</td>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: right;">Precio</td>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: right;">Subtotal</td>
      </tr>
      ${buildItemRows(data.items!)}
    </table>
  ` : "";

  return `
    <!-- Success Icon -->
    <div style="text-align: center; margin: 0 0 24px 0;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #E8F5E9; border-radius: 50%; line-height: 64px; font-size: 32px;">
        ✓
      </div>
    </div>

    <p style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #4CAF50; text-align: center;">Pago Confirmado</p>
    <h2 style="margin: 0 0 24px 0; font-family: 'Georgia', serif; font-size: 22px; font-weight: normal; color: #3a3a3a; text-align: center;">${data.serviceName}</h2>
    
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      Hola <strong>${data.customerName}</strong>,
    </p>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      Tu pago ha sido procesado exitosamente. Aquí tienes los detalles:
    </p>

    ${itemsTable}

    <!-- Details Card -->
    <div style="background-color: #FAF7F2; border-radius: 8px; padding: 24px; margin: 0 0 24px 0;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999;">Servicio</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; font-weight: bold;">${data.serviceName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Monto pagado</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; font-weight: bold; border-top: 1px solid #EDE8E0;">${formatCLP(data.amount)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Referencia</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; font-weight: bold; border-top: 1px solid #EDE8E0;">${data.saleReference}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      Nuestro equipo se pondrá en contacto contigo para coordinar tu reserva.
    </p>
    <p style="font-size: 12px; color: #999; margin-top: 24px; text-align: center;">
      Si tienes alguna consulta, escríbenos a 
      <a href="mailto:${CONTACT_EMAIL}" style="color: #D3BC8D;">${CONTACT_EMAIL}</a>.
    </p>
  `;
}

function paymentSuccessSellerHtml(data: {
  sellerName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  amount: number;
  commissionAmount: number;
  saleReference: string;
  items?: { label: string; quantity: number; unitPrice: number; subtotal: number }[];
}): string {
  const hasItems = data.items && data.items.length > 0;

  const itemsTable = hasItems ? `
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Tipo</td>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Cant.</td>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: right;">Subtotal</td>
      </tr>
      ${data.items!.map((item, i) => {
        const bg = i % 2 === 0 ? "#FAF7F2" : "#ffffff";
        return `
          <tr>
            <td style="padding: 12px 16px; background-color: ${bg}; font-size: 14px; color: #4a4a4a; border-bottom: 1px solid #EDE8E0;">${item.label}</td>
            <td style="padding: 12px 16px; background-color: ${bg}; font-size: 14px; color: #4a4a4a; text-align: center; border-bottom: 1px solid #EDE8E0;">${item.quantity}</td>
            <td style="padding: 12px 16px; background-color: ${bg}; font-size: 14px; color: #3a3a3a; text-align: right; font-weight: bold; border-bottom: 1px solid #EDE8E0;">${formatCLP(item.subtotal)}</td>
          </tr>
        `;
      }).join("")}
    </table>
  ` : "";

  return `
    <p style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #4CAF50;">Venta Confirmada</p>
    <h2 style="margin: 0 0 24px 0; font-family: 'Georgia', serif; font-size: 22px; font-weight: normal; color: #3a3a3a;">¡Felicidades, ${data.sellerName}!</h2>
    
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      Se ha confirmado el pago de una venta que generaste:
    </p>

    <!-- Client Info -->
    <div style="background-color: #FAF7F2; border-radius: 8px; padding: 20px; margin: 0 0 20px 0; border-left: 4px solid #D3BC8D;">
      <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #999;">Cliente</p>
      <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: bold; color: #3a3a3a;">${data.customerName}</p>
      <p style="margin: 0; font-size: 13px; color: #666;">${data.customerEmail} ${data.customerPhone ? `· ${data.customerPhone}` : ""}</p>
    </div>

    ${itemsTable}

    <!-- Sale Details -->
    <div style="background-color: #FAF7F2; border-radius: 8px; padding: 20px; margin: 0 0 20px 0;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999;">Servicio</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right;">${data.serviceName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Monto total</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; font-weight: bold; border-top: 1px solid #EDE8E0;">${formatCLP(data.amount)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Referencia</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; border-top: 1px solid #EDE8E0;">${data.saleReference}</td>
        </tr>
      </table>
    </div>

    <!-- Commission Highlight -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 24px 0;">
      <tr>
        <td style="padding: 16px 20px; background-color: #3a3a3a; border-radius: 8px;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="font-size: 14px; color: #AAAAAA; text-transform: uppercase; letter-spacing: 1px;">Tu comisión</td>
              <td style="text-align: right; font-size: 24px; font-weight: bold; color: #D3BC8D; font-family: 'Georgia', serif;">${formatCLP(data.commissionAmount)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function paymentFailedCustomerHtml(data: {
  customerName: string;
  serviceName: string;
  amount: number;
}): string {
  return `
    <!-- Error Icon -->
    <div style="text-align: center; margin: 0 0 24px 0;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #FFEBEE; border-radius: 50%; line-height: 64px; font-size: 32px;">
        ✕
      </div>
    </div>

    <p style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #c53030; text-align: center;">Pago No Procesado</p>
    <h2 style="margin: 0 0 24px 0; font-family: 'Georgia', serif; font-size: 22px; font-weight: normal; color: #3a3a3a; text-align: center;">${data.serviceName}</h2>
    
    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      Hola <strong>${data.customerName}</strong>,
    </p>
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      Lamentablemente tu pago no pudo ser procesado.
    </p>

    <div style="background-color: #FAF7F2; border-radius: 8px; padding: 24px; margin: 0 0 24px 0;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999;">Servicio</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right;">${data.serviceName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Monto</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; font-weight: bold; border-top: 1px solid #EDE8E0;">${formatCLP(data.amount)}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      Si deseas intentar nuevamente, contacta a tu vendedor para que te genere un nuevo enlace de pago.
    </p>
    <p style="font-size: 12px; color: #999; margin-top: 24px; text-align: center;">
      Si tienes alguna consulta, escríbenos a 
      <a href="mailto:${CONTACT_EMAIL}" style="color: #D3BC8D;">${CONTACT_EMAIL}</a>.
    </p>
  `;
}

function paymentFailedSellerHtml(data: {
  sellerName: string;
  customerName: string;
  serviceName: string;
  amount: number;
  saleReference: string;
}): string {
  return `
    <p style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #c53030;">Pago Fallido</p>
    <h2 style="margin: 0 0 24px 0; font-family: 'Georgia', serif; font-size: 22px; font-weight: normal; color: #3a3a3a;">Atención, ${data.sellerName}</h2>
    
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      El pago de una venta que generaste no fue procesado exitosamente:
    </p>

    <div style="background-color: #FAF7F2; border-radius: 8px; padding: 24px; margin: 0 0 24px 0;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999;">Cliente</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right;">${data.customerName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Servicio</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; border-top: 1px solid #EDE8E0;">${data.serviceName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Monto</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; font-weight: bold; border-top: 1px solid #EDE8E0;">${formatCLP(data.amount)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Referencia</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; border-top: 1px solid #EDE8E0;">${data.saleReference}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      Puedes generar un nuevo enlace de pago desde el módulo Concierge si el cliente desea intentar nuevamente.
    </p>
  `;
}

function newReservationNotificationHtml(data: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  amount: number;
  saleReference: string;
  sellerName: string;
  sellerCode: string;
  items?: { label: string; quantity: number; unitPrice: number; subtotal: number }[];
}): string {
  const hasItems = data.items && data.items.length > 0;

  const itemsTable = hasItems ? `
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Tipo</td>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Cant.</td>
        <td style="padding: 10px 16px; background-color: #3a3a3a; color: #D3BC8D; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: right;">Subtotal</td>
      </tr>
      ${data.items!.map((item, i) => {
        const bg = i % 2 === 0 ? "#FAF7F2" : "#ffffff";
        return `
          <tr>
            <td style="padding: 12px 16px; background-color: ${bg}; font-size: 14px; color: #4a4a4a; border-bottom: 1px solid #EDE8E0;">${item.label}</td>
            <td style="padding: 12px 16px; background-color: ${bg}; font-size: 14px; color: #4a4a4a; text-align: center; border-bottom: 1px solid #EDE8E0;">${item.quantity}</td>
            <td style="padding: 12px 16px; background-color: ${bg}; font-size: 14px; color: #3a3a3a; text-align: right; font-weight: bold; border-bottom: 1px solid #EDE8E0;">${formatCLP(item.subtotal)}</td>
          </tr>
        `;
      }).join("")}
    </table>
  ` : "";

  return `
    <p style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: #D3BC8D;">Nueva Venta Concierge</p>
    <h2 style="margin: 0 0 24px 0; font-family: 'Georgia', serif; font-size: 22px; font-weight: normal; color: #3a3a3a;">Gestionar Reserva</h2>
    
    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4a4a4a;">
      Se ha confirmado una nueva venta del módulo Concierge. Por favor, gestionar la reserva del cliente.
    </p>

    <!-- Client Info -->
    <div style="background-color: #FAF7F2; border-radius: 8px; padding: 20px; margin: 0 0 20px 0; border-left: 4px solid #D3BC8D;">
      <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #999;">Datos del Cliente</p>
      <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: bold; color: #3a3a3a;">${data.customerName}</p>
      <p style="margin: 0 0 2px 0; font-size: 13px; color: #666;">
        <a href="mailto:${data.customerEmail}" style="color: #D3BC8D; text-decoration: none;">${data.customerEmail}</a>
      </p>
      <p style="margin: 0; font-size: 13px; color: #666;">${data.customerPhone || "Teléfono no proporcionado"}</p>
    </div>

    ${itemsTable}

    <!-- Sale Details -->
    <div style="background-color: #FAF7F2; border-radius: 8px; padding: 20px; margin: 0 0 20px 0;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999;">Servicio</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right;">${data.serviceName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Monto pagado</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; font-weight: bold; border-top: 1px solid #EDE8E0;">${formatCLP(data.amount)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Referencia</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; border-top: 1px solid #EDE8E0;">${data.saleReference}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 14px; color: #999; border-top: 1px solid #EDE8E0;">Vendedor</td>
          <td style="padding: 8px 0; font-size: 14px; color: #3a3a3a; text-align: right; border-top: 1px solid #EDE8E0;">${data.sellerName} (${data.sellerCode})</td>
        </tr>
      </table>
    </div>
  `;
}

// ============================================
// FUNCIONES DE ENVÍO
// ============================================

/** Enviar link de pago al cliente */
export async function sendPaymentLinkEmail(data: {
  customerName: string;
  customerEmail: string;
  serviceName: string;
  amount: number;
  paymentUrl: string;
  sellerName: string;
  items?: { label: string; quantity: number; unitPrice: number; subtotal: number }[];
}) {
  const html = cancaguaEmailWrapper(paymentLinkEmailHtml(data));
  return await sendEmail({
    to: data.customerEmail,
    subject: `Cancagua - Enlace de Pago por ${data.serviceName}`,
    html,
    senderType: "notification",
  });
}

/** Enviar confirmación de pago exitoso al cliente */
export async function sendPaymentSuccessToCustomer(data: {
  customerName: string;
  customerEmail: string;
  serviceName: string;
  amount: number;
  saleReference: string;
  items?: { label: string; quantity: number; unitPrice: number; subtotal: number }[];
}) {
  const html = cancaguaEmailWrapper(paymentSuccessCustomerHtml(data));
  return await sendEmail({
    to: data.customerEmail,
    subject: `Cancagua - Pago Confirmado - ${data.serviceName}`,
    html,
    senderType: "notification",
  });
}

/** Enviar confirmación de venta al vendedor */
export async function sendPaymentSuccessToSeller(data: {
  sellerName: string;
  sellerEmail: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  amount: number;
  commissionAmount: number;
  saleReference: string;
  items?: { label: string; quantity: number; unitPrice: number; subtotal: number }[];
}) {
  const html = cancaguaEmailWrapper(paymentSuccessSellerHtml(data));
  return await sendEmail({
    to: data.sellerEmail,
    subject: `Cancagua - Venta Confirmada - ${data.saleReference}`,
    html,
    senderType: "notification",
  });
}

/** Enviar notificación de nueva reserva a contacto@cancagua.cl */
export async function sendReservationNotification(data: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  amount: number;
  saleReference: string;
  sellerName: string;
  sellerCode: string;
  items?: { label: string; quantity: number; unitPrice: number; subtotal: number }[];
}) {
  const html = cancaguaEmailWrapper(newReservationNotificationHtml(data));
  return await sendEmail({
    to: CONTACT_EMAIL,
    subject: `Nueva Venta Concierge - ${data.customerName} - ${data.serviceName}`,
    html,
    senderType: "notification",
    replyTo: data.customerEmail,
  });
}

/** Enviar notificación de pago fallido al cliente */
export async function sendPaymentFailedToCustomer(data: {
  customerName: string;
  customerEmail: string;
  serviceName: string;
  amount: number;
}) {
  const html = cancaguaEmailWrapper(paymentFailedCustomerHtml(data));
  return await sendEmail({
    to: data.customerEmail,
    subject: `Cancagua - Pago No Procesado`,
    html,
    senderType: "notification",
  });
}

/** Enviar notificación de pago fallido al vendedor */
export async function sendPaymentFailedToSeller(data: {
  sellerName: string;
  sellerEmail: string;
  customerName: string;
  serviceName: string;
  amount: number;
  saleReference: string;
}) {
  const html = cancaguaEmailWrapper(paymentFailedSellerHtml(data));
  return await sendEmail({
    to: data.sellerEmail,
    subject: `Cancagua - Pago Fallido - ${data.saleReference}`,
    html,
    senderType: "notification",
  });
}
