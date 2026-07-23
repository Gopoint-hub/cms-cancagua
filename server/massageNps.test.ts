import { describe, expect, it } from "vitest";
import { chileLocalDateTimeToUtc } from "./massageNps";

describe("chileLocalDateTimeToUtc", () => {
  it("convierte correctamente el horario de invierno de Chile", () => {
    expect(chileLocalDateTimeToUtc("2026-07-23", "14:30").toISOString())
      .toBe("2026-07-23T18:30:00.000Z");
  });

  it("convierte correctamente el horario de verano de Chile", () => {
    expect(chileLocalDateTimeToUtc("2026-01-23", "14:30").toISOString())
      .toBe("2026-01-23T17:30:00.000Z");
  });
});
