import axios from "axios";
import { chileLocalDateTimeToUtc } from "./massageNps";

const SKEDU_API_BASE_URL = "https://api.getskedu.com";
const STORE_UUID = "c5e0a893-7eff-42b8-815a-296b1a9c345d";
const BUSINESS_UUID = "5d59ea78-5b85-4274-b771-5ca34e689061";
const CHILE_TIME_ZONE = "America/Santiago";
const PAGE_SIZE = 100;
const USER_CACHE_MS = 10 * 60 * 1000;

type SkeduNamedValue = { Name?: string | null } | string | null | undefined;

export type SkeduAppointment = {
  UUID: string;
  GroupUUID: string;
  UserUUID: string;
  CreatedAt?: string | null;
  DeletedAt?: string | null;
  RealDeletedAt?: string | null;
  IsConfirmed?: boolean;
  StartsAt: string;
  EndsAt: string;
  Service?: SkeduNamedValue;
  Variant?: SkeduNamedValue;
  SessionPriceWithDiscount?: number | null;
  Message?: string | null;
};

type SkeduUser = {
  UUID: string;
  FirstName?: string | null;
  LastName?: string | null;
  Email?: string | null;
  Phone?: string | null;
};

type SkeduPayment = {
  UUID: string;
  IsConfirmed?: boolean;
  CancelledAt?: string | null;
  DeletedAt?: string | null;
  SystemSlug?: string | null;
  Method?: string | null;
  Amount?: number | null;
  Description?: string | null;
  RemotePaymentID?: string | null;
  CreatedAt?: string | null;
};

export type SkeduBiopoolCalendarEvent = {
  appointmentUuid: string;
  groupUuid: string;
  userUuid: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  variantName: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  status: "confirmed" | "pending";
  people: number;
  amountClp: number;
  notes: string | null;
  createdAt: string | null;
};

const userCache = new Map<string, { expiresAt: number; value: SkeduUser | null }>();

