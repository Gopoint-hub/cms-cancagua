import { customerPurchaseSurveys } from "../drizzle/schema";
import { normalizeCustomerAcquisition, type CustomerAcquisition } from "../shared/customerAcquisition";

export async function saveCustomerPurchaseSurvey(
  db: any,
  input: {
    purchaseType: string;
    purchaseId: string | number;
    clientEmail?: string | null;
    acquisition: CustomerAcquisition;
  },
) {
  const normalized = normalizeCustomerAcquisition(input.acquisition);
  await db.insert(customerPurchaseSurveys).values({
    purchaseType: input.purchaseType,
    purchaseId: String(input.purchaseId),
    clientEmail: input.clientEmail?.trim().toLowerCase() || null,
    ...normalized,
  });
}
