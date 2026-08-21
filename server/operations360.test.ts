import { describe, expect, it } from "vitest";
import {
  biopoolActivityPresentation,
  buildClientKey,
  buildPaymentDetail,
  canReadRegularClassesCalendar,
  clientEventResponse,
  canLinkClientReservation360,
  canOpenClientReservation360Detail,
  canReplaceReservation360GiftCard,
  chooseClientProfileCandidate,
  deduplicateSkeduAppointments,
  guardLegacyPaymentMaterialization,
  inferSkeduClientService,
  isVisibleCalendarReservation,
  massageProgramPaymentState,
  normalizeClientEmail,
  normalizeClientPhone,
  regularClassCalendarTeacherScopeId,
  resolveMergedClientProfileIds,
  santiagoLocalMidnightUtc,
  skeduClientEventStatus,
  visibleReservationNotes,
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

  it("abre membresías desde Cliente 360 sólo con permiso de alumnos", () => {
    const membership = {
      sourceKey: "regular_class_membership:17",
      kind: "regular_class_membership" as const,
      service: "regular_classes" as const,
    };
    expect(
      canOpenClientReservation360Detail(membership, {
        role: "user",
        permissions: JSON.stringify(["regular_classes.students"]),
      })
    ).toBe(true);
    expect(
      canOpenClientReservation360Detail(membership, {
        role: "user",
        permissions: JSON.stringify(["module.regular_classes"]),
      })
    ).toBe(false);
  });

  it("no abre una asistencia individual como si fuera la sesión completa", () => {
    expect(
      canOpenClientReservation360Detail(
        {
          sourceKey: "regular_class_attendance:29",
          kind: "regular_class",
          service: "regular_classes",
        },
        {
          role: "user",
          permissions: JSON.stringify(["module.regular_classes"]),
        }
      )
    ).toBe(false);
  });
});

describe("vinculación exhaustiva de reservas 360", () => {
  const massageUser = {
    role: "user",
    permissions: JSON.stringify(["massages.manage_agenda"]),
  };

  it("asigna permisos explícitos a cada tipo de reserva enlazable", () => {
    expect(canLinkClientReservation360(massageUser, "massage")).toBe(true);
    expect(canLinkClientReservation360(massageUser, "massage_program")).toBe(true);
    expect(canLinkClientReservation360(massageUser, "biopool")).toBe(false);
    expect(
      canLinkClientReservation360(
        {
          role: "user",
          permissions: JSON.stringify(["regular_classes.students"]),
        },
        "regular_class_membership"
      )
    ).toBe(true);
  });

  it("falla de forma segura ante un tipo futuro sin adaptador", () => {
    expect(() =>
      canLinkClientReservation360(massageUser, "future_service" as never)
    ).toThrow(/no tiene adaptador/i);
  });
});

describe("visibilidad de reservas en Calendario 360", () => {
  it("oculta todas las reservas canceladas", () => {
    expect(isVisibleCalendarReservation("cancelled")).toBe(false);
    expect(isVisibleCalendarReservation("confirmed")).toBe(true);
    expect(isVisibleCalendarReservation("pending")).toBe(true);
    expect(isVisibleCalendarReservation("completed")).toBe(true);
  });

  it("limita clases al profesor enlazado y nunca abre el scope por ausencia", () => {
    expect(regularClassCalendarTeacherScopeId("admin", null)).toBeNull();
    expect(regularClassCalendarTeacherScopeId("user", 17)).toBe(17);
    expect(regularClassCalendarTeacherScopeId("user", null)).toBe(-1);
  });

  it("retira las clases del calendario si un profesor pierde módulo o asistencia", () => {
    expect(
      canReadRegularClassesCalendar({
        role: "user",
        permissions: JSON.stringify([
          "module.regular_classes",
          "regular_classes.attendance",
        ]),
      })
    ).toBe(true);
    expect(
      canReadRegularClassesCalendar({
        role: "user",
        permissions: JSON.stringify(["module.regular_classes"]),
      })
    ).toBe(false);
    expect(
      canReadRegularClassesCalendar({
        role: "user",
        permissions: JSON.stringify(["regular_classes.attendance"]),
      })
    ).toBe(false);
  });
});

