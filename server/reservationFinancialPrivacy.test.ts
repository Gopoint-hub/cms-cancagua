import { describe, expect, it } from "vitest";
import {
  canReadClientGiftCards,
  canReadReservationFinancials,
  presentBiopoolActivityFinancials,
  presentBiopoolBookingFinancials,
  presentClientAuditActivity,
  presentReservationFinancials,
  presentSaunaBookingFinancials,
} from "./reservationFinancialPrivacy";
import { saunaRouter } from "./saunaRouter";
import { biopoolsRouter } from "./biopoolsRouter";

const userWith = (...permissions: string[]) => ({
  role: "user",
  permissions: JSON.stringify(permissions),
});

describe("privacidad financiera de reservas", () => {
  it("rechaza la API nativa de pagos de Sauna sin permiso financiero", async () => {
    const caller = saunaRouter.createCaller({
      user: {
        id: 81,
        role: "user",
        permissions: JSON.stringify(["module.sauna", "sauna.view_clients"]),
      },
      req: { protocol: "https", headers: {} },
      res: {},
    } as any);

    await expect(
      caller.agenda.getPayments({ bookingId: 9 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rechaza la API nativa de ventas Bio sin permiso financiero", async () => {
    const caller = biopoolsRouter.createCaller({
      user: {
        id: 82,
        role: "user",
        permissions: JSON.stringify([
          "module.biopools",
          "biopools.view_clients",
        ]),
      },
      req: { protocol: "https", headers: {} },
      res: {},
    } as any);

    await expect(caller.sales.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("no confunde acceso a clientes con acceso a Gift Cards", () => {
    expect(canReadClientGiftCards(userWith("biopools.view_clients"))).toBe(
      false
    );
    expect(
      canReadClientGiftCards(
        userWith("biopools.view_clients", "module.gift_cards")
      )
    ).toBe(true);
  });

  it("separa ver clientes de ver pagos en cada servicio", () => {
    expect(
      canReadReservationFinancials(
        userWith("massages.view_clients"),
        "massages"
      )
    ).toBe(false);
    expect(
      canReadReservationFinancials(
        userWith("massages.view_clients", "massages.view_sales"),
        "massages"
      )
    ).toBe(true);

    expect(
      canReadReservationFinancials(
        userWith("biopools.view_clients"),
        "biopools"
      )
    ).toBe(false);
    expect(
      canReadReservationFinancials(
        userWith("biopools.view_clients", "biopools.manage_agenda"),
        "biopools"
      )
    ).toBe(true);

    expect(
      canReadReservationFinancials(userWith("sauna.view_clients"), "sauna")
    ).toBe(false);
    expect(
      canReadReservationFinancials(
        userWith("sauna.view_clients", "sauna.view_sales"),
        "sauna"
      )
    ).toBe(true);
  });

  it("conserva datos operativos y elimina todos los campos financieros del historial 360", () => {
    const event = {
      id: "biopool:7",
      service: "biopools" as const,
      title: "Biopiscina",
      status: "confirmed",
      paymentStatus: "partially_paid",
      amountClp: 20_000,
      totalAmountClp: 72_000,
      balanceAmountClp: 52_000,
    };

    expect(
      presentReservationFinancials(event, userWith("biopools.view_clients"))
    ).toEqual({
      ...event,
      paymentStatus: null,
      amountClp: null,
      totalAmountClp: null,
      balanceAmountClp: null,
      financialRestricted: true,
    });
    expect(
      presentReservationFinancials(
        event,
        userWith("biopools.view_clients", "biopools.view_sales")
      )
    ).toEqual({ ...event, financialRestricted: false });
  });

  it("conserva la trazabilidad del audit sin propagar notas libres", () => {
    const rows = [
      {
        id: 4,
        action: "profile_updated",
        detail:
          '{"before":{"notes":"saldo $45.000"},"after":{"notes":"pagado"}}',
        actorUserId: 8,
      },
    ];
    expect(presentClientAuditActivity(rows, true)).toEqual([
      {
        id: 4,
        action: "profile_updated",
        detail: null,
        actorUserId: 8,
      },
    ]);
    expect(presentClientAuditActivity(rows, false)).toEqual(rows);
  });

  it("redacta la agenda nativa de Sauna sin borrar información operacional", () => {
    const booking = {
      id: 11,
      clientName: "Cliente Sauna",
      status: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "gift_card",
      paymentReference: "GC-SECRETA",
      amountClp: 45_000,
      amountPaidClp: 45_000,
      notes: [
        "Necesita apoyo para ingresar",
        "Pago Getnet acreditado automáticamente (REQ-123).",
      ].join("\n"),
    };
    const result = presentSaunaBookingFinancials(booking, false);

    expect(result).toMatchObject({
      id: 11,
      clientName: "Cliente Sauna",
      status: "confirmed",
      paymentStatus: null,
      paymentMethod: null,
      paymentReference: null,
      amountClp: null,
      amountPaidClp: null,
      notes: "Necesita apoyo para ingresar",
      paymentRestricted: true,
    });
    expect(JSON.stringify(result)).not.toContain("GC-SECRETA");
    expect(JSON.stringify(result)).not.toContain("REQ-123");
  });

  it("redacta montos, descuentos, reembolsos y actividad financiera de Biopiscinas", () => {
    const booking = {
      id: 12,
      clientName: "Cliente Bio",
      paymentStatus: "partially_refunded",
      paymentMethod: "gift_card",
      paymentReference: "GC-PRIVADA",
      originalAmountClp: 72_000,
      discountAmountClp: 10_000,
      discountCodeId: 3,
      discountCode: "CODIGO-PRIVADO",
      amountPaidClp: 62_000,
      refundAmountClp: 5_000,
      refundFeeAmountClp: 1_250,
      refundStatus: "pending",
      refundFeePercent: "0.25",
      notes: "Cliente llegará 10 minutos antes",
    };
    const result = presentBiopoolBookingFinancials(booking, false);

    expect(result).toMatchObject({
      id: 12,
      clientName: "Cliente Bio",
      paymentStatus: null,
      paymentMethod: null,
      paymentReference: null,
      originalAmountClp: null,
      discountAmountClp: null,
      discountCodeId: null,
      discountCode: null,
      amountPaidClp: null,
      refundAmountClp: null,
      refundFeeAmountClp: null,
      refundStatus: null,
      refundFeePercent: null,
      notes: "Cliente llegará 10 minutos antes",
      paymentRestricted: true,
    });
    expect(JSON.stringify(result)).not.toContain("GC-PRIVADA");
    expect(JSON.stringify(result)).not.toContain("CODIGO-PRIVADO");

    const activity = presentBiopoolActivityFinancials(
      [
        {
          action: "payment_added",
          detail: '{"amountClp":62000,"reference":"GC-PRIVADA"}',
        },
        {
          action: "booking_created",
          detail: '{"originalAmountClp":72000}',
        },
        {
          action: "guest_count_updated",
          detail:
            '{"from":{"adults":1,"children":0,"totalClp":36000},"to":{"adults":2,"children":1,"totalClp":90000}}',
        },
        {
          action: "status_cancelled",
          detail:
            '{"reason":"Cambio de fecha","refund":{"netClp":62000,"feeClp":10000}}',
        },
        {
          action: "booking_rescheduled",
          detail: '{"from":"10:00","to":"11:00"}',
        },
      ],
      false
    );
    expect(activity).toEqual([
      { action: "booking_created", detail: null },
      {
        action: "guest_count_updated",
        detail:
          '{"from":{"adults":1,"children":0},"to":{"adults":2,"children":1}}',
      },
      {
        action: "status_cancelled",
        detail: '{"reason":"Cambio de fecha"}',
      },
      {
        action: "booking_rescheduled",
        detail: '{"from":"10:00","to":"11:00"}',
      },
    ]);
  });
});
