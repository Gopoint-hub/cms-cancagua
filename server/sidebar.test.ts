import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { DEFAULT_SIDEBAR_MODULE_ORDER } from "../shared/sidebar";

const { getSiteSettingsMock, updateSiteSettingMock } = vi.hoisted(() => ({
  getSiteSettingsMock: vi.fn(),
  updateSiteSettingMock: vi.fn(),
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getSiteSettings: getSiteSettingsMock,
  updateSiteSetting: updateSiteSettingMock,
}));

import { appRouter } from "./routers";

function createContext(role: string): TrpcContext {
  return {
    user: {
      id: 1,
      openId: `sidebar-${role}`,
      email: `${role}@cancagua.cl`,
      name: role,
      passwordHash: null,
      loginMethod: "email",
      role: role as TrpcContext["user"] extends infer U
        ? U extends { role: infer R }
          ? R
          : never
        : never,
      status: "active",
      allowedModules: null,
      invitationToken: null,
      invitationExpiresAt: null,
      resetToken: null,
      resetTokenExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      invitedBy: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("sidebar module order", () => {
  beforeEach(() => {
    getSiteSettingsMock.mockReset();
    updateSiteSettingMock.mockReset();
    getSiteSettingsMock.mockResolvedValue({});
    updateSiteSettingMock.mockResolvedValue(undefined);
  });

  it("returns the stable default order when no setting exists", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.sidebar.getOrder()).resolves.toEqual({
      order: DEFAULT_SIDEBAR_MODULE_ORDER,
    });
  });

  it("allows a super administrator to save the global order", async () => {
    const caller = appRouter.createCaller(createContext("super_admin"));
    const order = [...DEFAULT_SIDEBAR_MODULE_ORDER].reverse();

    await expect(caller.sidebar.updateOrder({ order })).resolves.toEqual({
      success: true,
      order,
    });
    expect(updateSiteSettingMock).toHaveBeenCalledWith(
      "cms_sidebar_module_order",
      JSON.stringify(order),
    );
  });

  it("rejects every role other than super administrator", async () => {
    const caller = appRouter.createCaller(createContext("admin"));

    await expect(caller.sidebar.updateOrder({
      order: DEFAULT_SIDEBAR_MODULE_ORDER,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updateSiteSettingMock).not.toHaveBeenCalled();
  });
});
