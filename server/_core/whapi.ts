import { ENV } from "./env";

const WHAPI_URL = "https://gate.whapi.cloud/messages/text";

function normalizePhone(phone: string): string {
  // Elimina espacios, guiones y paréntesis; agrega 56 si es número chileno sin código país
  const digits = phone.replace(/[\s\-().+]/g, "");
  if (digits.startsWith("56")) return digits + "@s.whatsapp.net";
  if (digits.startsWith("9") && digits.length === 9) return "56" + digits + "@s.whatsapp.net";
  return digits + "@s.whatsapp.net";
}

export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  if (!ENV.whapiToken || !phone) return;
  try {
    const to = normalizePhone(phone);
    await fetch(WHAPI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ENV.whapiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to, body: message }),
    });
  } catch (e) {
    console.error("[WHAPI] Error sending WhatsApp:", e);
  }
}
