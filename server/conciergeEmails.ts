/**
 * Emails del Módulo Concierge
 * Templates y funciones para enviar emails de pagos, confirmaciones y notificaciones
 */
import { sendEmail, generateNewsletterWrapper } from "./email";

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "contacto@cancagua.cl";

// ============================================
// TEMPLATES HTML
// ============================================

function paymentLinkEmailHtml(data: {
  customerName: string;
  serviceName: string;
  amount: number;
  paymentUrl: string;
  sellerName: string;
}): string {
  const formattedAmount = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(data.amount);

  return `
    <h2 style="color: #44580E; margin-bottom: 16px;">Enlace de Pago</h2>
    <p>Hola <strong>${data.customerName}</strong>,</p>
    <p>
      ${data.sellerName} de Cancagua te ha generado un enlace de pago por el siguiente servicio:
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Servicio:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.serviceName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <strong>Monto:</strong>
        </td>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          ${formattedAmount}
        </td>
      </tr>
    </table>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.paymentUrl}" 
         style="display: inline-block; background-color: #44580E; color: #ffffff; 
                padding: 16px 32px; text-decoration: none; border-radius: 8px; 
                font-size: 16px; font-weight: bold;">
        Pagar Ahora
      </a>
    </div>
    <p style="font-size: 13px; color: #666;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
      <a href="${data.paymentUrl}" style="color: #44580E;">${data.paymentUrl}</a>
    </p>
    <p style="font-size: 13px; color: #999; margin-top: 24px;">
      Este enlace de pago es válido por un tiempo limitado. Si tienes alguna duda, 
      contacta a tu vendedor o escríbenos a <a href="mailto:${CONTACT_EMAIL}" style="color: #44580E;">${CONTACT_EMAIL}</a>.
    </p>
  `;
}

function paymentSuccessCustomerHtml(data: {
  customerName: string;
  serviceName: string;
  amount: number;
  saleReference: string;
}): string {
  const formattedAmount = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(data.amount);

  return `
    <h2 style="color: #44580E; margin-bottom: 16px;">¡Pago Confirmado!</h2>
    <p>Hola <strong>${data.customerName}</strong>,</p>
    <p>Tu pago ha sido procesado exitosamente. Aquí tienes los detalles:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Servicio:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.serviceName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <strong>Monto pagado:</strong>
        </td>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          ${formattedAmount}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Referencia:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.saleReference}
        </td>
      </tr>
    </table>
    <p>
      Nuestro equipo se pondrá en contacto contigo para coordinar tu reserva.
    </p>
    <p style="font-size: 13px; color: #999; margin-top: 24px;">
      Si tienes alguna consulta, escríbenos a 
      <a href="mailto:${CONTACT_EMAIL}" style="color: #44580E;">${CONTACT_EMAIL}</a>.
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
}): string {
  const formattedAmount = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(data.amount);
  const formattedCommission = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(data.commissionAmount);

  return `
    <h2 style="color: #44580E; margin-bottom: 16px;">Venta Confirmada</h2>
    <p>Hola <strong>${data.sellerName}</strong>,</p>
    <p>Se ha confirmado el pago de una venta que generaste:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Cliente:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.customerName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <strong>Servicio:</strong>
        </td>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          ${data.serviceName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Monto:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${formattedAmount}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <strong>Tu comisión:</strong>
        </td>
        <td style="padding: 12px; border: 1px solid #e5e5e0; color: #44580E; font-weight: bold;">
          ${formattedCommission}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Referencia:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.saleReference}
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
  const formattedAmount = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(data.amount);

  return `
    <h2 style="color: #c53030; margin-bottom: 16px;">Pago No Procesado</h2>
    <p>Hola <strong>${data.customerName}</strong>,</p>
    <p>Lamentablemente tu pago no pudo ser procesado.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Servicio:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.serviceName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <strong>Monto:</strong>
        </td>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          ${formattedAmount}
        </td>
      </tr>
    </table>
    <p>
      Si deseas intentar nuevamente, contacta a tu vendedor para que te genere un nuevo enlace de pago.
    </p>
    <p style="font-size: 13px; color: #999; margin-top: 24px;">
      Si tienes alguna consulta, escríbenos a 
      <a href="mailto:${CONTACT_EMAIL}" style="color: #44580E;">${CONTACT_EMAIL}</a>.
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
  const formattedAmount = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(data.amount);

  return `
    <h2 style="color: #c53030; margin-bottom: 16px;">Pago Fallido</h2>
    <p>Hola <strong>${data.sellerName}</strong>,</p>
    <p>El pago de una venta que generaste no fue procesado exitosamente:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Cliente:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.customerName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <strong>Servicio:</strong>
        </td>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          ${data.serviceName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Monto:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${formattedAmount}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <strong>Referencia:</strong>
        </td>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          ${data.saleReference}
        </td>
      </tr>
    </table>
    <p>
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
}): string {
  const formattedAmount = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(data.amount);

  return `
    <h2 style="color: #44580E; margin-bottom: 16px;">Nueva Venta Concierge - Gestionar Reserva</h2>
    <p>Se ha confirmado una nueva venta del módulo Concierge. Por favor, gestionar la reserva del cliente.</p>
    
    <h3 style="color: #44580E; margin-top: 24px;">Datos del Cliente</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Nombre:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.customerName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <strong>Email:</strong>
        </td>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <a href="mailto:${data.customerEmail}" style="color: #44580E;">${data.customerEmail}</a>
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Teléfono:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.customerPhone || "No proporcionado"}
        </td>
      </tr>
    </table>

    <h3 style="color: #44580E; margin-top: 24px;">Datos de la Venta</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Servicio:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.serviceName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <strong>Monto pagado:</strong>
        </td>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          ${formattedAmount}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Referencia:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.saleReference}
        </td>
      </tr>
    </table>

    <h3 style="color: #44580E; margin-top: 24px;">Datos del Vendedor</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          <strong>Vendedor:</strong>
        </td>
        <td style="padding: 12px; background-color: #f9f9f6; border: 1px solid #e5e5e0;">
          ${data.sellerName}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          <strong>Código:</strong>
        </td>
        <td style="padding: 12px; border: 1px solid #e5e5e0;">
          ${data.sellerCode}
        </td>
      </tr>
    </table>
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
}) {
  const html = generateNewsletterWrapper(paymentLinkEmailHtml(data));
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
}) {
  const html = generateNewsletterWrapper(paymentSuccessCustomerHtml(data));
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
}) {
  const html = generateNewsletterWrapper(
    paymentSuccessSellerHtml(data)
  );
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
}) {
  const html = generateNewsletterWrapper(newReservationNotificationHtml(data));
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
  const html = generateNewsletterWrapper(paymentFailedCustomerHtml(data));
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
  const html = generateNewsletterWrapper(paymentFailedSellerHtml(data));
  return await sendEmail({
    to: data.sellerEmail,
    subject: `Cancagua - Pago Fallido - ${data.saleReference}`,
    html,
    senderType: "notification",
  });
}
