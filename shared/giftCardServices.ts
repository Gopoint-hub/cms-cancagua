export const GIFT_CARD_SERVICE_KEYS = [
  "biopools",
  "massages",
  "sauna",
  "regular_classes",
  "hot_tubs",
  "mixed_program",
] as const;

export type GiftCardServiceKey = (typeof GIFT_CARD_SERVICE_KEYS)[number];

export const GIFT_CARD_SERVICE_LABELS: Record<GiftCardServiceKey, string> = {
  biopools: "Biopiscinas",
  massages: "Masajes",
  sauna: "Sauna",
  regular_classes: "Clases Regulares",
  hot_tubs: "Hot Tubs",
  mixed_program: "Programa mixto",
};

export function inferGiftCardServiceKey(
  text?: string | null
): GiftCardServiceKey | null {
  const value = (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const mentioned = [
    value.includes("biopisc") && "biopools",
    value.includes("masaje") && "massages",
    value.includes("sauna") && "sauna",
    (value.includes("clase") ||
      value.includes("yoga") ||
      value.includes("pilates")) &&
      "regular_classes",
    (value.includes("hot tub") || value.includes("hottub")) && "hot_tubs",
  ].filter(Boolean) as GiftCardServiceKey[];
  if (mentioned.length > 1 || value.includes("reconecta"))
    return "mixed_program";
  return mentioned[0] ?? null;
}

export function giftCardServiceMatches(
  cardService: string | null | undefined,
  requestedService: string
): boolean {
  return (
    Boolean(cardService) &&
    cardService === requestedService &&
    cardService !== "mixed_program"
  );
}
