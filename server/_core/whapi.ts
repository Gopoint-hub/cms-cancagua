import { ENV } from "./env";

const WHAPI_URL = "https://gate.whapi.cloud/messages/text";
const WHAPI_HEALTH_URL = "https://gate.whapi.cloud/health";

export type WhatsAppResult = {
  success: boolean;
  error?: string;
  status?: number;
};

export type WhatsAppHealthResult = {
  success: boolean;
  configured: boolean;
  status?: number;
  error?: string;
};

export async function checkWhatsAppHealth(): Promise<WhatsAppHealthResult> {
  if (!ENV.whapiToken) {
    return {
      success: false,
      configured: false,
      error: "WHAPI_CANCAGUA_TOKEN is not configured",
    };
  }

  try {
    const response = await fetch(WHAPI_HEALTH_URL, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${ENV.whapiToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        configured: true,
        status: response.status,
        error: `WHAPI health returned ${response.status}`,
      };
    }

    return { success: true, configured: true, status: response.status };
  } catch (error) {
    return {
      success: false,
      configured: true,
      error: String(error),
    };
  }
}

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("56") && digits.length === 10) return "569" + digits.slice(2) + "@s.whatsapp.net";
  if (digits.startsWith("56")) return digits + "@s.whatsapp.net";
  if (digits.startsWith("9") && digits.length === 9) return "56" + digits + "@s.whatsapp.net";
  if (digits.length === 8) return "569" + digits + "@s.whatsapp.net";
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
