export type ManualGiftCardType = "amount" | "service";

export interface ManualGiftCardInput {
  type: ManualGiftCardType;
  amount?: number;
  serviceName?: string;
  serviceDetails?: string;
  backgroundImage: string;
  recipientName: string;
  recipientEmail?: string;
  senderName?: string;
  senderEmail?: string;
  personalMessage?: string;
}

export interface ManualGiftCardActor {
  id: number;
  name?: string | null;
  email?: string | null;
}

function addThreeMonths(date: Date): Date {
  const expiresAt = new Date(date);
  expiresAt.setMonth(expiresAt.getMonth() + 3);
  return expiresAt;
}

function buildServiceMessage(input: ManualGiftCardInput): string {
  const serviceName = input.serviceName?.trim();
  if (!serviceName) throw new Error("Debes indicar el servicio");

  const detail = input.serviceDetails?.trim();
  const serviceText = `Servicio: ${serviceName}${detail ? ` para ${detail}` : ""}.`;
  return [serviceText, input.personalMessage?.trim()].filter(Boolean).join(" ");
}

export function buildManualGiftCardData(
  input: ManualGiftCardInput,
  actor: ManualGiftCardActor,
  now = new Date(),
) {
  if (!input.recipientName.trim()) throw new Error("Debes indicar el destinatario");

  if (input.type === "amount" && (!input.amount || input.amount <= 0)) {
    throw new Error("Debes indicar un monto mayor a cero");
  }

  const amount = input.type === "amount" ? input.amount! : 0;
  const timestamp = now.getTime().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).substring(2, 5).toUpperCase();

  return {
    code: `GC-M-${timestamp}-${randomPart}`,
    amount,
    balance: amount,
    backgroundImage: input.backgroundImage,
    recipientName: input.recipientName.trim(),
    recipientEmail: input.recipientEmail?.trim() || null,
    recipientPhone: null,
    senderName: input.senderName?.trim() || actor.name || "Cancagua",
    senderEmail: input.senderEmail?.trim() || null,
    personalMessage: input.type === "service"
      ? buildServiceMessage(input)
      : input.personalMessage?.trim() || null,
    deliveryMethod: "email" as const,
    deliveredAt: null,
    purchaseStatus: "completed" as const,
    status: "active" as const,
    expiresAt: addThreeMonths(now),
    paymentMethod: null,
    paymentReference: null,
  };
}
