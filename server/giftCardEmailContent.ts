export type GiftCardEmailPresentation = {
  kind: "amount" | "service";
  headline: string;
  serviceDetail: string | null;
  personalMessage: string | null;
  subject: string;
  introSuffix: string;
};

const SERVICE_LABELS = [
  { pattern: /biopisc/i, label: "Biopiscinas" },
  { pattern: /masaj/i, label: "Masajes" },
  { pattern: /sauna/i, label: "Sauna" },
  { pattern: /hot[\s-]?tub/i, label: "Hot-tub" },
];

function formatClp(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function parseServiceMessage(message?: string | null): {
  headline: string;
  serviceDetail: string | null;
  personalMessage: string | null;
} {
  const text = message?.trim() || "";
  const serviceToken = /Servicio:\s*/i.exec(text);
  const serviceStart = serviceToken ? serviceToken.index + serviceToken[0].length : 0;
  const serviceTail = text.slice(serviceStart).trim();
  const descriptorMatch = serviceTail.match(/^([^.!?]+[.!?]?)/);
  const descriptor = (descriptorMatch?.[1] || serviceTail).trim();
  const remainder = serviceTail.slice(descriptor.length).trim();
  const personalMessage = serviceToken?.index === 0 && remainder ? remainder : null;

  const detected = SERVICE_LABELS
    .map((service) => ({ ...service, index: descriptor.search(service.pattern) }))
    .filter((service) => service.index >= 0)
    .sort((a, b) => a.index - b.index)[0];
  const headline = detected?.label || "Experiencia Cancagua";
  const quantityMatch = descriptor.match(/\bpara\b[\s\S]*/i);
  const entryCountMatch = descriptor.match(/\b(\d+)\s+entradas?\b/i);
  const serviceDetail = quantityMatch
    ? ensureSentence(quantityMatch[0])
    : entryCountMatch
      ? `Para ${entryCountMatch[1]} ${entryCountMatch[1] === "1" ? "persona" : "personas"}.`
      : null;

  return { headline, serviceDetail, personalMessage };
}

export function buildGiftCardEmailPresentation(params: {
  amount: number;
  message?: string | null;
}): GiftCardEmailPresentation {
  if (params.amount > 0) {
    const formattedAmount = formatClp(params.amount);
    return {
      kind: "amount",
      headline: formattedAmount,
      serviceDetail: null,
      personalMessage: params.message?.trim() || null,
      subject: `🎁 ¡Has recibido una Gift Card de Cancagua por ${formattedAmount}!`,
      introSuffix: "por un valor de:",
    };
  }

  const service = parseServiceMessage(params.message);
  return {
    kind: "service",
    ...service,
    subject: `🎁 ¡Has recibido una Gift Card de Cancagua para ${service.headline}!`,
    introSuffix: "para disfrutar de:",
  };
}
