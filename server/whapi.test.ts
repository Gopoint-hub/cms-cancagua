import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete process.env.WHAPI_CANCAGUA_TOKEN;
});

describe("findWhatsAppGroupId", () => {
  it("resolves the café group by its visible WhatsApp name", async () => {
    process.env.WHAPI_CANCAGUA_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ groups: [
        { id: "120363000000000000@g.us", name: "Café Cancagua 🍓" },
      ] }),
    }));
    const { findWhatsAppGroupId } = await import("./_core/whapi");

    await expect(findWhatsAppGroupId("Cafe Cancagua 🍓")).resolves.toBe("120363000000000000@g.us");
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ "User-Agent": expect.stringContaining("Mozilla/5.0") }),
    });
  });
});

describe("sendWhatsApp", () => {
  it("normalizes Chilean local mobile numbers without country code", async () => {
    process.env.WHAPI_CANCAGUA_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendWhatsApp } = await import("./_core/whapi");

    const result = await sendWhatsApp("1234 5678", "Hola");

    expect(result.success).toBe(true);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.to).toBe("56912345678@s.whatsapp.net");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "User-Agent": expect.stringContaining("Mozilla/5.0"),
    });
  });

  it("normalizes Chilean local mobile numbers with only +56 country code", async () => {
    process.env.WHAPI_CANCAGUA_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendWhatsApp } = await import("./_core/whapi");

    const result = await sendWhatsApp("+56 1234 5678", "Hola");

    expect(result.success).toBe(true);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.to).toBe("56912345678@s.whatsapp.net");
  });

  it("normalizes international numbers written with 00 prefix", async () => {
    process.env.WHAPI_CANCAGUA_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendWhatsApp } = await import("./_core/whapi");

    const result = await sendWhatsApp("00 54 9 11 1234 5678", "Hola");

    expect(result.success).toBe(true);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.to).toBe("5491112345678@s.whatsapp.net");
  });

  it("preserves WhatsApp group chat identifiers", async () => {
    process.env.WHAPI_CANCAGUA_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { sendWhatsApp } = await import("./_core/whapi");

    await sendWhatsApp("120363000000000000@g.us", "Nueva comanda");

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.to).toBe("120363000000000000@g.us");
  });

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

describe("checkWhatsAppHealth", () => {
  it("checks the Whapi channel without sending a message", async () => {
    process.env.WHAPI_CANCAGUA_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const { checkWhatsAppHealth } = await import("./_core/whapi");

    const result = await checkWhatsAppHealth();

    expect(result).toEqual({ success: true, configured: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gate.whapi.cloud/health",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "User-Agent": expect.stringContaining("Mozilla/5.0") }),
      }),
    );
  });

  it("reports a missing production token", async () => {
    const { checkWhatsAppHealth } = await import("./_core/whapi");

    await expect(checkWhatsAppHealth()).resolves.toMatchObject({
      success: false,
      configured: false,
    });
  });
});
