import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import {
  assertPaymentLinkPayable,
  type BookingSnapshot,
  paymentLinkServiceSchema,
  paymentLinkExpiry,
  reservationPaymentLinksRouter,
  samePaymentLinkClient,
  validatePaymentLinkApproval,
} from "./reservationPaymentLinks";
import { assertReservationPaymentEditable } from "./reservationPayments";

const VALID_TOKEN = "a".repeat(48);

function context(user: TrpcContext["user"] = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function userWithoutOperationalPermissions(): NonNullable<TrpcContext["user"]> {
  const now = new Date("2026-08-17T12:00:00.000Z");
  return {
    id: 91,
    openId: "payment-link-test-user",
    email: "sin-permisos@example.com",
    name: "Usuario sin permisos",
    passwordHash: null,
    loginMethod: "email",
    role: "user",
    permissions: "[]",
    status: "active",
    allowedModules: null,
    invitationToken: null,
    invitationExpiresAt: null,
    resetToken: null,
    resetTokenExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

function snapshot(changes: Partial<BookingSnapshot> = {}): BookingSnapshot {
  return {
    service: "biopools",
    reservationId: 1,
    provider: "webpay",
    totalClp: 72_000,
    amountPaidClp: 0,
    outstandingClp: 72_000,
    status: "confirmed",
    clientName: "Coni Sandoval",
    clientEmail: "coni@example.com",
    clientPhone: "+56 9 5360 0260",
    serviceName: "Biopiscinas",
    bookingDate: "2026-08-18",
    startTime: "10:00",
    ...changes,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("contrato público de links de pago", () => {
  it("expone las cuatro operaciones esperadas", () => {
    expect(
      Object.keys(reservationPaymentLinksRouter._def.procedures).sort()
    ).toEqual(["activeForReservation", "cancel", "create", "get", "start"]);
  });

  it("acepta únicamente módulos que tienen conciliación implementada", () => {
    for (const service of [
      "massages",
      "massage_programs",
      "biopools",
      "sauna",
    ]) {
      expect(paymentLinkServiceSchema.safeParse(service).success).toBe(true);
    }

    for (const service of ["regular_classes", "hot_tubs", "gift_cards", ""]) {
      expect(paymentLinkServiceSchema.safeParse(service).success).toBe(false);
    }
  });

  it("rechaza tokens públicos truncados antes de consultar datos", async () => {
    const caller = reservationPaymentLinksRouter.createCaller(context());

    await expect(caller.get({ token: "corto" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.start({ token: "corto" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("mantiene creación y cancelación protegidas por autenticación", async () => {
    const caller = reservationPaymentLinksRouter.createCaller(context());

    await expect(
      caller.create({
        reservations: [{ service: "massages", reservationId: 1 }],
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.cancel({ token: VALID_TOKEN })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("impide generar cobros a usuarios sin permiso operativo", async () => {
    const caller = reservationPaymentLinksRouter.createCaller(
      context(userWithoutOperationalPermissions())
    );

    await expect(
      caller.create({
        reservations: [{ service: "biopools", reservationId: 7 }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rechaza reservas repetidas y lotes fuera de rango", async () => {
    const caller = reservationPaymentLinksRouter.createCaller(
      context(userWithoutOperationalPermissions())
    );

    await expect(
      caller.create({
        reservations: [
          { service: "sauna", reservationId: 12 },
          { service: "sauna", reservationId: 12 },
        ],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(caller.create({ reservations: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    await expect(
      caller.create({
        reservations: Array.from({ length: 21 }, (_, index) => ({
          service: "massages" as const,
          reservationId: index + 1,
        })),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("validación de aprobaciones del proveedor", () => {
  const approved = {
    amountClp: 36_000,
    currency: "CLP",
    providerReference: "RPL-APROBADA-1",
    expectedAmountClp: 36_000,
    expectedReference: "RPL-APROBADA-1",
  };

  it.each([
    [undefined, "monto CLP válido"],
    [Number.NaN, "monto CLP válido"],
    [0, "monto CLP válido"],
    [-1, "monto CLP válido"],
    [36_000.5, "monto CLP válido"],
  ])("rechaza montos inválidos (%s)", (amountClp, message) => {
    expect(validatePaymentLinkApproval({ ...approved, amountClp })).toContain(
      message
    );
  });

  it("compara moneda y referencia de forma exacta", () => {
    expect(
      validatePaymentLinkApproval({ ...approved, currency: "clp" })
    ).toContain("moneda");
    expect(
      validatePaymentLinkApproval({
        ...approved,
        providerReference: ` ${approved.providerReference}`,
      })
    ).toContain("referencia");
    expect(validatePaymentLinkApproval(approved)).toBeNull();
  });
});

describe("vigencia y agrupación del cobro", () => {
  it("identifica al mismo cliente por correo normalizado", () => {
    expect(
      samePaymentLinkClient(
        snapshot({ clientEmail: " Coni@Example.com " }),
        snapshot({
          reservationId: 2,
          clientEmail: "coni@example.com",
          clientPhone: "+56 9 0000 0000",
          clientName: "Otro formato de nombre",
        })
      )
    ).toBe(true);
  });

  it("usa teléfono y luego nombre cuando no hay correos comparables", () => {
    expect(
      samePaymentLinkClient(
        snapshot({ clientEmail: null, clientPhone: "+56 9 5360 0260" }),
        snapshot({
          reservationId: 2,
          clientEmail: null,
          clientPhone: "56953600260",
          clientName: "Nombre distinto",
        })
      )
    ).toBe(true);

    expect(
      samePaymentLinkClient(
        snapshot({ clientEmail: null, clientPhone: null }),
        snapshot({
          reservationId: 2,
          clientEmail: null,
          clientPhone: null,
          clientName: "  CONI   SANDOVAL ",
        })
      )
    ).toBe(true);
  });

  it("no agrupa clientes con identificadores completos distintos", () => {
    expect(
      samePaymentLinkClient(
        snapshot(),
        snapshot({
          reservationId: 2,
          clientEmail: "otra@example.com",
          clientPhone: "+56 9 0000 0000",
          clientName: "Otra persona",
        })
      )
    ).toBe(false);
  });

  it("vence a las 24 horas o al comenzar la reserva, lo que ocurra primero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:00:00.000Z"));

    expect(paymentLinkExpiry([snapshot()]).toISOString()).toBe(
      "2026-08-18T12:00:00.000Z"
    );
    expect(
      paymentLinkExpiry([
        snapshot({ bookingDate: "2026-08-17", startTime: "10:00" }),
      ]).toISOString()
    ).toBe("2026-08-17T14:00:00.000Z");
  });

  it("no emite un link para una reserva que ya comenzó", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:00:00.000Z"));

    expect(() =>
      paymentLinkExpiry([
        snapshot({ bookingDate: "2026-08-17", startTime: "07:00" }),
      ])
    ).toThrow(/ya comenzó/);
  });
});

describe("reservas cobrables", () => {
  it("acepta una reserva vigente con saldo total o parcial", () => {
    expect(() => assertPaymentLinkPayable(snapshot())).not.toThrow();
    expect(() =>
      assertPaymentLinkPayable(
        snapshot({ amountPaidClp: 30_000, outstandingClp: 42_000 })
      )
    ).not.toThrow();
  });

  it.each(["cancelled", "no_show"])(
    "rechaza una reserva con estado %s",
    status => {
      expect(() => assertPaymentLinkPayable(snapshot({ status }))).toThrow(
        /cancelada|inasistencia/
      );
    }
  );

  it("rechaza servicios sin precio y reservas ya pagadas", () => {
    expect(() =>
      assertPaymentLinkPayable(
        snapshot({ totalClp: 0, amountPaidClp: 0, outstandingClp: 0 })
      )
    ).toThrow(/monto por cobrar/);
    expect(() =>
      assertPaymentLinkPayable(
        snapshot({ amountPaidClp: 72_000, outstandingClp: 0 })
      )
    ).toThrow(/pagada completamente/);
  });
});

describe("protección de pagos acreditados", () => {
  it("protege solo pagos confirmados por la pasarela", () => {
    for (const method of ["webpay", "webpay_plus", "getnet"]) {
      expect(() => assertReservationPaymentEditable({ method })).toThrow(
        /protegidos/
      );
    }
  });

  it("permite reemplazar marcadores pendientes de un link vencido o cancelado", () => {
    for (const method of [
      "pending_payment",
      "payment_link",
      "getnet_link",
      "cash",
      "bank_transfer",
      "gift_card",
      "transbank_machine",
    ]) {
      expect(() => assertReservationPaymentEditable({ method })).not.toThrow();
    }
  });
});
