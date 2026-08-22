import {
  formatRescheduleActor,
  type RescheduleAuditActor,
} from "./rescheduleAudit";

export type SaunaCancellationAuditEntry = {
  timestamp: string;
  reason: string;
  actor: string;
  policyOverride: boolean;
  source: "CMS" | "Skedu";
  raw: string;
};

const CANCELLATION_PATTERN =
  /^\[Cancelación ([^\]]+)\] Motivo: (.*?) \| Responsable: (.*?) \| Excepción: (Sí|No) \| Origen: (CMS|Skedu)$/;

function singleLine(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSaunaCancellationAuditLine(input: {
  timestamp?: Date | string;
  reason: string;
  actor: RescheduleAuditActor;
  policyOverride: boolean;
  source: "CMS" | "Skedu";
}): string {
  const timestamp = new Date(input.timestamp ?? new Date());
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("El timestamp de la cancelación no es válido");
  }
  return [
    `[Cancelación ${timestamp.toISOString()}] Motivo: ${singleLine(input.reason)}`,
    `Responsable: ${formatRescheduleActor(input.actor)}`,
    `Excepción: ${input.policyOverride ? "Sí" : "No"}`,
    `Origen: ${input.source}`,
  ].join(" | ");
}

export function appendSaunaAuditLine(
  notes: string | null | undefined,
  line: string
): string {
  return [notes?.trim(), line.trim()].filter(Boolean).join("\n");
}

export function parseSaunaCancellationAuditLines(
  notes: string | null | undefined
): SaunaCancellationAuditEntry[] {
  if (!notes) return [];
  return notes
    .split(/\r?\n/)
    .map(line => {
      const match = line.trim().match(CANCELLATION_PATTERN);
      if (!match || Number.isNaN(new Date(match[1]).getTime())) return null;
      return {
        timestamp: match[1],
        reason: match[2],
        actor: match[3],
        policyOverride: match[4] === "Sí",
        source: match[5] as "CMS" | "Skedu",
        raw: match[0],
      } satisfies SaunaCancellationAuditEntry;
    })
    .filter((entry): entry is SaunaCancellationAuditEntry => entry !== null);
}
