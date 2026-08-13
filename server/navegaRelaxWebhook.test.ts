import { describe, expect, it } from "vitest";
import { parseBandurriaEvent, parseBandurriaReservation } from "./navegaRelaxWebhook";

const body = `
Nueva reserva
Reserva BAN-B7D84
Tienen una nueva reserva de Navega & Relax que saldrá con Catamarán Bandurria.
N° de reserva BAN-B7D84
Fecha 14 de Agosto, 2026
Horario 13:00 hrs
Pasajero Erica Da Silva
Teléfono +56946389908
Email erica@destinochile.com.br
Pasajeros 1
Tipo 1 adulto
`;

describe("Navega Relax desde Bandurria", () => {
  it("extrae los datos de una reserva", () => {
    expect(parseBandurriaReservation(body)).toEqual({
      reference: "BAN-B7D84",
      bookingDate: "2026-08-14",
      startTime: "13:00",
      clientName: "Erica Da Silva",
      clientEmail: "erica@destinochile.com.br",
      clientPhone: "+56946389908",
      adultQuantity: 1,
      childQuantity: 0,
      totalGuests: 1,
    });
  });

  it("acepta una combinación de adultos y niños consistente", () => {
    const parsed = parseBandurriaReservation(body.replace("Pasajeros 1", "Pasajeros 3").replace("Tipo 1 adulto", "Tipo 2 adultos, 1 niño"));
    expect(parsed.adultQuantity).toBe(2);
    expect(parsed.childQuantity).toBe(1);
    expect(parsed.totalGuests).toBe(3);
  });

  it("ignora remitentes distintos de Bandurria", () => {
    const event = { payload: { headers: [{ name: "From", value: "otro@example.com" }, { name: "Subject", value: "Nueva reserva Navega & Relax" }], body: { data: Buffer.from(body).toString("base64url") } } };
    expect(parseBandurriaEvent(event)).toBeNull();
  });

  it("procesa el evento Gmail válido", () => {
    const event = { payload: { headers: [{ name: "From", value: '"Catamarán Bandurria" <catamaran@catamaranbandurria.cl>' }, { name: "Subject", value: "Nueva reserva Navega & Relax · BAN-B7D84 · 2026-08-14" }], body: { data: Buffer.from(body).toString("base64url") } } };
    expect(parseBandurriaEvent(event)?.reference).toBe("BAN-B7D84");
  });

  it("rechaza correos incompletos", () => {
    expect(() => parseBandurriaReservation("Reserva BAN-123"))
      .toThrow("no contiene todos los datos obligatorios");
  });
});
