import { describe, expect, it } from "vitest";
import { isDuplicateColumnError } from "./ensureCustomerExperienceSchema";

describe("isDuplicateColumnError", () => {
  it("reconoce el error MySQL envuelto por Drizzle", () => {
    const error = Object.assign(new Error("Failed query: ALTER TABLE discount_codes"), {
      cause: Object.assign(new Error("Duplicate column name 'booking_valid_from'"), {
        code: "ER_DUP_FIELDNAME",
        errno: 1060,
        sqlMessage: "Duplicate column name 'booking_valid_from'",
      }),
    });

    expect(isDuplicateColumnError(error)).toBe(true);
  });

  it("no oculta errores distintos", () => {
    const error = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("Access denied"), {
        code: "ER_ACCESS_DENIED_ERROR",
        errno: 1045,
      }),
    });

    expect(isDuplicateColumnError(error)).toBe(false);
  });
});