describe("pagos diferenciados del Calendario 360", () => {
  it("bloquea links vivos antes de inspeccionar un pago legacy", async () => {
    const calls: string[] = [];
    await guardLegacyPaymentMaterialization({
      assertNoLiveAttempt: async () => {
        calls.push("live-link-guard");
      },
      loadExistingPayments: async () => {
        calls.push("existing-payments");
        return [];
      },
    });
    expect(calls).toEqual(["live-link-guard", "existing-payments"]);
  });

  it("no consulta pagos legacy si falla el guard de links activos", async () => {
    const calls: string[] = [];
    await expect(
      guardLegacyPaymentMaterialization({
        assertNoLiveAttempt: async () => {
          calls.push("live-link-guard");
          throw new Error("link activo");
        },
        loadExistingPayments: async () => {
          calls.push("existing-payments");
          return [];
        },
      })
    ).rejects.toThrow("link activo");
    expect(calls).toEqual(["live-link-guard"]);
  });

  it("muestra los abonos de programas como pago parcial", () => {
    const booking = {
      duration: 60,
      modality: "simple",
      status: "confirmed",
      paymentMethod: "pending_payment",
    } as any;
    const state = massageProgramPaymentState(booking, [
      { status: "paid", amountClp: 20_000 },
    ] as any);

    expect(state).toMatchObject({
      totalClp: 45_000,
      paidClp: 20_000,
      status: "partially_paid",
    });
  });

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

describe("privacidad financiera del detalle 360", () => {
  it("redacta montos, estado y notas financieras del historial con solo view_clients", () => {
    const response = clientEventResponse(
      {
        id: "massage:91",
        sourceKey: "massage:91",
        entityId: 91,
        kind: "massage",
        clientKey: "profile:8",
        service: "massages",
        date: "2026-08-20",
        startTime: "10:00",
        endTime: "11:00",
        title: "Masaje",
        status: "confirmed",
        paymentStatus: "paid",
        amountClp: 45_000,
        totalAmountClp: 45_000,
        balanceAmountClp: 0,
        people: 1,
        href: "/cms/masajes/agenda?date=2026-08-20",
        clientName: "Cliente",
        clientEmail: "cliente@example.com",
        clientPhone: "+56911111111",
        detail: [
          "Alérgica al aceite de almendras",
          "Pago Getnet acreditado automáticamente (REQ-PRIVADA).",
        ].join("\n"),
      },
      {
        role: "user",
        permissions: JSON.stringify(["massages.view_clients"]),
      }
    );

    expect(response).toMatchObject({
      paymentStatus: null,
      amountClp: null,
      totalAmountClp: null,
      balanceAmountClp: null,
      paidAmountClp: null,
      financialRestricted: true,
      hasPaymentRecord: false,
      detail: "Alérgica al aceite de almendras",
    });
    expect(JSON.stringify(response)).not.toContain("REQ-PRIVADA");
  });

  it("retira las líneas financieras del campo de notas sin ocultar notas operativas", () => {
    const notes = [
      "Cliente alérgica al aceite de almendras",
      "Pago Getnet acreditado automáticamente (REQ-123).",
      "Pago Webpay acreditado automáticamente (WP-456).",
      "RECONCILIACIÓN REQUERIDA: pago getnet por $45.000 registrado (REF-9).",
    ].join("\n");

    expect(visibleReservationNotes(notes, false)).toBe(
      "Cliente alérgica al aceite de almendras"
    );
    expect(visibleReservationNotes(notes, true)).toBe(notes);
  });

  it("oculta eventos de pago de Biopiscinas y depura detalles operativos", () => {
    expect(
      biopoolActivityPresentation(
        "payment_link_paid",
        JSON.stringify({ amountClp: 45_000, reference: "AUTH-1" }),
        false
      )
    ).toBeNull();
    expect(
      biopoolActivityPresentation(
        "booking_created_webpay",
        JSON.stringify({ authorizationCode: "AUTH-1" }),
        false
      )
    ).toEqual({ label: "booking_created", detail: null });
  });

  it("exige módulo, gestión de pagos y acceso a Gift Cards para reemplazarlas", () => {
    const allowed = {
      role: "user",
      permissions: JSON.stringify([
        "module.massages",
        "massages.manage_payments",
        "module.gift_cards",
      ]),
    };
    expect(canReplaceReservation360GiftCard(allowed, "massages")).toBe(true);
    expect(
      canReplaceReservation360GiftCard(
        {
          ...allowed,
          permissions: JSON.stringify([
            "massages.manage_payments",
            "module.gift_cards",
          ]),
        },
        "massages"
      )
    ).toBe(false);
    expect(
      canReplaceReservation360GiftCard(
        {
          ...allowed,
          permissions: JSON.stringify([
            "module.massages",
            "massages.manage_payments",
          ]),
        },
        "massages"
      )
    ).toBe(false);
  });
});
