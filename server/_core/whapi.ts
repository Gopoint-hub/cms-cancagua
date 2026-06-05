import { ENV } from "./env";

const WHAPI_URL = "https://gate.whapi.cloud/messages/text";

export type WhatsAppResult = {
  success: boolean;
  error?: string;
  status?: number;
};

function normalizePhone(phone: string): string {
  // Elimina espacios, guiones y paréntesis; agrega 56 si es número chileno sin código país
  const digits = phone.replace(/[\s\-().+]/g, "");
  if (digits.startsWith("56")) return digits + "@s.whatsapp.net";
  if (digits.startsWith("9") && digits.length === 9) return "56" + digits + "@s.whatsapp.net";
  return digits + "@s.whatsapp.net";
}

export async function sendWhatsApp(phone: string, message: string): Promise<WhatsAppResult> {
  if (!phone) {
    return { success: false, error: "Phone is required" };
  }
  if (!ENV.whapiToken) {
    const error = "WHAPI_CANCAGUA_TOKEN is not configured";
    console.warn(`[WHAPI] ${error}`);
    return { success: false, error };
  }
  try {
    const to = normalizePhone(phone);
    const response = await fetch(WHAPI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ENV.whapiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to, body: message }),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      const error = `WHAPI ${response.status} ${response.statusText}${responseBody ? `: ${responseBody.slice(0, 500)}` : ""}`;
      console.error(`[WHAPI] Error sending WhatsApp: ${error}`);
      return { success: false, error, status: response.status };
    }

    return { success: true };
  } catch (e) {
    console.error("[WHAPI] Error sending WhatsApp:", e);
    return { success: false, error: String(e) };
  }
}
