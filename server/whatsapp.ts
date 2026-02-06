// WhatsApp integration - stub for CMS standalone

export const WHATSAPP_INFO = {
  phone: "+56912345678",
  formatted: "+569 1234 5678",
  enabled: false,
};

export function formatContactFormMessage(data: any): string {
  const name = data.nombre || data.name || "";
  const email = data.email || "";
  const phone = data.telefono || data.phone || "N/A";
  const message = data.mensaje || data.message || "";
  return `Nuevo mensaje de contacto:\nNombre: ${name}\nEmail: ${email}\nTeléfono: ${phone}\nMensaje: ${message}`;
}

export function generateWhatsAppLink(message: string, phone?: string): string {
  const targetPhone = phone || WHATSAPP_INFO.phone;
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${targetPhone.replace(/[^0-9]/g, "")}?text=${encodedMessage}`;
}

export async function sendWhatsAppNotification(phone: string, message: string) {
  console.log("[WhatsApp] Stub: notification not sent (not configured in CMS)");
  return { success: false, message: "WhatsApp not configured in CMS" };
}
