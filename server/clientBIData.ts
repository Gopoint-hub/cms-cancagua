import { eq } from "drizzle-orm";
import {
  biopoolBookings,
  clients,
  massageBookings,
  massageProgramBookings,
  regularClassMemberships,
  regularClassStudents,
} from "../drizzle/schema";
import { getDb } from "./db";

export type ClientBIProfile = {
  name: string | null;
  email: string | null;
  totalGasto: number;
  totalVisitas: number;
  visitas2025: number;
  visitas2026: number;
  ultimaVisita: string | null;
  createdAt: string;
  genero: "M" | "F" | "nd";
  idioma: string | null;
  origen: string | null;
  baseLastActivity: string | null;
};

type OperationalEvent = {
  name: string | null;
  email: string | null;
  phone: string | null;
  date: string;
  amountClp: number;
  status: string;
};

function dateValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function identityKeys(input: { email?: string | null; phone?: string | null; name?: string | null }): string[] {
  const keys: string[] = [];
  const email = input.email?.trim().toLocaleLowerCase();
  if (email) keys.push(`email:${email}`);
  const phone = (input.phone ?? "").replace(/\D/g, "");
  if (phone.length >= 8) keys.push(`phone:${phone}`);
  if (!keys.length) keys.push(`name:${(input.name ?? "sin nombre").trim().toLocaleLowerCase()}`);
  return keys;
}

/**
 * Conserva el histórico importado y añade actividad operacional posterior a
 * la última visita sincronizada. Así evita volver a contar reservas antiguas.
 */
export async function loadClientBIProfiles(): Promise<ClientBIProfile[]> {
  const db = await getDb();
  if (!db) return [];

  const [legacy, massages, programs, biopools, memberships] = await Promise.all([
    db.select().from(clients),
    db.select({
      name: massageBookings.clientName,
      email: massageBookings.clientEmail,
      phone: massageBookings.clientPhone,
      date: massageBookings.bookingDate,
      amount: massageBookings.amountPaid,
      status: massageBookings.status,
    }).from(massageBookings),
    db.select({
      name: massageProgramBookings.clientName,
      email: massageProgramBookings.clientEmail,
      phone: massageProgramBookings.clientPhone,
      date: massageProgramBookings.bookingDate,
      status: massageProgramBookings.status,
    }).from(massageProgramBookings),
    db.select({
      name: biopoolBookings.clientName,
      email: biopoolBookings.clientEmail,
      phone: biopoolBookings.clientPhone,
      date: biopoolBookings.bookingDate,
      amount: biopoolBookings.amountPaidClp,
      status: biopoolBookings.status,
    }).from(biopoolBookings),
    db.select({
      firstName: regularClassStudents.firstName,
      lastName: regularClassStudents.lastName,
      email: regularClassStudents.email,
      phone: regularClassStudents.phone,
      date: regularClassMemberships.periodStart,
      amount: regularClassMemberships.pricePaidClp,
      status: regularClassMemberships.status,
    }).from(regularClassMemberships)
      .innerJoin(regularClassStudents, eq(regularClassMemberships.studentId, regularClassStudents.id)),
  ]);

  const profiles: ClientBIProfile[] = legacy.map(client => ({
    name: client.name,
    email: client.email,
    totalGasto: Number(client.totalGasto ?? 0),
    totalVisitas: Number(client.totalVisitas ?? 0),
    visitas2025: Number(client.visitas2025 ?? 0),
    visitas2026: Number(client.visitas2026 ?? 0),
    ultimaVisita: dateValue(client.ultimaVisita),
    createdAt: dateValue(client.createdAt) ?? "1970-01-01",
    genero: client.genero ?? "nd",
    idioma: client.idioma,
    origen: client.origen,
    baseLastActivity: dateValue(client.ultimaVisita),
  }));
  const byIdentity = new Map<string, ClientBIProfile>();
  legacy.forEach((client, index) => {
    identityKeys(client).forEach(key => byIdentity.set(key, profiles[index]));
  });

  const events: OperationalEvent[] = [
    ...massages.map(row => ({
      name: row.name,
      email: row.email,
      phone: row.phone,
      date: dateValue(row.date) ?? "",
      amountClp: Number(row.amount ?? 0),
      status: row.status,
    })),
    ...programs.map(row => ({
      name: row.name,
      email: row.email,
      phone: row.phone,
      date: dateValue(row.date) ?? "",
      amountClp: 0,
      status: row.status,
    })),
    ...biopools.map(row => ({
      name: row.name,
      email: row.email,
      phone: row.phone,
      date: dateValue(row.date) ?? "",
      amountClp: Number(row.amount ?? 0),
      status: row.status,
    })),
    ...memberships.map(row => ({
      name: [row.firstName, row.lastName].filter(Boolean).join(" "),
      email: row.email,
      phone: row.phone,
      date: dateValue(row.date) ?? "",
      amountClp: Number(row.amount ?? 0),
      status: row.status,
    })),
  ].filter(event => event.date && event.status !== "cancelled");

  const grouped = new Map<string, OperationalEvent[]>();
  for (const event of events) {
    const key = identityKeys(event)[0];
    const current = grouped.get(key) ?? [];
    current.push(event);
    grouped.set(key, current);
  }

  for (const group of Array.from(grouped.values())) {
    const representative = group[0];
    const keys = identityKeys(representative);
    let profile = keys.map(key => byIdentity.get(key)).find(Boolean);
    if (!profile) {
      const dates = group.map(event => event.date).sort();
      profile = {
        name: representative.name,
        email: representative.email,
        totalGasto: 0,
        totalVisitas: 0,
        visitas2025: 0,
        visitas2026: 0,
        ultimaVisita: null,
        createdAt: dates[0],
        genero: "nd",
        idioma: null,
        origen: "operacion_cms",
        baseLastActivity: null,
      };
      profiles.push(profile);
      keys.forEach(key => byIdentity.set(key, profile!));
    }

    const additions = group.filter(event =>
      !profile!.baseLastActivity || event.date > profile!.baseLastActivity
    );
    if (!additions.length) continue;
    profile.totalVisitas += additions.length;
    profile.visitas2025 += additions.filter(event => event.date.startsWith("2025-")).length;
    profile.visitas2026 += additions.filter(event => event.date.startsWith("2026-")).length;
    profile.totalGasto += additions.reduce((sum, event) => sum + event.amountClp, 0);
    profile.ultimaVisita = [profile.ultimaVisita, ...additions.map(event => event.date)]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  }

  return profiles;
}
