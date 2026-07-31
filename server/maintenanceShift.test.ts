import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { CANCAGUA_STAFF_ROLE, canAccessCmsPath } from "../shared/permissions";

/**
 * La ficha diaria de mantención no toca la base en estas pruebas: se sustituye
 * la capa de datos para poder verificar permisos, validaciones y el guardia del
 * turno cerrado sin depender de una conexión.
 */
const dbMock = vi.hoisted(() => ({
  getShiftReportById: vi.fn(),
  getShiftReportDetail: vi.fn(),
  getShiftHandover: vi.fn(),
  ensureShiftReport: vi.fn(),
  updateShiftReport: vi.fn(),
  saveShiftTask: vi.fn(),
  saveShiftTemperature: vi.fn(),
  saveShiftWaterQuality: vi.fn(),
  createShiftCycleStep: vi.fn(),
  updateShiftCycleStep: vi.fn(),
  submitShiftReport: vi.fn(),
  listShiftReports: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, ...dbMock };
});

const { appRouter } = await import("./routers");

function contextWithRole(role: string): TrpcContext {
  return {
    user: {
      id: 991001,
      openId: `shift-test-${role}`,
      email: "mantencion@cancagua.cl",
      name: "Mantención",
      passwordHash: null,
      loginMethod: "email",
      role,
      status: "active",
      allowedModules: null,
      invitationToken: null,
      invitationExpiresAt: null,
      resetToken: null,
      resetTokenExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const OPEN_REPORT = { id: 7, reportDate: "2026-07-31", shift: "apertura", status: "draft" };
const CLOSED_REPORT = { id: 8, reportDate: "2026-07-31", shift: "apertura", status: "submitted" };

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getShiftReportById.mockResolvedValue(OPEN_REPORT);
});

describe("ficha diaria de mantención — acceso", () => {
  it("deja entrar al personal de Cancagua", async () => {
    dbMock.getShiftReportDetail.mockResolvedValue({ ...OPEN_REPORT, tasks: [] });
    const caller = appRouter.createCaller(contextWithRole(CANCAGUA_STAFF_ROLE));

    await expect(
      caller.maintenanceShift.get({ reportDate: "2026-07-31", shift: "apertura" }),
    ).resolves.toMatchObject({ id: 7 });
  });

  it("bloquea a un rol sin acceso a mantención", async () => {
    const caller = appRouter.createCaller(contextWithRole("seller"));

    await expect(
      caller.maintenanceShift.get({ reportDate: "2026-07-31", shift: "apertura" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.getShiftReportDetail).not.toHaveBeenCalled();
  });

  it("la ruta del módulo queda habilitada para el personal", () => {
    expect(canAccessCmsPath(CANCAGUA_STAFF_ROLE, "/cms/mantencion-turnos")).toBe(true);
  });
});

describe("ficha diaria de mantención — validaciones", () => {
  it("rechaza una fecha con formato distinto de YYYY-MM-DD", async () => {
    const caller = appRouter.createCaller(contextWithRole(CANCAGUA_STAFF_ROLE));

    await expect(
      caller.maintenanceShift.get({ reportDate: "31-07-2026", shift: "apertura" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rechaza un turno que no existe", async () => {
    const caller = appRouter.createCaller(contextWithRole(CANCAGUA_STAFF_ROLE));

    await expect(
      caller.maintenanceShift.get({ reportDate: "2026-07-31", shift: "noche" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("ficha diaria de mantención — turno cerrado", () => {
  it("no admite marcar tareas después de cerrado", async () => {
    dbMock.getShiftReportById.mockResolvedValue(CLOSED_REPORT);
    const caller = appRouter.createCaller(contextWithRole(CANCAGUA_STAFF_ROLE));

    await expect(
      caller.maintenanceShift.saveTask({
        reportId: 8,
        taskKey: "cierre|21:00|revisar-bombas",
        label: "Revisar bombas",
        done: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(dbMock.saveShiftTask).not.toHaveBeenCalled();
  });

  it("sí admite marcar tareas mientras el turno sigue abierto", async () => {
    dbMock.saveShiftTask.mockResolvedValue({ id: 1, done: 1 });
    const caller = appRouter.createCaller(contextWithRole(CANCAGUA_STAFF_ROLE));

    await expect(
      caller.maintenanceShift.saveTask({
        reportId: 7,
        taskKey: "apertura|08:00|abrir-valvulas",
        label: "Abrir válvulas",
        done: true,
        doneAt: "08:12",
        responsible: "Pedro",
      }),
    ).resolves.toMatchObject({ done: 1 });
    expect(dbMock.saveShiftTask).toHaveBeenCalledTimes(1);
  });

  it("avisa cuando el reporte no existe", async () => {
    dbMock.getShiftReportById.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(contextWithRole(CANCAGUA_STAFF_ROLE));

    await expect(
      caller.maintenanceShift.submit({ id: 404 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("ficha diaria de mantención — traspaso", () => {
  it("pide el traspaso del turno anterior", async () => {
    dbMock.getShiftHandover.mockResolvedValue({
      fromDate: "2026-07-30",
      fromShift: "cierre",
      pendingTasks: [],
    });
    const caller = appRouter.createCaller(contextWithRole(CANCAGUA_STAFF_ROLE));

    await expect(
      caller.maintenanceShift.handover({ reportDate: "2026-07-31", shift: "apertura" }),
    ).resolves.toMatchObject({ fromShift: "cierre" });
    expect(dbMock.getShiftHandover).toHaveBeenCalledWith("2026-07-31", "apertura");
  });
});
