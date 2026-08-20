import { describe, expect, it } from "vitest";
import { customerAcquisitionSchema, normalizeCustomerAcquisition } from "../shared/customerAcquisition";

describe("datos de origen de una compra", () => {
  it("exige región y ciudad para clientes de Chile", () => {
    const result = customerAcquisitionSchema.safeParse({
      discoverySource: "google",
      originType: "chile",
      region: "Región de Los Lagos",
    });
    expect(result.success).toBe(false);
  });

  it("exige detalle cuando la fuente es Otro y país para extranjeros", () => {
    const result = customerAcquisitionSchema.safeParse({
      discoverySource: "other",
      originType: "foreign",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["discoverySourceOther", "country"]));
    }
  });

  it("normaliza una respuesta chilena sin guardar campos extranjeros", () => {
    expect(normalizeCustomerAcquisition({
      discoverySource: "friends_family",
      originType: "chile",
      region: "Región de Los Lagos",
      city: "Frutillar",
    })).toEqual({
      discoverySource: "friends_family",
      discoverySourceOther: null,
      originType: "chile",
      country: "Chile",
      region: "Región de Los Lagos",
      city: "Frutillar",
    });
  });
});
