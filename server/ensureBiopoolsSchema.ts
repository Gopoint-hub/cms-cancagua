import { eq, sql } from "drizzle-orm";
import {
  biopoolSchedules,
  biopoolServiceImages,
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

export const DEFAULT_FULL_DAY_BIOPOOL_DESCRIPTION = `¡Descubre una experiencia única con nuestras Biopiscinas geotermales a orillas del Lago Llanquihue!

¿Qué son nuestras Biopiscinas Geotermales?

Son piscinas naturales diseñadas de manera sostenible, que utilizan plantas y sistemas ecológicos para mantener el agua cristalina, sin químicos y en armonía con el medio ambiente. La temperatura varía entre 36 y 40 grados.

Nuestras Biopiscinas están pensadas para brindarte un entorno relajante, rodeado de paisajes espectaculares. Además, contamos con baños, ducha y camarín completamente equipados para garantizar tu comodidad.

Ven a conocer nuestras Biopiscinas, un espacio donde la naturaleza y comodidad se encuentran para ofrecerte momentos inolvidables.

Disfruta de una estadía de 8 horas, al costado de nuestra cafetería de alimentación saludable.

La estadía incluye para uso en el lugar:
• 1 bata por persona
• 1 toalla por persona
• 1 gorra de nado por persona
• 1 bolsa pilwa con llave de locker

El ingreso a Biopiscina es solo para mayores de 5 años con control de esfínter y sin pañal. Todo niño debe asistir acompañado por al menos un adulto. La tarifa de niños corresponde desde los 5 hasta los 12 años.`;

export const DEFAULT_FULL_DAY_BIOPOOL_CONFIRMATION_BODY = `¡Muchas gracias por tu compra!

Reserva: {{bookingCode}}
Servicio: {{serviceName}}
Fecha: {{date}}
Horario de ingreso: {{startTime}}
Adultos: {{adultQuantity}}
Niños: {{childQuantity}}

Tu estadía incluye:
• 8 horas de estadía en biopiscinas geotermales, playa y cafetería.
• Cafetería abierta de martes a domingo de 9:30 a 21:30.
• Acceso a estacionamientos y baños.
• 1 bata / 1 toalla / 1 gorra de nado / 1 locker / 1 bolsa pilwa.

Condiciones de servicio:
• Al momento del check-in se solicita cédula de identidad.
• Solo pueden ingresar niños mayores de 5 años con control de esfínter y sin pañal, siempre acompañados por un adulto.
• El espacio es compartido con otros clientes y tiene cupos limitados.
• Es obligatorio el uso de gorra de nado.
• No usar bloqueador solar antes de ingresar para no dañar las plantas que depuran el agua.

Políticas de cancelación y reagendamiento:
• Con 72 horas o más puedes solicitar cancelación o reagendamiento con opción de reembolso, descontando 0,25% por la transacción de Transbank.
• Con 48 horas o más puedes solicitar reagendamiento sin derecho a reembolso.
• Recepción puede reagendar un máximo de 2 veces por reserva.
• Con menos de 48 horas no hay reembolso ni reagendamiento.
• Gift Cards y cupones tienen 3 meses desde la compra para ser canjeados.

Reglamento: {{rulesUrl}}
Ubicación: {{mapsUrl}}`;

export const DEFAULT_LATE_HOUR_BIOPOOL_DESCRIPTION = `Nuevo horario nocturno de Biopiscinas para adultos.

Disfruta de una pausa al final del día en aguas geotermales, sin cloro y frente al Lago Llanquihue. El Late Hour funciona de martes a domingo, con ingreso único a las 20:00 y salida a las 21:30.

La experiencia incluye para uso en el lugar:
• Bata por persona
• Gorra de nado por persona
• Bolsa pilwa con llave de locker

Modalidad exclusiva para mayores de 18 años. El espacio es compartido y tiene cupos limitados.`;

export const DEFAULT_LATE_HOUR_CONFIRMATION_BODY = `¡Muchas gracias por tu compra!

Reserva: {{bookingCode}}
Servicio: {{serviceName}}
Fecha: {{date}}
Horario: 20:00 a 21:30
Adultos: {{adultQuantity}}

Tu entrada Late Hour incluye:
• 90 minutos en las biopiscinas geotermales.
• Bata, gorra de nado, llave de locker y bolsa pilwa.
• Acceso a estacionamientos, baños y vestuarios.

Condiciones de servicio:
• Modalidad exclusiva para mayores de 18 años.
• En el check-in se solicita cédula de identidad.
• Es obligatorio el uso de gorra de nado.
• No usar bloqueador solar antes de ingresar, para cuidar el ecosistema de las biopiscinas.

Reglamento: {{rulesUrl}}
Ubicación: {{mapsUrl}}`;

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
    payment_status enum('pending','partially_paid','paid','partially_refunded','refunded') NOT NULL DEFAULT 'pending',
    payment_method varchar(60) NULL, payment_reference varchar(160) NULL,
    original_amount_clp int NOT NULL, discount_amount_clp int NOT NULL DEFAULT 0,
    discount_code_id int NULL, discount_code varchar(50) NULL,
    amount_paid_clp int NOT NULL DEFAULT 0, refund_amount_clp int NOT NULL DEFAULT 0,
    refund_fee_amount_clp int NOT NULL DEFAULT 0,
    refund_status enum('none','pending','processed','rejected') NOT NULL DEFAULT 'none',
    refund_fee_percent decimal(5,2) NOT NULL DEFAULT 0.25,
    source enum('cms','web','skedu_import','b2b') NOT NULL DEFAULT 'cms', reschedule_count int NOT NULL DEFAULT 0,
    notes text NULL, cancellation_reason text NULL, cancelled_at timestamp NULL, cancelled_by_user_id int NULL,
    agenda_hidden_at timestamp NULL, agenda_hidden_by_user_id int NULL,
    created_by_user_id int NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX biopool_bookings_date_status_idx (service_id, booking_date, status),
    INDEX biopool_bookings_client_idx (client_id), INDEX biopool_bookings_email_idx (client_email)
  )`,
  `CREATE TABLE IF NOT EXISTS reservation_payments (
    id int AUTO_INCREMENT PRIMARY KEY, module varchar(40) NOT NULL, reservation_id int NOT NULL,
    method varchar(60) NOT NULL,
    status enum('pending','paid','refunded') NOT NULL DEFAULT 'paid', amount_clp int NOT NULL,
    paid_at timestamp NULL, reference varchar(160) NULL,
    card_type enum('credit','debit') NULL, gift_card_id int NULL, created_by_user_id int NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX reservation_payment_entity_idx (module, reservation_id, created_at),
    INDEX reservation_payment_gift_card_idx (gift_card_id)
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
  `CREATE TABLE IF NOT EXISTS biopool_checkout_orders (
    id int AUTO_INCREMENT PRIMARY KEY, public_token varchar(64) NOT NULL UNIQUE, service_id int NOT NULL,
    booking_id int NULL, client_name varchar(200) NOT NULL, client_email varchar(320) NOT NULL,
    client_phone varchar(40) NOT NULL, booking_date date NOT NULL, start_time varchar(5) NOT NULL,
    end_time varchar(5) NOT NULL, adult_quantity int NOT NULL, child_quantity int NOT NULL DEFAULT 0,
    total_guests int NOT NULL, subtotal_clp int NOT NULL, discount_clp int NOT NULL DEFAULT 0,
    discount_code_id int NULL, discount_code varchar(50) NULL, total_clp int NOT NULL,
    status enum('initiating','payment_pending','paid','rejected','aborted','timeout','expired','failed') NOT NULL DEFAULT 'initiating',
    expires_at timestamp NOT NULL, webpay_token varchar(180) NULL UNIQUE, buy_order varchar(26) NULL UNIQUE,
    session_id varchar(61) NULL, webpay_status varchar(40) NULL, response_code int NULL,
    authorization_code varchar(80) NULL, card_number varchar(40) NULL, payment_type_code varchar(10) NULL,
    transaction_date varchar(60) NULL, raw_response mediumtext NULL, error text NULL,
    utm_source varchar(100) NULL, utm_medium varchar(100) NULL, utm_campaign varchar(100) NULL,
    paid_at timestamp NULL, completed_at timestamp NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX biopool_checkout_hold_idx (service_id, booking_date, status, expires_at),
    INDEX biopool_checkout_booking_idx (booking_id), INDEX biopool_checkout_created_idx (created_at)
  )`,
  `CREATE TABLE IF NOT EXISTS biopool_checkout_items (
    id int AUTO_INCREMENT PRIMARY KEY, order_id int NOT NULL, ticket_type_id int NOT NULL,
    code varchar(40) NOT NULL, name varchar(120) NOT NULL, unit_price_clp int NOT NULL,
    quantity int NOT NULL, subtotal_clp int NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX biopool_checkout_items_order_idx (order_id)
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
  const paymentStatusColumn = ((bookingColumns as any)?.[0] ?? []).find(
    (column: any) => column.Field === "payment_status"
  );
  if (paymentStatusColumn && !String(paymentStatusColumn.Type).includes("partially_paid")) {
    await db.execute(sql`ALTER TABLE biopool_bookings MODIFY COLUMN payment_status enum('pending','partially_paid','paid','partially_refunded','refunded') NOT NULL DEFAULT 'pending'`);
  }
  const checkoutColumns = await db.execute(sql`SHOW COLUMNS FROM biopool_checkout_orders`);
  const existingCheckoutColumns = new Set(((checkoutColumns as any)?.[0] ?? []).map((column: any) => column.Field));
  if (!existingCheckoutColumns.has("discount_code_id")) {
    await db.execute(sql`ALTER TABLE biopool_checkout_orders ADD COLUMN discount_code_id int NULL AFTER discount_clp`);
  }
  if (!existingCheckoutColumns.has("discount_code")) {
    await db.execute(sql`ALTER TABLE biopool_checkout_orders ADD COLUMN discount_code varchar(50) NULL AFTER discount_code_id`);
  }
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
  if (!existingBookingColumns.has("agenda_hidden_at")) {
    await db.execute(
      sql`ALTER TABLE biopool_bookings ADD COLUMN agenda_hidden_at timestamp NULL AFTER cancelled_by_user_id`
    );
  }
  if (!existingBookingColumns.has("agenda_hidden_by_user_id")) {
    await db.execute(
      sql`ALTER TABLE biopool_bookings ADD COLUMN agenda_hidden_by_user_id int NULL AFTER agenda_hidden_at`
    );
  }
  if (!existingBookingColumns.has("discount_code_id")) {
    await db.execute(
      sql`ALTER TABLE biopool_bookings ADD COLUMN discount_code_id int NULL AFTER discount_amount_clp`
    );
  }
  if (!existingBookingColumns.has("discount_code")) {
    await db.execute(
      sql`ALTER TABLE biopool_bookings ADD COLUMN discount_code varchar(50) NULL AFTER discount_code_id`
    );
  }
  await db.execute(sql`
    UPDATE biopool_bookings booking
    INNER JOIN biopool_checkout_orders checkout ON checkout.booking_id = booking.id
    SET booking.discount_code_id = checkout.discount_code_id,
        booking.discount_code = checkout.discount_code
    WHERE booking.discount_code IS NULL
      AND checkout.discount_code IS NOT NULL
  `);

  let [service] = await db
    .select()
    .from(biopoolServices)
    .where(eq(biopoolServices.slug, "biopiscinas-geotermales"))
    .limit(1);
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

  let [fullDayService] = await db
    .select()
    .from(biopoolServices)
    .where(eq(biopoolServices.slug, "full-day-biopiscinas"))
    .limit(1);
  if (!fullDayService) {
    const [created] = await db
      .insert(biopoolServices)
      .values({
        name: "Full Day Biopiscinas + Playa (Estadía de 8 horas)",
        slug: "full-day-biopiscinas",
        description: DEFAULT_FULL_DAY_BIOPOOL_DESCRIPTION,
        status: "published",
        capacity: 40,
        openingTime: "10:00",
        firstEntryTime: "10:00",
        lastEntryTime: "13:00",
        slotIntervalMinutes: 60,
        standardDurationMinutes: 480,
        finalEntryDurationMinutes: 480,
        waterCloseTime: "21:30",
        facilityCloseTime: "22:00",
        maxStaffReschedules: 2,
        refundNoticeHours: 72,
        rescheduleNoticeHours: 48,
        refundFeePercent: "0.25",
        childMinAge: 5,
        childMaxAge: 12,
        childRequiresAdult: 1,
        reminderHoursBefore: 24,
        reminderEmailEnabled: 1,
        reminderWhatsappEnabled: 1,
        notificationEmail: "contacto@cancagua.cl",
        mapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Cancagua+Spa+Frutillar",
        rulesUrl:
          "https://drive.google.com/file/d/1zV3KFg_JuQ7U6Yzy49BGKCy-oW3raJZQ/view?usp=sharing",
        confirmationEmailSubject:
          "Confirmación de tu Full Day Biopiscinas — Cancagua",
        confirmationEmailBody: DEFAULT_FULL_DAY_BIOPOOL_CONFIRMATION_BODY,
        reminderEmailSubject: "Recordatorio de tu Full Day en Cancagua",
        reminderEmailBody: DEFAULT_BIOPOOL_REMINDER_BODY,
        reminderWhatsappBody: DEFAULT_BIOPOOL_REMINDER_BODY,
      })
      .$returningId();
    [fullDayService] = await db
      .select()
      .from(biopoolServices)
      .where(eq(biopoolServices.id, created.id))
      .limit(1);
  }

  const fullDayTickets = await db
    .select()
    .from(biopoolTicketTypes)
    .where(eq(biopoolTicketTypes.serviceId, fullDayService.id));
  if (!fullDayTickets.some(ticket => ticket.code === "adult")) {
    await db.insert(biopoolTicketTypes).values({
      serviceId: fullDayService.id,
      code: "adult",
      name: "Ticket adulto Full Day",
      priceClp: 51_000,
      minimumAge: 13,
      displayOrder: 1,
    });
  }
  if (!fullDayTickets.some(ticket => ticket.code === "child")) {
    await db.insert(biopoolTicketTypes).values({
      serviceId: fullDayService.id,
      code: "child",
      name: "Ticket niño Full Day",
      priceClp: 34_000,
      minimumAge: 5,
      maximumAge: 12,
      requiresAdult: 1,
      displayOrder: 2,
    });
  }

  const fullDaySchedules = await db
    .select()
    .from(biopoolSchedules)
    .where(eq(biopoolSchedules.serviceId, fullDayService.id));
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
    if (fullDaySchedules.some(schedule => schedule.dayOfWeek === dayOfWeek))
      continue;
    await db.insert(biopoolSchedules).values({
      serviceId: fullDayService.id,
      dayOfWeek,
      enabled: dayOfWeek === 1 ? 0 : 1,
      openingTime: "10:00",
      firstEntryTime: "10:00",
      lastEntryTime: "13:00",
      waterCloseTime: "21:30",
      facilityCloseTime: "22:00",
    });
  }
  const fullDayImages = await db
    .select()
    .from(biopoolServiceImages)
    .where(eq(biopoolServiceImages.serviceId, fullDayService.id));
  if (!fullDayImages.length) {
    await db.insert(biopoolServiceImages).values({
      serviceId: fullDayService.id,
      url: "https://res.cloudinary.com/dhuln9b1n/image/upload/v1770309169/cancagua/images/fullday-biopiscinas-hero.webp",
      altText: "Full Day en las Biopiscinas Geotermales de Cancagua",
      displayOrder: 0,
    });
  }

  let [lateHourService] = await db
    .select()
    .from(biopoolServices)
    .where(eq(biopoolServices.slug, "late-hour-biopiscinas"))
    .limit(1);
  if (!lateHourService) {
    const [created] = await db
      .insert(biopoolServices)
      .values({
        name: "Late Hour Biopiscinas (20:00 a 21:30)",
        slug: "late-hour-biopiscinas",
        description: DEFAULT_LATE_HOUR_BIOPOOL_DESCRIPTION,
        status: "published",
        capacity: 40,
        openingTime: "20:00",
        firstEntryTime: "20:00",
        lastEntryTime: "20:00",
        slotIntervalMinutes: 90,
        standardDurationMinutes: 90,
        finalEntryDurationMinutes: 90,
        waterCloseTime: "21:30",
        facilityCloseTime: "22:00",
        maxStaffReschedules: 2,
        refundNoticeHours: 72,
        rescheduleNoticeHours: 48,
        refundFeePercent: "0.25",
        childMinAge: 18,
        childMaxAge: 18,
        childRequiresAdult: 0,
        reminderHoursBefore: 24,
        reminderEmailEnabled: 1,
        reminderWhatsappEnabled: 1,
        notificationEmail: "contacto@cancagua.cl",
        mapsUrl: "https://www.google.com/maps/search/?api=1&query=Cancagua+Spa+Frutillar",
        rulesUrl: "https://drive.google.com/file/d/1zV3KFg_JuQ7U6Yzy49BGKCy-oW3raJZQ/view?usp=sharing",
        confirmationEmailSubject: "Confirmación de tu Late Hour en Cancagua",
        confirmationEmailBody: DEFAULT_LATE_HOUR_CONFIRMATION_BODY,
        reminderEmailSubject: "Recordatorio de tu Late Hour en Cancagua",
        reminderEmailBody: DEFAULT_BIOPOOL_REMINDER_BODY,
        reminderWhatsappBody: DEFAULT_BIOPOOL_REMINDER_BODY,
      })
      .$returningId();
    [lateHourService] = await db
      .select()
      .from(biopoolServices)
      .where(eq(biopoolServices.id, created.id))
      .limit(1);
  }

  const lateHourTickets = await db
    .select()
    .from(biopoolTicketTypes)
    .where(eq(biopoolTicketTypes.serviceId, lateHourService.id));
  if (!lateHourTickets.some(ticket => ticket.code === "adult")) {
    await db.insert(biopoolTicketTypes).values({
      serviceId: lateHourService.id,
      code: "adult",
      name: "Ticket adulto Late Hour",
      priceClp: 24_000,
      minimumAge: 18,
      displayOrder: 1,
    });
  }

  const lateHourSchedules = await db
    .select()
    .from(biopoolSchedules)
    .where(eq(biopoolSchedules.serviceId, lateHourService.id));
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
    if (lateHourSchedules.some(schedule => schedule.dayOfWeek === dayOfWeek)) continue;
    await db.insert(biopoolSchedules).values({
      serviceId: lateHourService.id,
      dayOfWeek,
      enabled: dayOfWeek === 1 ? 0 : 1,
      openingTime: "20:00",
      firstEntryTime: "20:00",
      lastEntryTime: "20:00",
      waterCloseTime: "21:30",
      facilityCloseTime: "22:00",
    });
  }
  console.log("[database] Módulo de Biopiscinas verificado");
}
