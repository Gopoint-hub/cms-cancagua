import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(overrides?: {
  role?: string;
  userId?: number;
}): { ctx: TrpcContext } {
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
    invitedBy: null,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("lists.uniqueSubscriberCount", () => {
  it("should exist as a procedure on the router", () => {
    const caller = appRouter.createCaller(createMockContext().ctx);
    expect(caller.lists.uniqueSubscriberCount).toBeDefined();
  });

  it("should return count 0 for empty listIds", async () => {
    const caller = appRouter.createCaller(createMockContext().ctx);
    const result = await caller.lists.uniqueSubscriberCount({ listIds: [] });
    expect(result).toEqual({ count: 0 });
  });

  it("should return a count object for valid listIds", async () => {
    const caller = appRouter.createCaller(createMockContext().ctx);
    // Use list IDs that may or may not exist - the important thing is it returns { count: number }
    const result = await caller.lists.uniqueSubscriberCount({ listIds: [1, 2, 3] });
    expect(result).toHaveProperty("count");
    expect(typeof result.count).toBe("number");
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  it("should reject non-admin users", async () => {
    const caller = appRouter.createCaller(createMockContext({ role: "user" }).ctx);
    await expect(caller.lists.uniqueSubscriberCount({ listIds: [1] })).rejects.toThrow();
  });

  it("should allow seller role to be rejected", async () => {
    const caller = appRouter.createCaller(createMockContext({ role: "seller" }).ctx);
    await expect(caller.lists.uniqueSubscriberCount({ listIds: [1] })).rejects.toThrow();
  });
});

describe("lists.totalActiveSubscribers", () => {
  it("should exist as a procedure on the router", () => {
    const caller = appRouter.createCaller(createMockContext().ctx);
    expect(caller.lists.totalActiveSubscribers).toBeDefined();
  });

  it("should return a count object", async () => {
    const caller = appRouter.createCaller(createMockContext().ctx);
    const result = await caller.lists.totalActiveSubscribers();
    expect(result).toHaveProperty("count");
    expect(typeof result.count).toBe("number");
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  it("should reject non-admin users", async () => {
    const caller = appRouter.createCaller(createMockContext({ role: "user" }).ctx);
    await expect(caller.lists.totalActiveSubscribers()).rejects.toThrow();
  });
});
