import { Router } from "express";
import { and, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  biopoolBlocks,
  biopoolBookingActivity,
  biopoolBookings,
  biopoolCheckoutOrders,
  biopoolServices,
  biopoolTicketTypes,
  clients,
} from "../drizzle/schema";
import { getDb } from "./db";

type Header = { name?: string; value?: string };

export type BandurriaReservation = {
  reference: string;
  bookingDate: string;
  startTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  adultQuantity: number;
  childQuantity: number;
  totalGuests: number;
};

const MONTHS: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
};

function cleanText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/tr>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function decodedBody(part: any): string {
  const encoded = part?.body?.data;
  const own = typeof encoded === "string"
    ? Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    : "";
  const children = Array.isArray(part?.parts) ? part.parts.map(decodedBody).filter(Boolean) : [];
  return cleanText([own, ...children].join("\n"));
}

function field(text: string, label: string): string | null {
  const pattern = new RegExp(`(?:^|\\n)${label}\\s*[:：]?\\s*([^\\n]+)`, "im");
  return text.match(pattern)?.[1]?.trim() ?? null;
}

export function parseBandurriaReservation(text: string): BandurriaReservation {
  const content = cleanText(text);
  const reference = content.match(/\bBAN-[A-Z0-9-]+\b/i)?.[0]?.toUpperCase();
  const rawDate = field(content, "Fecha");
  const rawTime = field(content, "Horario");
  const clientName = field(content, "Pasajero");
  const clientPhone = field(content, "Teléfono") ?? field(content, "Telefono");
  const clientEmail = field(content, "Email");
  const rawPassengers = field(content, "Pasajeros");
  const rawType = field(content, "Tipo") ?? "";
  if (!reference || !rawDate || !rawTime || !clientName || !clientPhone || !clientEmail || !rawPassengers) {
    throw new Error("El correo de Bandurria no contiene todos los datos obligatorios");
  }
  const dateMatch = rawDate.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .match(/(\d{1,2})\s+de\s+([a-z]+),?\s+(\d{4})/);
  if (!dateMatch || !MONTHS[dateMatch[2]]) throw new Error("Fecha de Bandurria no reconocida");
  const bookingDate = `${dateMatch[3]}-${MONTHS[dateMatch[2]]}-${dateMatch[1].padStart(2, "0")}`;
  const timeMatch = rawTime.match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) throw new Error("Horario de Bandurria no reconocido");
  const startTime = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
  const totalGuests = Number(rawPassengers.match(/\d+/)?.[0]);
  const adultQuantity = Number(rawType.match(/(\d+)\s*adult/i)?.[1] ?? 0);
  const childQuantity = Number(rawType.match(/(\d+)\s*niñ/i)?.[1] ?? 0);
  if (!Number.isInteger(totalGuests) || totalGuests < 1 || adultQuantity + childQuantity !== totalGuests) {
    throw new Error("La cantidad o el tipo de pasajeros no es consistente");
  }
  if (childQuantity > 0 && adultQuantity < 1) throw new Error("La reserva de niños requiere al menos un adulto");
  return { reference, bookingDate, startTime, clientName, clientEmail: clientEmail.toLowerCase(), clientPhone, adultQuantity, childQuantity, totalGuests };
}

