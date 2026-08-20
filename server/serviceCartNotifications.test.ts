import { describe, expect, it } from "vitest";
import { buildServiceCartConfirmationEmail } from "./serviceCartNotifications";

describe("correo consolidado del carrito de servicios", () => {
  it("reúne Biopiscinas y Sauna sin repetir la información común", () => {
    const email = buildServiceCartConfirmationEmail({
      clientName: "Camila Pérez",
      totalClp: 89000,
      items: [
        { module: "sauna", itemName: "Sauna Nativo", bookingDate: "2026-08-25", startTime: "10:00", endTime: "11:00", guests: 2, bookingCode: "SAU-001" },
        { module: "biopools", itemName: "Biopiscinas Geotermales", bookingDate: "2026-08-25", startTime: "12:00", endTime: "16:00", guests: 2, bookingCode: "BIO-002" },
      ],
    });

    expect(email.subject).toBe("Confirmación de tus experiencias en Cancagua");
    expect(email.html).toContain("Sauna Nativo");
    expect(email.html).toContain("10:00 a 11:00");
    expect(email.html).toContain("Biopiscinas Geotermales");
    expect(email.html).toContain("12:00 a 16:00");
    expect(email.html.match(/Información común para tu visita/g)).toHaveLength(1);
    expect(email.html.match(/Total pagado/g)).toHaveLength(1);
    expect(email.text).toContain("SAU-001");
    expect(email.text).toContain("BIO-002");
  });

  it("reúne masaje y clases en el mismo correo de una compra Transbank mixta", () => {
    const email = buildServiceCartConfirmationEmail({
      clientName: "Camila Pérez",
      totalClp: 149000,
      items: [
        { module: "massages", itemName: "Masaje relajación", bookingDate: "2026-08-25", startTime: "10:00", endTime: "10:50", guests: 1 },
        { module: "regular_classes", itemName: "Plan Pulso 3", bookingDate: "2026-08-01", startTime: "00:00", endTime: "00:00", guests: 1 },
        { module: "sauna", itemName: "Sauna Nativo", bookingDate: "2026-08-25", startTime: "12:00", endTime: "13:00", guests: 2 },
      ],
    });
    expect(email.html).toContain("Masaje relajación");
    expect(email.html).toContain("Plan Pulso 3");
    expect(email.html).toContain("Sauna Nativo");
    expect(email.html.match(/Información común para tu visita/g)).toHaveLength(1);
    expect(email.html.match(/Total pagado/g)).toHaveLength(1);
  });
});
