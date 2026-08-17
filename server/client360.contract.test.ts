import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { operations360Router } from "./operations360Router";

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("contrato backend de Cliente 360", () => {
  it("expone lectura paginada, ficha, edición, enlace, fusión e importación", () => {
    const procedures = Object.keys(operations360Router._def.procedures);
    expect(procedures).toEqual(
      expect.arrayContaining([
        "clients.list",
        "clients.listPage",
        "clients.history",
        "clients.historyPage",
        "clients.profile",
        "clients.updateProfile",
        "clients.linkReservations",
        "clients.mergeProfiles",
        "clients.syncSkeduHistory",
      ])
    );
  });

  it("incluye una migración idempotente y extensible", () => {
    const sql = readFileSync(
      new URL("../drizzle/0046_client_360_profiles.sql", import.meta.url),
      "utf8"
    );
    for (const table of [
      "client_360_profiles",
      "client_360_identities",
      "client_360_reservation_links",
      "client_360_external_events",
      "client_360_audit",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS \`${table}\``);
    }
    expect(sql).toContain("`reservation_kind` varchar(60)");
    expect(sql).toContain("CONCAT('legacy_client:', c.`id`)");
    expect(sql).not.toContain("GROUP BY LOWER(TRIM(c.`email`))");
  });

  it("verifica el mismo esquema de forma idempotente al iniciar producción", () => {
    const ensureSource = readFileSync(
      new URL("./ensureClient360Schema.ts", import.meta.url),
      "utf8"
    );
    const startupSource = readFileSync(
      new URL("./_core/index.ts", import.meta.url),
      "utf8"
    );
    for (const table of [
      "client_360_profiles",
      "client_360_identities",
      "client_360_reservation_links",
      "client_360_external_events",
      "client_360_audit",
    ]) {
      expect(ensureSource).toContain(
        "CREATE TABLE IF NOT EXISTS \\`" + table + "\\`"
      );
    }
    expect(startupSource).toContain("await ensureClient360Schema()");
  });

  it("mantiene mutaciones de fichas e importación detrás de autenticación", async () => {
    const caller = operations360Router.createCaller(anonymousContext());
    await expect(
      caller.clients.updateProfile({ profileId: 1, name: "Cliente" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.clients.linkReservations({
        profileId: 1,
        reservations: [{ service: "biopools", reservationId: 7 }],
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.clients.mergeProfiles({
        sourceProfileId: 1,
        targetProfileId: 2,
        reason: "Ficha duplicada",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.clients.syncSkeduHistory({
        from: "2026-01-01",
        to: "2026-01-31",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