function getHeader(headers: Header[], name: string): string {
  return headers.find(header => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function parseBandurriaEvent(event: any): BandurriaReservation | null {
  const payload = event?.payload?.headers
    ? event.payload
    : event?.payload?.payload?.headers
      ? event.payload.payload
      : event?.headers
        ? event
        : event?.payload ?? event;
  const headers: Header[] = payload?.headers ?? [];
  const from = getHeader(headers, "From").toLowerCase();
  const subject = getHeader(headers, "Subject").toLowerCase();
  if (!from.includes("catamaran@catamaranbandurria.cl")) return null;
  if (!subject.includes("nueva reserva navega & relax") && !subject.includes("nueva reserva navega &amp; relax")) return null;
  return parseBandurriaReservation(decodedBody(payload));
}

function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const value = hours * 60 + mins + minutes;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export async function createBandurriaBooking(data: BandurriaReservation) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  return db.transaction(async tx => {
    const lockName = `bandurria:${data.reference}`;
    const lock: any = await tx.execute(sql`SELECT GET_LOCK(${lockName}, 10) AS acquired`);
    if (Number(lock?.[0]?.[0]?.acquired ?? 0) !== 1) throw new Error("No se pudo bloquear la reserva para procesarla");
    try {
      const [duplicate] = await tx.select({ id: biopoolBookings.id, bookingCode: biopoolBookings.bookingCode })
        .from(biopoolBookings).where(eq(biopoolBookings.paymentReference, data.reference)).limit(1);
      if (duplicate) return { created: false as const, ...duplicate };

      const [service] = await tx.select().from(biopoolServices).where(and(eq(biopoolServices.name, "Navega Relax"), ne(biopoolServices.status, "archived"))).limit(1);
      if (!service) throw new Error("El servicio Navega Relax no está disponible");
      const endTime = addMinutes(data.startTime, service.standardDurationMinutes);
      if (data.startTime < service.firstEntryTime || data.startTime > service.lastEntryTime || endTime > service.facilityCloseTime) {
        throw new Error("El horario de Bandurria está fuera de la configuración de Navega Relax");
      }
      const [tickets, bookings, blocks, holds] = await Promise.all([
        tx.select().from(biopoolTicketTypes).where(and(eq(biopoolTicketTypes.serviceId, service.id), eq(biopoolTicketTypes.active, 1))),
        tx.select({ guests: biopoolBookings.totalGuests }).from(biopoolBookings).where(and(
          eq(biopoolBookings.bookingDate, data.bookingDate), inArray(biopoolBookings.status, ["pending", "confirmed", "completed"]),
          lt(biopoolBookings.startTime, endTime), sql`${biopoolBookings.endTime} > ${data.startTime}`,
        )),
        tx.select({ capacity: biopoolBlocks.blockedCapacity }).from(biopoolBlocks).where(and(
          eq(biopoolBlocks.active, 1), sql`${biopoolBlocks.startDate} <= ${data.bookingDate}`, sql`${biopoolBlocks.endDate} >= ${data.bookingDate}`,
          lt(biopoolBlocks.startTime, endTime), sql`${biopoolBlocks.endTime} > ${data.startTime}`,
        )),
        tx.select({ guests: biopoolCheckoutOrders.totalGuests }).from(biopoolCheckoutOrders).where(and(
          eq(biopoolCheckoutOrders.bookingDate, data.bookingDate),
          inArray(biopoolCheckoutOrders.status, ["initiating", "payment_pending"]), sql`${biopoolCheckoutOrders.expiresAt} > NOW()`,
          lt(biopoolCheckoutOrders.startTime, endTime), sql`${biopoolCheckoutOrders.endTime} > ${data.startTime}`,
        )),
      ]);
      const used = bookings.reduce((sum, row) => sum + row.guests, 0) + blocks.reduce((sum, row) => sum + row.capacity, 0) + holds.reduce((sum, row) => sum + row.guests, 0);
      if (used + data.totalGuests > service.capacity) throw new Error(`No hay cupos suficientes para ${data.reference}`);
      const adult = tickets.find(ticket => ticket.code === "adult");
      const child = tickets.find(ticket => ticket.code === "child");
      if (!adult || !child) throw new Error("Faltan tarifas de Navega Relax");
      const originalAmountClp = adult.priceClp * data.adultQuantity + child.priceClp * data.childQuantity;

      let [client] = await tx.select().from(clients).where(or(eq(clients.email, data.clientEmail), eq(clients.phone, data.clientPhone))).limit(1);
      if (client) {
        await tx.update(clients).set({ name: data.clientName, email: data.clientEmail, phone: data.clientPhone }).where(eq(clients.id, client.id));
      } else {
        const [createdClient] = await tx.insert(clients).values({ email: data.clientEmail, name: data.clientName, phone: data.clientPhone, origen: "Catamarán Bandurria" }).$returningId();
        [client] = await tx.select().from(clients).where(eq(clients.id, createdClient.id)).limit(1);
      }
      const bookingCode = `BIO-${data.bookingDate.replaceAll("-", "")}-${nanoid(6).toUpperCase()}`;
      const [created] = await tx.insert(biopoolBookings).values({
        bookingCode, serviceId: service.id, clientId: client.id, clientName: data.clientName,
        clientEmail: data.clientEmail, clientPhone: data.clientPhone, bookingDate: data.bookingDate,
        startTime: data.startTime, endTime, adultQuantity: data.adultQuantity, childQuantity: data.childQuantity,
        totalGuests: data.totalGuests, status: "confirmed", attendanceToken: nanoid(48), paymentStatus: "pending",
        paymentMethod: null, paymentReference: data.reference, originalAmountClp, discountAmountClp: 0,
        amountPaidClp: 0, refundFeePercent: service.refundFeePercent, source: "cms",
        notes: `Reserva automática desde correo de Catamarán Bandurria · ${data.reference}`,
      }).$returningId();
      await tx.insert(biopoolBookingActivity).values({ bookingId: created.id, action: "booking_created", detail: JSON.stringify({ source: "catamaran_bandurria_email", reference: data.reference, totalGuests: data.totalGuests, originalAmountClp }) });
      return { created: true as const, id: created.id, bookingCode };
    } finally {
      await tx.execute(sql`SELECT RELEASE_LOCK(${lockName})`);
    }
  });
}

const router = Router();
router.post("/", async (req, res) => {
  const secret = process.env.NAVEGA_RELAX_WEBHOOK_SECRET;
  if (!secret || req.get("X-Navega-Relax-Secret") !== secret) return res.status(401).json({ error: "unauthorized" });
  try {
    const reservation = parseBandurriaEvent(req.body);
    if (!reservation) return res.status(200).json({ ignored: true });
    const result = await createBandurriaBooking(reservation);
    return res.status(200).json(result);
  } catch (error) {
    console.error("[Navega Relax webhook]", error);
    return res.status(422).json({ error: error instanceof Error ? error.message : "No se pudo procesar la reserva" });
  }
});

export default router;
