import { eq, sql } from "drizzle-orm";
import {
  biopoolSchedules,
  biopoolServices,
  biopoolTicketTypes,
} from "../drizzle/schema";
import { getDb } from "./db";

export const DEFAULT_BIOPOOL_DESCRIPTION = `¡Descubre una experiencia única con nuestras Biopiscinas geotermales a orillas del Lago Llanquihue!

¿Qué son nuestras Biopiscinas Geotermales?

Son piscinas naturales diseñadas de manera sostenible, que utilizan plantas y sistemas ecológicos para mantener el agua cristalina, sin químicos y en armonía con el medio ambiente. La temperatura varía entre 35 y 40 grados.

Nuestras Biopiscinas están pensadas para brindarte un entorno relajante, rodeado de paisajes espectaculares. Además, contamos con baños, ducha y camarín completamente equipados para garantizar tu comodidad.

Disfruta de una estadía de 4 horas. Al costado de Biopiscinas encontrarás nuestra cafetería de alimentación saludable.

La estadía incluye para uso en el lugar:
• Bata por persona
• Gorra de nado por persona
• Bolsa pilwa con llavero de locker

El ingreso es solo para mayores de 5 años con control de esfínter y sin pañal. Todo niño debe asistir acompañado por al menos un adulto. El espacio es compartido y tiene cupos limitados. La tarifa de niños corresponde desde los 5 hasta los 12 años. En el horario de las 18:00 el ticket contempla 3,5 horas, porque la piscina cierra a las 21:30.`;

export const DEFAULT_BIOPOOL_CONFIRMATION_BODY = `¡Muchas gracias por tu compra!

Reserva: {{bookingCode}}
Servicio: {{serviceName}}
Fecha: {{date}}
Horario de ingreso: {{startTime}}
Adultos: {{adultQuantity}}
Niños: {{childQuantity}}

Tu estadía incluye:
• 4 horas de estadía en biopiscinas geotermales, playa y cafetería (3,5 horas para el ingreso de las 18:00).
• Cafetería abierta de martes a domingo de 9:30 a 21:30.
• Acceso a estacionamientos y baños.
• Bata para adultos / toalla para niños.
• Gorra de nado / llave de locker / bolsa pilwa.

Condiciones de servicio:
• En el check-in se solicita cédula de identidad.
• Solo pueden ingresar niños mayores de 5 años con control de esfínter y sin pañal, siempre acompañados por un adulto.
• El espacio es compartido y tiene cupos limitados.
• Es obligatorio el uso de gorra de nado.
• No usar bloqueador solar al ingresar, para no dañar las plantas que depuran el agua.

Al cumplirse tu estadía dispones de 30 minutos de tolerancia para hacer check-out. Después se cobrará el adicional correspondiente de $15.000 por adulto / $10.000 por niño.

Políticas:
• Con 72 horas o más puedes solicitar cancelación o reagendamiento con opción de reembolso, descontando 0,25% por transacción.
• Con 48 horas o más puedes solicitar reagendamiento sin derecho a reembolso.
• Con menos de 48 horas no hay reembolso ni reagendamiento.
• Recepción puede reagendar un máximo de 2 veces por reserva.
• Gift Cards y cupones tienen 3 meses desde la compra para ser canjeados.

Reglamento: {{rulesUrl}}
Ubicación: {{mapsUrl}}`;

