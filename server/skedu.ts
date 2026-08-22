import axios from "axios";

const SKEDU_API_BASE_URL = "https://api.getskedu.com";
const STORE_UUID = "c5e0a893-7eff-42b8-815a-296b1a9c345d";

/** Evita que Axios serialice headers de autenticación en los logs. */
function safeSkeduError(error: unknown) {
  if (axios.isAxiosError(error)) {
    return {
      message: error.message,
      code: error.code,
      status: error.response?.status,
    };
  }
  return error instanceof Error
    ? { message: error.message }
    : { message: "Error desconocido" };
}

// Las credenciales se configurarán mediante variables de entorno
const getHeaders = () => {
  const appId = process.env.SKEDU_APP_ID;
  const secret = process.env.SKEDU_APP_SECRET;

  if (!appId || !secret) {
    throw new Error("Skedu API credentials not configured");
  }

  return {
    "X-Skedu-App-ID": appId,
    "X-Skedu-App-Secret": secret,
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (compatible; CancaguaCMS/1.0; +https://cms.cancagua.cl)",
    Accept: "application/json",
    "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
  };
};

export type SkeduAppointmentQuery = {
  startDate?: string;
  endDate?: string;
  status?: string;
  resourceUuid?: string;
  serviceUuid?: string;
};

export type SkeduAppointmentRecord = Record<string, any>;

export type VerifiedSkeduAppointmentReschedule = {
  verified: true;
  appointment: SkeduAppointmentRecord;
};

export type VerifiedSkeduAppointmentCancellation = {
  verified: true;
  verification: "deleted_at" | "not_found";
  appointment: SkeduAppointmentRecord | null;
};

export type SkeduAppointmentPaymentRecord = Record<string, any>;

type SkeduAppointmentOperation =
  | "reschedule"
  | "cancel"
  | "verify"
  | "payments";

/**
 * Error deliberadamente acotado: nunca conserva el request de Axios, porque ese
 * objeto incluye los headers privados de la aplicación de Skedu.
 */
export class SkeduAppointmentOperationError extends Error {
  readonly operation: SkeduAppointmentOperation;
  readonly status?: number;
  readonly code?: string;

  constructor(
    operation: SkeduAppointmentOperation,
    message: string,
    metadata: { status?: number; code?: string } = {}
  ) {
    super(message);
    this.name = "SkeduAppointmentOperationError";
    this.operation = operation;
    this.status = metadata.status;
    this.code = metadata.code;
  }
}

const SKEDU_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SKEDU_STARTS_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const SKEDU_VERIFICATION_DELAYS_MS = [0, 250, 750] as const;
const SKEDU_REQUEST_TIMEOUT_MS = 3_000;
const SKEDU_OPERATION_DEADLINE_MS = 10_000;

function assertSkeduUuid(
  value: string,
  label: string,
  operation: SkeduAppointmentOperation
): void {
  if (!SKEDU_UUID_PATTERN.test(value)) {
    throw new SkeduAppointmentOperationError(
      operation,
      `${label} no es un UUID válido de Skedu`
    );
  }
}

function assertSkeduStartsAt(value: string): number {
  const timestamp = Date.parse(value);
  if (!SKEDU_STARTS_AT_PATTERN.test(value) || Number.isNaN(timestamp)) {
    throw new SkeduAppointmentOperationError(
      "reschedule",
      "La nueva fecha de la reserva debe ser una fecha ISO con zona horaria"
    );
  }
  return timestamp;
}

function sanitizedAppointmentError(
  operation: SkeduAppointmentOperation,
  error: unknown
): SkeduAppointmentOperationError {
  if (error instanceof SkeduAppointmentOperationError) return error;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const action =
      operation === "reschedule"
        ? "reagendar la reserva"
        : operation === "cancel"
          ? "cancelar la reserva"
          : operation === "payments"
            ? "verificar los pagos de la reserva"
            : "verificar la reserva";
    return new SkeduAppointmentOperationError(
      operation,
      `Skedu no pudo ${action}${status ? ` (HTTP ${status})` : ""}`,
      { status, code: error.code }
    );
  }
  return new SkeduAppointmentOperationError(
    operation,
    operation === "verify"
      ? "Skedu no pudo verificar la reserva"
      : operation === "payments"
        ? "Skedu no pudo verificar los pagos de la reserva"
        : `Skedu no pudo ${operation === "reschedule" ? "reagendar" : "cancelar"} la reserva`
  );
}

