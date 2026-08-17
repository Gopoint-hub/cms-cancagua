import { describe, expect, it } from "vitest";
import {
  buildClientKey,
  buildPaymentDetail,
  chooseClientProfileCandidate,
  deduplicateSkeduAppointments,
  inferSkeduClientService,
  isVisibleCalendarReservation,
  normalizeClientEmail,
  normalizeClientPhone,
  resolveMergedClientProfileIds,
  santiagoLocalMidnightUtc,
  skeduClientEventStatus,
} from "./operations360Router";
import { canAccessCmsPath } from "../shared/permissions";

describe("Cliente 360", () => {
  it("prioriza correo normalizado para unir historiales", () => {
    expect(buildClientKey({ email: " Cliente@Cancagua.cl ", phone: "+56 9 1111 2222" }))
      .toBe("email:cliente@cancagua.cl");
  });

  it("usa teléfono cuando no existe correo", () => {
    expect(buildClientKey({ phone: "+56 9 1111 2222", name: "Cliente" }))
      .toBe("phone:56911112222");
  });

  it("normaliza formatos móviles chilenos al mismo alias", () => {
    expect(normalizeClientPhone("9 5360 0260")).toBe("56953600260");
    expect(normalizeClientPhone("+56 9 5360 0260")).toBe("56953600260");
    expect(normalizeClientEmail(" Persona@Example.COM ")).toBe("persona@example.com");
  });

  it("jamás agrupa personas solo por compartir nombre", () => {
    expect(buildClientKey({ name: "María", sourceKey: "massage:1" }))
      .toBe("unidentified:massage:1");
    expect(buildClientKey({ name: "María", sourceKey: "massage:2" }))
      .toBe("unidentified:massage:2");
  });

  it("no fusiona automáticamente identidades contradictorias", () => {
    expect(chooseClientProfileCandidate({ emailProfileId: 10, phoneProfileId: 20 }))
      .toEqual({ profileId: 10, conflict: true });
    expect(chooseClientProfileCandidate({ emailProfileId: 10, phoneProfileId: 10 }))
      .toEqual({ profileId: 10, conflict: false });
  });

  it("resuelve aliases conservados en una ficha fusionada hacia el destino", () => {
    expect(resolveMergedClientProfileIds([10, 20], [
      { id: 10, status: "merged", mergedIntoProfileId: 20 },
      { id: 20, status: "active", mergedIntoProfileId: null },
    ])).toEqual([20]);
  });
});

