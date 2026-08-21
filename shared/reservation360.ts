/**
 * Contrato único de las reservas que pueden abrirse desde Calendario 360,
 * Clientes 360 y las agendas de cada módulo.
 *
 * Al incorporar un servicio nuevo, se agrega aquí su clave y sus tipos de
 * reserva; después el backend implementa el adaptador de detalle y la agenda
 * consume el mismo Reservation360DetailDialog. Así las acciones no se copian
 * entre pantallas.
 */
export const RESERVATION_360_SERVICE_KEYS = [
  "massages",
  "biopools",
  "sauna",
  "regular_classes",
] as const;

export type Reservation360ServiceKey =
  (typeof RESERVATION_360_SERVICE_KEYS)[number];

export const RESERVATION_360_EVENT_KINDS = [
  "massage",
  "massage_program",
  "biopool",
  "sauna",
  "regular_class",
  "regular_class_schedule",
  "regular_class_membership",
] as const;

export type Reservation360EventKind =
  (typeof RESERVATION_360_EVENT_KINDS)[number];

export const RESERVATION_360_CALENDAR_EVENT_KINDS = [
  "massage",
  "massage_program",
  "biopool",
  "sauna",
  "regular_class",
  "regular_class_schedule",
] as const satisfies readonly Reservation360EventKind[];

export const RESERVATION_360_CLIENT_EVENT_KINDS = [
  "massage",
  "massage_program",
  "biopool",
  "sauna",
  "regular_class",
  "regular_class_membership",
] as const satisfies readonly Reservation360EventKind[];

export const RESERVATION_360_KIND_SERVICE = {
  massage: "massages",
  massage_program: "massages",
  biopool: "biopools",
  sauna: "sauna",
  regular_class: "regular_classes",
  regular_class_schedule: "regular_classes",
  regular_class_membership: "regular_classes",
} as const satisfies Record<Reservation360EventKind, Reservation360ServiceKey>;

export type Reservation360EventBase = {
  id: string;
  entityId: number;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  clientName: string;
  status: string;
  paymentStatus: string | null;
  people: number;
  href: string;
};

/**
 * Unión discriminada: TypeScript impide, por ejemplo, abrir una reserva de
 * sauna usando accidentalmente las mutaciones o invalidaciones de Masajes.
 */
export type Reservation360Event = {
  [Kind in Reservation360EventKind]: Reservation360EventBase & {
    kind: Kind;
    service: (typeof RESERVATION_360_KIND_SERVICE)[Kind];
  };
}[Reservation360EventKind];

/**
 * Construye el evento con el módulo canónico del tipo de reserva. Es útil para
 * historiales heterogéneos, donde `kind` llega como unión y TypeScript no puede
 * conservar por sí solo su relación con `service`.
 */
export function createReservation360Event<Kind extends Reservation360EventKind>(
  event: Reservation360EventBase & { kind: Kind }
): Extract<Reservation360Event, { kind: Kind }> {
  return {
    ...event,
    service: RESERVATION_360_KIND_SERVICE[event.kind],
  } as Extract<Reservation360Event, { kind: Kind }>;
}
