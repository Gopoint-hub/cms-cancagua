import { describe, expect, it } from "vitest";
import {
  isSkeduBiopoolAppointment,
  peopleFromSkeduVariant,
  skeduPaymentMethod,
  type SkeduAppointment,
} from "./skeduBiopoolCalendar";

function appointment(overrides: Partial<SkeduAppointment> = {}): SkeduAppointment {
  return {
    UUID: "81881085-7a10-4765-87be-cf877f18567b",
    GroupUUID: "c39da3e7-06f5-42d7-a011-d9e28f9dc35b",
    UserUUID: "4e565e7c-0540-4d8e-9e16-fb1eb5cf85ca",
    StartsAt: "2026-08-12T21:00:00Z",
    EndsAt: "2026-08-13T01:00:00Z",
    Service: { Name: "Biopiscinas Geotermales (Estadía de 4 horas)" },
    Variant: { Name: "Ticket 2 Adultos" },
    ...overrides,
  };
}

describe("reservas Skedu en Calendario 360", () => {
  it("reconoce servicios de biopiscinas vigentes", () => {
    expect(isSkeduBiopoolAppointment(appointment())).toBe(true);
    expect(isSkeduBiopoolAppointment(appointment({ Service: { Name: "Reset - Biopiscinas Geotermales" } }))).toBe(true);
    expect(isSkeduBiopoolAppointment(appointment({ Service: { Name: "Hot Tub" } }))).toBe(false);
  });

  it("excluye reservas eliminadas", () => {
    expect(isSkeduBiopoolAppointment(appointment({ DeletedAt: "2026-08-11T10:00:00Z" }))).toBe(false);
    expect(isSkeduBiopoolAppointment(appointment({ RealDeletedAt: "2026-08-11T10:00:00Z" }))).toBe(false);
  });

  it("obtiene la cantidad de personas desde la variante", () => {
    expect(peopleFromSkeduVariant("Ticket 4 Adultos")).toBe(4);
    expect(peopleFromSkeduVariant("2 adultos y 1 niño")).toBe(3);
    expect(peopleFromSkeduVariant("Ticket para 2 (Alimentación + Biopiscinas)")).toBe(2);
    expect(peopleFromSkeduVariant("Ticket Adulto")).toBe(1);
  });

  it("normaliza los medios de pago de Skedu", () => {
    expect(skeduPaymentMethod({ UUID: "1", Method: "Deposit" })).toBe("bank_transfer");
    expect(skeduPaymentMethod({ UUID: "2", Method: "Cash" })).toBe("cash");
    expect(skeduPaymentMethod({ UUID: "3", SystemSlug: "webpay" })).toBe("webpay");
  });
});
