import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertReservationPaymentEditable } from "./reservationPayments";
import {
  classifyWebpayAttemptStatus,
  paymentLinkProviderFor,
  validatePaymentLinkApproval,
} from "./reservationPaymentLinks";

const paymentLinksSource = readFileSync(
  new URL("./reservationPaymentLinks.ts", import.meta.url),
  "utf8"
);

describe("links de pago de reservas", () => {
  it("agrupa Masajes y programas en Getnet; Bio y Sauna en Webpay", () => {
    expect(paymentLinkProviderFor("massages")).toBe("getnet");
    expect(paymentLinkProviderFor("massage_programs")).toBe("getnet");
    expect(paymentLinkProviderFor("biopools")).toBe("webpay");
    expect(paymentLinkProviderFor("sauna")).toBe("webpay");
  });

  it("solo libera un INITIALIZED rechazado cuando el intento ya venció", () => {
    const base = {
      storedToken: "token-webpay",
      queriedToken: "token-webpay",
      expectedReference: "RPL-1",
      expectedSessionId: "SID-RPL-1",
      expectedAmountClp: 45_000,
      attemptCreatedAt: new Date("2026-08-21T09:00:00.000Z"),
      attemptExpiresAt: new Date("2026-08-21T11:00:00.000Z"),
      now: new Date("2026-08-21T12:00:00.000Z"),
      result: {
        status: "INITIALIZED",
        responseCode: -2,
        buyOrder: "RPL-1",
        sessionId: "SID-RPL-1",
        amount: 45_000,
      },
    };

    expect(classifyWebpayAttemptStatus(base)).toEqual({
      action: "not_approved",
      terminalStatus: "rejected",
    });
    expect(
      classifyWebpayAttemptStatus({
        ...base,
        attemptExpiresAt: new Date("2026-08-21T12:01:00.000Z"),
      })
    ).toEqual({ action: "pending" });
  });

  it("envía a conciliación cualquier mismatch de identidad Webpay", () => {
    const decision = classifyWebpayAttemptStatus({
      storedToken: "token-webpay",
      queriedToken: "otro-token",
      expectedReference: "RPL-1",
      expectedSessionId: "SID-RPL-1",
      expectedAmountClp: 45_000,
      attemptCreatedAt: new Date("2026-08-21T09:00:00.000Z"),
      attemptExpiresAt: new Date("2026-08-21T11:00:00.000Z"),
      now: new Date("2026-08-21T12:00:00.000Z"),
      result: {
        status: "AUTHORIZED",
        responseCode: 0,
        buyOrder: "RPL-1",
        sessionId: "SID-RPL-1",
        amount: 45_000,
      },
    });

    expect(decision.action).toBe("reconciliation");
  });

  it("no trata AUTHORIZED con código negativo como pago acreditable", () => {
    const decision = classifyWebpayAttemptStatus({
      storedToken: "token-webpay",
      queriedToken: "token-webpay",
      expectedReference: "RPL-1",
      expectedSessionId: "SID-RPL-1",
      expectedAmountClp: 45_000,
      attemptCreatedAt: new Date("2026-08-21T09:00:00.000Z"),
      attemptExpiresAt: new Date("2026-08-21T11:00:00.000Z"),
      now: new Date("2026-08-21T12:00:00.000Z"),
      result: {
        status: "AUTHORIZED",
        responseCode: -2,
        buyOrder: "RPL-1",
        sessionId: "SID-RPL-1",
        amount: 45_000,
      },
    });

    expect(decision.action).toBe("reconciliation");
  });

  it("solo habilita acreditación en conciliación tras validar la aprobación", () => {
    expect(
      paymentLinksSource.match(
        /markReconciliation\(db, approval, reason, true\)/g
      )
    ).toHaveLength(1);
    expect(paymentLinksSource).toMatch(
      /if \(approvalError\)[\s\S]{0,300}markReconciliation\(db, approval, reason\);/
    );
    expect(paymentLinksSource).toContain(
      '(attempt.status === "reconciliation_required" && !creditVerifiedPayment)'
    );
  });

  it("reintenta verificar callbacks aprobados aunque una conciliación ambigua haya ganado la carrera", () => {
    const getnetStart = paymentLinksSource.indexOf(
      "export async function handleReservationPaymentLinkGetnetWebhook"
    );
    const webpayStart = paymentLinksSource.indexOf(
      "export async function handleReservationPaymentLinkWebpayReturn"
    );
    const routerStart = paymentLinksSource.indexOf(
      "export const reservationPaymentLinksRouter"
    );
    expect(getnetStart).toBeGreaterThan(-1);
    expect(webpayStart).toBeGreaterThan(getnetStart);
    expect(routerStart).toBeGreaterThan(webpayStart);

    const getnetHandler = paymentLinksSource.slice(getnetStart, webpayStart);
    const webpayHandler = paymentLinksSource.slice(webpayStart, routerStart);
    expect(getnetHandler).toContain(
      'attempt.status === "approved" && linkedRequest?.status === "paid"'
    );
    expect(getnetHandler).not.toContain(
      '["approved", "reconciliation_required"].includes(attempt.status)'
    );
    expect(webpayHandler).toContain(
      'attempt.status === "approved" && request.status === "paid"'
    );
    expect(webpayHandler).not.toContain(
      'if (attempt.status === "reconciliation_required")'
    );
  });

  it("hace idempotente el upgrade de una conciliación con aprobación verificada", () => {
    expect(paymentLinksSource).toMatch(
      /linkedPayment\?\.status === "paid"[\s\S]{0,220}linkedPayment\.method === method[\s\S]{0,220}linkedPayment\.reference === paymentReference[\s\S]{0,220}linkedPayment\.amountClp === amountClp/
    );
    expect(paymentLinksSource).toContain("...(creditVerifiedPayment");
    expect(paymentLinksSource).toContain(
      'currentAttempt?.status !== "reconciliation_required"'
    );
  });

  it("recupera identificadores tardíos sin degradar la conciliación ni la URL", () => {
    expect(paymentLinksSource).toContain(
      'const providerUrl = attempt.providerUrl || session.providerUrl || ""'
    );
    expect(paymentLinksSource).toContain(
      'status: isReconciliation ? "reconciliation_required" : "pending"'
    );
    expect(
      paymentLinksSource.match(/"reconciliation_required",/g)?.length
    ).toBeGreaterThan(2);

    const getnetRecovery = paymentLinksSource.slice(
      paymentLinksSource.indexOf(
        "export async function handleReservationPaymentLinkGetnetWebhook"
      ),
      paymentLinksSource.indexOf(
        "export async function handleReservationPaymentLinkWebpayReturn"
      )
    );
    const webpayRecovery = paymentLinksSource.slice(
      paymentLinksSource.indexOf(
        "export async function handleReservationPaymentLinkWebpayReturn"
      ),
      paymentLinksSource.indexOf("export const reservationPaymentLinksRouter")
    );
    for (const recovery of [getnetRecovery, webpayRecovery]) {
      expect(recovery).toMatch(
        /inArray\(reservationPaymentAttempts\.status, \[[\s\S]{0,160}"reconciliation_required"/
      );
    }
  });

  it("no presenta una conciliación concurrente como rechazo o aborto Webpay", () => {
    expect(paymentLinksSource).toContain(
      "return loadCurrentWebpayAttemptOutcome(db, attempt.id)"
    );
    expect(paymentLinksSource).toMatch(
      /await markAttemptNotApproved\(attempt\.id, "aborted"[\s\S]{0,300}outcome === "reconciliation_required"[\s\S]{0,100}"reconciliation_required"/
    );
  });

  it("lleva a conciliación los intentos Getnet vencidos que siguen ambiguos", () => {
    const staleStart = paymentLinksSource.indexOf(
      "async function resolveStaleProviderAttempt"
    );
    const staleEnd = paymentLinksSource.indexOf(
      "async function resolveOverlappingProviderAttempts"
    );
    const staleResolver = paymentLinksSource.slice(staleStart, staleEnd);
    expect(staleResolver).toContain(
      "El intento Getnet vencido sigue en estado"
    );
    expect(staleResolver).toContain(
      "No fue posible verificar el resultado del intento Getnet vencido"
    );
    expect(staleResolver).toMatch(
      /providerStatus: info\.status \|\| "UNKNOWN"[\s\S]{0,180}markReconciliation|markReconciliation\([\s\S]{0,220}providerStatus: info\.status \|\| "UNKNOWN"/
    );
  });

  it("Getnet stale concilia sin acreditar si cambia el requestId", () => {
    const mismatchStart = paymentLinksSource.indexOf(
      "info.requestId !== body.requestId ||"
    );
    expect(mismatchStart).toBeGreaterThan(-1);
    const mismatchBranch = paymentLinksSource.slice(
      mismatchStart,
      mismatchStart + 900
    );
    expect(mismatchBranch).toContain("markReconciliation(");
    expect(mismatchBranch).toContain(
      "attempt.providerRequestId !== body.requestId"
    );
    expect(mismatchBranch).toContain(
      "Getnet respondió con un requestId diferente al intento"
    );
    expect(mismatchBranch).not.toMatch(/markReconciliation\([\s\S]*?, true\)/);
  });

  it("solo acepta monto, moneda y referencia exactos", () => {
    const expected = {
      amountClp: 36_000,
      currency: "CLP",
      providerReference: "RPL-123",
      expectedAmountClp: 36_000,
      expectedReference: "RPL-123",
    };
    expect(validatePaymentLinkApproval(expected)).toBeNull();
    expect(
      validatePaymentLinkApproval({ ...expected, amountClp: 35_999 })
    ).toMatch(/monto distinto/);
    expect(
      validatePaymentLinkApproval({ ...expected, amountClp: undefined })
    ).toMatch(/monto CLP válido/);
    expect(
      validatePaymentLinkApproval({ ...expected, currency: "USD" })
    ).toMatch(/moneda/);
    expect(
      validatePaymentLinkApproval({ ...expected, providerReference: "otra" })
    ).toMatch(/referencia/);
  });

  it("protege pagos electrónicos acreditados y mantiene editables los manuales", () => {
    for (const method of ["getnet", "webpay", "webpay_plus"]) {
      expect(() => assertReservationPaymentEditable({ method })).toThrow(
        TRPCError
      );
    }
    for (const method of [
      "cash",
      "bank_transfer",
      "gift_card",
      "transbank_machine",
    ]) {
      expect(() => assertReservationPaymentEditable({ method })).not.toThrow();
    }
  });
});
