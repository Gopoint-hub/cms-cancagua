import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import * as webpay from "./webpay";

// ============================================
// HELPERS
// ============================================

function createMockContext(overrides?: {
  role?: string;
  userId?: number;
}): {
  ctx: TrpcContext;
  clearedCookies: { name: string; options: Record<string, unknown> }[];
  setCookies: { name: string; value: string; options: Record<string, unknown> }[];
} {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
  const setCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const user = {
    id: overrides?.userId ?? 1,
    openId: "test-open-id",
    email: "test@cancagua.cl",
    name: "Test Admin",
    passwordHash: "$2b$10$testhashedpassword",
    loginMethod: "email",
    role: (overrides?.role ?? "super_admin") as any,
    status: "active" as const,
    allowedModules: null,
    invitationToken: null,
    invitationExpiresAt: null,
    resetToken: null,
    resetTokenExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies, setCookies };
}

function createUnauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as TrpcContext["res"],
  };
}

// ============================================
// TESTS: Router Structure
// ============================================

describe("Concierge router structure", () => {
  it("has concierge router with expected sub-routers", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const conciergeKeys = routerKeys.filter((k) => k.startsWith("concierge."));
    expect(conciergeKeys.length).toBeGreaterThan(0);

    // Should have services, sellers, sales, commissions, and payment sub-routers
    const expectedPrefixes = [
      "concierge.services",
      "concierge.sellers",
      "concierge.sales",
      "concierge.commissions",
      "concierge.payment",
    ];
    for (const prefix of expectedPrefixes) {
      const hasRouter = conciergeKeys.some((k) => k.startsWith(prefix + "."));
      expect(hasRouter, `Sub-router "${prefix}" should exist`).toBe(true);
    }
  });

  it("has expected concierge procedures", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const expectedProcedures = [
      // Services (admin)
      "concierge.services.getAll",
      "concierge.services.upsert",
      "concierge.services.delete",
      // Sellers (admin)
      "concierge.sellers.getAll",
      "concierge.sellers.upsert",
      "concierge.sellers.getMetrics",
      "concierge.sellers.updateCommission",
      // Sales (concierge)
      "concierge.sales.getAvailableServices",
      "concierge.sales.getMySellerInfo",
      "concierge.sales.initiateSale",
      "concierge.sales.getMySales",
      "concierge.sales.getMyMetrics",
      "concierge.sales.getMyCommissionSummary",
      // Commissions (admin)
      "concierge.commissions.getSummary",
      "concierge.commissions.getAllSales",
      // Payment (public)
      "concierge.payment.confirm",
      "concierge.payment.getStatus",
    ];
    for (const proc of expectedProcedures) {
      expect(routerKeys, `Procedure "${proc}" should exist`).toContain(proc);
    }
  });

  it("payment.confirm is a public procedure (no auth required)", async () => {
    // The fact that we can call it without auth context proves it's public
    const ctx = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    // Calling with invalid token should return not_found, not throw UNAUTHORIZED
    await expect(
      caller.concierge.payment.confirm({ token_ws: "invalid-token" })
    ).resolves.toMatchObject({
      success: false,
      status: "not_found",
    });
  });

  it("payment.getStatus is a public procedure", async () => {
    const ctx = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.concierge.payment.getStatus({ saleReference: "NONEXISTENT" })
    ).resolves.toMatchObject({
      found: false,
    });
  });
});

// ============================================
// TESTS: Access Control
// ============================================

describe("Concierge access control", () => {
  it("admin procedures require authentication", async () => {
    const ctx = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    // Admin-only procedures should throw for unauthenticated users
    await expect(caller.concierge.services.getAll()).rejects.toThrow();
    await expect(caller.concierge.sellers.getAll()).rejects.toThrow();
    await expect(
      caller.concierge.commissions.getSummary({
        startDate: "2025-01-01",
        endDate: "2025-12-31",
      })
    ).rejects.toThrow();
  });

  it("concierge procedures require authentication", async () => {
    const ctx = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    // Concierge procedures should throw for unauthenticated users
    await expect(caller.concierge.sales.getAvailableServices()).rejects.toThrow();
    await expect(caller.concierge.sales.getMySellerInfo()).rejects.toThrow();
  });

  it("admin can access services list", async () => {
    const { ctx } = createMockContext({ role: "super_admin" });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.concierge.services.getAll();
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can access sellers list", async () => {
    const { ctx } = createMockContext({ role: "super_admin" });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.concierge.sellers.getAll();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ============================================
// TESTS: WebPay Utility Functions
// ============================================

describe("WebPay utility functions", () => {
  it("generateBuyOrder creates valid order IDs", () => {
    const order1 = webpay.generateBuyOrder(1);
    const order2 = webpay.generateBuyOrder(999);

    expect(order1).toMatch(/^CONC-1-/);
    expect(order2).toMatch(/^CONC-999-/);
    // Max 26 chars for WebPay
    expect(order1.length).toBeLessThanOrEqual(26);
    expect(order2.length).toBeLessThanOrEqual(26);
  });

  it("generateBuyOrder creates unique IDs", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 10; i++) {
      orders.add(webpay.generateBuyOrder(i));
    }
    expect(orders.size).toBe(10);
  });

  it("generateSessionId creates valid session IDs", () => {
    const session = webpay.generateSessionId();
    expect(session).toMatch(/^SES-/);
    expect(session.length).toBeLessThanOrEqual(61);
  });

  it("isTransactionApproved correctly identifies approved transactions", () => {
    expect(webpay.isTransactionApproved(0, "AUTHORIZED")).toBe(true);
    expect(webpay.isTransactionApproved(0, "FAILED")).toBe(false);
    expect(webpay.isTransactionApproved(-1, "AUTHORIZED")).toBe(false);
    expect(webpay.isTransactionApproved(1, "AUTHORIZED")).toBe(false);
    expect(webpay.isTransactionApproved(0, "")).toBe(false);
  });
});

// ============================================
// TESTS: WebPay Credentials
// ============================================

describe("WebPay production credentials", () => {
  it("WEBPAY_API_KEY is set and has UUID format", () => {
    const key = process.env.WEBPAY_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("WEBPAY_COMMERCE_CODE is set and numeric", () => {
    const code = process.env.WEBPAY_COMMERCE_CODE;
    expect(code).toBeDefined();
    expect(code).not.toBe("");
    expect(code).toMatch(/^\d+$/);
  });

  it("WEBPAY_ENVIRONMENT is set to production", () => {
    const env = process.env.WEBPAY_ENVIRONMENT;
    expect(env).toBe("production");
  });

  // FRONTEND_URL and CONTACT_EMAIL are set in env.ts with defaults
  // They may not be in process.env during test, but the code uses ENV.frontendUrl
  it("env.ts has correct default for frontendUrl", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.frontendUrl).toContain("cancagua.cl");
  });

  it("env.ts has correct default for contactEmail", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.contactEmail).toContain("@");
  });
});

// ============================================
// TESTS: CORS Configuration
// ============================================

describe("CORS configuration", () => {
  it("env.ts frontendUrl defaults to cancagua.cl", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.frontendUrl).toBe("https://cancagua.cl");
  });
});