function isAmbiguousSkeduMutationError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status == null || status === 408 || status === 429 || status >= 500;
}

function operationDeadline() {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    SKEDU_OPERATION_DEADLINE_MS
  );
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function appointmentFromResponse(value: any): SkeduAppointmentRecord | null {
  const root = value?.Data ?? value?.data ?? value;
  if (Array.isArray(root)) return root[0] ?? null;
  if (Array.isArray(root?.Items)) return root.Items[0] ?? null;
  return root && typeof root === "object" ? root : null;
}

function isNotFoundSkeduError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function waitForSkeduVerification(delayMs: number): Promise<void> {
  if (delayMs === 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function requestSkeduAppointment(
  appointmentUuid: string,
  signal: AbortSignal
): Promise<any> {
  const response = await axios.get(
    `${SKEDU_API_BASE_URL}/appointments/${appointmentUuid}`,
    {
      headers: getHeaders(),
      params: { StoreUUID: STORE_UUID },
      signal,
      timeout: SKEDU_REQUEST_TIMEOUT_MS,
    }
  );
  return response.data;
}

async function verifySkeduReschedule(
  appointmentUuid: string,
  startsAtTimestamp: number,
  resourceUuid: string,
  signal: AbortSignal
): Promise<VerifiedSkeduAppointmentReschedule> {
  let lastReadError: unknown;
  for (const delayMs of SKEDU_VERIFICATION_DELAYS_MS) {
    await waitForSkeduVerification(delayMs);
    try {
      const appointment = appointmentFromResponse(
        await requestSkeduAppointment(appointmentUuid, signal)
      );
      if (
        appointment &&
        !appointment.DeletedAt &&
        !appointment.RealDeletedAt &&
        Date.parse(String(appointment.StartsAt ?? "")) === startsAtTimestamp &&
        String(appointment.ResourceUUID ?? "").toLowerCase() ===
          resourceUuid.toLowerCase()
      ) {
        return { verified: true, appointment };
      }
      lastReadError = undefined;
    } catch (error) {
      lastReadError = error;
    }
  }
  if (lastReadError) {
    throw sanitizedAppointmentError("verify", lastReadError);
  }
  throw new SkeduAppointmentOperationError(
    "verify",
    "Skedu respondió, pero no confirmó el nuevo horario de la reserva"
  );
}

async function verifySkeduCancellation(
  appointmentUuid: string,
  signal: AbortSignal
): Promise<VerifiedSkeduAppointmentCancellation> {
  let lastReadError: unknown;
  for (const delayMs of SKEDU_VERIFICATION_DELAYS_MS) {
    await waitForSkeduVerification(delayMs);
    try {
      const appointment = appointmentFromResponse(
        await requestSkeduAppointment(appointmentUuid, signal)
      );
      if (appointment?.DeletedAt || appointment?.RealDeletedAt) {
        return {
          verified: true,
          verification: "deleted_at",
          appointment,
        };
      }
      lastReadError = undefined;
    } catch (error) {
      if (isNotFoundSkeduError(error)) {
        return {
          verified: true,
          verification: "not_found",
          appointment: null,
        };
      }
      lastReadError = error;
    }
  }
  if (lastReadError) {
    throw sanitizedAppointmentError("verify", lastReadError);
  }
  throw new SkeduAppointmentOperationError(
    "verify",
    "Skedu respondió, pero la reserva todavía figura activa"
  );
}

/**
 * Reagenda una cita en Skedu y confirma por GET que la fecha y el recurso hayan
 * quedado persistidos antes de que el CMS actualice su espejo local.
 */
export async function rescheduleSkeduAppointment(
  appointmentUuid: string,
  input: { startsAt: string; resourceUuid: string }
): Promise<VerifiedSkeduAppointmentReschedule> {
  assertSkeduUuid(appointmentUuid, "La reserva", "reschedule");
  assertSkeduUuid(input.resourceUuid, "El recurso", "reschedule");
  const startsAtTimestamp = assertSkeduStartsAt(input.startsAt);
  const deadline = operationDeadline();
  let mutationError: unknown;
  try {
    try {
      await axios.put(
        `${SKEDU_API_BASE_URL}/appointments/${appointmentUuid}`,
        {
          StartsAt: input.startsAt,
          ResourceUUID: input.resourceUuid,
        },
        {
          headers: getHeaders(),
          params: { StoreUUID: STORE_UUID },
          signal: deadline.signal,
          timeout: SKEDU_REQUEST_TIMEOUT_MS,
        }
      );
    } catch (error) {
      if (!isAmbiguousSkeduMutationError(error)) {
        throw sanitizedAppointmentError("reschedule", error);
      }
      mutationError = error;
    }
    try {
      return await verifySkeduReschedule(
        appointmentUuid,
        startsAtTimestamp,
        input.resourceUuid,
        deadline.signal
      );
    } catch (verificationError) {
      if (mutationError) {
        throw sanitizedAppointmentError("reschedule", mutationError);
      }
      throw verificationError;
    }
  } finally {
    deadline.clear();
  }
}

/**
 * Cancela una cita en Skedu y sólo informa éxito cuando el GET posterior la
 * devuelve con fecha de eliminación o confirma que ya no existe.
 */
export async function cancelSkeduAppointment(
  appointmentUuid: string
): Promise<VerifiedSkeduAppointmentCancellation> {
  assertSkeduUuid(appointmentUuid, "La reserva", "cancel");
  const deadline = operationDeadline();
  let mutationError: unknown;
  try {
    try {
      await axios.delete(
        `${SKEDU_API_BASE_URL}/appointments/${appointmentUuid}`,
        {
          headers: getHeaders(),
          params: { StoreUUID: STORE_UUID },
          data: {},
          signal: deadline.signal,
          timeout: SKEDU_REQUEST_TIMEOUT_MS,
        }
      );
    } catch (error) {
      if (
        !isNotFoundSkeduError(error) &&
        !isAmbiguousSkeduMutationError(error)
      ) {
        throw sanitizedAppointmentError("cancel", error);
      }
      mutationError = error;
    }
    try {
      return await verifySkeduCancellation(appointmentUuid, deadline.signal);
    } catch (verificationError) {
      if (mutationError) {
        throw sanitizedAppointmentError("cancel", mutationError);
      }
      throw verificationError;
    }
  } finally {
    deadline.clear();
  }
}

export async function getSkeduAppointmentPayments(
  groupUuid: string
): Promise<SkeduAppointmentPaymentRecord[]> {
  assertSkeduUuid(groupUuid, "El grupo de la reserva", "payments");
  const deadline = operationDeadline();
  try {
    const response = await axios.get(`${SKEDU_API_BASE_URL}/payments`, {
      headers: getHeaders(),
      params: { GroupUUID: groupUuid, limit: 20, offset: 0 },
      signal: deadline.signal,
      timeout: SKEDU_REQUEST_TIMEOUT_MS,
    });
    const root = response.data?.Data ?? response.data?.data ?? response.data;
    return Array.isArray(root) ? root : (root?.Items ?? []);
  } catch (error) {
    if (isNotFoundSkeduError(error)) return [];
    throw sanitizedAppointmentError("payments", error);
  } finally {
    deadline.clear();
  }
}

export function hasConfirmedSkeduWebpayPayment(
  payments: SkeduAppointmentPaymentRecord[]
): boolean {
  return payments.some(payment => {
    const confirmed =
      payment.IsConfirmed === true ||
      payment.IsConfirmed === 1 ||
      String(payment.IsConfirmed).toLowerCase() === "true";
    return (
      confirmed &&
      Number(payment.Amount ?? 0) > 0 &&
      String(payment.SystemSlug ?? "")
        .toLowerCase()
        .includes("webpay") &&
      !payment.DeletedAt &&
      !payment.CancelledAt
    );
  });
}

/** Skedu limita cada página a 100 filas; la paginación siempre vive en backend. */
export async function getAllSkeduAppointments(
  params: SkeduAppointmentQuery = {}
): Promise<any[]> {
  const pageSize = 100;
  const items: any[] = [];
  let total = 0;
  do {
    const skeduParams: Record<string, string | number> = {
      StoreUUID: STORE_UUID,
      limit: pageSize,
      offset: items.length,
    };
    if (params.startDate)
      skeduParams["StartsAt~ge"] = params.startDate.includes("T")
        ? params.startDate
        : `${params.startDate}T00:00:00Z`;
    if (params.endDate)
      skeduParams["StartsAt~lt"] = params.endDate.includes("T")
        ? params.endDate
        : `${params.endDate}T23:59:59Z`;
    if (params.status) skeduParams.Status = params.status;
    if (params.resourceUuid) skeduParams.ResourceUUID = params.resourceUuid;
    if (params.serviceUuid) skeduParams.ServiceUUID = params.serviceUuid;
    const response = await axios.get(`${SKEDU_API_BASE_URL}/appointments`, {
      headers: getHeaders(),
      params: skeduParams,
    });
    const data = response.data?.Data ?? response.data?.data ?? response.data;
    const page = Array.isArray(data) ? data : (data?.Items ?? []);
    total = Array.isArray(data)
      ? page.length
      : Number(data?.Count ?? page.length);
    items.push(...page);
    if (page.length < pageSize) break;
  } while (items.length < total);
  return items;
}

export async function getSkeduBusinessUser(
  businessUuid: string,
  userUuid: string
) {
  const response = await axios.get(
    `${SKEDU_API_BASE_URL}/businesses/${businessUuid}/users`,
    {
      headers: getHeaders(),
      params: { UUID: userUuid, limit: 1, offset: 0 },
    }
  );
  const data = response.data?.Data ?? response.data;
  return (Array.isArray(data) ? data : (data?.Items ?? []))[0] ?? null;
}

/**
 * Descarga el directorio completo de usuarios de un negocio sin hacer una
 * solicitud por cada cita. Skedu limita cada página a 100 filas.
 */
export async function getAllSkeduBusinessUsers(
  businessUuid: string
): Promise<any[]> {
  const pageSize = 100;
  const users: any[] = [];
  let total = 0;
  do {
    const response = await axios.get(
      `${SKEDU_API_BASE_URL}/businesses/${businessUuid}/users`,
      {
        headers: getHeaders(),
        params: { limit: pageSize, offset: users.length },
      }
    );
    const data = response.data?.Data ?? response.data;
    const page = Array.isArray(data) ? data : (data?.Items ?? []);
    total = Array.isArray(data)
      ? page.length
      : Number(data?.Count ?? page.length);
    users.push(...page);
    if (page.length < pageSize) break;
  } while (users.length < total);
  return users;
}

/**
 * Obtener lista de servicios desde Skedu
 */
export async function getSkeduServices() {
  try {
    const response = await axios.get(`${SKEDU_API_BASE_URL}/services`, {
      headers: getHeaders(),
      params: { StoreUUID: STORE_UUID },
    });
    return response.data;
  } catch (error) {
    console.error("[Skedu] Error fetching services:", safeSkeduError(error));
    throw error;
  }
}

/**
 * Obtener un servicio específico por ID
 */
export async function getSkeduServiceById(serviceId: string) {
  try {
    const response = await axios.get(
      `${SKEDU_API_BASE_URL}/services/${serviceId}`,
      {
        headers: getHeaders(),
        params: { StoreUUID: STORE_UUID },
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      `[Skedu] Error fetching service ${serviceId}:`,
      safeSkeduError(error)
    );
    throw error;
  }
}

/**
 * Obtener lista de eventos desde Skedu (Appointments)
 */
export async function getSkeduEvents(params?: SkeduAppointmentQuery) {
  try {
    return { Data: await getAllSkeduAppointments(params) };
  } catch (error) {
    console.error("[Skedu] Error fetching events:", safeSkeduError(error));
    throw error;
  }
}

/**
 * Obtener una reserva específica por ID
 */
export async function getSkeduAppointmentById(appointmentId: string) {
  try {
    const response = await axios.get(
      `${SKEDU_API_BASE_URL}/appointments/${appointmentId}`,
      {
        headers: getHeaders(),
        params: { StoreUUID: STORE_UUID },
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      `[Skedu] Error fetching appointment ${appointmentId}:`,
      safeSkeduError(error)
    );
    throw error;
  }
}

/**
 * Obtener lista de clientes desde Skedu
 * Nota: Según docs, usa /businesses/:business_uuid/users
 * Pero intentaremos /clients si existe o el usuario provee el business_uuid
 */
export async function getSkeduClients(params?: {
  page?: number;
  perPage?: number;
  email?: string;
}) {
  try {
    // Intentamos el endpoint genérico primero si está disponible
    const response = await axios.get(`${SKEDU_API_BASE_URL}/clients`, {
      headers: getHeaders(),
      params: { ...params, StoreUUID: STORE_UUID },
    });
    return response.data;
  } catch (error) {
    console.error("[Skedu] Error fetching clients:", safeSkeduError(error));
    throw error;
  }
}

/**
 * Crear una reserva en Skedu
 */
export async function createSkeduBooking(data: {
  serviceId?: string;
  eventId?: string;
  clientId: string;
  date: string;
  time?: string;
  notes?: string;
}) {
  try {
    const response = await axios.post(
      `${SKEDU_API_BASE_URL}/appointments`,
      { ...data, StoreUUID: STORE_UUID },
      {
        headers: getHeaders(),
      }
    );
    return response.data;
  } catch (error) {
    console.error("[Skedu] Error creating booking:", safeSkeduError(error));
    throw error;
  }
}

/**
 * Obtener lista de reservas (alias de getSkeduEvents para compatibilidad)
 */
export async function getSkeduBookings(params?: {
  startDate?: string;
  endDate?: string;
  clientId?: string;
  status?: string;
}) {
  return getSkeduEvents(params);
}

/**
 * Alias compatible para obtener pagos por el UUID del grupo de la reserva.
 */
export async function getSkeduPayments(groupUuid: string) {
  return getSkeduAppointmentPayments(groupUuid);
}

// ============================================
// FUNCIONES PARA MÓDULO CONCIERGE
// ============================================

/**
 * URL base del sistema de reservas de Skedu
 */
const SKEDU_BOOKING_BASE_URL = "https://booking.getskedu.com";
const BUSINESS_SLUG = "cancagua"; // Slug del negocio en Skedu

/**
 * Genera la URL de reserva de Skedu con parámetros UTM para tracking
 * @param serviceId - ID del servicio en Skedu (opcional)
 * @param utmParams - Parámetros UTM para tracking
 * @returns URL completa de reserva
 */
export function getSkeduBookingUrl(
  serviceId?: string,
  utmParams?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
  }
): string {
  // Construir URL base
  let url = `${SKEDU_BOOKING_BASE_URL}/${BUSINESS_SLUG}`;

  // Si hay un servicio específico, agregarlo a la URL
  if (serviceId) {
    url += `/service/${serviceId}`;
  }

  // Agregar parámetros UTM si existen
  if (utmParams) {
    const params = new URLSearchParams();

    if (utmParams.utm_source) params.append("utm_source", utmParams.utm_source);
    if (utmParams.utm_medium) params.append("utm_medium", utmParams.utm_medium);
    if (utmParams.utm_campaign)
      params.append("utm_campaign", utmParams.utm_campaign);
    if (utmParams.utm_content)
      params.append("utm_content", utmParams.utm_content);

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}

/**
 * Registrar un pago offline en Skedu (para tracking de comisiones)
 * @param groupUuid - UUID del grupo de reserva
 * @param data - Datos del pago
 */
export async function registerSkeduPayment(
  groupUuid: string,
  data: {
    method: "Coupon" | "Cash" | "Credit Card" | "Debit Card" | "Deposit";
    amount: number;
    description?: string;
  }
) {
  try {
    const response = await axios.post(
      `${SKEDU_API_BASE_URL}/payments/offline`,
      {
        GroupUUID: groupUuid,
        Method: data.method,
        Amount: data.amount,
        Description: data.description,
      },
      {
        headers: getHeaders(),
      }
    );
    return response.data;
  } catch (error) {
    console.error("[Skedu] Error registering payment:", safeSkeduError(error));
    throw error;
  }
}
