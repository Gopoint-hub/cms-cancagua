// WebPay integration - stub for CMS standalone
// Payments are handled by the frontend (Render), not the CMS

export interface WebPayTransaction {
  token: string;
  url: string;
}

export interface WebPayCommitResult {
  buyOrder: string;
  responseCode: number;
  status: string;
  authorizationCode: string;
  cardNumber: string;
  transactionDate: string;
}

export async function createTransaction(
  buyOrder: string,
  sessionId: string,
  amount: number,
  returnUrl: string
): Promise<WebPayTransaction> {
  throw new Error("WebPay is not configured in the CMS. Payments are handled by the frontend.");
}

export async function commitTransaction(token: string): Promise<WebPayCommitResult> {
  throw new Error("WebPay is not configured in the CMS. Payments are handled by the frontend.");
}

export function generateBuyOrder(id?: number | string): string {
  return `BO-${id || Date.now()}`;
}

export function generateSessionId(): string {
  return `SS-${Date.now()}`;
}

export function isTransactionApproved(responseCode: number, status?: string): boolean {
  return responseCode === 0;
}
