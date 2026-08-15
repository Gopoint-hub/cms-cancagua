import { describe, expect, it } from "vitest";
import {
  appendRescheduleAuditLine,
  buildRescheduleAuditLine,
  formatRescheduleActor,
  parseRescheduleAuditLine,
  parseRescheduleAuditLines,
} from "./rescheduleAudit";

const timestamp = new Date("2026-08-15T18:15:00.000Z");

describe("reschedule audit notes", () => {
  it("builds and parses a regular reschedule line", () => {
    const line = buildRescheduleAuditLine({
      timestamp,
      from: { date: "2026-08-14", time: "15:00" },
      to: { date: "2026-08-21", time: "16:30" },
      reason: "Solicitud del cliente",
      actor: { id: 7, name: "Cony", email: "cony@example.com" },
      policyOverride: false,
    });

    expect(line).toBe(
      "[Reagendamiento 2026-08-15T18:15:00.000Z] De: 2026-08-14 15:00 → 2026-08-21 16:30 | Motivo: Solicitud del cliente | Responsable: Cony <cony@example.com> (#7) | Excepción: No"
    );
    expect(parseRescheduleAuditLine(line)).toEqual({
      timestamp: "2026-08-15T18:15:00.000Z",
      from: { date: "2026-08-14", time: "15:00" },
      to: { date: "2026-08-21", time: "16:30" },
      reason: "Solicitud del cliente",
      actor: "Cony <cony@example.com> (#7)",
      policyOverride: false,
      policyViolations: [],
      raw: line,
    });
  });

  it("preserves the policy violations used by an exception", () => {
    const line = buildRescheduleAuditLine({
      timestamp,
      from: { date: "2026-08-15", time: "15:00" },
      to: { date: "2026-08-15", time: "18:00" },
      reason: "Autorizado por Operaciones",
      actor: "Recepción",
      policyOverride: true,
      policyViolations: [
        { code: "notice", noticeHours: 48 },
        { code: "maximum_reschedules", maxReschedules: 2 },
      ],
    });

    expect(parseRescheduleAuditLine(line)).toMatchObject({
      policyOverride: true,
      policyViolations: [
        "anticipación menor a 48 horas",
        "máximo de 2 reagendamientos alcanzado",
      ],
    });
  });

  it("keeps every audit entry while ignoring ordinary notes", () => {
    const first = buildRescheduleAuditLine({
      timestamp,
      from: { date: "2026-08-14", time: "15:00" },
      to: { date: "2026-08-21", time: "16:30" },
      reason: "Primer cambio",
      actor: "Cony",
    });
    const second = buildRescheduleAuditLine({
      timestamp: "2026-08-16T10:00:00.000Z",
      from: { date: "2026-08-21", time: "16:30" },
      to: { date: "2026-08-22", time: "10:00" },
      reason: "Segundo cambio",
      actor: "Recepción",
    });
    const notes = appendRescheduleAuditLine(
      appendRescheduleAuditLine("Cliente prefiere la tarde", first),
      second
    );

    expect(notes).toContain("Cliente prefiere la tarde\n[Reagendamiento");
    expect(parseRescheduleAuditLines(notes)).toHaveLength(2);
    expect(parseRescheduleAuditLine(first)?.policyOverride).toBeNull();
  });

  it("normalizes separators and line breaks without breaking parsing", () => {
    const line = buildRescheduleAuditLine({
      timestamp,
      from: { date: "2026-08-14", time: "15:00" },
      to: { date: "2026-08-21", time: "16:30" },
      reason: "Cliente llamó\nacepta diferencia | confirmada",
      actor: { id: 9 },
    });

    expect(parseRescheduleAuditLine(line)).toMatchObject({
      reason: "Cliente llamó acepta diferencia / confirmada",
      actor: "Usuario #9",
    });
  });

  it("formats actors with the best available identifier", () => {
    expect(formatRescheduleActor({ name: "Cony" })).toBe("Cony");
    expect(formatRescheduleActor({ email: "recepcion@example.com" })).toBe(
      "recepcion@example.com"
    );
    expect(formatRescheduleActor({ id: 12 })).toBe("Usuario #12");
    expect(formatRescheduleActor({})).toBe("Usuario CMS");
  });

  it("does not parse legacy or malformed note lines", () => {
    expect(
      parseRescheduleAuditLine("Reagendamiento: cambio solicitado")
    ).toBeNull();
    expect(
      parseRescheduleAuditLine(
        "[Reagendamiento fecha-inválida] De: 2026-08-14 15:00 → 2026-08-21 16:30 | Motivo: Cambio | Responsable: Cony | Excepción: No"
      )
    ).toBeNull();
  });
});
