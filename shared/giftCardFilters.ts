export type GiftCardFilter = "all" | "completed" | "used" | "pending" | "failed";

type FilterableGiftCard = {
  purchaseStatus?: string | null;
  status?: string | null;
  amount?: number | null;
  balance?: number | null;
};

/**
 * Mutually exclusive business filters for the Gift Card sales history.
 * - completed: purchased and not yet used
 * - pending: purchased, partially used, with money still available
 * - used: fully redeemed
 * - failed: purchase was never completed
 */
export function matchesGiftCardFilter(card: FilterableGiftCard, filter: GiftCardFilter): boolean {
  if (filter === "all") return true;

  const amount = Number(card.amount ?? 0);
  const balance = Number(card.balance ?? 0);
  const purchased = card.purchaseStatus === "completed";

  if (filter === "failed") return !purchased;
  if (filter === "used") return purchased && card.status === "redeemed";
  if (filter === "pending") {
    return purchased && card.status !== "redeemed" && amount > 0 && balance > 0 && balance < amount;
  }

  return purchased && card.status !== "redeemed" && balance === amount;
}
