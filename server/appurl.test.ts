import { describe, it, expect } from "vitest";

describe("APP_URL configuration", () => {
  it("should have APP_URL environment variable set", () => {
    const appUrl = process.env.APP_URL;
    expect(appUrl).toBeDefined();
    expect(appUrl).not.toBe("");
  });

  it("should point to cms.cancagua.cl", () => {
    const appUrl = process.env.APP_URL;
    expect(appUrl).toBe("https://cms.cancagua.cl");
  });

  it("should generate correct invitation link", () => {
    const appUrl = process.env.APP_URL || "https://cancagua.cl";
    const invitationLink = `${appUrl}/cms/activar-cuenta?token=test123`;
    expect(invitationLink).toBe("https://cms.cancagua.cl/cms/activar-cuenta?token=test123");
  });

  it("should generate correct password reset link", () => {
    const appUrl = process.env.APP_URL || "https://cancagua.cl";
    const resetLink = `${appUrl}/cms/restablecer-contrasena?token=test123`;
    expect(resetLink).toBe("https://cms.cancagua.cl/cms/restablecer-contrasena?token=test123");
  });

  it("should generate correct login link", () => {
    const appUrl = process.env.APP_URL || "https://cancagua.cl";
    const loginLink = `${appUrl}/cms/login`;
    expect(loginLink).toBe("https://cms.cancagua.cl/cms/login");
  });
});
