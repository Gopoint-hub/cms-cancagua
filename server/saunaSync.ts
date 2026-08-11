import { and, eq, inArray, sql } from "drizzle-orm";
import {
  saunaBookings,
  saunaProgramQueue,
  saunaServices,
  saunaSyncRuns,
} from "../drizzle/schema";
import { addMinutesToTime, inferSaunaBooking } from "../shared/sauna";
import { getDb } from "./db";
import {
  getAllSkeduAppointments,
  getSkeduBusinessUser,
  getSkeduServices,
} from "./skedu";

export const SAUNA_SKEDU_RESOURCE_UUID = "1acef3a2-1716-4d74-805b-79d3633fec4e";
const CHILE_TIME_ZONE = "America/Santiago";
const CORE_SAUNA_SERVICE = /^Sauna Nativo(?:\s|$)/i;
const DETOX_SERVICE = /(?:Bio-)?Reconecta Detox/i;

type SkeduUser = {
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
};

function dateAndTimeInChile(value: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function servicesFromResponse(response: any): any[] {
  const root = response?.Data ?? response?.data ?? response;
  return Array.isArray(root) ? root : (root?.Items ?? []);
}

function serviceName(item: any): string {
  return String(item?.Service?.Name ?? item?.Name ?? "Servicio Sauna");
}

function variantName(item: any): string {
  return String(item?.Variant?.Name ?? item?.Variant?.Title ?? "");
}

async function loadFutureUsers(
  appointments: any[]
): Promise<Map<string, SkeduUser>> {
  const now = Date.now() - 24 * 60 * 60 * 1000;
  const unique = new Map<string, { businessUuid: string; userUuid: string }>();
  for (const appointment of appointments) {
    if (
      appointment?.BusinessUUID &&
      appointment?.UserUUID &&
      new Date(appointment.StartsAt).getTime() >= now
    ) {
      unique.set(appointment.UserUUID, {
        businessUuid: appointment.BusinessUUID,
        userUuid: appointment.UserUUID,
      });
    }
  }

  const entries = [...unique.values()];
  const users = new Map<string, SkeduUser>();
  for (let index = 0; index < entries.length; index += 6) {
    const batch = entries.slice(index, index + 6);
    const results = await Promise.all(
      batch.map(async entry => {
        try {
          return [
            entry.userUuid,
            await getSkeduBusinessUser(entry.businessUuid, entry.userUuid),
          ] as const;
        } catch (error) {
          console.error("[sauna:sync] No se pudo leer un cliente Skedu", {
            userUuid: entry.userUuid,
            error: error instanceof Error ? error.message : String(error),
          });
          return [entry.userUuid, null] as const;
        }
      })
    );
    for (const [uuid, user] of results) if (user) users.set(uuid, user);
  }
  return users;
}

function userValues(user?: SkeduUser | null) {
  const name = [user?.FirstName, user?.LastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    clientName: name || null,
    clientEmail: user?.Email?.trim().toLowerCase() || null,
    clientPhone: user?.Phone?.trim() || null,
  };
}

export async function syncSaunaFromSkedu(rangeFrom: string, rangeTo: string) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const [run] = await db
    .insert(saunaSyncRuns)
    .values({ rangeFrom, rangeTo })
    .$returningId();

  try {
    const serviceResponse = await getSkeduServices();
    const services = servicesFromResponse(serviceResponse);
    const coreServices = services.filter(service =>
      CORE_SAUNA_SERVICE.test(String(service.Name ?? ""))
    );
    const detoxServices = services.filter(service =>
      DETOX_SERVICE.test(String(service.Name ?? ""))
    );

    for (const service of coreServices) {
      const variant = Array.isArray(service.Variants)
        ? service.Variants[0]
        : (service.Variant ?? service.ServiceVariants?.[0] ?? null);
      const inferred = inferSaunaBooking(
        String(service.Name ?? ""),
        String(variant?.Name ?? "")
      );
      await db
        .insert(saunaServices)
        .values({
          skeduServiceUuid: service.UUID,
          skeduVariantUuid: variant?.UUID ?? null,
          name: service.Name,
          kind:
            inferred.kind === "private"
              ? "private"
              : inferred.kind === "staff"
                ? "staff"
                : "shared",
          partySize: inferred.guests,
          capacityUsed: inferred.capacityUsed,
          priceClp: Number(variant?.Price ?? service.Price ?? 0),
          durationMinutes: Number(variant?.Duration ?? 60),
          intervalMinutes: Number(variant?.Interval ?? 90),
          published: service.IsPublished ? 1 : 0,
          rawJson: JSON.stringify(service),
          syncedAt: new Date(),
        })
        .onDuplicateKeyUpdate({
          set: {
            skeduVariantUuid: variant?.UUID ?? null,
            name: service.Name,
            kind:
              inferred.kind === "private"
                ? "private"
                : inferred.kind === "staff"
                  ? "staff"
                  : "shared",
            partySize: inferred.guests,
            capacityUsed: inferred.capacityUsed,
            priceClp: Number(variant?.Price ?? service.Price ?? 0),
            durationMinutes: Number(variant?.Duration ?? 60),
            intervalMinutes: Number(variant?.Interval ?? 90),
            published: service.IsPublished ? 1 : 0,
            rawJson: JSON.stringify(service),
            syncedAt: new Date(),
          },
        });
    }

    const coreAppointments = (
      await getAllSkeduAppointments({
        startDate: rangeFrom,
        endDate: rangeTo,
        resourceUuid: SAUNA_SKEDU_RESOURCE_UUID,
      })
    ).filter(item => item.ResourceUUID === SAUNA_SKEDU_RESOURCE_UUID);

    const detoxGroups = await Promise.all(
      detoxServices.map(async service => {
        const appointments = await getAllSkeduAppointments({
          startDate: rangeFrom,
          endDate: rangeTo,
          serviceUuid: service.UUID,
        });
        return appointments.filter(item => item.ServiceUUID === service.UUID);
      })
    );
    const detoxAppointments = detoxGroups.flat();
    const users = await loadFutureUsers([
      ...coreAppointments,
      ...detoxAppointments,
    ]);
    let bookingsUpserted = 0;
    let programsQueued = 0;

    for (const appointment of coreAppointments) {
      const inferred = inferSaunaBooking(
        serviceName(appointment),
        variantName(appointment)
      );
      const start = dateAndTimeInChile(appointment.StartsAt);
      const end = appointment.EndsAt
        ? dateAndTimeInChile(appointment.EndsAt).time
        : addMinutesToTime(start.time, 60);
      const isCancelled = Boolean(
        appointment.DeletedAt || appointment.RealDeletedAt
      );
      const user = users.get(appointment.UserUUID);
      const values = {
        skeduGroupUuid: appointment.GroupUUID ?? null,
        skeduUserUuid: appointment.UserUUID ?? null,
        skeduServiceUuid: appointment.ServiceUUID ?? null,
        serviceName: serviceName(appointment),
        kind:
          inferred.kind === "private"
            ? ("private" as const)
            : inferred.kind === "staff"
              ? ("staff" as const)
              : ("shared" as const),
        ...userValues(user),
        bookingDate: start.date,
        startTime: start.time,
        endTime: end,
        guests: inferred.guests,
        capacityUsed: inferred.capacityUsed,
        isPrivate: inferred.isPrivate ? 1 : 0,
        status: isCancelled
          ? ("cancelled" as const)
          : appointment.IsConfirmed
            ? ("confirmed" as const)
            : ("pending" as const),
        isConfirmed: appointment.IsConfirmed ? 1 : 0,
        amountClp: Number(
          appointment.SessionPriceWithDiscount ?? appointment.SessionPrice ?? 0
        ),
        source: "skedu" as const,
        origin: appointment.Origin ?? null,
        rescheduleCount: Number(appointment.RescheduleCount ?? 0),
        notes: appointment.Message ?? null,
        externalUpdatedAt: appointment.UpdatedAt
          ? new Date(appointment.UpdatedAt)
          : null,
        lastSyncedAt: new Date(),
        cancelledAt: isCancelled
          ? new Date(appointment.RealDeletedAt ?? appointment.DeletedAt)
          : null,
      };
      await db
        .insert(saunaBookings)
        .values({
          bookingCode: `SKD-${String(appointment.UUID).slice(0, 18).toUpperCase()}`,
          skeduAppointmentUuid: appointment.UUID,
          ...values,
        })
        .onDuplicateKeyUpdate({ set: values });
      bookingsUpserted += 1;
    }

    for (const appointment of detoxAppointments) {
      const inferred = inferSaunaBooking(
        serviceName(appointment),
        variantName(appointment)
      );
      const isCancelled = Boolean(
        appointment.DeletedAt || appointment.RealDeletedAt
      );
      const values = {
        skeduGroupUuid: appointment.GroupUUID ?? null,
        skeduUserUuid: appointment.UserUUID ?? null,
        skeduServiceUuid: appointment.ServiceUUID ?? null,
        serviceName: serviceName(appointment),
        variantName: variantName(appointment) || null,
        programStartsAt: new Date(appointment.StartsAt),
        guests: inferred.guests,
        ...userValues(users.get(appointment.UserUUID)),
        status: isCancelled ? ("cancelled" as const) : ("pending" as const),
        lastSyncedAt: new Date(),
      };
      await db
        .insert(saunaProgramQueue)
        .values({
          skeduAppointmentUuid: appointment.UUID,
          ...values,
        })
        .onDuplicateKeyUpdate({ set: values });
      programsQueued += 1;
    }

    // Si Skedu deja de devolver una reserva anulada dentro de la ventana, no
    // debe seguir ocupando capacidad local indefinidamente.
    const externalIds = coreAppointments.map(item => String(item.UUID));
    const windowFilters = and(
      eq(saunaBookings.source, "skedu"),
      sql`${saunaBookings.bookingDate} >= ${rangeFrom}`,
      sql`${saunaBookings.bookingDate} <= ${rangeTo}`
    );
    if (externalIds.length) {
      await db
        .update(saunaBookings)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          lastSyncedAt: new Date(),
        })
        .where(
          and(
            windowFilters,
            sql`${saunaBookings.skeduAppointmentUuid} NOT IN (${sql.join(
              externalIds.map(id => sql`${id}`),
              sql`, `
            )})`
          )
        );
    }

    const result = {
      appointmentsRead: coreAppointments.length + detoxAppointments.length,
      bookingsUpserted,
      programsQueued,
      servicesSynced: coreServices.length,
    };
    await db
      .update(saunaSyncRuns)
      .set({
        status: "completed",
        ...result,
        completedAt: new Date(),
      })
      .where(eq(saunaSyncRuns.id, run.id));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(saunaSyncRuns)
      .set({
        status: "failed",
        error: message.slice(0, 10_000),
        completedAt: new Date(),
      })
      .where(eq(saunaSyncRuns.id, run.id));
    throw error;
  }
}

let schedulerStarted = false;
let syncInProgress = false;

function chileDateOffset(days: number): string {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHILE_TIME_ZONE }).format(
    base
  );
}

export function startSaunaSyncScheduler(): void {
  if (schedulerStarted || process.env.NODE_ENV === "test") return;
  schedulerStarted = true;
  const run = async () => {
    if (
      syncInProgress ||
      !process.env.SKEDU_APP_ID ||
      !process.env.SKEDU_APP_SECRET
    )
      return;
    syncInProgress = true;
    try {
      await syncSaunaFromSkedu(chileDateOffset(-7), chileDateOffset(365));
    } catch (error) {
      console.error("[sauna:sync] Sincronización automática falló", error);
    } finally {
      syncInProgress = false;
    }
  };
  const initial = setTimeout(() => void run(), 15_000);
  initial.unref?.();
  const timer = setInterval(() => void run(), 5 * 60_000);
  timer.unref?.();
}
