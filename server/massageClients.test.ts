import { describe, expect, it } from "vitest";
import {
  buildMassageClientDirectory,
  type MassageClientBookingRecord,
} from "./massageClients";

const booking = (
  overrides: Partial<MassageClientBookingRecord> = {},
): MassageClientBookingRecord => ({
  id: "massage:1",
  clientName: "María Pérez",
  clientEmail: "maria@example.com",
  clientPhone: "+56 9 1234 5678",
  clientOrigin: "Web",
  bookingDate: "2026-07-20",
  startTime: "10:00",
  duration: 50,
  serviceName: "Relajación",
  therapistName: "Bárbara",
  status: "completed",
  amountPaid: 45_000,
  crossSellServices: null,
  cancellationCategory: null,
  cancellationReason: null,
  cancelledAt: null,
  source: "massage",
  ...overrides,
});

describe("massage client directory", () => {
  it("registers standard and Skedu clients in the same directory", () => {
    const clients = buildMassageClientDirectory([
      booking(),
      booking({
        id: "skedu_program:2:1",
        clientName: "Ana Soto",
        clientEmail: "ana@example.com",
        clientPhone: null,
        clientOrigin: "Programa Skedu",
        source: "skedu_program",
        serviceName: "Programa Reconecta",
      }),
    ]);

    expect(clients).toHaveLength(2);
    expect(clients.map((client) => client.clientEmail)).toEqual([
      "ana@example.com",
      "maria@example.com",
    ]);
  });

  it("deduplicates changed contact data by normalized email or phone", () => {
    const clients = buildMassageClientDirectory([
      booking(),
      booking({
        id: "massage:2",
        clientEmail: " MARIA@EXAMPLE.COM ",
        clientPhone: "912345678",
        bookingDate: "2026-07-25",
        amountPaid: 50_000,
      }),
    ]);

    expect(clients).toHaveLength(1);
    expect(clients[0]).toEqual(expect.objectContaining({
      totalBookings: 2,
      totalSpent: 95_000,
      lastBookingDate: "2026-07-25",
    }));
    expect(clients[0].history).toHaveLength(2);
  });

  it("keeps clients with no email and includes cancelled booking history", () => {
    const clients = buildMassageClientDirectory([
      booking({
        clientName: "Cliente sin correo",
        clientEmail: null,
        clientPhone: null,
        status: "cancelled",
        amountPaid: 0,
        cancellationReason: "Cambio de planes",
      }),
    ]);

    expect(clients).toHaveLength(1);
    expect(clients[0].clientKey).toBe("name:cliente sin correo");
    expect(clients[0].history[0].status).toBe("cancelled");
  });
});
