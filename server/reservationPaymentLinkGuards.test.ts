import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { expireActiveReservationPaymentRequest } from "./reservationPaymentLinkGuards";

const guardSource = readFileSync(
  new URL("./reservationPaymentLinkGuards.ts", import.meta.url),
  "utf8"
);

function transactionDouble(input: {
  request: { status: string; expiresAt: Date } | null;
  paymentIds?: Array<number | null>;
}) {
  let selectCall = 0;
  const updateWhere = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockImplementation(() => {
      selectCall += 1;
      if (selectCall === 1) {
        const requestQuery = {
          from: vi.fn(),
          where: vi.fn(),
          limit: vi.fn(),
          for: vi.fn().mockResolvedValue(input.request ? [input.request] : []),
        };
        requestQuery.from.mockReturnValue(requestQuery);
        requestQuery.where.mockReturnValue(requestQuery);
        requestQuery.limit.mockReturnValue(requestQuery);
        return requestQuery;
      }
      const allocationQuery = {
        from: vi.fn(),
        where: vi.fn(),
        for: vi
          .fn()
          .mockResolvedValue(
            (input.paymentIds ?? []).map(paymentId => ({ paymentId }))
          ),
      };
      allocationQuery.from.mockReturnValue(allocationQuery);
      allocationQuery.where.mockReturnValue(allocationQuery);
      return allocationQuery;
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: updateWhere }),
    }),
    delete: vi.fn().mockReturnValue({ where: deleteWhere }),
  };
  return { tx, updateWhere, deleteWhere };
}

describe("vencimiento de links de pago", () => {
  const now = new Date("2026-08-21T12:00:00.000Z");

  it("vence la solicitud y elimina todos sus placeholders pendientes", async () => {
    const { tx, updateWhere, deleteWhere } = transactionDouble({
      request: {
        status: "active",
        expiresAt: new Date("2026-08-21T11:59:59.000Z"),
      },
      paymentIds: [31, 32, 31, null],
    });

    await expect(
      expireActiveReservationPaymentRequest(tx, 7, now)
    ).resolves.toBe(true);
    expect(updateWhere).toHaveBeenCalledOnce();
    expect(tx.delete).toHaveBeenCalledOnce();
    expect(deleteWhere).toHaveBeenCalledOnce();
  });

  it.each([
    ["active", "2026-08-21T12:00:01.000Z"],
    ["processing", "2026-08-21T11:59:59.000Z"],
    ["reconciliation_required", "2026-08-21T11:59:59.000Z"],
  ])(
    "no libera placeholders cuando el estado es %s o el link sigue vigente",
    async (status, expiresAt) => {
      const { tx, updateWhere, deleteWhere } = transactionDouble({
        request: { status, expiresAt: new Date(expiresAt) },
        paymentIds: [31],
      });

      await expect(
        expireActiveReservationPaymentRequest(tx, 7, now)
      ).resolves.toBe(false);
      expect(updateWhere).not.toHaveBeenCalled();
      expect(deleteWhere).not.toHaveBeenCalled();
    }
  );

  it("repara placeholders que quedaron en solicitudes ya vencidas", async () => {
    const { tx, updateWhere, deleteWhere } = transactionDouble({
      request: {
        status: "expired",
        expiresAt: new Date("2026-08-20T12:00:00.000Z"),
      },
      paymentIds: [41],
    });

    await expect(
      expireActiveReservationPaymentRequest(tx, 8, now)
    ).resolves.toBe(true);
    expect(updateWhere).not.toHaveBeenCalled();
    expect(deleteWhere).toHaveBeenCalledOnce();
  });

  it("descubre links con current-read y bloquea solo la tabla de requests", () => {
    expect(guardSource).toContain("FOR UPDATE OF reservation_payment_requests");
    expect(guardSource).not.toMatch(
      /\.innerJoin\([\s\S]{0,500}?\.for\("update"\)/
    );
  });

  it("todos los callers del guard usan transacciones READ COMMITTED", () => {
    const callerFiles = [
      "masajesRouter.ts",
      "saunaRouter.ts",
      "biopoolsRouter.ts",
      "operations360Router.ts",
    ];
    let guardedTransactions = 0;

    for (const file of callerFiles) {
      const sourceText = readFileSync(
        new URL(`./${file}`, import.meta.url),
        "utf8"
      );
      const source = ts.createSourceFile(
        file,
        sourceText,
        ts.ScriptTarget.Latest,
        true
      );

      function visit(node: ts.Node, transactions: ts.CallExpression[] = []) {
        let currentTransactions = transactions;
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "transaction"
        ) {
          currentTransactions = [...transactions, node];
        }
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "assertNoLiveReservationPaymentAttempt"
        ) {
          const transaction = currentTransactions.at(-1);
          expect(transaction).toBeDefined();
          expect(transaction?.arguments[1]?.getText(source)).toBe(
            "RESERVATION_PAYMENT_TRANSACTION"
          );
          guardedTransactions += 1;
        }
        ts.forEachChild(node, child => visit(child, currentTransactions));
      }

      visit(source);
    }

    expect(guardedTransactions).toBe(30);
  });
});
