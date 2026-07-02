import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { ENV } from "./_core/env";

function requireGetnetConfig() {
  if (!ENV.getnetLogin || !ENV.getnetSecretKey) {
    throw new Error("Getnet no está configurado: faltan GETNET_LOGIN o GETNET_SECRET_KEY");
  }
  if (!ENV.appUrl) {
    throw new Error("Getnet no está configurado: falta APP_URL para returnUrl/notificationUrl");
  }
  if (!ENV.frontendUrl) {
    throw new Error("Getnet no está configurado: falta FRONTEND_URL para returnUrl");
  }
  try {
    new URL(ENV.getnetBaseUrl);
    new URL(ENV.appUrl);
    new URL(ENV.frontendUrl);
  } catch {
    throw new Error("Getnet no está configurado: GETNET_BASE_URL, APP_URL o FRONTEND_URL no son URLs válidas");
  }
}

function buildAuth() {
  const rawNonce = randomBytes(16);
  const seed = new Date().toISOString();
  const tranKey = createHash("sha256")
    .update(rawNonce)
    .update(seed)
    .update(ENV.getnetSecretKey)
    .digest("base64");

  return {
    login: ENV.getnetLogin,
    tranKey,
    nonce: rawNonce.toString("base64"),
    seed,
  };
}

export interface GetnetSessionParams {
  bookingId: number;
  description: string;
  amountCLP: number;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
}

export interface GetnetSessionResult {
  requestId: string;
  processUrl: string;
}

export async function createGetnetSession(
  params: GetnetSessionParams
): Promise<GetnetSessionResult> {
  requireGetnetConfig();
  const { bookingId, description, amountCLP, clientName, clientEmail, clientPhone } = params;
  const reference = `masaje-${bookingId}`;

  const body: Record<string, unknown> = {
    auth: buildAuth(),
    payment: {
      reference,
      description,
      amount: {
        currency: "CLP",
        total: amountCLP,
      },
    },
    expiration: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().replace("Z", "+00:00"),
    returnUrl: `${ENV.frontendUrl}/servicios/masajes?ref=${reference}`,
    notificationUrl: `${ENV.appUrl}/api/webhooks/getnet`,
    ipAddress: "127.0.0.1",
    userAgent: "CancaguaWebApp/1.0",
  };

  if (clientEmail || clientPhone) {
    body.buyer = {
      name: clientName,
      ...(clientEmail ? { email: clientEmail } : {}),
      ...(clientPhone ? { mobile: clientPhone } : {}),
    };
  }

  console.log("[Getnet] createSession:", {
    reference,
    amountCLP,
    baseUrl: ENV.getnetBaseUrl,
    returnUrl: body.returnUrl,
    notificationUrl: body.notificationUrl,
  });
  const res = await fetch(`${ENV.getnetBaseUrl}/api/session/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[Getnet] createSession failed:", res.status, text);
    throw new Error(`Getnet createSession error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    requestId: string;
    processUrl: string;
    status?: { status: string; message: string };
  };

  if (!data.requestId || !data.processUrl) {
    throw new Error(`Getnet createSession missing fields: ${JSON.stringify(data)}`);
  }

  return { requestId: data.requestId, processUrl: data.processUrl };
}

export interface GetnetStatusResult {
  requestId: string;
  status: "APPROVED" | "REJECTED" | "PENDING" | "FAILED" | "PARTIAL" | string;
  reason?: string;
  message?: string;
  date?: string;
  signature?: string;
  amount?: number;
  currency?: string;
  reference?: string;
}

export async function getGetnetSessionInfo(
  requestId: string
): Promise<GetnetStatusResult> {
  requireGetnetConfig();
  const res = await fetch(`${ENV.getnetBaseUrl}/api/session/${requestId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth: buildAuth() }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Getnet getSessionInfo error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    requestId: string;
    status: {
      status: string;
      reason?: string;
      message?: string;
      date?: string;
    };
    payment?: Array<{
      amount?: { total?: number; currency?: string };
      reference?: string;
      status?: { signature?: string };
    }>;
  };

  const payment = data.payment?.[0];
  return {
    requestId: data.requestId,
    status: data.status.status,
    reason: data.status.reason,
    message: data.status.message,
    date: data.status.date,
    signature: payment?.status?.signature,
    amount: payment?.amount?.total,
    currency: payment?.amount?.currency,
    reference: payment?.reference,
  };
}

export function validateGetnetWebhookSignature(
  requestId: string,
  status: string,
  date: string,
  signature: string
): boolean {
  // PlacetoPay/Getnet documenta SHA-1(requestId + status + date + secretKey);
  // se acepta también SHA-256 por si la plataforma migra de algoritmo
  const payload = requestId + status + date + ENV.getnetSecretKey;
  const received = Buffer.from(signature.toLowerCase());
  return ["sha1", "sha256"].some((algo) => {
    const expected = Buffer.from(createHash(algo).update(payload).digest("hex"));
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
}
