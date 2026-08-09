import { afterEach, describe, expect, it } from "vitest";
import { renderBiopoolTemplate, staffRecipient } from "./biopoolNotifications";

describe("Biopiscinas reminder template", () => {
  it("renders reservation, location and attendance confirmation data", () => {
    const message = renderBiopoolTemplate(
      "{{firstName}} · {{serviceName}} · {{date}} {{startTime}} · {{mapsUrl}} · {{confirmUrl}}",
      {
        clientName: "María Pérez",
        bookingCode: "BIO-001",
        bookingDate: "2026-08-08",
        startTime: "10:00",
        endTime: "14:00",
        adultQuantity: 1,
        childQuantity: 1,
        totalGuests: 2,
        attendanceToken: "token-confirmacion-123456789",
      } as any,
      {
        name: "Biopiscinas Geotermales",
        mapsUrl: "https://maps.google.com/cancagua",
        rulesUrl: "https://example.com/reglamento",
      } as any
    );

    expect(message).toContain("María · Biopiscinas Geotermales");
    expect(message).toContain("10:00 · https://maps.google.com/cancagua");
    expect(message).toContain("/biopiscinas/confirmar/token-confirmacion-123456789");
  });
});

describe("Destinatario de la copia a recepcion", () => {
  afterEach(() => {
    delete process.env.BIOPOOL_STAFF_EMAIL;
  });

  it("usa el email de notificacion del servicio cuando no hay variable", () => {
    expect(
      staffRecipient({ notificationEmail: "contacto@cancagua.cl" } as any)
    ).toBe("contacto@cancagua.cl");
  });

  it("prefiere BIOPOOL_STAFF_EMAIL cuando esta definida", () => {
    process.env.BIOPOOL_STAFF_EMAIL = " recepcion@cancagua.cl ";
    expect(
      staffRecipient({ notificationEmail: "contacto@cancagua.cl" } as any)
    ).toBe("recepcion@cancagua.cl");
  });

  it("devuelve vacio si no hay ninguno, para no intentar un envio sin destino", () => {
    expect(staffRecipient({ notificationEmail: "" } as any)).toBe("");
  });
});