describe("historial Skedu de Cliente 360", () => {
  it("clasifica servicios conocidos y conserva fallback extensible", () => {
    expect(inferSkeduClientService("Masaje Relajante")).toBe("massages");
    expect(inferSkeduClientService("Biopiscinas Geotermales")).toBe("biopools");
    expect(inferSkeduClientService("Sauna Nativo")).toBe("sauna");
    expect(inferSkeduClientService("Hatha Yoga")).toBe("regular_classes");
    expect(inferSkeduClientService("Servicio futuro")).toBe("other");
  });

  it("deduplica UUID y conserva la actualización más reciente", () => {
    const rows = deduplicateSkeduAppointments([
      { UUID: "a", UpdatedAt: "2026-01-01T10:00:00Z", Service: { Name: "Antiguo" } },
      { UUID: "a", UpdatedAt: "2026-01-01T11:00:00Z", Service: { Name: "Nuevo" } },
      { UUID: "b", UpdatedAt: "2026-01-01T09:00:00Z" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.UUID === "a")?.Service.Name).toBe("Nuevo");
  });

  it("no inventa asistencia a partir de estados opacos", () => {
    expect(skeduClientEventStatus({ DeletedAt: "2026-01-01" })).toBe("cancelled");
    expect(skeduClientEventStatus({ IsTemporary: true })).toBe("pending");
    expect(skeduClientEventStatus({ IsConfirmed: false })).toBe("pending");
    expect(skeduClientEventStatus({ IsConfirmed: true })).toBe("confirmed");
  });

  it("convierte el rango local de Chile a límites UTC", () => {
    expect(santiagoLocalMidnightUtc("2026-08-17"))
      .toBe("2026-08-17T04:00:00.000Z");
    expect(santiagoLocalMidnightUtc("2026-01-17"))
      .toBe("2026-01-17T03:00:00.000Z");
  });
});

describe("acceso a vistas 360", () => {
  it("permite calendario con acceso a cualquier módulo operativo", () => {
    const permissions = JSON.stringify(["module.biopools"]);
    expect(canAccessCmsPath("editor", "/cms/calendario", false, permissions)).toBe(true);
    expect(canAccessCmsPath("editor", "/cms/calendario", false, JSON.stringify(["module.sauna"]))).toBe(true);
    expect(canAccessCmsPath("editor", "/cms/clientes-360", false, permissions)).toBe(false);
  });

  it("requiere permiso de clientes para Cliente 360", () => {
    const permissions = JSON.stringify(["module.biopools", "biopools.view_clients"]);
    expect(canAccessCmsPath("editor", "/cms/clientes-360", false, permissions)).toBe(true);
    expect(canAccessCmsPath(
      "editor",
      "/cms/clientes-360",
      false,
      JSON.stringify(["module.sauna", "sauna.view_clients"]),
    )).toBe(true);
  });

  it("reserva el Dashboard BI exclusivamente para superadministradores", () => {
    const permissions = JSON.stringify(["module.b2c", "biopools.view_clients"]);
    expect(canAccessCmsPath("admin", "/cms/clientes-360/dashboard-bi", false, permissions)).toBe(false);
    expect(canAccessCmsPath("super_admin", "/cms/clientes-360/dashboard-bi", false, permissions)).toBe(true);
  });
});

describe("visibilidad de reservas en Calendario 360", () => {
  it("oculta todas las reservas canceladas", () => {
    expect(isVisibleCalendarReservation("cancelled")).toBe(false);
    expect(isVisibleCalendarReservation("confirmed")).toBe(true);
    expect(isVisibleCalendarReservation("pending")).toBe(true);
    expect(isVisibleCalendarReservation("completed")).toBe(true);
  });
});

describe("pagos diferenciados del Calendario 360", () => {
  it("separa código de descuento y pago Webpay", () => {
    const payment = buildPaymentDetail({
      status: "paid",
      method: "webpay_plus",
      reference: "003122",
      originalAmountClp: 72_000,
      discountAmountClp: 36_000,
      discountCode: "BIOPISCINA2X1",
      amountPaidClp: 36_000,
    });

    expect(payment).toMatchObject({
      originalAmountClp: 72_000,
      discountAmountClp: 36_000,
      totalAmountClp: 36_000,
      amountClp: 36_000,
      balanceAmountClp: 0,
    });
    expect(payment.lines).toEqual([
      expect.objectContaining({ type: "discount", reference: "BIOPISCINA2X1", amountClp: 36_000 }),
      expect.objectContaining({ type: "payment", method: "webpay_plus", reference: "003122", amountClp: 36_000 }),
    ]);
  });

  it("conserva cada abono futuro como una línea independiente", () => {
    const payment = buildPaymentDetail({
      status: "partially_paid",
      originalAmountClp: 80_000,
      amountPaidClp: 50_000,
      rows: [
        { id: 1, method: "bank_transfer", status: "paid", amountClp: 30_000, reference: "TR-1" },
        { id: 2, method: "cash", status: "paid", amountClp: 20_000 },
      ],
    });

    expect(payment.balanceAmountClp).toBe(30_000);
    expect(payment.lines.map(line => [line.method, line.amountClp])).toEqual([
      ["bank_transfer", 30_000],
      ["cash", 20_000],
    ]);
  });

  it("reconstruye el pago electrónico anterior junto a pagos manuales", () => {
    const payment = buildPaymentDetail({
      status: "paid",
      method: "mixed",
      amountPaidClp: 72_000,
      originalAmountClp: 72_000,
      legacyMethod: "webpay_plus",
      legacyReference: "006923",
      historicalDiscountCode: "BIOPISCINA2X1",
      historicalDiscountAmountClp: 36_000,
      rows: [
        { id: 1, method: "transbank_machine", status: "paid", amountClp: 36_000, reference: "005949" },
      ],
    });

    expect(payment.lines.map(line => [line.type, line.method, line.status, line.amountClp])).toEqual([
      ["discount", "Código de descuento", "removed", 36_000],
      ["payment", "webpay_plus", "paid", 36_000],
      ["payment", "transbank_machine", "paid", 36_000],
    ]);
  });

  it("señala un excedente cuando el nuevo valor queda bajo lo ya pagado", () => {
    const payment = buildPaymentDetail({
      originalAmountClp: 36_000,
      amountPaidClp: 72_000,
      status: "paid",
    });
    expect(payment.balanceAmountClp).toBe(0);
    expect(payment.overpaymentAmountClp).toBe(36_000);
  });
});
