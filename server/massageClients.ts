export type MassageClientBookingRecord = {
  id: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientOrigin: string | null;
  bookingDate: string;
  startTime: string;
  duration: number;
  serviceName: string | null;
  therapistName: string | null;
  status: string;
  amountPaid: number;
  crossSellServices: string | null;
  cancellationCategory: string | null;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  source: "massage" | "skedu_program";
};

export type MassageClientHistoryItem = {
  id: string;
  bookingDate: string;
  startTime: string;
  duration: number;
  techniqueName: string | null;
  therapistName: string | null;
  status: string;
  amountPaid: number;
  crossSellServices: string | null;
  cancellationCategory: string | null;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  source: "massage" | "skedu_program";
};

export type MassageClientDirectoryEntry = {
  clientKey: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientOrigin: string | null;
  totalBookings: number;
  lastBookingDate: string;
  totalSpent: number;
  history: MassageClientHistoryItem[];
};

const normalizedEmail = (value: string | null) => value?.trim().toLowerCase() || null;
const normalizedPhone = (value: string | null) => {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  return digits.length > 9 ? digits.slice(-9) : digits;
};
const normalizedName = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");

export function buildMassageClientDirectory(
  records: MassageClientBookingRecord[],
): MassageClientDirectoryEntry[] {
  const clients = new Map<string, MassageClientDirectoryEntry>();
  const emailAliases = new Map<string, string>();
  const phoneAliases = new Map<string, string>();
  const uncontactedNameAliases = new Map<string, string>();

  const sorted = [...records].sort((left, right) =>
    `${left.bookingDate} ${left.startTime} ${left.id}`
      .localeCompare(`${right.bookingDate} ${right.startTime} ${right.id}`),
  );

  for (const record of sorted) {
    const email = normalizedEmail(record.clientEmail);
    const phone = normalizedPhone(record.clientPhone);
    const name = normalizedName(record.clientName);
    const existingKey = (email ? emailAliases.get(email) : undefined)
      ?? (phone ? phoneAliases.get(phone) : undefined)
      ?? uncontactedNameAliases.get(name);
    const clientKey = existingKey
      ?? (email ? `email:${email}` : phone ? `phone:${phone}` : `name:${name}`);
    const client = clients.get(clientKey) ?? {
      clientKey,
      clientName: record.clientName.trim(),
      clientEmail: record.clientEmail?.trim() || null,
      clientPhone: record.clientPhone?.trim() || null,
      clientOrigin: record.clientOrigin?.trim() || null,
      totalBookings: 0,
      lastBookingDate: record.bookingDate,
      totalSpent: 0,
      history: [],
    };

    client.clientName = record.clientName.trim() || client.clientName;
    client.clientEmail = record.clientEmail?.trim() || client.clientEmail;
    client.clientPhone = record.clientPhone?.trim() || client.clientPhone;
    client.clientOrigin = record.clientOrigin?.trim() || client.clientOrigin;
    client.totalBookings += 1;
    client.totalSpent += Number(record.amountPaid || 0);
    if (record.bookingDate >= client.lastBookingDate) {
      client.lastBookingDate = record.bookingDate;
    }
    client.history.push({
      id: record.id,
      bookingDate: record.bookingDate,
      startTime: record.startTime,
      duration: record.duration,
      techniqueName: record.serviceName,
      therapistName: record.therapistName,
      status: record.status,
      amountPaid: Number(record.amountPaid || 0),
      crossSellServices: record.crossSellServices,
      cancellationCategory: record.cancellationCategory,
      cancellationReason: record.cancellationReason,
      cancelledAt: record.cancelledAt,
      source: record.source,
    });
    clients.set(clientKey, client);

    if (email) emailAliases.set(email, clientKey);
    if (phone) phoneAliases.set(phone, clientKey);
    if (!email && !phone) uncontactedNameAliases.set(name, clientKey);
  }

  return Array.from(clients.values())
    .map((client) => ({
      ...client,
      totalSpent: Math.round(client.totalSpent),
      history: client.history.sort((left, right) =>
        `${right.bookingDate} ${right.startTime}`.localeCompare(`${left.bookingDate} ${left.startTime}`),
      ),
    }))
    .sort((left, right) =>
      right.lastBookingDate.localeCompare(left.lastBookingDate)
      || left.clientName.localeCompare(right.clientName, "es"),
    );
}
