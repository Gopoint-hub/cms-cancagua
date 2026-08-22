import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { lockAndReloadSkeduProgramGroupForSettlement } from "./skeduProgramConcurrency";

describe("concurrencia de programas Skedu", () => {
  it("adquiere todos los scopes y relee el grupo antes de aceptar el cobro", async () => {
    const events: string[] = [];
    const lockPaymentScopes = vi.fn(async (ids: number[]) => {
      events.push(`scopes:${ids.join(",")}`);
    });
    const assertNoLivePaymentAttempt = vi.fn(async (id: number) => {
      events.push(`guard:${id}`);
    });
    const reloadBookings = vi.fn(async (ids: number[]) => {
      events.push(`reload:${ids.join(",")}`);
      return ids.map(id => ({ id, status: "pending" }));
    });

    await expect(
      lockAndReloadSkeduProgramGroupForSettlement({
        bookingIds: [12, 11, 12],
        lockPaymentScopes,
        assertNoLivePaymentAttempt,
        reloadBookings,
      })
    ).resolves.toEqual([
      { id: 11, status: "pending" },
      { id: 12, status: "pending" },
    ]);
    expect(events).toEqual([
      "scopes:11,12",
      "guard:11",
      "guard:12",
      "reload:11,12",
    ]);
  });

  it("rechaza el snapshot fresco si la cancelación ganó la carrera", async () => {
    await expect(
      lockAndReloadSkeduProgramGroupForSettlement({
        bookingIds: [21, 22],
        lockPaymentScopes: async () => undefined,
        assertNoLivePaymentAttempt: async () => undefined,
        reloadBookings: async () => [
          { id: 21, status: "cancelled" },
          { id: 22, status: "cancelled" },
        ],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("mantiene la reasignación dentro del mutex con relectura y update condicional", () => {
    const source = readFileSync(
      new URL("./masajesRouter.ts", import.meta.url),
      "utf8"
    );
    const start = source.indexOf("updateSkeduProgramTherapists:");
    const end = source.indexOf("updateSkeduProgramStatus:", start);
    const procedure = source.slice(start, end);
    const lock = procedure.indexOf("withMassageResourceLock(");
    const freshRead = procedure.indexOf(".select()", lock);
    const availability = procedure.indexOf(
      "getSkeduProgramResourceAvailability(",
      freshRead
    );
    const conditionalUpdate = procedure.indexOf(
      'ne(massageProgramBookings.status, "cancelled")',
      availability
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(freshRead).toBeGreaterThan(lock);
    expect(availability).toBeGreaterThan(freshRead);
    expect(conditionalUpdate).toBeGreaterThan(availability);
  });

  it("serializa la cancelación con el mismo mutex usado por la asignación", () => {
    const source = readFileSync(
      new URL("./masajesRouter.ts", import.meta.url),
      "utf8"
    );
    const start = source.indexOf("updateSkeduProgramStatus:");
    const end = source.indexOf("getByDateRange:", start);
    const procedure = source.slice(start, end);
    const lock = procedure.indexOf("withMassageResourceLock(");
    const transaction = procedure.indexOf("db.transaction(", lock);
    const freshRead = procedure.indexOf(".select()", transaction);
    const groupUpdate = procedure.indexOf(
      ".update(massageProgramBookings)",
      freshRead
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(transaction).toBeGreaterThan(lock);
    expect(freshRead).toBeGreaterThan(transaction);
    expect(groupUpdate).toBeGreaterThan(freshRead);
  });
});
