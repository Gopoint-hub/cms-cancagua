import { describe, expect, it } from "vitest";
import { normalizeDecimalInput, serializeDateOnly } from "./masajesRouter";

describe("serializeDateOnly", () => {
  it("serializes Date values as YYYY-MM-DD strings for React-safe rendering", () => {
    expect(serializeDateOnly(new Date(2026, 4, 28))).toBe("2026-05-28");
  });

  it("preserves existing date strings and null values", () => {
    expect(serializeDateOnly("2026-05-28T12:30:00.000Z")).toBe("2026-05-28");
    expect(serializeDateOnly(null)).toBeNull();
  });
});

describe("normalizeDecimalInput", () => {
  it("accepts comma decimals and strips unit labels before saving", () => {
    expect(normalizeDecimalInput("0,2 ml")).toBe("0.2");
    expect(normalizeDecimalInput("2 ml")).toBe("2");
  });

  it("rejects values that do not contain a valid number", () => {
    expect(() => normalizeDecimalInput("ml")).toThrow("Ingresa una cantidad valida");
  });
});
