/**
 * Integración con WebPay Plus (Transbank) para el Módulo Concierge
 * Usa transbank-sdk para crear y confirmar transacciones
 */

// transbank-sdk is CJS-only, use createRequire for ESM compatibility
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const tbk = require("transbank-sdk");
const { WebpayPlus, Options, Environment, IntegrationCommerceCodes, IntegrationApiKeys } = tbk;

const isProduction = process.env.WEBPAY_ENVIRONMENT === "production";

const getWebpayOptions = () => {
  if (isProduction) {
    const commerceCode = process.env.WEBPAY_COMMERCE_CODE;
    const apiKey = process.env.WEBPAY_API_KEY;

    if (!commerceCode || !apiKey) {
      throw new Error("WebPay: Credenciales de producción no configuradas");
    }

    return new Options(commerceCode, apiKey, Environment.Production);
  } else {
    return new Options(
      IntegrationCommerceCodes.WEBPAY_PLUS,
      IntegrationApiKeys.WEBPAY,
      Environment.Integration
    );
  }
};

/**
 * Crear una nueva transacción de WebPay Plus
 */
export async function createTransaction(
  buyOrder: string,
  sessionId: string,
  amount: number,
  returnUrl: string
): Promise<{ token: string; url: string }> {
  try {
    const options = getWebpayOptions();
    const tx = new WebpayPlus.Transaction(options);

    const response = await tx.create(buyOrder, sessionId, amount, returnUrl);

    return {
      token: response.token,
      url: response.url,
    };
  } catch (error: any) {
    console.error("WebPay createTransaction error:", error);
    throw new Error(`Error al crear transacción WebPay: ${error.message}`);
  }
}

/**
 * Confirmar una transacción de WebPay Plus
 */
export async function commitTransaction(token: string): Promise<{
  vci: string;
  amount: number;
  status: string;
  buyOrder: string;
  sessionId: string;
  cardNumber: string;
  accountingDate: string;
  transactionDate: string;
  authorizationCode: string;
  paymentTypeCode: string;
  responseCode: number;
  installmentsAmount: number | null;
  installmentsNumber: number | null;
}> {
  try {
    const options = getWebpayOptions();
    const tx = new WebpayPlus.Transaction(options);

    const response = await tx.commit(token);

    return {
      vci: response.vci,
      amount: response.amount,
      status: response.status,
      buyOrder: response.buy_order,
      sessionId: response.session_id,
      cardNumber: response.card_detail?.card_number || "",
      accountingDate: response.accounting_date,
      transactionDate: response.transaction_date,
      authorizationCode: response.authorization_code,
      paymentTypeCode: response.payment_type_code,
      responseCode: response.response_code,
      installmentsAmount: response.installments_amount,
      installmentsNumber: response.installments_number,
    };
  } catch (error: any) {
    console.error("WebPay commitTransaction error:", error);
    throw new Error(`Error al confirmar transacción WebPay: ${error.message}`);
  }
}

/**
 * Obtener el estado de una transacción
 */
export async function getTransactionStatus(token: string) {
  try {
    const options = getWebpayOptions();
    const tx = new WebpayPlus.Transaction(options);

    const response = await tx.status(token);

    return {
      vci: response.vci,
      amount: response.amount,
      status: response.status,
      buyOrder: response.buy_order,
      sessionId: response.session_id,
      cardNumber: response.card_detail?.card_number || "",
      accountingDate: response.accounting_date,
      transactionDate: response.transaction_date,
      authorizationCode: response.authorization_code,
      paymentTypeCode: response.payment_type_code,
      responseCode: response.response_code,
    };
  } catch (error: any) {
    console.error("WebPay getTransactionStatus error:", error);
    throw new Error(`Error al obtener estado de transacción WebPay: ${error.message}`);
  }
}

/**
 * Verificar si una transacción fue exitosa
 */
export function isTransactionApproved(responseCode: number, status: string): boolean {
  return responseCode === 0 && status === "AUTHORIZED";
}

/**
 * Generar un buyOrder único para ventas Concierge
 */
export function generateBuyOrder(saleId: number): string {
  const timestamp = Date.now().toString(36).slice(-4);
  return `CONC-${saleId}-${timestamp}`.substring(0, 26);
}

/**
 * Generar un sessionId único
 */
export function generateSessionId(): string {
  return `SES-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.substring(0, 61);
}