export const DEFAULT_BIOPOOL_REMINDER_BODY = `Hola {{firstName}} 😊 Te recordamos tu reserva en Cancagua.

Servicio: {{serviceName}}
Fecha: {{date}}
Hora de ingreso: {{startTime}}
Reserva: {{bookingCode}}

Recuerda traer tu cédula de identidad y traje de baño. Nosotros te entregaremos bata o toalla, gorra de nado, llave de locker y bolsa pilwa. No uses bloqueador solar antes de entrar al agua.

Cómo llegar: {{mapsUrl}}
Reglamento: {{rulesUrl}}

Confirma tu asistencia aquí: {{confirmUrl}}

¡Te esperamos!`;

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS biopool_services (
    id int AUTO_INCREMENT PRIMARY KEY, name varchar(180) NOT NULL, slug varchar(180) NOT NULL UNIQUE,
    description mediumtext NULL, status enum('draft','published','hidden','archived') NOT NULL DEFAULT 'draft',
    capacity int NOT NULL DEFAULT 40, opening_time varchar(5) NOT NULL DEFAULT '10:00',
    water_close_time varchar(5) NOT NULL DEFAULT '21:30', facility_close_time varchar(5) NOT NULL DEFAULT '22:00',
    first_entry_time varchar(5) NOT NULL DEFAULT '10:00', last_entry_time varchar(5) NOT NULL DEFAULT '18:00',
    slot_interval_minutes int NOT NULL DEFAULT 60, standard_duration_minutes int NOT NULL DEFAULT 240,
    final_entry_duration_minutes int NOT NULL DEFAULT 210, booking_horizon_months int NULL,
    customer_can_cancel int NOT NULL DEFAULT 0, customer_can_reschedule int NOT NULL DEFAULT 0,
    max_staff_reschedules int NOT NULL DEFAULT 2, refund_notice_hours int NOT NULL DEFAULT 72,
    reschedule_notice_hours int NOT NULL DEFAULT 48, refund_fee_percent decimal(5,2) NOT NULL DEFAULT 0.25,
    child_min_age int NOT NULL DEFAULT 5, child_max_age int NOT NULL DEFAULT 12, child_requires_adult int NOT NULL DEFAULT 1,
    reminder_hours_before int NOT NULL DEFAULT 24, reminder_email_enabled int NOT NULL DEFAULT 1,
    reminder_whatsapp_enabled int NOT NULL DEFAULT 1, notification_email varchar(320) NOT NULL DEFAULT 'contacto@cancagua.cl',
    maps_url text NULL, rules_url text NULL, confirmation_email_subject varchar(250) NULL,
    confirmation_email_body mediumtext NULL, reminder_email_subject varchar(250) NULL,
    reminder_email_body mediumtext NULL, reminder_whatsapp_body mediumtext NULL,
    created_by_user_id int NULL, archived_at timestamp NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS biopool_ticket_types (
    id int AUTO_INCREMENT PRIMARY KEY, service_id int NOT NULL, code varchar(40) NOT NULL,
    name varchar(120) NOT NULL, price_clp int NOT NULL, minimum_age int NULL, maximum_age int NULL,
    requires_adult int NOT NULL DEFAULT 0, display_order int NOT NULL DEFAULT 0, active int NOT NULL DEFAULT 1,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY biopool_ticket_service_code_unique (service_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS biopool_schedules (
    id int AUTO_INCREMENT PRIMARY KEY, service_id int NOT NULL, day_of_week int NOT NULL,
    enabled int NOT NULL DEFAULT 1, opening_time varchar(5) NOT NULL DEFAULT '10:00',
    first_entry_time varchar(5) NOT NULL DEFAULT '10:00', last_entry_time varchar(5) NOT NULL DEFAULT '18:00',
    water_close_time varchar(5) NOT NULL DEFAULT '21:30', facility_close_time varchar(5) NOT NULL DEFAULT '22:00',
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY biopool_schedule_service_day_unique (service_id, day_of_week)
  )`,
  `CREATE TABLE IF NOT EXISTS biopool_service_images (
    id int AUTO_INCREMENT PRIMARY KEY, service_id int NOT NULL, url text NOT NULL,
    alt_text varchar(250) NULL, display_order int NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX biopool_images_service_order_idx (service_id, display_order)
  )`,
  `CREATE TABLE IF NOT EXISTS biopool_blocks (
    id int AUTO_INCREMENT PRIMARY KEY, service_id int NOT NULL, start_date date NOT NULL, end_date date NOT NULL,
    start_time varchar(5) NOT NULL DEFAULT '10:00', end_time varchar(5) NOT NULL DEFAULT '22:00',
    blocked_capacity int NOT NULL DEFAULT 40,
    reason enum('technical','temperature','private_event','maintenance','other') NOT NULL,
    notes text NULL, reference_type varchar(40) NULL, reference_id varchar(80) NULL,
    active int NOT NULL DEFAULT 1, created_by_user_id int NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX biopool_blocks_date_idx (service_id, start_date, end_date, active)
  )`,
  `CREATE TABLE IF NOT EXISTS biopool_bookings (
    id int AUTO_INCREMENT PRIMARY KEY, booking_code varchar(32) NOT NULL UNIQUE, service_id int NOT NULL,
    client_id int NULL, client_name varchar(200) NOT NULL, client_email varchar(320) NOT NULL,
    client_phone varchar(40) NOT NULL, booking_date date NOT NULL, start_time varchar(5) NOT NULL,
    end_time varchar(5) NOT NULL, adult_quantity int NOT NULL DEFAULT 1, child_quantity int NOT NULL DEFAULT 0,
    total_guests int NOT NULL, status enum('pending','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'pending',
    attendance_confirmation enum('pending','confirmed','declined') NOT NULL DEFAULT 'pending', attendance_token varchar(64) NOT NULL UNIQUE,
    payment_status enum('pending','paid','partially_refunded','refunded') NOT NULL DEFAULT 'pending',
    payment_method varchar(60) NULL, payment_reference varchar(160) NULL,
    original_amount_clp int NOT NULL, discount_amount_clp int NOT NULL DEFAULT 0,
    amount_paid_clp int NOT NULL DEFAULT 0, refund_amount_clp int NOT NULL DEFAULT 0,
    refund_fee_amount_clp int NOT NULL DEFAULT 0,
    refund_status enum('none','pending','processed','rejected') NOT NULL DEFAULT 'none',
    refund_fee_percent decimal(5,2) NOT NULL DEFAULT 0.25,
    source enum('cms','web','skedu_import','b2b') NOT NULL DEFAULT 'cms', reschedule_count int NOT NULL DEFAULT 0,
    notes text NULL, cancellation_reason text NULL, cancelled_at timestamp NULL, cancelled_by_user_id int NULL,
    created_by_user_id int NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX biopool_bookings_date_status_idx (service_id, booking_date, status),
    INDEX biopool_bookings_client_idx (client_id), INDEX biopool_bookings_email_idx (client_email)
  )`,
  `CREATE TABLE IF NOT EXISTS biopool_booking_activity (
    id int AUTO_INCREMENT PRIMARY KEY, booking_id int NOT NULL, action varchar(80) NOT NULL,
    detail text NULL, user_id int NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX biopool_activity_booking_idx (booking_id, created_at)
  )`,
  `CREATE TABLE IF NOT EXISTS biopool_notifications (
    id int AUTO_INCREMENT PRIMARY KEY, booking_id int NOT NULL,
    type enum('confirmation','reminder') NOT NULL, channel enum('email','whatsapp') NOT NULL,
    status enum('pending','sending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
    scheduled_at timestamp NULL, sent_at timestamp NULL, provider_id varchar(180) NULL,
    error text NULL, attempt_count int NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX biopool_notification_queue_idx (status, scheduled_at)
  )`,
];

export async function ensureBiopoolsSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const statement of CREATE_STATEMENTS)
    await db.execute(sql.raw(statement));
  const bookingColumns = await db.execute(
    sql`SHOW COLUMNS FROM biopool_bookings`
  );
  const existingBookingColumns = new Set(
    ((bookingColumns as any)?.[0] ?? []).map((column: any) => column.Field)
  );
  if (!existingBookingColumns.has("refund_fee_amount_clp")) {
    await db.execute(
      sql`ALTER TABLE biopool_bookings ADD COLUMN refund_fee_amount_clp int NOT NULL DEFAULT 0 AFTER refund_amount_clp`
    );
  }
  if (!existingBookingColumns.has("refund_status")) {
    await db.execute(
      sql`ALTER TABLE biopool_bookings ADD COLUMN refund_status enum('none','pending','processed','rejected') NOT NULL DEFAULT 'none' AFTER refund_fee_amount_clp`
    );
  }

  let [service] = await db.select().from(biopoolServices).limit(1);
  if (!service) {
    const [created] = await db
      .insert(biopoolServices)
      .values({
        name: "Biopiscinas Geotermales (Estadía de 4 horas)",
        slug: "biopiscinas-geotermales",
        description: DEFAULT_BIOPOOL_DESCRIPTION,
        status: "published",
        mapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Cancagua+Spa+Frutillar",
        rulesUrl:
          "https://drive.google.com/file/d/1zV3KFg_JuQ7U6Yzy49BGKCy-oW3raJZQ/view?usp=sharing",
        confirmationEmailSubject:
          "Confirmación de tu reserva de Biopiscinas — Cancagua",
        confirmationEmailBody: DEFAULT_BIOPOOL_CONFIRMATION_BODY,
        reminderEmailSubject: "Recordatorio de tu reserva en Cancagua",
        reminderEmailBody: DEFAULT_BIOPOOL_REMINDER_BODY,
        reminderWhatsappBody: DEFAULT_BIOPOOL_REMINDER_BODY,
      })
      .$returningId();
    [service] = await db
      .select()
      .from(biopoolServices)
      .where(eq(biopoolServices.id, created.id))
      .limit(1);
  }

  const tickets = await db
    .select()
    .from(biopoolTicketTypes)
    .where(eq(biopoolTicketTypes.serviceId, service.id));
  if (!tickets.some(ticket => ticket.code === "adult")) {
    await db.insert(biopoolTicketTypes).values({
      serviceId: service.id,
      code: "adult",
      name: "Ticket adulto",
      priceClp: 36_000,
      minimumAge: 13,
      displayOrder: 1,
    });
  }
  if (!tickets.some(ticket => ticket.code === "child")) {
    await db.insert(biopoolTicketTypes).values({
      serviceId: service.id,
      code: "child",
      name: "Ticket niño",
      priceClp: 24_000,
      minimumAge: 5,
      maximumAge: 12,
      requiresAdult: 1,
      displayOrder: 2,
    });
  }

  const schedules = await db
    .select()
    .from(biopoolSchedules)
    .where(eq(biopoolSchedules.serviceId, service.id));
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
    if (schedules.some(schedule => schedule.dayOfWeek === dayOfWeek)) continue;
    await db.insert(biopoolSchedules).values({
      serviceId: service.id,
      dayOfWeek,
      enabled: dayOfWeek === 1 ? 0 : 1,
    });
  }
  console.log("[database] Módulo de Biopiscinas verificado");
}
