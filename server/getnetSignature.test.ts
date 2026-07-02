import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { validateGetnetWebhookSignature } from "./getnet";

const SECRET = process.env.GETNET_SECRET_KEY ?? "";

function sign(algo: "sha1" | "sha256", requestId: string, status: string, date: string): string {
  return createHash(algo).update(requestId + status + date + SECRET).digest("hex");
}

describe("validateGetnetWebhookSignature", () => {
  const requestId = "10999015";
  const status = "APPROVED";
  const date = "2026-07-02T11:37:00-04:00";

  it("acepta firma SHA-1 (estándar PlacetoPay/Getnet)", () => {
    const sig = sign("sha1", requestId, status, date);
    expect(validateGetnetWebhookSignature(requestId, status, date, sig)).toBe(true);
  });

  it("acepta firma SHA-256 (compatibilidad)", () => {
    const sig = sign("sha256", requestId, status, date);
    expect(validateGetnetWebhookSignature(requestId, status, date, sig)).toBe(true);
  });

  it("acepta firma en mayúsculas", () => {
    const sig = sign("sha1", requestId, status, date).toUpperCase();
    expect(validateGetnetWebhookSignature(requestId, status, date, sig)).toBe(true);
  });

  it("rechaza firma incorrecta", () => {
    expect(validateGetnetWebhookSignature(requestId, status, date, "deadbeef".repeat(5))).toBe(false);
  });

  it("rechaza firma de otro requestId", () => {
    const sig = sign("sha1", "999", status, date);
    expect(validateGetnetWebhookSignature(requestId, status, date, sig)).toBe(false);
  });

  it("rechaza firma vacía", () => {
    expect(validateGetnetWebhookSignature(requestId, status, date, "")).toBe(false);
  });
});
