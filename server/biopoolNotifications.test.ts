import { afterEach, describe, expect, it } from "vitest";
import {
  buildBiopoolNotificationSchedule,
  renderBiopoolTemplate,
  staffRecipient,
} from "./biopoolNotifications";

describe("Programación de comunicaciones de Biopiscinas", () => {
  it("envía email y WhatsApp inmediatamente, además de los recordatorios habilitados", () => {
    const confirmationAt = new Date("2026-08-13T14:00:00Z");
    const reminderAt = new Date("2026-08-14T23:00:00Z");
    const schedule = buildBiopoolNotificationSchedule({
      bookingId: 42,
      confirmationAt,
      reminderAt,
      reminderEmailEnabled: 1,
      reminderWhatsappEnabled: 1,
    });

    expect(schedule).toEqual([
      expect.objectContaining({ type: "confirmation", channel: "email", scheduledAt: confirmationAt }),
      expect.objectContaining({ type: "confirmation", channel: "whatsapp", scheduledAt: confirmationAt }),
      expect.objectContaining({ type: "reminder", channel: "email", scheduledAt: reminderAt }),
      expect.objectContaining({ type: "reminder", channel: "whatsapp", scheduledAt: reminderAt }),
    ]);
  });

  it("evita duplicar mensajes cuando la hora del recordatorio ya pasó", () => {
    const schedule = buildBiopoolNotificationSchedule({
      bookingId: 43,
      confirmationAt: new Date("2026-08-13T14:00:00Z"),
      reminderAt: new Date("2026-08-13T10:00:00Z"),
      reminderEmailEnabled: 1,
      reminderWhatsappEnabled: 1,
    });

    expect(schedule.map(item => `${item.type}:${item.channel}`)).toEqual([
      "confirmation:email",
      "confirmation:whatsapp",
    ]);
  });
});

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
