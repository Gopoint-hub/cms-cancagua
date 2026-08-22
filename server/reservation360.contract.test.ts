import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RESERVATION_360_CALENDAR_EVENT_KINDS,
  RESERVATION_360_CLIENT_EVENT_KINDS,
  RESERVATION_360_EVENT_KINDS,
  RESERVATION_360_KIND_SERVICE,
  RESERVATION_360_SERVICE_KEYS,
} from "../shared/reservation360";

const source = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("contrato compartido de operaciones de reservas 360", () => {
  it("asigna cada tipo de reserva a un módulo conocido", () => {
    expect(Object.keys(RESERVATION_360_KIND_SERVICE).sort()).toEqual(
      [...RESERVATION_360_EVENT_KINDS].sort()
    );
    for (const service of Object.values(RESERVATION_360_KIND_SERVICE)) {
      expect(RESERVATION_360_SERVICE_KEYS).toContain(service);
    }
    for (const kind of [
      ...RESERVATION_360_CALENDAR_EVENT_KINDS,
      ...RESERVATION_360_CLIENT_EVENT_KINDS,
    ]) {
      expect(RESERVATION_360_EVENT_KINDS).toContain(kind);
    }
  });

  it("mantiene los esquemas del router ligados al contrato común", () => {
    const router = source("server/operations360Router.ts");
    expect(router).toContain("z.enum(RESERVATION_360_SERVICE_KEYS)");
    expect(router).toContain("z.enum(RESERVATION_360_EVENT_KINDS)");
    expect(router).toContain("RESERVATION_360_CLIENT_EVENT_KINDS");
    expect(router).toContain('if (input.kind === "regular_class_schedule")');
    expect(router).toContain("assertUnreachableReservation360Kind(input.kind)");
    expect(router).toContain('case "regular_class":');
    expect(router).toContain(
      "return assertUnreachableReservation360Kind(reference.kind)"
    );
  });

  it("usa un solo diálogo operativo fuera de las páginas", () => {
    const dialog = source(
      "client/src/components/cms/Reservation360DetailDialog.tsx"
    );
    const calendar = source("client/src/pages/cms/Calendario360.tsx");
    const clients = source("client/src/pages/cms/Clientes360.tsx");

    expect(dialog).toContain("operations360.detail.useQuery");
    expect(calendar).toContain("Reservation360DetailDialog");
    expect(clients).toContain("Reservation360DetailDialog");
    expect(calendar).not.toContain("function PaymentManager(");
    expect(calendar).not.toContain("function ReservationActions(");
  });

  it("expone el mismo diálogo desde todas las agendas operativas", () => {
    for (const file of [
      "client/src/pages/cms/masajes/Agenda.tsx",
      "client/src/pages/cms/biopiscinas/Agenda.tsx",
      "client/src/pages/cms/sauna/Agenda.tsx",
      "client/src/pages/cms/clases-regulares/Attendance.tsx",
      "client/src/pages/cms/clases-regulares/Students.tsx",
    ]) {
      expect(source(file)).toContain("Reservation360DetailDialog");
    }
  });

  it("mantiene las tres acciones operativas para Sauna en el diálogo común", () => {
    const dialog = source(
      "client/src/components/cms/Reservation360DetailDialog.tsx"
    );
    const agenda = source("client/src/pages/cms/sauna/Agenda.tsx");
    const saunaRouter = source("server/saunaRouter.ts");
    const saunaSync = source("server/saunaSync.ts");
    const operationsRouter = source("server/operations360Router.ts");

    expect(dialog).toContain("trpc.sauna.agenda.updateBooking.useMutation()");
    expect(dialog).toContain("trpc.sauna.agenda.reschedule.useMutation()");
    expect(dialog).toContain("trpc.sauna.agenda.setStatus.useMutation()");
    expect(dialog).toContain('if (event.kind === "sauna")');
    expect(dialog).toContain('status: "cancelled"');
    expect(dialog).toContain("externalManagementUrl");
    expect(dialog).not.toContain('event.kind !== "sauna"');
    expect(agenda).not.toContain('onStatus("cancelled")');

    expect(saunaRouter).toContain("updateBooking: protectedProcedure");
    expect(saunaRouter).toContain("cancelSkeduAppointment(");
    expect(saunaRouter).toContain("rescheduleSkeduAppointment(");
    expect(saunaRouter).toContain("getSkeduAppointmentPayments(");
    expect(saunaRouter).toContain("acquireSaunaSyncMutationLock(");
    expect(saunaSync).toContain("...syncedValues");
    expect(operationsRouter).toContain("externalManagementUrl:");
    expect(operationsRouter).toContain("noteSaunaCancellationActivities(");
  });
});
