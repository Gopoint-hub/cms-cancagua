import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// Helper to create a mock authenticated context for testing
function createMockContext(overrides?: {
  role?: string;
  userId?: number;
}): { ctx: TrpcContext; clearedCookies: { name: string; options: Record<string, unknown> }[]; setCookies: { name: string; value: string; options: Record<string, unknown> }[] } {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
  const setCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const user = {
    id: overrides?.userId ?? 1,
    openId: "test-open-id",
    email: "test@cancagua.cl",
    name: "Test User",
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

describe("auth.me", () => {
  it("returns the authenticated user", async () => {
    const { ctx } = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeTruthy();
    expect(result?.email).toBe("test@cancagua.cl");
    expect(result?.name).toBe("Test User");
  });

  it("returns null for unauthenticated user", async () => {
    const ctx = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
  });
});

describe("router structure", () => {
  it("has all expected CMS routers defined", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    // Check that key CMS routers exist
    const expectedPrefixes = [
      "auth",
      "newsletters",
      "subscribers",
      "contactMessages",
      "giftCards",
      "menu",
      "users",
      "quotes",
      "menuAdmin",
    ];
    for (const prefix of expectedPrefixes) {
      const hasRouter = routerKeys.some((k) => k.startsWith(prefix + "."));
      expect(hasRouter, `Router "${prefix}" should exist`).toBe(true);
    }
  });

  it("has protected procedures for CMS management", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    // These should exist as procedures
    const expectedProcedures = [
      "auth.me",
      "auth.logout",
      "newsletters.getAll",
      "subscribers.getAll",
      "contactMessages.list",
      "giftCards.getAll",
      "menu.getCategories",
      "users.list",
    ];
    for (const proc of expectedProcedures) {
      expect(routerKeys, `Procedure "${proc}" should exist`).toContain(proc);
    }
  });
});

describe("protected procedures", () => {
  it("throws UNAUTHORIZED for unauthenticated access to protected endpoints", async () => {
    const ctx = createUnauthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    // Trying to access a protected procedure should throw
    await expect(caller.users.list()).rejects.toThrow();
  });
});
