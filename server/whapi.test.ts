import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete process.env.WHAPI_CANCAGUA_TOKEN;
});

describe("sendWhatsApp", () => {
  it("returns a failure when WHAPI token is not configured", async () => {
    const { sendWhatsApp } = await import("./_core/whapi");

    const result = await sendWhatsApp("+56 9 1234 5678", "Hola");

    expect(result.success).toBe(false);
    expect(result.error).toContain("WHAPI_CANCAGUA_TOKEN");
  });

  it("returns a failure when WHAPI rejects the request", async () => {
    process.env.WHAPI_CANCAGUA_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: vi.fn().mockResolvedValue("bad token"),
    }));
    const { sendWhatsApp } = await import("./_core/whapi");

    const result = await sendWhatsApp("+56 9 1234 5678", "Hola");

    expect(result.success).toBe(false);
    expect(result.error).toContain("401");
  });
});