function headers() {
  const appId = process.env.SKEDU_APP_ID;
  const secret = process.env.SKEDU_APP_SECRET;
  if (!appId || !secret) throw new Error("Skedu API credentials not configured");
  return {
    "X-Skedu-App-ID": appId,
    "X-Skedu-App-Secret": secret,
    Accept: "application/json",
    "User-Agent": "CancaguaCMS/1.0 (+https://cms.cancagua.cl)",
  };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function nameOf(value: SkeduNamedValue): string {
  if (typeof value === "string") return value;
  return value?.Name?.trim() ?? "";
}

function chileParts(value: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: CHILE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map(part => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function isSkeduBiopoolAppointment(value: SkeduAppointment): boolean {
  return Boolean(
    !value.DeletedAt &&
      !value.RealDeletedAt &&
      nameOf(value.Service).toLocaleLowerCase().includes("biopisc")
  );
}

export function peopleFromSkeduVariant(value: string): number {
  const normalized = value.toLocaleLowerCase();
  const typedQuantities = Array.from(
    normalized.matchAll(/(\d+)\s*(?:adult|niñ|person)/g)
  )
    .map(match => Number(match[1]))
    .filter(quantity => Number.isFinite(quantity) && quantity > 0);
  if (typedQuantities.length) {
    return typedQuantities.reduce((sum, quantity) => sum + quantity, 0);
  }
  const generic = normalized.match(/(?:ticket|pase)\s+(?:para\s+)?(\d+)/);
  return generic ? Math.max(1, Number(generic[1])) : 1;
}

export function skeduPaymentMethod(value?: SkeduPayment | null): string | null {
  const method = value?.Method?.toLocaleLowerCase();
  const system = value?.SystemSlug?.toLocaleLowerCase();
  if (method === "cash") return "cash";
  if (method === "deposit") return "bank_transfer";
  if (method === "credit card") return "credit_card";
  if (method === "debit card") return "debit_card";
  if (method === "coupon") return "coupon";
  if (system === "webpay") return "webpay";
  return method || system || null;
}

function itemsOf<T>(payload: unknown): T[] {
  const data = (payload as any)?.Data;
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.Items) ? data.Items : [];
}

async function fetchAppointments(from: string, to: string): Promise<SkeduAppointment[]> {
  const items: SkeduAppointment[] = [];
  const start = chileLocalDateTimeToUtc(from, "00:00").toISOString();
  const end = chileLocalDateTimeToUtc(addDays(to, 1), "00:00").toISOString();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await axios.get(`${SKEDU_API_BASE_URL}/appointments`, {
      headers: headers(),
      params: {
        StoreUUID: STORE_UUID,
        limit: PAGE_SIZE,
        offset,
        order: "StartsAt",
        "StartsAt~ge": start,
        "StartsAt~lt": end,
      },
      timeout: 20_000,
    });
    const page = itemsOf<SkeduAppointment>(response.data);
    items.push(...page);
    if (page.length < PAGE_SIZE) return items;
  }
}

async function fetchUser(userUuid: string): Promise<SkeduUser | null> {
  const cached = userCache.get(userUuid);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await axios.get(
    `${SKEDU_API_BASE_URL}/businesses/${BUSINESS_UUID}/users`,
    {
      headers: headers(),
      params: { UUID: userUuid, limit: 25, offset: 0 },
      timeout: 15_000,
    }
  );
  const value = itemsOf<SkeduUser>(response.data)[0] ?? null;
  userCache.set(userUuid, { expiresAt: Date.now() + USER_CACHE_MS, value });
  return value;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      result[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return result;
}

function clientName(user: SkeduUser | null): string {
  const value = [user?.FirstName, user?.LastName].filter(Boolean).join(" ").trim();
  return value || "Cliente Skedu";
}

function mapEvent(appointment: SkeduAppointment, user: SkeduUser | null): SkeduBiopoolCalendarEvent {
  const start = chileParts(appointment.StartsAt);
  const end = chileParts(appointment.EndsAt);
  const variantName = nameOf(appointment.Variant);
  return {
    appointmentUuid: appointment.UUID,
    groupUuid: appointment.GroupUUID,
    userUuid: appointment.UserUUID,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    title: nameOf(appointment.Service) || "Biopiscinas",
    variantName,
    clientName: clientName(user),
    clientEmail: user?.Email?.trim().toLocaleLowerCase() || null,
    clientPhone: user?.Phone?.trim() || null,
    status: appointment.IsConfirmed ? "confirmed" : "pending",
    people: peopleFromSkeduVariant(variantName),
    amountClp: Math.max(0, Number(appointment.SessionPriceWithDiscount ?? 0)),
    notes: appointment.Message?.trim() || null,
    createdAt: appointment.CreatedAt ?? null,
  };
}

export async function getSkeduBiopoolCalendarEvents(
  from: string,
  to: string
): Promise<SkeduBiopoolCalendarEvent[]> {
  const appointments = (await fetchAppointments(from, to)).filter(isSkeduBiopoolAppointment);
  return mapWithConcurrency(appointments, 8, async appointment => {
    let user: SkeduUser | null = null;
    try {
      user = await fetchUser(appointment.UserUUID);
    } catch (error) {
      console.error(`[Skedu] No se pudo cargar cliente ${appointment.UserUUID}:`, error);
    }
    return mapEvent(appointment, user);
  });
}

export async function getSkeduBiopoolDetail(appointmentUuid: string) {
  const appointmentResponse = await axios.get(
    `${SKEDU_API_BASE_URL}/appointments/${appointmentUuid}`,
    { headers: headers(), timeout: 15_000 }
  );
  const appointment = appointmentResponse.data?.Data as SkeduAppointment | undefined;
  if (!appointment || !isSkeduBiopoolAppointment(appointment)) return null;
  const [user, paymentResponse] = await Promise.all([
    fetchUser(appointment.UserUUID).catch(() => null),
    axios.get(`${SKEDU_API_BASE_URL}/payments`, {
      headers: headers(),
      params: { GroupUUID: appointment.GroupUUID, limit: 25, offset: 0 },
      timeout: 15_000,
    }),
  ]);
  const payments = itemsOf<SkeduPayment>(paymentResponse.data).filter(
    payment => payment.IsConfirmed && !payment.CancelledAt && !payment.DeletedAt
  );
  const amountClp = payments.reduce((sum, payment) => sum + Number(payment.Amount ?? 0), 0);
  const primaryPayment = payments[0] ?? null;
  return {
    event: mapEvent(appointment, user),
    payment: primaryPayment
      ? {
          status: "paid" as const,
          method: skeduPaymentMethod(primaryPayment),
          reference:
            primaryPayment.Description ||
            primaryPayment.RemotePaymentID ||
            primaryPayment.UUID,
          amountClp,
          refundAmountClp: 0,
        }
      : null,
  };
}
