import { createHash, randomBytes } from "crypto";
import { ENV } from "./_core/env";

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
    returnUrl: `${ENV.appUrl}/masajes/reserva/confirmacion?ref=${reference}`,
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

  console.log("[Getnet] createSession payload:", JSON.stringify(body));
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
  const expected = createHash("sha256")
    .update(requestId + status + date + ENV.getnetSecretKey)
    .digest("hex");
  return expected === signature;
}
