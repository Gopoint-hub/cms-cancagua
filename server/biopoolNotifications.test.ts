import { describe, expect, it } from "vitest";
import { renderBiopoolTemplate } from "./biopoolNotifications";

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
