export type RescheduleAuditPoint = {
  date: string;
  time: string;
};

export type RescheduleAuditActor = {
  id?: number | string | null;
  name?: string | null;
  email?: string | null;
};

export type ReschedulePolicyViolation =
  | {
      code: "notice";
      noticeHours: number;
    }
  | {
      code: "maximum_reschedules";
      maxReschedules: number;
    };

export type RescheduleAuditEntry = {
  timestamp: string;
  from: RescheduleAuditPoint;
  to: RescheduleAuditPoint;
  reason: string;
  actor: string;
  policyOverride: boolean | null;
  policyViolations: string[];
  raw: string;
};

export type BuildRescheduleAuditLineInput = {
  timestamp?: Date | string;
  from: RescheduleAuditPoint;
  to: RescheduleAuditPoint;
  reason: string;
  actor: string | RescheduleAuditActor;
  policyOverride?: boolean;
  policyViolations?: ReschedulePolicyViolation[];
};

const AUDIT_PREFIX = "[Reagendamiento ";
const AUDIT_LINE_PATTERN =
  /^\[Reagendamiento ([^\]]+)\] De: (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) → (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) \| Motivo: (.*?) \| Responsable: (.*?)(?: \| Excepción: (Sí|No))?(?: \| Infracciones: (.*))?$/;

function singleLine(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function isoTimestamp(value: Date | string | undefined): string {
  const timestamp = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("El timestamp del reagendamiento no es válido");
  }
  return timestamp.toISOString();
}

export function formatRescheduleActor(actor: RescheduleAuditActor): string {
  const name = singleLine(actor.name);
  const email = singleLine(actor.email);
  const id = singleLine(actor.id);

  if (name && email) return `${name} <${email}>${id ? ` (#${id})` : ""}`;
  if (name) return `${name}${id ? ` (#${id})` : ""}`;
  if (email) return `${email}${id ? ` (#${id})` : ""}`;
  return id ? `Usuario #${id}` : "Usuario CMS";
}

function formatPolicyViolation(violation: ReschedulePolicyViolation): string {
  if (violation.code === "notice") {
    return `anticipación menor a ${violation.noticeHours} horas`;
  }
  return `máximo de ${violation.maxReschedules} reagendamientos alcanzado`;
}

export function buildRescheduleAuditLine(
  input: BuildRescheduleAuditLineInput
): string {
  const actor =
    typeof input.actor === "string"
      ? singleLine(input.actor)
      : formatRescheduleActor(input.actor);
  const violations = (input.policyViolations ?? []).map(formatPolicyViolation);
  const parts = [
    `${AUDIT_PREFIX}${isoTimestamp(input.timestamp)}] De: ${singleLine(input.from.date)} ${singleLine(input.from.time)} → ${singleLine(input.to.date)} ${singleLine(input.to.time)}`,
    `Motivo: ${singleLine(input.reason)}`,
    `Responsable: ${actor || "Usuario CMS"}`,
  ];

  if (typeof input.policyOverride === "boolean") {
    parts.push(`Excepción: ${input.policyOverride ? "Sí" : "No"}`);
  }

  if (violations.length > 0) {
    parts.push(`Infracciones: ${violations.join("; ")}`);
  }

  return parts.join(" | ");
}

export function appendRescheduleAuditLine(
  notes: string | null | undefined,
  line: string
): string {
  return [notes?.trim(), line.trim()].filter(Boolean).join("\n");
}

export function parseRescheduleAuditLine(
  line: string
): RescheduleAuditEntry | null {
  const match = line.trim().match(AUDIT_LINE_PATTERN);
  if (!match) return null;

  const [
    raw,
    timestamp,
    fromDate,
    fromTime,
    toDate,
    toTime,
    reason,
    actor,
    policyOverride,
    violations,
  ] = match;

  if (Number.isNaN(new Date(timestamp).getTime())) return null;

  return {
    timestamp,
    from: { date: fromDate, time: fromTime },
    to: { date: toDate, time: toTime },
    reason,
    actor,
    policyOverride:
      policyOverride === undefined ? null : policyOverride === "Sí",
    policyViolations: violations
      ? violations
          .split(";")
          .map(item => item.trim())
          .filter(Boolean)
      : [],
    raw,
  };
}

export function parseRescheduleAuditLines(
  notes: string | null | undefined
): RescheduleAuditEntry[] {
  if (!notes) return [];
  return notes
    .split(/\r?\n/)
    .map(parseRescheduleAuditLine)
    .filter((entry): entry is RescheduleAuditEntry => entry !== null);
}
