import { describe, expect, it } from "vitest";
import {
  appendSaunaAuditLine,
  buildSaunaCancellationAuditLine,
  parseSaunaCancellationAuditLines,
} from "./saunaCancellationAudit";

const timestamp = new Date("2026-08-22T16:45:00.000Z");

describe("auditoría de cancelaciones de Sauna", () => {
  it("construye y parsea motivo, responsable, excepción y origen", () => {
    const line = buildSaunaCancellationAuditLine({
      timestamp,
      reason: "Solicitud de la clienta",
      actor: { id: 7, name: "Cony", email: "cony@example.com" },
      policyOverride: true,
      source: "CMS",
    });

    expect(line).toBe(
      "[Cancelación 2026-08-22T16:45:00.000Z] Motivo: Solicitud de la clienta | Responsable: Cony <cony@example.com> (#7) | Excepción: Sí | Origen: CMS"
    );
    expect(parseSaunaCancellationAuditLines(line)).toEqual([
      {
        timestamp: "2026-08-22T16:45:00.000Z",
        reason: "Solicitud de la clienta",
        actor: "Cony <cony@example.com> (#7)",
        policyOverride: true,
        source: "CMS",
        raw: line,
      },
    ]);
  });

  it("normaliza saltos, separadores y espacios del motivo a una sola línea", () => {
    const line = buildSaunaCancellationAuditLine({
      timestamp,
      reason: "  Cliente llamó\n  y confirmó | la cancelación  ",
      actor: { id: 12 },
      policyOverride: false,
      source: "Skedu",
    });

    expect(parseSaunaCancellationAuditLines(line)).toEqual([
      expect.objectContaining({
        reason: "Cliente llamó y confirmó / la cancelación",
        actor: "Usuario #12",
        policyOverride: false,
        source: "Skedu",
      }),
    ]);
  });

  it("preserva las notas existentes al agregar una línea de auditoría", () => {
    const line = buildSaunaCancellationAuditLine({
      timestamp,
      reason: "Cambio de planes",
      actor: { name: "Recepción" },
      policyOverride: false,
      source: "CMS",
    });

    const notes = appendSaunaAuditLine(
      "Cliente prefiere contacto por WhatsApp\nTraerá su propia toalla",
      line
    );

    expect(notes).toBe(
      `Cliente prefiere contacto por WhatsApp\nTraerá su propia toalla\n${line}`
    );
    expect(parseSaunaCancellationAuditLines(notes)).toHaveLength(1);
  });

  it("ignora notas ordinarias y líneas de cancelación malformadas", () => {
    const valid = buildSaunaCancellationAuditLine({
      timestamp,
      reason: "Solicitud del cliente",
      actor: { email: "recepcion@example.com" },
      policyOverride: false,
      source: "CMS",
    });
    const notes = [
      "Nota operativa sin formato",
      "Cancelación: cliente no asistirá",
      "[Cancelación 2026-08-22T16:45:00.000Z] Motivo: incompleta",
      valid,
    ].join("\n");

    expect(parseSaunaCancellationAuditLines(notes)).toEqual([
      expect.objectContaining({
        actor: "recepcion@example.com",
        raw: valid,
      }),
    ]);
  });

  it("rechaza timestamps inválidos al construir y los ignora al parsear", () => {
    expect(() =>
      buildSaunaCancellationAuditLine({
        timestamp: "fecha-inválida",
        reason: "Solicitud del cliente",
        actor: {},
        policyOverride: false,
        source: "CMS",
      })
    ).toThrow(/timestamp de la cancelación no es válido/i);

    expect(
      parseSaunaCancellationAuditLines(
        "[Cancelación fecha-inválida] Motivo: Solicitud del cliente | Responsable: Usuario CMS | Excepción: No | Origen: CMS"
      )
    ).toEqual([]);
  });
});
