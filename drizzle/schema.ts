import { date, decimal, foreignKey, int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Supports email/password authentication with role-based access control.
 * Roles:
 * - super_admin: Full access, cannot be removed by admins (owner and advisors)
 * - admin: Full access to all modules, can manage users except super_admins
 * - user: Access to specific modules only
 * - seller: Access to sales-related modules
 * - concierge: Access only to concierge sales tool
 * - cancagua_staff: Reception/operations access to B2C, maintenance and massage agenda
 * - massage_therapist: Read-only access to massage dashboard and agenda
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique identifier for the user (UUID format) */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  /** Hashed password using bcrypt */
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }).default("email"),
  /** User role: super_admin, admin, user, seller */
  role: mysqlEnum("role", ["super_admin", "admin", "editor", "user", "seller", "concierge", "cancagua_staff", "massage_therapist"]).default("user").notNull(),
  /** User status: active, pending (invited but not activated), inactive */
  status: mysqlEnum("status", ["active", "pending", "inactive"]).default("pending").notNull(),
  /** Modules the user has access to (JSON array, null = all modules for admin roles) */
  allowedModules: text("allowedModules"),
  /** Permisos granulares explícitos (JSON array). null conserva los permisos predeterminados del rol. */
  permissions: text("permissions"),
  /** Acceso acumulable como profesor/a de clases regulares. Puede coexistir con otros roles. */
  regularClassesTeacher: int("regular_classes_teacher").default(0).notNull(),
  /** Invitation token for new users */
  invitationToken: varchar("invitationToken", { length: 255 }),
  invitationExpiresAt: timestamp("invitationExpiresAt"),
  /** Password reset token */
  resetToken: varchar("resetToken", { length: 255 }),
  resetTokenExpiresAt: timestamp("resetTokenExpiresAt"),
  /** Who invited this user */
  invitedBy: int("invitedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UserRole = "super_admin" | "admin" | "editor" | "user" | "seller" | "concierge" | "cancagua_staff" | "massage_therapist";
export type UserStatus = "active" | "pending" | "inactive";

// Biopiscinas: catálogo, aforo compartido, agenda y comunicaciones.
export const biopoolServices = mysqlTable("biopool_services", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  description: mediumtext("description"),
  status: mysqlEnum("status", ["draft", "published", "hidden", "archived"]).default("draft").notNull(),
  capacity: int("capacity").default(40).notNull(),
  openingTime: varchar("opening_time", { length: 5 }).default("10:00").notNull(),
  waterCloseTime: varchar("water_close_time", { length: 5 }).default("21:30").notNull(),
  facilityCloseTime: varchar("facility_close_time", { length: 5 }).default("22:00").notNull(),
  firstEntryTime: varchar("first_entry_time", { length: 5 }).default("10:00").notNull(),
  lastEntryTime: varchar("last_entry_time", { length: 5 }).default("18:00").notNull(),
  slotIntervalMinutes: int("slot_interval_minutes").default(60).notNull(),
  standardDurationMinutes: int("standard_duration_minutes").default(240).notNull(),
  finalEntryDurationMinutes: int("final_entry_duration_minutes").default(210).notNull(),
  bookingHorizonMonths: int("booking_horizon_months"),
  customerCanCancel: int("customer_can_cancel").default(0).notNull(),
  customerCanReschedule: int("customer_can_reschedule").default(0).notNull(),
  maxStaffReschedules: int("max_staff_reschedules").default(2).notNull(),
  refundNoticeHours: int("refund_notice_hours").default(72).notNull(),
  rescheduleNoticeHours: int("reschedule_notice_hours").default(48).notNull(),
  refundFeePercent: decimal("refund_fee_percent", { precision: 5, scale: 2 }).default("0.25").notNull(),
  childMinAge: int("child_min_age").default(5).notNull(),
  childMaxAge: int("child_max_age").default(12).notNull(),
  childRequiresAdult: int("child_requires_adult").default(1).notNull(),
  reminderHoursBefore: int("reminder_hours_before").default(24).notNull(),
  reminderEmailEnabled: int("reminder_email_enabled").default(1).notNull(),
  reminderWhatsappEnabled: int("reminder_whatsapp_enabled").default(1).notNull(),
  notificationEmail: varchar("notification_email", { length: 320 }).default("contacto@cancagua.cl").notNull(),
  mapsUrl: text("maps_url"),
  rulesUrl: text("rules_url"),
  confirmationEmailSubject: varchar("confirmation_email_subject", { length: 250 }),
  confirmationEmailBody: mediumtext("confirmation_email_body"),
  reminderEmailSubject: varchar("reminder_email_subject", { length: 250 }),
  reminderEmailBody: mediumtext("reminder_email_body"),
  reminderWhatsappBody: mediumtext("reminder_whatsapp_body"),
  createdByUserId: int("created_by_user_id"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const biopoolTicketTypes = mysqlTable("biopool_ticket_types", {
  id: int("id").autoincrement().primaryKey(),
  serviceId: int("service_id").notNull(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  priceClp: int("price_clp").notNull(),
  minimumAge: int("minimum_age"),
  maximumAge: int("maximum_age"),
  requiresAdult: int("requires_adult").default(0).notNull(),
  displayOrder: int("display_order").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const biopoolSchedules = mysqlTable("biopool_schedules", {
  id: int("id").autoincrement().primaryKey(),
  serviceId: int("service_id").notNull(),
  dayOfWeek: int("day_of_week").notNull(),
  enabled: int("enabled").default(1).notNull(),
  openingTime: varchar("opening_time", { length: 5 }).default("10:00").notNull(),
  firstEntryTime: varchar("first_entry_time", { length: 5 }).default("10:00").notNull(),
  lastEntryTime: varchar("last_entry_time", { length: 5 }).default("18:00").notNull(),
  waterCloseTime: varchar("water_close_time", { length: 5 }).default("21:30").notNull(),
  facilityCloseTime: varchar("facility_close_time", { length: 5 }).default("22:00").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const biopoolServiceImages = mysqlTable("biopool_service_images", {
  id: int("id").autoincrement().primaryKey(),
  serviceId: int("service_id").notNull(),
  url: text("url").notNull(),
  altText: varchar("alt_text", { length: 250 }),
  displayOrder: int("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const biopoolBlocks = mysqlTable("biopool_blocks", {
  id: int("id").autoincrement().primaryKey(),
  serviceId: int("service_id").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }).default("10:00").notNull(),
  endTime: varchar("end_time", { length: 5 }).default("22:00").notNull(),
  blockedCapacity: int("blocked_capacity").default(40).notNull(),
  reason: mysqlEnum("reason", ["technical", "temperature", "private_event", "maintenance", "other"]).notNull(),
  notes: text("notes"),
  referenceType: varchar("reference_type", { length: 40 }),
  referenceId: varchar("reference_id", { length: 80 }),
  active: int("active").default(1).notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const biopoolBookings = mysqlTable("biopool_bookings", {
  id: int("id").autoincrement().primaryKey(),
  bookingCode: varchar("booking_code", { length: 32 }).notNull().unique(),
  serviceId: int("service_id").notNull(),
  clientId: int("client_id"),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientEmail: varchar("client_email", { length: 320 }).notNull(),
  clientPhone: varchar("client_phone", { length: 40 }).notNull(),
  bookingDate: date("booking_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  adultQuantity: int("adult_quantity").default(1).notNull(),
  childQuantity: int("child_quantity").default(0).notNull(),
  totalGuests: int("total_guests").notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "completed", "cancelled", "no_show"]).default("pending").notNull(),
  attendanceConfirmation: mysqlEnum("attendance_confirmation", ["pending", "confirmed", "declined"]).default("pending").notNull(),
  attendanceToken: varchar("attendance_token", { length: 64 }).notNull().unique(),
  paymentStatus: mysqlEnum("payment_status", ["pending", "partially_paid", "paid", "partially_refunded", "refunded"]).default("pending").notNull(),
  paymentMethod: varchar("payment_method", { length: 60 }),
  paymentReference: varchar("payment_reference", { length: 160 }),
  originalAmountClp: int("original_amount_clp").notNull(),
  discountAmountClp: int("discount_amount_clp").default(0).notNull(),
  discountCodeId: int("discount_code_id"),
  discountCode: varchar("discount_code", { length: 50 }),
  amountPaidClp: int("amount_paid_clp").default(0).notNull(),
  refundAmountClp: int("refund_amount_clp").default(0).notNull(),
  refundFeeAmountClp: int("refund_fee_amount_clp").default(0).notNull(),
  refundStatus: mysqlEnum("refund_status", ["none", "pending", "processed", "rejected"]).default("none").notNull(),
  refundFeePercent: decimal("refund_fee_percent", { precision: 5, scale: 2 }).default("0.25").notNull(),
  source: mysqlEnum("source", ["cms", "web", "skedu_import", "b2b"]).default("cms").notNull(),
  rescheduleCount: int("reschedule_count").default(0).notNull(),
  notes: text("notes"),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledByUserId: int("cancelled_by_user_id"),
  agendaHiddenAt: timestamp("agenda_hidden_at"),
  agendaHiddenByUserId: int("agenda_hidden_by_user_id"),
  createdByUserId: int("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const reservationPayments = mysqlTable("reservation_payments", {
  id: int("id").autoincrement().primaryKey(),
  module: varchar("module", { length: 40 }).notNull(),
  reservationId: int("reservation_id").notNull(),
  method: varchar("method", { length: 60 }).notNull(),
  status: mysqlEnum("status", ["pending", "paid", "refunded"]).default("paid").notNull(),
  amountClp: int("amount_clp").notNull(),
  paidAt: timestamp("paid_at"),
  reference: varchar("reference", { length: 160 }),
  cardType: mysqlEnum("card_type", ["credit", "debit"]),
  giftCardId: int("gift_card_id"),
  createdByUserId: int("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Mutex estable por reserva para serializar la creación de links con las
 * modificaciones financieras del CMS. A diferencia del propio link, esta fila
 * existe antes de que haya una solicitud y evita dos links activos creados al
 * mismo tiempo para la misma reserva.
 */
export const reservationPaymentLocks = mysqlTable("reservation_payment_locks", {
  lockKey: varchar("lock_key", { length: 100 }).primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Enlace estable que recepción puede enviar al cliente para pagar una o más
 * reservas ya creadas. La solicitud no es una orden del catálogo público: sus
 * montos se vuelven a comprobar contra las reservas antes de iniciar y
 * acreditar cada intento.
 */
export const reservationPaymentRequests = mysqlTable("reservation_payment_requests", {
  id: int("id").autoincrement().primaryKey(),
  publicToken: varchar("public_token", { length: 64 }).notNull().unique(),
  provider: mysqlEnum("provider", ["getnet", "webpay"]).notNull(),
  status: mysqlEnum("status", [
    "active",
    "processing",
    "paid",
    "cancelled",
    "expired",
    "failed",
    "reconciliation_required",
  ]).default("active").notNull(),
  totalClp: int("total_clp").notNull(),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientEmail: varchar("client_email", { length: 320 }),
  clientPhone: varchar("client_phone", { length: 40 }),
  expiresAt: timestamp("expires_at").notNull(),
  paidAt: timestamp("paid_at"),
  cancelledAt: timestamp("cancelled_at"),
  reconciliationReason: text("reconciliation_reason"),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const reservationPaymentAllocations = mysqlTable("reservation_payment_allocations", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("request_id").notNull(),
  service: mysqlEnum("service", ["massages", "massage_programs", "biopools", "sauna"]).notNull(),
  reservationId: int("reservation_id").notNull(),
  amountClp: int("amount_clp").notNull(),
  paymentId: int("payment_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reservationPaymentAttempts = mysqlTable("reservation_payment_attempts", {
  id: int("id").autoincrement().primaryKey(),
  requestId: int("request_id").notNull(),
  provider: mysqlEnum("provider", ["getnet", "webpay"]).notNull(),
  status: mysqlEnum("status", [
    "initiating",
    "pending",
    "approved",
    "rejected",
    "aborted",
    "expired",
    "failed",
    "reconciliation_required",
  ]).default("initiating").notNull(),
  reference: varchar("reference", { length: 80 }).notNull().unique(),
  expectedAmountClp: int("expected_amount_clp").notNull(),
  providerRequestId: varchar("provider_request_id", { length: 80 }).unique(),
  webpayToken: varchar("webpay_token", { length: 180 }).unique(),
  providerUrl: text("provider_url"),
  reportedAmountClp: int("reported_amount_clp"),
  reportedCurrency: varchar("reported_currency", { length: 10 }),
  providerStatus: varchar("provider_status", { length: 40 }),
  authorizationCode: varchar("authorization_code", { length: 80 }),
  rawResponse: mediumtext("raw_response"),
  error: text("error"),
  expiresAt: timestamp("expires_at").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// Movimientos manuales de la caja de recepción. Los ingresos provenientes de
// reservas no se duplican aquí: se leen directamente desde
// reservation_payments cuando son pagos en efectivo confirmados. Esta tabla
// conserva retiros e ingresos excepcionales de servicios que aún no tienen una
// reserva nativa en el CMS.
export const cashRegisterMovements = mysqlTable("cash_register_movements", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", ["manual_income", "withdrawal"]).notNull(),
  service: varchar("service", { length: 40 }),
  amountClp: int("amount_clp").notNull(),
  category: mysqlEnum("category", [
    "bank_deposit",
    "maintenance",
    "operations",
    "other",
  ]),
  reason: varchar("reason", { length: 500 }).notNull(),
  occurredAt: timestamp("occurred_at").notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  voidedAt: timestamp("voided_at"),
  voidedByUserId: int("voided_by_user_id"),
  voidReason: varchar("void_reason", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// Fecha de apertura del libro. Evita interpretar como efectivo físicamente
// disponible los cobros históricos realizados antes de que existiera la caja.
export const cashRegisterSettings = mysqlTable("cash_register_settings", {
  id: int("id").primaryKey(),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const biopoolBookingActivity = mysqlTable("biopool_booking_activity", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  detail: text("detail"),
  userId: int("user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const biopoolNotifications = mysqlTable("biopool_notifications", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull(),
  type: mysqlEnum("type", ["confirmation", "reminder"]).notNull(),
  channel: mysqlEnum("channel", ["email", "whatsapp"]).notNull(),
  status: mysqlEnum("status", ["pending", "sending", "sent", "failed", "skipped"]).default("pending").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  providerId: varchar("provider_id", { length: 180 }),
  error: text("error"),
  attemptCount: int("attempt_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const biopoolCheckoutOrders = mysqlTable("biopool_checkout_orders", {
  id: int("id").autoincrement().primaryKey(),
  publicToken: varchar("public_token", { length: 64 }).notNull().unique(),
  serviceId: int("service_id").notNull(),
  bookingId: int("booking_id"),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientEmail: varchar("client_email", { length: 320 }).notNull(),
  clientPhone: varchar("client_phone", { length: 40 }).notNull(),
  bookingDate: date("booking_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  adultQuantity: int("adult_quantity").notNull(),
  childQuantity: int("child_quantity").default(0).notNull(),
  totalGuests: int("total_guests").notNull(),
  subtotalClp: int("subtotal_clp").notNull(),
  discountClp: int("discount_clp").default(0).notNull(),
  discountCodeId: int("discount_code_id"),
  discountCode: varchar("discount_code", { length: 50 }),
  giftCardCode: varchar("gift_card_code", { length: 20 }),
  totalClp: int("total_clp").notNull(),
  status: mysqlEnum("status", [
    "initiating",
    "payment_pending",
    "paid",
    "rejected",
    "aborted",
    "timeout",
    "expired",
    "failed",
  ]).default("initiating").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  webpayToken: varchar("webpay_token", { length: 180 }).unique(),
  buyOrder: varchar("buy_order", { length: 26 }).unique(),
  sessionId: varchar("session_id", { length: 61 }),
  webpayStatus: varchar("webpay_status", { length: 40 }),
  responseCode: int("response_code"),
  authorizationCode: varchar("authorization_code", { length: 80 }),
  cardNumber: varchar("card_number", { length: 40 }),
  paymentTypeCode: varchar("payment_type_code", { length: 10 }),
  transactionDate: varchar("transaction_date", { length: 60 }),
  rawResponse: mediumtext("raw_response"),
  error: text("error"),
  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),
  paidAt: timestamp("paid_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const biopoolCheckoutItems = mysqlTable("biopool_checkout_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("order_id").notNull(),
  ticketTypeId: int("ticket_type_id").notNull(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  unitPriceClp: int("unit_price_clp").notNull(),
  quantity: int("quantity").notNull(),
  subtotalClp: int("subtotal_clp").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BiopoolService = typeof biopoolServices.$inferSelect;
export type BiopoolTicketType = typeof biopoolTicketTypes.$inferSelect;
export type BiopoolSchedule = typeof biopoolSchedules.$inferSelect;
export type BiopoolBlock = typeof biopoolBlocks.$inferSelect;
export type BiopoolBooking = typeof biopoolBookings.$inferSelect;
export type BiopoolCheckoutOrder = typeof biopoolCheckoutOrders.$inferSelect;

// Sauna: espejo de Skedu, agenda de aforo compartido, pases Detox y pagos Webpay.
export const saunaSettings = mysqlTable("sauna_settings", {
  id: int("id").primaryKey(),
  capacity: int("capacity").default(6).notNull(),
  durationMinutes: int("duration_minutes").default(60).notNull(),
  slotIntervalMinutes: int("slot_interval_minutes").default(30).notNull(),
  bookingLeadHours: int("booking_lead_hours").default(2).notNull(),
  cancellationNoticeHours: int("cancellation_notice_hours").default(72).notNull(),
  rescheduleNoticeHours: int("reschedule_notice_hours").default(48).notNull(),
  maxReschedules: int("max_reschedules").default(2).notNull(),
  checkoutEnabled: int("checkout_enabled").default(0).notNull(),
  scheduleJson: text("schedule_json").notNull(),
  notificationEmail: varchar("notification_email", { length: 320 }),
  confirmationEmailSubject: varchar("confirmation_email_subject", { length: 220 }),
  confirmationEmailBody: text("confirmation_email_body"),
  confirmationWhatsappBody: text("confirmation_whatsapp_body"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const saunaNotifications = mysqlTable("sauna_notifications", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull(),
  type: mysqlEnum("type", ["confirmation"]).notNull(),
  channel: mysqlEnum("channel", ["email", "whatsapp"]).notNull(),
  status: mysqlEnum("status", ["pending", "sending", "sent", "failed", "skipped"]).default("pending").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  providerId: varchar("provider_id", { length: 180 }),
  error: text("error"),
  attemptCount: int("attempt_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const saunaServices = mysqlTable("sauna_services", {
  id: int("id").autoincrement().primaryKey(),
  skeduServiceUuid: varchar("skedu_service_uuid", { length: 64 }).notNull().unique(),
  skeduVariantUuid: varchar("skedu_variant_uuid", { length: 64 }),
  name: varchar("name", { length: 220 }).notNull(),
  kind: mysqlEnum("kind", ["shared", "private", "staff", "program"]).notNull(),
  partySize: int("party_size").notNull(),
  capacityUsed: int("capacity_used").notNull(),
  priceClp: int("price_clp").default(0).notNull(),
  durationMinutes: int("duration_minutes").default(60).notNull(),
  intervalMinutes: int("interval_minutes").default(90).notNull(),
  published: int("published").default(0).notNull(),
  rawJson: mediumtext("raw_json"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const saunaBookings = mysqlTable("sauna_bookings", {
  id: int("id").autoincrement().primaryKey(),
  bookingCode: varchar("booking_code", { length: 40 }).notNull().unique(),
  skeduAppointmentUuid: varchar("skedu_appointment_uuid", { length: 64 }).unique(),
  skeduGroupUuid: varchar("skedu_group_uuid", { length: 64 }),
  skeduUserUuid: varchar("skedu_user_uuid", { length: 64 }),
  skeduServiceUuid: varchar("skedu_service_uuid", { length: 64 }),
  serviceName: varchar("service_name", { length: 220 }).notNull(),
  kind: mysqlEnum("kind", ["shared", "private", "staff", "detox", "manual"]).default("shared").notNull(),
  clientName: varchar("client_name", { length: 200 }),
  clientEmail: varchar("client_email", { length: 320 }),
  clientPhone: varchar("client_phone", { length: 40 }),
  bookingDate: date("booking_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  guests: int("guests").notNull(),
  capacityUsed: int("capacity_used").notNull(),
  isPrivate: int("is_private").default(0).notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "completed", "cancelled", "no_show"]).default("confirmed").notNull(),
  isConfirmed: int("is_confirmed").default(0).notNull(),
  paymentStatus: mysqlEnum("payment_status", ["unknown", "pending", "partially_paid", "paid", "partially_refunded", "refunded"]).default("unknown").notNull(),
  paymentMethod: varchar("payment_method", { length: 60 }),
  paymentReference: varchar("payment_reference", { length: 160 }),
  amountClp: int("amount_clp").default(0).notNull(),
  amountPaidClp: int("amount_paid_clp").default(0).notNull(),
  source: mysqlEnum("source", ["skedu", "web", "cms", "detox"]).default("cms").notNull(),
  origin: varchar("origin", { length: 40 }),
  rescheduleCount: int("reschedule_count").default(0).notNull(),
  notes: text("notes"),
  externalUpdatedAt: timestamp("external_updated_at"),
  lastSyncedAt: timestamp("last_synced_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdByUserId: int("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const saunaBlocks = mysqlTable("sauna_blocks", {
  id: int("id").autoincrement().primaryKey(),
  blockDate: date("block_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  blockedCapacity: int("blocked_capacity").default(6).notNull(),
  reason: mysqlEnum("reason", ["maintenance", "private_event", "detox", "operational", "other"]).notNull(),
  notes: text("notes"),
  active: int("active").default(1).notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const saunaProgramQueue = mysqlTable("sauna_program_queue", {
  id: int("id").autoincrement().primaryKey(),
  skeduAppointmentUuid: varchar("skedu_appointment_uuid", { length: 64 }).notNull().unique(),
  skeduGroupUuid: varchar("skedu_group_uuid", { length: 64 }),
  skeduUserUuid: varchar("skedu_user_uuid", { length: 64 }),
  skeduServiceUuid: varchar("skedu_service_uuid", { length: 64 }),
  serviceName: varchar("service_name", { length: 240 }).notNull(),
  variantName: varchar("variant_name", { length: 240 }),
  programStartsAt: timestamp("program_starts_at").notNull(),
  guests: int("guests").notNull(),
  clientName: varchar("client_name", { length: 200 }),
  clientEmail: varchar("client_email", { length: 320 }),
  clientPhone: varchar("client_phone", { length: 40 }),
  status: mysqlEnum("status", ["pending", "scheduled", "dismissed", "cancelled"]).default("pending").notNull(),
  saunaBookingId: int("sauna_booking_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const saunaSyncRuns = mysqlTable("sauna_sync_runs", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  rangeFrom: date("range_from", { mode: "string" }).notNull(),
  rangeTo: date("range_to", { mode: "string" }).notNull(),
  appointmentsRead: int("appointments_read").default(0).notNull(),
  bookingsUpserted: int("bookings_upserted").default(0).notNull(),
  programsQueued: int("programs_queued").default(0).notNull(),
  error: text("error"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const saunaCheckoutOrders = mysqlTable("sauna_checkout_orders", {
  id: int("id").autoincrement().primaryKey(),
  publicToken: varchar("public_token", { length: 64 }).notNull().unique(),
  bookingId: int("booking_id"),
  serviceId: int("service_id").notNull(),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientEmail: varchar("client_email", { length: 320 }).notNull(),
  clientPhone: varchar("client_phone", { length: 40 }).notNull(),
  bookingDate: date("booking_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  guests: int("guests").notNull(),
  capacityUsed: int("capacity_used").notNull(),
  isPrivate: int("is_private").default(0).notNull(),
  subtotalClp: int("subtotal_clp").default(0).notNull(),
  discountClp: int("discount_clp").default(0).notNull(),
  discountCodeId: int("discount_code_id"),
  discountCode: varchar("discount_code", { length: 50 }),
  totalClp: int("total_clp").notNull(),
  giftCardCode: varchar("gift_card_code", { length: 20 }),
  status: mysqlEnum("status", ["initiating", "payment_pending", "paid", "rejected", "aborted", "expired", "failed", "refunded", "manual_review"]).default("initiating").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  webpayToken: varchar("webpay_token", { length: 180 }).unique(),
  buyOrder: varchar("buy_order", { length: 26 }).unique(),
  sessionId: varchar("session_id", { length: 61 }),
  webpayStatus: varchar("webpay_status", { length: 40 }),
  responseCode: int("response_code"),
  authorizationCode: varchar("authorization_code", { length: 80 }),
  cardNumber: varchar("card_number", { length: 40 }),
  paymentTypeCode: varchar("payment_type_code", { length: 10 }),
  transactionDate: varchar("transaction_date", { length: 60 }),
  rawResponse: mediumtext("raw_response"),
  error: text("error"),
  paidAt: timestamp("paid_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// Checkout público transversal. Mantiene una sola transacción Webpay para una
// compra que puede combinar Biopiscinas y Sauna, mientras cada línea conserva
// su hold de aforo en el módulo correspondiente.
export const serviceCartCheckoutOrders = mysqlTable("service_cart_checkout_orders", {
  id: int("id").autoincrement().primaryKey(),
  publicToken: varchar("public_token", { length: 64 }).notNull().unique(),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientEmail: varchar("client_email", { length: 320 }).notNull(),
  clientPhone: varchar("client_phone", { length: 40 }).notNull(),
  totalClp: int("total_clp").notNull(),
  status: mysqlEnum("status", [
    "initiating",
    "payment_pending",
    "paid",
    "rejected",
    "aborted",
    "expired",
    "failed",
    "refunded",
    "manual_review",
  ]).default("initiating").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  webpayToken: varchar("webpay_token", { length: 180 }).unique(),
  buyOrder: varchar("buy_order", { length: 26 }).unique(),
  sessionId: varchar("session_id", { length: 61 }),
  webpayStatus: varchar("webpay_status", { length: 40 }),
  responseCode: int("response_code"),
  authorizationCode: varchar("authorization_code", { length: 80 }),
  cardNumber: varchar("card_number", { length: 40 }),
  paymentTypeCode: varchar("payment_type_code", { length: 10 }),
  transactionDate: varchar("transaction_date", { length: 60 }),
  rawResponse: mediumtext("raw_response"),
  error: text("error"),
  paidAt: timestamp("paid_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const serviceCartCheckoutItems = mysqlTable("service_cart_checkout_items", {
  id: int("id").autoincrement().primaryKey(),
  cartOrderId: int("cart_order_id").notNull(),
  module: mysqlEnum("module", ["biopools", "sauna", "massages", "regular_classes"]).notNull(),
  childOrderId: int("child_order_id").notNull(),
  itemName: varchar("item_name", { length: 220 }).notNull(),
  bookingDate: date("booking_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  guests: int("guests").notNull(),
  totalClp: int("total_clp").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const serviceCartNotifications = mysqlTable("service_cart_notifications", {
  id: int("id").autoincrement().primaryKey(),
  cartOrderId: int("cart_order_id").notNull().unique(),
  type: mysqlEnum("type", ["confirmation"]).default("confirmation").notNull(),
  channel: mysqlEnum("channel", ["email"]).default("email").notNull(),
  status: mysqlEnum("status", ["pending", "sending", "sent", "failed", "skipped"]).default("pending").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  providerId: varchar("provider_id", { length: 180 }),
  error: text("error"),
  attemptCount: int("attempt_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type SaunaBooking = typeof saunaBookings.$inferSelect;
export type SaunaService = typeof saunaServices.$inferSelect;
export type SaunaCheckoutOrder = typeof saunaCheckoutOrders.$inferSelect;
export type ServiceCartCheckoutOrder = typeof serviceCartCheckoutOrders.$inferSelect;

// Servicios de Skedu
export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  skeduId: varchar("skedu_id", { length: 255 }).unique(),
  name: text("name").notNull(),
  description: text("description"),
  duration: int("duration"), // en minutos
  price: int("price"), // en pesos chilenos
  category: varchar("category", { length: 100 }),
  imageUrl: text("image_url"),
  active: int("active").default(1).notNull(), // 1 = activo, 0 = inactivo
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
});

export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;

// Eventos de Skedu
export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  skeduId: varchar("skedu_id", { length: 255 }).unique(),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  duration: int("duration"), // en minutos
  price: int("price"),
  totalCapacity: int("total_capacity").notNull(),
  availableCapacity: int("available_capacity").notNull(),
  category: varchar("category", { length: 100 }),
  imageUrl: text("image_url"),
  location: text("location"),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

// Clientes sincronizados desde Skedu
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  skeduId: varchar("skedu_id", { length: 255 }).unique(),
  email: varchar("email", { length: 320 }).notNull(),
  name: text("name"),
  phone: varchar("phone", { length: 50 }),
  subscribedToNewsletter: int("subscribed_to_newsletter").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),
  // BI fields — populated from Skedu income reports
  totalVisitas: int("total_visitas").default(0),
  totalGasto: decimal("total_gasto", { precision: 12, scale: 0 }).default("0"),
  gasto2025: decimal("gasto_2025", { precision: 12, scale: 0 }).default("0"),
  gasto2026: decimal("gasto_2026", { precision: 12, scale: 0 }).default("0"),
  visitas2025: int("visitas_2025").default(0),
  visitas2026: int("visitas_2026").default(0),
  primerVisita: date("primer_visita"),
  ultimaVisita: date("ultima_visita"),
  serviciosUsados: text("servicios_usados"),  // JSON array
  codigosUsados: text("codigos_usados"),       // JSON array
  esLeal: int("es_leal").default(0),           // 1 = visited both 2025 and 2026
  origen: varchar("origen", { length: 150 }),
  idioma: varchar("idioma", { length: 10 }),
  fechaNacimiento: date("fecha_nacimiento"),
  genero: mysqlEnum("genero", ["M", "F", "nd"]).default("nd"),
  ticketPromedio: decimal("ticket_promedio", { precision: 10, scale: 0 }).default("0"),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

/**
 * Ficha canónica de Cliente 360.
 *
 * Las fuentes operativas (Masajes, Biopiscinas, Sauna y Clases) conservan sus
 * propios datos históricos. Esta tabla entrega una identidad estable para
 * agruparlos sin depender de que el nombre esté escrito exactamente igual.
 */
export const client360Profiles = mysqlTable("client_360_profiles", {
  id: int("id").autoincrement().primaryKey(),
  originKey: varchar("origin_key", { length: 160 }).unique(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  primaryEmail: varchar("primary_email", { length: 320 }),
  primaryPhone: varchar("primary_phone", { length: 40 }),
  notes: text("notes"),
  status: mysqlEnum("status", ["active", "merged"]).default("active").notNull(),
  mergedIntoProfileId: int("merged_into_profile_id"),
  createdByUserId: int("created_by_user_id"),
  updatedByUserId: int("updated_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Alias normalizados de una ficha. `identityKey` incluye el tipo
 * (`email:...`/`phone:...`). Un contacto puede estar compartido por una familia,
 * por eso el lookup no es único globalmente: la resolución automática solo lo
 * usa cuando conduce a una única ficha.
 */
export const client360Identities = mysqlTable("client_360_identities", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profile_id").notNull(),
  kind: mysqlEnum("kind", ["email", "phone", "external"]).notNull(),
  identityKey: varchar("identity_key", { length: 400 }).notNull(),
  normalizedValue: varchar("normalized_value", { length: 320 }).notNull(),
  displayValue: varchar("display_value", { length: 320 }),
  source: varchar("source", { length: 60 }).default("operations_360").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Enlace estable entre una ficha y el registro operativo original. */
export const client360ReservationLinks = mysqlTable(
  "client_360_reservation_links",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profile_id").notNull(),
    // varchar para permitir que servicios futuros se incorporen sin ALTER ENUM.
    reservationKind: varchar("reservation_kind", { length: 60 }).notNull(),
    reservationId: int("reservation_id").notNull(),
    // Para Clases el detalle abre la sesión, pero el origen estable puede ser
    // una asistencia. sourceKey evita colisiones entre participantes.
    sourceKey: varchar("source_key", { length: 120 }).notNull().unique(),
    linkedBy: mysqlEnum("linked_by", ["automatic", "manual", "merge"])
      .default("automatic")
      .notNull(),
    createdByUserId: int("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  }
);

/** Snapshot read-only de citas antiguas importadas desde Skedu. */
export const client360ExternalEvents = mysqlTable(
  "client_360_external_events",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profile_id"),
    provider: varchar("provider", { length: 40 }).default("skedu").notNull(),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    externalKey: varchar("external_key", { length: 320 }).notNull().unique(),
    userExternalId: varchar("user_external_id", { length: 255 }),
    businessExternalId: varchar("business_external_id", { length: 255 }),
    serviceKey: varchar("service_key", { length: 60 })
      .default("other")
      .notNull(),
    serviceName: varchar("service_name", { length: 220 }).notNull(),
    variantName: varchar("variant_name", { length: 220 }),
    eventDate: date("event_date", { mode: "string" }).notNull(),
    startTime: varchar("start_time", { length: 5 }),
    endTime: varchar("end_time", { length: 5 }),
    status: varchar("status", { length: 40 }).default("confirmed").notNull(),
    paymentStatus: varchar("payment_status", { length: 40 })
      .default("unknown")
      .notNull(),
    listedAmountClp: int("listed_amount_clp").default(0).notNull(),
    clientName: varchar("client_name", { length: 200 }),
    clientEmail: varchar("client_email", { length: 320 }),
    clientPhone: varchar("client_phone", { length: 40 }),
    nativeKind: varchar("native_kind", { length: 60 }),
    nativeReservationId: int("native_reservation_id"),
    sourceCreatedAt: timestamp("source_created_at"),
    sourceUpdatedAt: timestamp("source_updated_at"),
    rawJson: mediumtext("raw_json"),
    lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  }
);

/** Auditoría mínima de altas, ediciones, enlaces, conflictos y fusiones. */
export const client360Audit = mysqlTable("client_360_audit", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profile_id").notNull(),
  action: varchar("action", { length: 60 }).notNull(),
  relatedProfileId: int("related_profile_id"),
  detail: text("detail"),
  actorUserId: int("actor_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Client360Profile = typeof client360Profiles.$inferSelect;
export type Client360Identity = typeof client360Identities.$inferSelect;
export type Client360ReservationLink =
  typeof client360ReservationLinks.$inferSelect;
export type Client360ExternalEvent =
  typeof client360ExternalEvents.$inferSelect;

// Suscriptores de newsletter
export const newsletterSubscribers = mysqlTable("newsletter_subscribers", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: text("name"),
  status: mysqlEnum("status", ["active", "unsubscribed"]).default("active").notNull(),
  source: varchar("source", { length: 100 }).default("website").notNull(), // website, import, manual
  metadata: text("metadata"), // JSON con datos adicionales (ciudad, fecha compra, etc.)
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type InsertNewsletterSubscriber = typeof newsletterSubscribers.$inferInsert;

// Listas de suscriptores (segmentación)
export const subscriberLists = mysqlTable("subscriber_lists", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  segmentationRules: text("segmentation_rules"), // JSON con reglas de segmentación
  subscriberCount: int("subscriber_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type SubscriberList = typeof subscriberLists.$inferSelect;
export type InsertSubscriberList = typeof subscriberLists.$inferInsert;

// Relación many-to-many entre suscriptores y listas
export const listSubscribers = mysqlTable("list_subscribers", {
  id: int("id").autoincrement().primaryKey(),
  listId: int("list_id").references(() => subscriberLists.id, { onDelete: "cascade" }).notNull(),
  subscriberId: int("subscriber_id").references(() => newsletterSubscribers.id, { onDelete: "cascade" }).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export type ListSubscriber = typeof listSubscribers.$inferSelect;
export type InsertListSubscriber = typeof listSubscribers.$inferInsert;

// Newsletters (campañas de email)
export const newsletters = mysqlTable("newsletters", {
  id: int("id").autoincrement().primaryKey(),
  subject: text("subject").notNull(),
  senderName: varchar("sender_name", { length: 100 }).default("Newsletter Cancagua").notNull(), // Nombre que aparece como remitente
  htmlContent: mediumtext("html_content").notNull(), // HTML generado por IA (mediumtext para soportar assets embebidos)
  textContent: text("text_content"), // Versión texto plano
  designPrompt: text("design_prompt"), // Prompt original usado para generar el diseño
  status: mysqlEnum("status", ["draft", "scheduled", "sending", "sent", "failed"]).default("draft").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  recipientCount: int("recipient_count").default(0).notNull(),
  openCount: int("open_count").default(0).notNull(),
  clickCount: int("click_count").default(0).notNull(),
  createdBy: int("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Newsletter = typeof newsletters.$inferSelect;
export type InsertNewsletter = typeof newsletters.$inferInsert;

// Listas asociadas a cada newsletter
export const newsletterLists = mysqlTable("newsletter_lists", {
  id: int("id").autoincrement().primaryKey(),
  newsletterId: int("newsletter_id").references(() => newsletters.id, { onDelete: "cascade" }).notNull(),
  listId: int("list_id").references(() => subscriberLists.id, { onDelete: "cascade" }).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export type NewsletterList = typeof newsletterLists.$inferSelect;
export type InsertNewsletterList = typeof newsletterLists.$inferInsert;

// Registro de envíos individuales (tracking)
export const newsletterSends = mysqlTable("newsletter_sends", {
  id: int("id").autoincrement().primaryKey(),
  newsletterId: int("newsletter_id").references(() => newsletters.id, { onDelete: "cascade" }).notNull(),
  subscriberId: int("subscriber_id").references(() => newsletterSubscribers.id, { onDelete: "cascade" }).notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed", "bounced"]).default("pending").notNull(),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type NewsletterSend = typeof newsletterSends.$inferSelect;
export type InsertNewsletterSend = typeof newsletterSends.$inferInsert;

// Logs de webhooks de Skedu
export const webhookLogs = mysqlTable("webhook_logs", {
  id: int("id").autoincrement().primaryKey(),
  event: varchar("event", { length: 255 }).notNull(),
  payload: text("payload").notNull(),
  processed: int("processed").default(0).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WebhookLog = typeof webhookLogs.$inferSelect;
export type InsertWebhookLog = typeof webhookLogs.$inferInsert;

// Eventos de analytics
export const analyticsEvents = mysqlTable("analytics_events", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  page: varchar("page", { length: 255 }),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 45 }),
  sessionId: varchar("session_id", { length: 255 }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;

// Categorías de menú (Tablas, Bebestibles, Postres, etc.)
export const menuCategories = mysqlTable("menu_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  displayOrder: int("display_order").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MenuCategory = typeof menuCategories.$inferSelect;
export type InsertMenuCategory = typeof menuCategories.$inferInsert;

// Items de menú
export const menuItems = mysqlTable("menu_items", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("category_id").references(() => menuCategories.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  // Precios flexibles (JSON para soportar múltiples precios)
  // Ejemplo: {"default": 5000, "for_2": 22000, "for_4": 28000, "for_6": 34000}
  prices: text("prices").notNull(),
  // Etiquetas dietéticas (JSON array)
  // Ejemplo: ["vegan", "gluten_free", "keto"]
  dietaryTags: text("dietary_tags"),
  // Notas especiales (ej: "Solicitar con 48 hrs de anticipación")
  specialNotes: text("special_notes"),
  displayOrder: int("display_order").default(0).notNull(),
  active: int("active").default(1).notNull(),
  // Disponibilidad operativa. A diferencia de `active`, mantiene el producto
  // visible en la carta, pero impide agregarlo al pedido y lo muestra agotado.
  inStock: int("in_stock").default(1).notNull(),
  preparationArea: mysqlEnum("preparation_area", ["cafe", "reception"]).default("cafe").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

// Preórdenes de alimentos y bebestibles para Hot Tubs.
export const hotTubOrders = mysqlTable("hot_tub_orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("order_number", { length: 32 }).notNull().unique(),
  customerName: varchar("customer_name", { length: 180 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
  identificationType: mysqlEnum("identification_type", ["hot_tub", "key_fob"]).default("hot_tub").notNull(),
  hotTubCode: mysqlEnum("hot_tub_code", ["1006", "1005", "1004", "1003", "1002", "1001"]),
  keyFobNumber: varchar("key_fob_number", { length: 20 }),
  serviceDate: date("service_date"),
  desiredTime: varchar("desired_time", { length: 5 }),
  notes: text("notes"),
  source: mysqlEnum("source", ["menu", "checkout"]).default("menu").notNull(),
  status: mysqlEnum("status", ["submitted", "acknowledged", "preparing", "ready", "delivered", "cancelled"]).default("submitted").notNull(),
  subtotal: int("subtotal").notNull(),
  receptionNotificationStatus: mysqlEnum("reception_notification_status", ["pending", "sent", "failed", "not_configured"]).default("pending").notNull(),
  cafeNotificationStatus: mysqlEnum("cafe_notification_status", ["pending", "sent", "failed", "not_required", "not_configured"]).default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
  preparingAt: timestamp("preparing_at"),
  readyAt: timestamp("ready_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type HotTubOrder = typeof hotTubOrders.$inferSelect;
export type InsertHotTubOrder = typeof hotTubOrders.$inferInsert;

export const hotTubOrderItems = mysqlTable("hot_tub_order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("order_id").references(() => hotTubOrders.id).notNull(),
  menuItemId: int("menu_item_id").references(() => menuItems.id).notNull(),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  priceKey: varchar("price_key", { length: 40 }).notNull(),
  priceLabel: varchar("price_label", { length: 80 }),
  unitPrice: int("unit_price").notNull(),
  quantity: int("quantity").notNull(),
  lineTotal: int("line_total").notNull(),
  preparationArea: mysqlEnum("preparation_area", ["cafe", "reception"]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type HotTubOrderItem = typeof hotTubOrderItems.$inferSelect;
export type InsertHotTubOrderItem = typeof hotTubOrderItems.$inferInsert;

// Reservas (bookings)
export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  serviceType: varchar("service_type", { length: 255 }).notNull(), // Biopiscinas, Hot Tubs, Masajes, etc.
  preferredDate: timestamp("preferred_date").notNull(),
  numberOfPeople: int("number_of_people").notNull(),
  message: text("message"),
  status: mysqlEnum("status", ["pending", "confirmed", "cancelled"]).default("pending").notNull(),
  skeduId: varchar("skedu_id", { length: 255 }),
  amount: int("amount").default(0).notNull(),
  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),
  utmTerm: varchar("utm_term", { length: 100 }),
  utmContent: varchar("utm_content", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

// Mensajes de contacto
export const contactMessages = mysqlTable("contact_messages", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["new", "read", "replied"]).default("new").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;
// ============================================
// SISTEMA DE COTIZACIONES B2B
// ============================================

// Negocios (Deals) - Entidad principal para cotizaciones B2B
export const deals = mysqlTable("deals", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(), // Nombre del negocio (ej: "GCN Turismo", "Hospital Frutillar")
  pipeline: varchar("pipeline", { length: 100 }).default("jornada_autocuidado").notNull(), // Pipeline/tipo de negocio
  stage: mysqlEnum("stage", [
    "nuevo",
    "reunion_programada",
    "cotizacion_enviada",
    "negociacion",
    "cerrado_ganado",
    "cerrado_perdido"
  ]).default("nuevo").notNull(),
  value: int("value").default(0).notNull(), // Valor estimado del negocio
  closeDate: date("close_date"), // Fecha estimada de cierre
  ownerId: int("owner_id").references(() => users.id), // Propietario/vendedor asignado
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = typeof deals.$inferInsert;
export type DealStage = "nuevo" | "reunion_programada" | "cotizacion_enviada" | "negociacion" | "cerrado_ganado" | "cerrado_perdido";

// Productos corporativos para cotizaciones
export const corporateProducts = mysqlTable("corporate_products", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(), // biopiscina, hot_tub, masaje, taller, alimentos, arriendo, programa
  priceType: mysqlEnum("price_type", ["per_person", "flat"]).default("per_person").notNull(),
  unitPrice: int("unit_price").notNull(), // en pesos chilenos
  duration: int("duration"), // en minutos (opcional)
  maxCapacity: int("max_capacity"), // capacidad máxima de personas (opcional)
  includes: text("includes"), // JSON con lista de items incluidos
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type CorporateProduct = typeof corporateProducts.$inferSelect;
export type InsertCorporateProduct = typeof corporateProducts.$inferInsert;

// Clientes corporativos
export const corporateClients = mysqlTable("corporate_clients", {
  id: int("id").autoincrement().primaryKey(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactPosition: text("contact_position"), // Cargo empresarial
  contactEmail: varchar("contact_email", { length: 320 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 50 }),
  contactWhatsapp: varchar("contact_whatsapp", { length: 50 }), // WhatsApp
  rut: varchar("rut", { length: 20 }), // RUT de la empresa
  giro: text("giro"), // Giro de la empresa
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }).default("Chile"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type CorporateClient = typeof corporateClients.$inferSelect;
export type InsertCorporateClient = typeof corporateClients.$inferInsert;

// Cotizaciones corporativas
export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  quoteNumber: varchar("quote_number", { length: 50 }).notNull().unique(), // Ej: COT-1000
  // Nombre de la cotización (ej: "GCN Turismo #1 Almuerzo", "Hospital Frutillar Alternativa")
  name: text("name"),
  // Relación con el negocio (Deal)
  dealId: int("deal_id").references(() => deals.id),
  // Datos del cliente (copiados para histórico)
  clientId: int("client_id").references(() => corporateClients.id),
  clientName: text("client_name").notNull(), // Nombre del contacto
  clientEmail: varchar("client_email", { length: 320 }).notNull(),
  clientCompany: text("client_company"), // Nombre de la empresa
  clientPosition: text("client_position"), // Cargo del contacto
  clientPhone: varchar("client_phone", { length: 50 }), // Teléfono
  clientWhatsapp: varchar("client_whatsapp", { length: 50 }), // WhatsApp
  clientRut: varchar("client_rut", { length: 20 }), // RUT de la empresa
  clientAddress: text("client_address"), // Dirección
  clientGiro: text("client_giro"), // Giro de la empresa
  // Datos del evento
  numberOfPeople: int("number_of_people").notNull(),
  eventDate: date("event_date"),
  eventDescription: text("event_description"), // Descripción de la jornada
  itinerary: text("itinerary"), // Texto editable del itinerario
  // Totales
  subtotal: int("subtotal").notNull(),
  discountType: mysqlEnum("discount_type", ["percentage", "fixed"]).default("percentage"),
  discountValue: int("discount_value").default(0), // Porcentaje o monto fijo
  total: int("total").notNull(),
  // Validez y estado
  validUntil: date("valid_until").notNull(), // Fecha de caducidad
  status: mysqlEnum("status", [
    "draft",
    "sent",
    "approved",
    "event_completed",
    "paid",
    "invoiced"
  ]).default("draft").notNull(),
  // URL pública para compartir
  slug: varchar("slug", { length: 100 }),
  // Términos de compra personalizados
  termsOfPurchase: text("terms_of_purchase"),
  // Notas internas
  notes: text("notes"),
  // Auditoría
  createdBy: int("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  sentAt: timestamp("sent_at"),
  approvedAt: timestamp("approved_at"),
});

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;

// Items de cotización
export const quoteItems = mysqlTable("quote_items", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quote_id").references(() => quotes.id, { onDelete: "cascade" }).notNull(),
  productId: int("product_id"),
  productName: varchar("product_name", { length: 255 }),
  description: text("description"),
  quantity: int("quantity").notNull().default(1),
  unitPrice: int("unit_price").notNull(),
  // Descuento por línea
  discountType: mysqlEnum("discount_type", ["percentage", "fixed"]).default("percentage"),
  discountValue: int("discount_value").default(0),
  discountPercent: int("discount_percent").default(0),
  // Subtotal antes de descuento
  subtotal: int("subtotal").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Total después de descuento
  total: int("total"),
  // Orden para itinerario (drag & drop)
  sortOrder: int("sort_order"),
  // Hora del itinerario (opcional, texto libre ej: "10:30")
  scheduleTime: varchar("schedule_time", { length: 10 }),
});

export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = typeof quoteItems.$inferInsert;


// Códigos de descuento
export const discountCodes = mysqlTable("discount_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(), // Código único (ej: BIENVENIDO_CANCAGUA)
  name: text("name").notNull(), // Nombre descriptivo
  description: text("description"), // Descripción interna
  discountType: mysqlEnum("discount_type", ["fixed", "percentage", "nth_free"]).default("percentage").notNull(),
  // Días de la semana en que el código aplica, como "2,3,4,5" con 0=domingo.
  // Vacío o null = todos los días. Se valida contra la fecha de la VISITA.
  validWeekdays: varchar("valid_weekdays", { length: 20 }),
  discountValue: int("discount_value").notNull(), // Porcentaje (0-100) o monto fijo en CLP
  minPurchase: int("min_purchase").default(0).notNull(), // Monto mínimo de compra para aplicar
  maxDiscount: int("max_discount"), // Descuento máximo en CLP (para porcentajes)
  maxUses: int("max_uses"), // Cantidad máxima de usos totales (null = ilimitado)
  maxUsesPerUser: int("max_uses_per_user").default(1).notNull(), // Usos por usuario
  currentUses: int("current_uses").default(0).notNull(), // Contador de usos actuales
  assignedUserId: int("assigned_user_id").references(() => users.id), // Usuario específico (null = genérico)
  applicableServices: text("applicable_services"), // JSON: ["biopiscinas", "masajes", "clases", "giftcards"]
  startsAt: timestamp("starts_at"), // Fecha de inicio de validez
  expiresAt: timestamp("expires_at"), // Fecha de expiración
  // Rango independiente para la fecha en que se realizará el servicio.
  bookingValidFrom: date("booking_valid_from", { mode: "string" }),
  bookingValidUntil: date("booking_valid_until", { mode: "string" }),
  active: int("active").default(1).notNull(),
  createdBy: int("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;

// Respuestas obligatorias de procedencia capturadas en compras públicas.
// Se guardan aparte para conservar una fila por compra, incluso cuando el pago
// agrupa servicios que viven en módulos distintos.
export const customerPurchaseSurveys = mysqlTable("customer_purchase_surveys", {
  id: int("id").autoincrement().primaryKey(),
  purchaseType: varchar("purchase_type", { length: 50 }).notNull(),
  purchaseId: varchar("purchase_id", { length: 100 }).notNull(),
  clientEmail: varchar("client_email", { length: 320 }),
  discoverySource: mysqlEnum("discovery_source", ["advertising", "facebook", "instagram", "google", "friends_family", "other"]).notNull(),
  discoverySourceOther: varchar("discovery_source_other", { length: 160 }),
  originType: mysqlEnum("origin_type", ["chile", "foreign"]).notNull(),
  country: varchar("country", { length: 120 }),
  region: varchar("region", { length: 160 }),
  city: varchar("city", { length: 160 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Uso de códigos de descuento (historial)
export const discountCodeUsages = mysqlTable("discount_code_usages", {
  id: int("id").autoincrement().primaryKey(),
  discountCodeId: int("discount_code_id").notNull(),
  userId: int("user_id").references(() => users.id),
  userEmail: varchar("user_email", { length: 320 }), // Email del usuario que usó el código
  orderId: varchar("order_id", { length: 100 }), // ID de la orden/reserva donde se aplicó
  orderType: varchar("order_type", { length: 50 }), // Tipo: "booking", "giftcard", etc.
  originalAmount: int("original_amount").notNull(), // Monto original
  discountAmount: int("discount_amount").notNull(), // Monto descontado
  finalAmount: int("final_amount").notNull(), // Monto final
  usedAt: timestamp("used_at").defaultNow().notNull(),
});

export type DiscountCodeUsage = typeof discountCodeUsages.$inferSelect;
export type InsertDiscountCodeUsage = typeof discountCodeUsages.$inferInsert;

// Técnicas específicas a las que aplica un código del área de masajes.
// Sin filas asociadas, el código aplica a todas las técnicas activas.
export const massageDiscountCodeTechniques = mysqlTable("massage_discount_code_techniques", {
  id: int("id").autoincrement().primaryKey(),
  discountCodeId: int("discount_code_id").references(() => discountCodes.id, { onDelete: "cascade" }).notNull(),
  techniqueId: int("technique_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  discountCodeFk: foreignKey({
    name: "mdct_discount_code_fk",
    columns: [table.discountCodeId],
    foreignColumns: [discountCodes.id],
  }).onDelete("cascade"),
}));

export type MassageDiscountCodeTechnique = typeof massageDiscountCodeTechniques.$inferSelect;

// Gift Cards
export const giftCards = mysqlTable("gift_cards", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(), // Código único de la gift card
  amount: int("amount").notNull(), // Monto en CLP
  balance: int("balance").notNull(), // Saldo restante
  redemptionMode: varchar("redemption_mode", { length: 20 }).default("amount").notNull(),
  serviceKey: varchar("service_key", { length: 80 }),
  serviceName: varchar("service_name", { length: 200 }),
  servicePayload: text("service_payload"),
  backgroundImage: varchar("background_image", { length: 255 }).default("default").notNull(), // Imagen de fondo seleccionada
  recipientName: text("recipient_name"), // Nombre del destinatario
  recipientEmail: varchar("recipient_email", { length: 320 }), // Email del destinatario
  recipientPhone: varchar("recipient_phone", { length: 50 }), // Teléfono/WhatsApp del destinatario
  senderName: text("sender_name"), // Nombre de quien regala
  senderEmail: varchar("sender_email", { length: 320 }), // Email de quien regala
  personalMessage: text("personal_message"), // Mensaje personalizado
  status: mysqlEnum("status", ["active", "redeemed", "expired", "cancelled"]).default("active").notNull(),
  purchaseStatus: mysqlEnum("purchase_status", ["pending", "completed", "rejected", "aborted", "timeout", "abandoned"]).default("pending").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }), // Método de pago usado
  paymentReference: varchar("payment_reference", { length: 100 }), // Referencia del pago
  // WebPay Plus integration fields
  webpayToken: varchar("webpay_token", { length: 100 }), // Token de la transacción WebPay
  webpayBuyOrder: varchar("webpay_buy_order", { length: 50 }), // Orden de compra única
  webpaySessionId: varchar("webpay_session_id", { length: 100 }), // ID de sesión
  webpayAuthorizationCode: varchar("webpay_authorization_code", { length: 20 }), // Código de autorización
  webpayCardNumber: varchar("webpay_card_number", { length: 20 }), // Últimos 4 dígitos de la tarjeta
  webpayTransactionDate: timestamp("webpay_transaction_date"), // Fecha de la transacción
  webpayResponseCode: int("webpay_response_code"), // Código de respuesta (0 = aprobado)
  deliveryMethod: mysqlEnum("delivery_method", ["email", "whatsapp", "download"]).default("email").notNull(),
  deliveredAt: timestamp("delivered_at"), // Fecha de entrega
  expiresAt: timestamp("expires_at").notNull(), // Fecha de expiración (3 meses por defecto)
  redeemedAt: timestamp("redeemed_at"), // Fecha de uso completo
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type GiftCard = typeof giftCards.$inferSelect;
export type InsertGiftCard = typeof giftCards.$inferInsert;

// Historial de uso de gift cards
export const giftCardTransactions = mysqlTable("gift_card_transactions", {
  id: int("id").autoincrement().primaryKey(),
  giftCardId: int("gift_card_id").notNull().references(() => giftCards.id),
  transactionType: mysqlEnum("transaction_type", ["purchase", "redemption", "refund"]).notNull(),
  amount: int("amount").notNull(),
  balanceBefore: int("balance_before").notNull(),
  balanceAfter: int("balance_after").notNull(),
  orderType: varchar("order_type", { length: 50 }), // 'booking', 'gift_card_purchase', etc.
  orderId: varchar("order_id", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type GiftCardTransaction = typeof giftCardTransactions.$inferSelect;
export type InsertGiftCardTransaction = typeof giftCardTransactions.$inferInsert;


// ============================================
// SISTEMA DE TRADUCCIONES AUTOMÁTICAS
// ============================================

// Traducciones de contenido (generadas por IA)
export const contentTranslations = mysqlTable("content_translations", {
  id: int("id").autoincrement().primaryKey(),
  // Identificador único del contenido (ej: "home.welcome", "blog.post.123", "service.biopiscinas")
  contentKey: varchar("content_key", { length: 255 }).notNull(),
  // Idioma de la traducción (es, en, pt, fr, de)
  language: varchar("language", { length: 10 }).notNull(),
  // Contenido original en español
  originalContent: text("original_content").notNull(),
  // Contenido traducido
  translatedContent: text("translated_content").notNull(),
  // Hash del contenido original para detectar cambios
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  // Si la traducción fue revisada/editada manualmente
  isReviewed: int("is_reviewed").default(0).notNull(),
  // Usuario que revisó la traducción
  reviewedBy: int("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  // Metadatos
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ContentTranslation = typeof contentTranslations.$inferSelect;
export type InsertContentTranslation = typeof contentTranslations.$inferInsert;

// Páginas/rutas del sitio para SEO multiidioma
export const sitePages = mysqlTable("site_pages", {
  id: int("id").autoincrement().primaryKey(),
  // Slug base de la página (ej: "servicios", "contacto", "blog/mi-articulo")
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  // Tipo de página para agrupar
  pageType: varchar("page_type", { length: 50 }).notNull(), // home, service, blog, event, static
  // Título SEO en español (base)
  titleEs: text("title_es").notNull(),
  // Descripción SEO en español (base)
  descriptionEs: text("description_es"),
  // Si la página está activa
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type SitePage = typeof sitePages.$inferSelect;
export type InsertSitePage = typeof sitePages.$inferInsert;

// Traducciones de slugs y metadatos SEO por idioma
export const pageTranslations = mysqlTable("page_translations", {
  id: int("id").autoincrement().primaryKey(),
  pageId: int("page_id").references(() => sitePages.id, { onDelete: "cascade" }).notNull(),
  language: varchar("language", { length: 10 }).notNull(),
  // Slug traducido (ej: "services" para inglés, "servicos" para portugués)
  translatedSlug: varchar("translated_slug", { length: 255 }).notNull(),
  // Título SEO traducido
  title: text("title").notNull(),
  // Descripción SEO traducida
  description: text("description"),
  // Si fue revisado manualmente
  isReviewed: int("is_reviewed").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type PageTranslation = typeof pageTranslations.$inferSelect;
export type InsertPageTranslation = typeof pageTranslations.$inferInsert;

// ============================================
// SISTEMA DE CONTENIDO ADICIONAL (BLOG, TESTIMONIOS, FAQS)
// ============================================

// Artículos de Blog
export const blogArticles = mysqlTable("blog_articles", {
  id: int("id").autoincrement().primaryKey(),
  title: text("title").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  content: text("content").notNull(),
  summary: text("summary"),
  imageUrl: text("image_url"),
  authorId: int("author_id").references(() => users.id),
  status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type BlogArticle = typeof blogArticles.$inferSelect;
export type InsertBlogArticle = typeof blogArticles.$inferInsert;

// Testimonios
export const testimonials = mysqlTable("testimonials", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  role: text("role"), // Ej: "Huésped", "Cliente Corporativo"
  content: text("content").notNull(),
  rating: int("rating").default(5),
  imageUrl: text("image_url"),
  approved: int("approved").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Testimonial = typeof testimonials.$inferSelect;
export type InsertTestimonial = typeof testimonials.$inferInsert;

// FAQs
export const faqs = mysqlTable("faqs", {
  id: int("id").autoincrement().primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: varchar("category", { length: 100 }), // Ej: "Reservas", "Servicios", "Hot Tubs"
  displayOrder: int("display_order").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Faq = typeof faqs.$inferSelect;
export type InsertFaq = typeof faqs.$inferInsert;

// Configuración del Sitio (KV store)
export const siteSettings = mysqlTable("site_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(), // JSON string
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = typeof siteSettings.$inferInsert;

// Galería de Imágenes
export const galleryImages = mysqlTable("gallery_images", {
  id: int("id").autoincrement().primaryKey(),
  url: text("url").notNull(),
  title: text("title"),
  description: text("description"),
  category: varchar("category", { length: 100 }), // Ej: "Piscina", "Paisaje", "Eventos"
  displayOrder: int("display_order").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type GalleryImage = typeof galleryImages.$inferSelect;
export type InsertGalleryImage = typeof galleryImages.$inferInsert;
// Inversión en marketing para ROI
export const marketingInvestments = mysqlTable("marketing_investments", {
  id: int("id").autoincrement().primaryKey(),
  channel: mysqlEnum("channel", ["seo", "facebook_organic", "instagram_organic", "tiktok_organic", "facebook_ads", "instagram_ads", "google_ads", "tiktok_ads", "other"]).notNull(),
  amount: int("amount").notNull(), // Monto invertido en CLP
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MarketingInvestment = typeof marketingInvestments.$inferSelect;
export type InsertMarketingInvestment = typeof marketingInvestments.$inferInsert;

// Calendario operativo del módulo de marketing
export const marketingCalendarEvents = mysqlTable("marketing_calendar_events", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(),
  title: text("title").notNull(),
  type: mysqlEnum("type", ["newsletter", "personal", "social", "otro"]).default("newsletter").notNull(),
  audience: text("audience"),
  subject: text("subject"),
  notes: text("notes"),
  status: mysqlEnum("status", ["pending", "done", "cancelled"]).default("pending").notNull(),
  htmlTemplate: text("html_template"),
  createdById: int("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MarketingCalendarEvent = typeof marketingCalendarEvents.$inferSelect;
export type InsertMarketingCalendarEvent = typeof marketingCalendarEvents.$inferInsert;

// Artículos de blog generados desde campañas, pendientes de publicar en cancagua.cl/blog
export const marketingBlogArticles = mysqlTable("marketing_blog_articles", {
  id: int("id").autoincrement().primaryKey(),
  title: text("title").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  metaDescription: text("meta_description"),
  metaKeywords: text("meta_keywords"),
  category: varchar("category", { length: 100 }),
  estimatedReadingTime: int("estimated_reading_time").default(5).notNull(),
  status: mysqlEnum("status", ["draft", "approved", "published"]).default("draft").notNull(),
  campaignSubject: text("campaign_subject"),
  publishedUrl: text("published_url"),
  publishedAt: timestamp("published_at"),
  createdById: int("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MarketingBlogArticle = typeof marketingBlogArticles.$inferSelect;
export type InsertMarketingBlogArticle = typeof marketingBlogArticles.$inferInsert;

// Bitácora de emails personales enviados desde eventos@cancagua.cl
export const personalEmailLogs = mysqlTable("personal_email_logs", {
  id: int("id").autoincrement().primaryKey(),
  to: varchar("to", { length: 320 }).notNull(),
  primerNombre: varchar("primer_nombre", { length: 120 }),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  replyTo: varchar("reply_to", { length: 320 }),
  status: mysqlEnum("status", ["sent", "failed"]).notNull(),
  providerId: varchar("provider_id", { length: 255 }),
  errorMessage: text("error_message"),
  sentById: int("sent_by_id").references(() => users.id),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export type PersonalEmailLog = typeof personalEmailLogs.$inferSelect;
export type InsertPersonalEmailLog = typeof personalEmailLogs.$inferInsert;


// ============================================
// SISTEMA DE REPORTES DE MANTENCIÓN
// ============================================

// Reportes de mantención diarios
export const maintenanceReports = mysqlTable("maintenance_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportNumber: varchar("report_number", { length: 50 }).notNull().unique(),
  title: text("title").notNull(),
  area: varchar("area", { length: 100 }),
  equipment: varchar("equipment", { length: 150 }),
  location: text("location"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "requires_follow_up"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  maintenanceType: mysqlEnum("maintenance_type", ["preventive", "corrective", "emergency"]).default("corrective").notNull(),
  description: text("description"),
  resolution: text("resolution"),
  materialsUsed: text("materials_used"),
  observations: text("observations"),
  reportedById: int("reported_by_id").references(() => users.id).notNull(),
  assignedToId: int("assigned_to_id").references(() => users.id),
  scheduledDate: timestamp("scheduled_date"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  nextMaintenanceDate: timestamp("next_maintenance_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MaintenanceReport = typeof maintenanceReports.$inferSelect;
export type InsertMaintenanceReport = typeof maintenanceReports.$inferInsert;

// Fotos adjuntas a los reportes de mantención
export const maintenanceReportPhotos = mysqlTable("maintenance_report_photos", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("report_id").references(() => maintenanceReports.id, { onDelete: "cascade" }).notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  description: text("description"),
  photoType: mysqlEnum("photo_type", ["before", "during", "after", "evidence"]).default("evidence").notNull(),
  uploadedById: int("uploaded_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MaintenanceReportPhoto = typeof maintenanceReportPhotos.$inferSelect;
export type InsertMaintenanceReportPhoto = typeof maintenanceReportPhotos.$inferInsert;

// Historial de cambios de estado de los reportes
export const maintenanceReportHistory = mysqlTable("maintenance_report_history", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("report_id").references(() => maintenanceReports.id, { onDelete: "cascade" }).notNull(),
  previousStatus: varchar("previous_status", { length: 50 }),
  newStatus: varchar("new_status", { length: 50 }).notNull(),
  changedById: int("changed_by_id").references(() => users.id).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MaintenanceReportHistory = typeof maintenanceReportHistory.$inferSelect;
export type InsertMaintenanceReportHistory = typeof maintenanceReportHistory.$inferInsert;

// ============================================
// MÓDULO CONCIERGE - Sistema de Ventas para Afiliados
// ============================================

/**
 * Servicios disponibles para el canal Concierge.
 * Los administradores configuran qué servicios pueden vender los vendedores.
 * La info del servicio (nombre, descripción, etc.) viene de Skedu (tabla services).
 * Los precios se configuran en el CMS con precios diferenciados (adulto, niño, etc.).
 */
export const conciergeServices = mysqlTable("concierge_services", {
  id: int("id").autoincrement().primaryKey(),
  serviceId: int("service_id").references(() => services.id, { onDelete: "cascade" }).notNull(),
  /** Cupos diarios: máximo de personas que se pueden atender por día. -1 = ilimitado */
  dailyQuota: int("daily_quota").default(-1).notNull(),
  active: int("active").default(1).notNull(),
  sellerNotes: text("seller_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ConciergeService = typeof conciergeServices.$inferSelect;
export type InsertConciergeService = typeof conciergeServices.$inferInsert;

/**
 * Precios diferenciados por servicio Concierge.
 * Cada servicio puede tener múltiples precios (ej: Adulto, Niño, Tercera Edad).
 */
export const conciergeServicePrices = mysqlTable("concierge_service_prices", {
  id: int("id").autoincrement().primaryKey(),
  serviceId: int("cs_id").references(() => conciergeServices.id, { onDelete: "cascade" }).notNull(),
  label: varchar("label", { length: 100 }).notNull(), // ej: "Adulto", "Niño", "Tercera Edad"
  price: int("price").notNull(), // en pesos chilenos
  sortOrder: int("sort_order").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ConciergeServicePrice = typeof conciergeServicePrices.$inferSelect;
export type InsertConciergeServicePrice = typeof conciergeServicePrices.$inferInsert;

/**
 * Registro de uso diario de cupos por servicio.
 * Se reinicia automáticamente cada día (hora Chile, America/Santiago).
 */
export const conciergeQuotaUsage = mysqlTable("concierge_quota_usage", {
  id: int("id").autoincrement().primaryKey(),
  conciergeServiceId: int("concierge_service_id").references(() => conciergeServices.id, { onDelete: "cascade" }).notNull(),
  /** Fecha en formato YYYY-MM-DD en hora Chile */
  usageDate: varchar("usage_date", { length: 10 }).notNull(),
  /** Total de personas vendidas en este día */
  usedQuota: int("used_quota").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ConciergeQuotaUsage = typeof conciergeQuotaUsage.$inferSelect;
export type InsertConciergeQuotaUsage = typeof conciergeQuotaUsage.$inferInsert;

/**
 * Configuración de vendedores del canal Concierge.
 * Almacena la comisión y configuración específica de cada vendedor.
 */
export const conciergeSellers = mysqlTable("concierge_sellers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  commissionRate: int("commission_rate").default(10).notNull(),
  sellerCode: varchar("seller_code", { length: 20 }).notNull().unique(),
  companyName: text("company_name"),
  notes: text("notes"),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ConciergeSeller = typeof conciergeSellers.$inferSelect;
export type InsertConciergeSeller = typeof conciergeSellers.$inferInsert;

/**
 * Registro de ventas del canal Concierge.
 * Cada venta iniciada por un vendedor se registra aquí para tracking y comisiones.
 */
export const conciergeSales = mysqlTable("concierge_sales", {
  id: int("id").autoincrement().primaryKey(),
  sellerId: int("seller_id").references(() => conciergeSellers.id).notNull(),
  conciergeServiceId: int("concierge_service_id").references(() => conciergeServices.id).notNull(),
  amount: int("amount").notNull(),
  commissionRate: int("commission_rate").notNull(),
  commissionAmount: int("commission_amount").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: varchar("customer_email", { length: 320 }),
  customerPhone: varchar("customer_phone", { length: 50 }),
  status: mysqlEnum("status", ["pending", "completed", "cancelled", "refunded"]).default("pending").notNull(),
  saleReference: varchar("sale_reference", { length: 50 }).notNull().unique(),
  /** WebPay token for the transaction */
  webpayToken: varchar("webpay_token", { length: 255 }),
  /** WebPay authorization code after successful payment */
  webpayAuthCode: varchar("webpay_auth_code", { length: 100 }),
  /** WebPay response code */
  webpayResponseCode: int("webpay_response_code"),
  /** WebPay card last 4 digits */
  webpayCardNumber: varchar("webpay_card_number", { length: 20 }),
  paymentLink: text("payment_link"),
  notes: text("notes"),
  /** Service name snapshot at time of sale */
  serviceName: text("service_name"),
  /** Price label snapshot (e.g. "Adulto", "Niño") */
  priceLabel: varchar("price_label", { length: 100 }),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ConciergeSale = typeof conciergeSales.$inferSelect;
export type InsertConciergeSale = typeof conciergeSales.$inferInsert;

/**
 * Métricas agregadas de vendedores por período.
 * Optimiza las consultas de dashboard evitando cálculos en tiempo real.
 */
export const conciergeSellerMetrics = mysqlTable("concierge_seller_metrics", {
  id: int("id").autoincrement().primaryKey(),
  sellerId: int("seller_id").references(() => conciergeSellers.id, { onDelete: "cascade" }).notNull(),
  periodType: mysqlEnum("period_type", ["daily", "weekly", "monthly"]).notNull(),
  periodKey: varchar("period_key", { length: 20 }).notNull(),
  totalSales: int("total_sales").default(0).notNull(),
  transactionCount: int("transaction_count").default(0).notNull(),
  totalCommission: int("total_commission").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ConciergeSellerMetric = typeof conciergeSellerMetrics.$inferSelect;
export type InsertConciergeSellerMetric = typeof conciergeSellerMetrics.$inferInsert;

/**
 * Cache de datos de analytics por mes.
 * Guarda el JSON completo del dashboard para evitar llamar a las APIs externas cada vez.
 */
export const analyticsCache = mysqlTable("analytics_cache", {
  id: int("id").autoincrement().primaryKey(),
  /** Clave del período: "2026-04" */
  periodKey: varchar("period_key", { length: 7 }).notNull().unique(),
  /** JSON con todos los datos del dashboard */
  data: text("data").notNull(),
  /** Cuándo se actualizó por última vez */
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type AnalyticsCache = typeof analyticsCache.$inferSelect;

// ============================================================
// MÓDULO MASAJES
// ============================================================

export const massageTechniques = mysqlTable("massage_techniques", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  durations: varchar("durations", { length: 50 }).default("50,80,110").notNull(), // CSV: "50,80,110"
  price50min: decimal("price_50min", { precision: 10, scale: 0 }),
  price80min: decimal("price_80min", { precision: 10, scale: 0 }),
  price110min: decimal("price_110min", { precision: 10, scale: 0 }),
  monthlyOnly: int("monthly_only").default(0).notNull(),
  monthlyFeatureMonth: varchar("monthly_feature_month", { length: 7 }),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageTechnique = typeof massageTechniques.$inferSelect;
export type InsertMassageTechnique = typeof massageTechniques.$inferInsert;

export const massageTherapists = mysqlTable("massage_therapists", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["inhouse", "freelance"]).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  cmsUserId: int("cms_user_id"),
  cmsInvitationEmailSentAt: timestamp("cms_invitation_email_sent_at"),
  cmsInvitationWhatsappSentAt: timestamp("cms_invitation_whatsapp_sent_at"),
  contractType: varchar("contract_type", { length: 100 }),
  leadTimeMinutes: int("lead_time_minutes").default(120),
  currentShift: mysqlEnum("current_shift", ["am", "pm"]).default("am"),
  notes: text("notes"),
  callPriority: int("call_priority").default(99),
  isManager: int("is_manager").default(0).notNull(),
  // 1 = auto-copiar horario del mes anterior (activo por default para Tamara)
  autoFillMonth: int("auto_fill_month").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageTherapist = typeof massageTherapists.$inferSelect;
export type InsertMassageTherapist = typeof massageTherapists.$inferInsert;

export const massageTherapistTechniques = mysqlTable("massage_therapist_techniques", {
  id: int("id").autoincrement().primaryKey(),
  therapistId: int("therapist_id").notNull(),
  techniqueId: int("technique_id").notNull(),
});

export const massageTherapistSchedules = mysqlTable("massage_therapist_schedules", {
  id: int("id").autoincrement().primaryKey(),
  therapistId: int("therapist_id").notNull(),
  dayOfWeek: int("day_of_week").notNull(), // 0=Domingo, 1=Lunes ... 6=Sábado
  startTime: varchar("start_time", { length: 5 }).notNull(), // "10:00"
  endTime: varchar("end_time", { length: 5 }).notNull(),     // "19:00"
  available: int("available").default(1).notNull(),
  // Bloqueos por rango de fechas (licencias, vacaciones)
  blockFrom: date("block_from"),
  blockTo: date("block_to"),
  blockReason: varchar("block_reason", { length: 255 }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageTherapistSchedule = typeof massageTherapistSchedules.$inferSelect;

export const massageRooms = mysqlTable("massage_rooms", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["individual", "double"]).notNull(),
  capacity: int("capacity").notNull(),
  // Sala Lingue y Arrayán: permiten 2 personas de la misma reserva
  allowCoupleBooking: int("allow_couple_booking").default(0).notNull(),
  active: int("active").default(1).notNull(),
});

export type MassageRoom = typeof massageRooms.$inferSelect;

export const massageBookings = mysqlTable("massage_bookings", {
  id: int("id").autoincrement().primaryKey(),
  // Datos del cliente
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientEmail: varchar("client_email", { length: 320 }),
  clientPhone: varchar("client_phone", { length: 20 }),
  clientOrigin: varchar("client_origin", { length: 100 }), // Localización/origen del cliente
  // Servicio
  techniqueId: int("technique_id").notNull(),
  therapistId: int("therapist_id"),
  roomId: int("room_id").notNull(),
  duration: int("duration").notNull(), // 50, 80 o 110
  // Fecha y hora
  bookingDate: date("booking_date").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(), // "10:00"
  endTime: varchar("end_time", { length: 5 }).notNull(),     // "11:30"
  // Estado y pago
  status: mysqlEnum("status", ["pending", "confirmed", "completed", "cancelled", "no_show"]).default("pending").notNull(),
  paymentStatus: mysqlEnum("payment_status", ["pending", "partially_paid", "paid", "refunded"]).default("pending").notNull(),
  getnetRequestId: varchar("getnet_request_id", { length: 64 }),
  manualPaymentMethod: mysqlEnum("manual_payment_method", [
    "pending_payment",
    "getnet_link",
    "getnet_pos",
    "bank_transfer",
    "cash",
    "gift_card",
    "transbank",
    "discount_code",
  ]),
  bookingSource: mysqlEnum("booking_source", ["web", "cms"]).default("cms").notNull(),
  // Flujo de aprobación para terapeutas freelance
  freelanceApprovalStatus: varchar("freelance_approval_status", { length: 30 }),
  adminApprovalToken: varchar("admin_approval_token", { length: 64 }),
  therapistConfirmationToken: varchar("therapist_confirmation_token", { length: 64 }),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }),
  discountCode: varchar("discount_code", { length: 50 }),
  originalAmount: decimal("original_amount", { precision: 10, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0"),
  discountCodeId: int("discount_code_id"),
  cancellationCategory: varchar("cancellation_category", { length: 50 }),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledByUserId: int("cancelled_by_user_id"),
  notes: text("notes"),
  // Cross-sell: servicios adicionales contratados
  crossSellServices: text("cross_sell_services"), // JSON array
  // Reagendamiento
  rescheduleCount: int("reschedule_count").default(0).notNull(),
  originalBookingId: int("original_booking_id"),
  // Masajes de pareja: dos bookings vinculados con el mismo coupleBookingId
  coupleBookingId: int("couple_booking_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageBooking = typeof massageBookings.$inferSelect;
export type InsertMassageBooking = typeof massageBookings.$inferInsert;

// Embudo anónimo de compra. No almacena nombre, email, teléfono ni notas.
export const massageCheckoutSessions = mysqlTable("massage_checkout_sessions", {
  checkoutId: varchar("checkout_id", { length: 64 }).primaryKey(),
  status: mysqlEnum("status", [
    "started",
    "scheduling",
    "details_completed",
    "payment_started",
    "paid",
    "payment_failed",
    "abandoned",
  ]).default("started").notNull(),
  items: text("items").notNull(),
  currency: varchar("currency", { length: 3 }).default("CLP").notNull(),
  originalTotal: decimal("original_total", { precision: 12, scale: 2 }).default("0").notNull(),
  discountTotal: decimal("discount_total", { precision: 12, scale: 2 }).default("0").notNull(),
  finalTotal: decimal("final_total", { precision: 12, scale: 2 }).default("0").notNull(),
  coupon: varchar("coupon", { length: 50 }),
  gaClientId: varchar("ga_client_id", { length: 100 }),
  gaSessionId: varchar("ga_session_id", { length: 64 }),
  getnetRequestId: varchar("getnet_request_id", { length: 64 }).unique(),
  bookingIds: text("booking_ids"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  schedulingStartedAt: timestamp("scheduling_started_at"),
  scheduleSelectedAt: timestamp("schedule_selected_at"),
  detailsCompletedAt: timestamp("details_completed_at"),
  paymentStartedAt: timestamp("payment_started_at"),
  paidAt: timestamp("paid_at"),
  failedAt: timestamp("failed_at"),
  abandonedAt: timestamp("abandoned_at"),
  purchaseEventClaimedAt: timestamp("purchase_event_claimed_at"),
  purchaseEventSentAt: timestamp("purchase_event_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageCheckoutSession = typeof massageCheckoutSessions.$inferSelect;
export type InsertMassageCheckoutSession = typeof massageCheckoutSessions.$inferInsert;

// Reservas ingresadas manualmente desde Skedu para programas que incluyen masaje.
// Se mantienen separadas de massage_bookings para no mezclarlas con ventas Getnet.
export const massageProgramBookings = mysqlTable("massage_program_bookings", {
  id: int("id").autoincrement().primaryKey(),
  program: varchar("program", { length: 50 }).notNull(),
  duration: int("duration").notNull(),
  modality: mysqlEnum("modality", ["simple", "double"]).notNull(),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  secondClientName: varchar("second_client_name", { length: 200 }),
  clientPhone: varchar("client_phone", { length: 20 }),
  clientEmail: varchar("client_email", { length: 320 }),
  bookingDate: date("booking_date").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  therapistId: int("therapist_id"),
  secondTherapistId: int("second_therapist_id"),
  roomId: int("room_id").notNull(),
  externalReference: varchar("external_reference", { length: 100 }),
  paymentMethod: mysqlEnum("payment_method", [
    "pending_payment",
    "getnet_link",
    "getnet_pos",
    "bank_transfer",
    "cash",
    "gift_card",
    "transbank",
    "skedu_program",
  ]).default("skedu_program").notNull(),
  paymentReference: varchar("payment_reference", { length: 100 }),
  cancellationCategory: varchar("cancellation_category", { length: 50 }),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledByUserId: int("cancelled_by_user_id"),
  notes: text("notes"),
  status: mysqlEnum("status", ["pending", "confirmed", "completed", "cancelled", "no_show"]).default("pending").notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageProgramBooking = typeof massageProgramBookings.$inferSelect;
export type InsertMassageProgramBooking = typeof massageProgramBookings.$inferInsert;

// Solicitudes de confirmación enviadas a terapeutas. Cada intento expira
// individualmente y conserva el historial de rotación de la reserva.
export const massageTherapistAssignmentRequests = mysqlTable("massage_therapist_assignment_requests", {
  id: int("id").autoincrement().primaryKey(),
  bookingType: mysqlEnum("booking_type", ["massage", "skedu_program"]).notNull(),
  bookingId: int("booking_id").notNull(),
  slotIndex: int("slot_index").default(1).notNull(),
  therapistId: int("therapist_id").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "confirmed", "rejected", "expired", "superseded"]).default("pending").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  respondedAt: timestamp("responded_at"),
  attemptNumber: int("attempt_number").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageTherapistAssignmentRequest = typeof massageTherapistAssignmentRequests.$inferSelect;

// Libro histórico de ingresos: un registro único por reserva pagada.
// Conserva los datos de la venta aunque la reserva cambie posteriormente.
export const massageSales = mysqlTable("massage_sales", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull().unique(),
  soldAt: timestamp("sold_at").defaultNow().notNull(),
  serviceDate: date("service_date").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientEmail: varchar("client_email", { length: 320 }),
  techniqueName: varchar("technique_name", { length: 100 }).notNull(),
  duration: int("duration").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).default("0").notNull(),
  originalAmount: decimal("original_amount", { precision: 10, scale: 2 }).default("0").notNull(),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0").notNull(),
  discountCodeId: int("discount_code_id"),
  discountCode: varchar("discount_code", { length: 50 }),
  discountType: mysqlEnum("discount_type", ["fixed", "percentage", "nth_free"]),
  discountValue: int("discount_value"),
  paymentMethod: mysqlEnum("payment_method", [
    "getnet",
    "cms_manual",
    "getnet_link",
    "getnet_pos",
    "bank_transfer",
    "cash",
    "gift_card",
    "transbank",
    "discount_code",
  ]).notNull(),
  paymentReference: varchar("payment_reference", { length: 100 }),
  status: mysqlEnum("status", ["paid", "refunded"]).default("paid").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageSale = typeof massageSales.$inferSelect;
export type InsertMassageSale = typeof massageSales.$inferInsert;

// Encuestas NPS enviadas por WhatsApp después de cada masaje.
export const massageNpsResponses = mysqlTable("massage_nps_responses", {
  id: int("id").autoincrement().primaryKey(),
  bookingType: mysqlEnum("booking_type", ["massage", "skedu_program"]).notNull(),
  bookingId: int("booking_id").notNull(),
  surveyToken: varchar("survey_token", { length: 64 }).notNull().unique(),
  serviceName: varchar("service_name", { length: 200 }).notNull(),
  clientName: varchar("client_name", { length: 200 }).notNull(),
  clientPhone: varchar("client_phone", { length: 30 }).notNull(),
  serviceDate: date("service_date").notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  scheduledSendAt: timestamp("scheduled_send_at").notNull(),
  deliveryStatus: mysqlEnum("delivery_status", ["pending", "sending", "sent", "failed", "skipped"]).default("pending").notNull(),
  attemptCount: int("attempt_count").default(0).notNull(),
  lastAttemptAt: timestamp("last_attempt_at"),
  sentAt: timestamp("sent_at"),
  deliveryError: text("delivery_error"),
  score: int("score"),
  comment: text("comment"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageNpsResponse = typeof massageNpsResponses.$inferSelect;
export type InsertMassageNpsResponse = typeof massageNpsResponses.$inferInsert;

// Cierres contables del área de masajes. Cada cierre conserva sus parámetros y
// una fotografía del cálculo para que los períodos cerrados sean inmutables.
export const massageMonthlyClosures = mysqlTable("massage_monthly_closures", {
  id: int("id").autoincrement().primaryKey(),
  closeMonth: varchar("close_month", { length: 7 }).notNull().unique(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: mysqlEnum("status", ["draft", "closed"]).default("draft").notNull(),
  supplyUnitCost: decimal("supply_unit_cost", { precision: 12, scale: 2 }).default("707").notNull(),
  laundryUnitCost: decimal("laundry_unit_cost", { precision: 12, scale: 2 }).default("3103.80").notNull(),
  regularTransportCost: decimal("regular_transport_cost", { precision: 12, scale: 2 }).default("398000").notNull(),
  freelanceTripUnitCost: decimal("freelance_trip_unit_cost", { precision: 12, scale: 2 }).default("5000").notNull(),
  freelanceTripCount: int("freelance_trip_count").default(0).notNull(),
  electricityCost: decimal("electricity_cost", { precision: 12, scale: 2 }).default("123573").notNull(),
  accountingCost: decimal("accounting_cost", { precision: 12, scale: 2 }).default("63333").notNull(),
  tamaraBaseSalary: decimal("tamara_base_salary", { precision: 12, scale: 2 }).default("811261").notNull(),
  barbaraBaseSalary: decimal("barbara_base_salary", { precision: 12, scale: 2 }),
  danielaBaseSalary: decimal("daniela_base_salary", { precision: 12, scale: 2 }),
  previredRate: decimal("previred_rate", { precision: 6, scale: 4 }).default("0.2000").notNull(),
  freelanceCommissionRate: decimal("freelance_commission_rate", { precision: 6, scale: 4 }).default("0.5000").notNull(),
  inhouseCommissionRate: decimal("inhouse_commission_rate", { precision: 6, scale: 4 }).default("0.2000").notNull(),
  tamaraBonusRate: decimal("tamara_bonus_rate", { precision: 6, scale: 4 }).default("0.1000").notNull(),
  notes: text("notes"),
  snapshot: mediumtext("snapshot"),
  createdByUserId: int("created_by_user_id").notNull(),
  closedByUserId: int("closed_by_user_id"),
  closedAt: timestamp("closed_at"),
  reopenedByUserId: int("reopened_by_user_id"),
  reopenedAt: timestamp("reopened_at"),
  reopenReason: text("reopen_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageMonthlyClosure = typeof massageMonthlyClosures.$inferSelect;
export type InsertMassageMonthlyClosure = typeof massageMonthlyClosures.$inferInsert;

export const massageMonthlyClosureAdjustments = mysqlTable("massage_monthly_closure_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  closureId: int("closure_id").notNull(),
  category: mysqlEnum("category", ["courtesy", "refund", "extra_cost", "correction", "other"]).default("other").notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MassageMonthlyClosureAdjustment = typeof massageMonthlyClosureAdjustments.$inferSelect;

export const massageMonthlyClosureAudit = mysqlTable("massage_monthly_closure_audit", {
  id: int("id").autoincrement().primaryKey(),
  closureId: int("closure_id").notNull(),
  action: mysqlEnum("action", ["created", "updated", "closed", "reopened", "exported"]).notNull(),
  detail: text("detail"),
  userId: int("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MassageMonthlyClosureAuditEntry = typeof massageMonthlyClosureAudit.$inferSelect;

export const massageSupplies = mysqlTable("massage_supplies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  categoria: mysqlEnum("categoria", ["insumo", "herramienta"]).default("insumo").notNull(),
  ubicacion: varchar("ubicacion", { length: 200 }),
  vidaUtilMeses: int("vida_util_meses"),
  currentStock: decimal("current_stock", { precision: 10, scale: 2 }).default("0").notNull(),
  minimumStock: decimal("minimum_stock", { precision: 10, scale: 2 }).default("0").notNull(),
  purchasedAt: date("purchased_at"),
  openedAt: date("opened_at"),
  notes: text("notes"),
  active: int("active").default(1).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const massageTherapistEvaluations = mysqlTable("massage_therapist_evaluations", {
  id: int("id").autoincrement().primaryKey(),
  therapistId: int("therapist_id").notNull(),
  period: varchar("period", { length: 7 }).notNull(), // "2024-01"
  evaluatedBy: int("evaluated_by").notNull(),
  puntualidad: int("puntualidad").notNull(), // 0-10
  tecnica: int("tecnica").notNull(),
  satisfaccionCliente: int("satisfaccion_cliente").notNull(),
  presentacionHigiene: int("presentacion_higiene").notNull(),
  comunicacion: int("comunicacion").notNull(),
  usoInsumos: int("uso_insumos").notNull(),
  comentarios: text("comentarios"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const massageTherapistDocuments = mysqlTable("massage_therapist_documents", {
  id: int("id").autoincrement().primaryKey(),
  therapistId: int("therapist_id").notNull(),
  tipo: mysqlEnum("tipo", ["certificado", "boleta", "contrato", "otro"]).notNull().default("otro"),
  nombre: varchar("nombre", { length: 300 }).notNull(),
  descripcion: text("descripcion"),
  archivoUrl: text("archivo_url"),
  periodo: varchar("periodo", { length: 7 }),
  uploadedBy: int("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MassageSupply = typeof massageSupplies.$inferSelect;
export type InsertMassageSupply = typeof massageSupplies.$inferInsert;

export const massageTechniqueRecipes = mysqlTable("massage_technique_recipes", {
  id: int("id").autoincrement().primaryKey(),
  techniqueId: int("technique_id").notNull(),
  supplyId: int("supply_id").notNull(),
  quantityPer50min: decimal("quantity_per_50min", { precision: 8, scale: 3 }).notNull(),
  // Las cantidades para 80 y 110 min se calculan proporcionalmente si son null
  quantityPer80min: decimal("quantity_per_80min", { precision: 8, scale: 3 }),
  quantityPer110min: decimal("quantity_per_110min", { precision: 8, scale: 3 }),
});

export type MassageTechniqueRecipe = typeof massageTechniqueRecipes.$inferSelect;

export const massageSettings = mysqlTable("massage_settings", {
  key: varchar("key", { length: 100 }).notNull().primaryKey(),
  value: text("value").notNull(),
});

// Disponibilidad mensual por fecha específica (reemplaza horario semanal)
export const massageTherapistAvailability = mysqlTable("massage_therapist_availability", {
  id: int("id").autoincrement().primaryKey(),
  therapistId: int("therapist_id").notNull(),
  date: date("date").notNull(),
  isAvailable: int("is_available").default(1).notNull(),
  startTime: varchar("start_time", { length: 5 }),
  endTime: varchar("end_time", { length: 5 }),
  shift: mysqlEnum("shift", ["am", "pm"]),
  blockType: mysqlEnum("block_type", ["vacation", "sick_leave", "personal", "other"]),
  blockNotes: varchar("block_notes", { length: 255 }),
  autoGenerated: int("auto_generated").default(0).notNull(),
  // Permite actualizar solo la disponibilidad creada desde el horario semanal,
  // sin sobreescribir rotaciones, copias de mes ni ajustes manuales.
  generationSource: varchar("generation_source", { length: 30 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageTherapistAvailability = typeof massageTherapistAvailability.$inferSelect;
export type InsertMassageTherapistAvailability = typeof massageTherapistAvailability.$inferInsert;

// Licencias y vacaciones (integración RRHH)
export const massageHrLeaves = mysqlTable("massage_hr_leaves", {
  id: int("id").autoincrement().primaryKey(),
  therapistId: int("therapist_id").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: mysqlEnum("type", ["vacation", "sick_leave", "maternity", "personal", "other"]).default("vacation").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  notes: text("notes"),
  approvedBy: int("approved_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageHrLeave = typeof massageHrLeaves.$inferSelect;
export type InsertMassageHrLeave = typeof massageHrLeaves.$inferInsert;

// ============================================================
// MÓDULO CLASES REGULARES
// ============================================================

export const regularClassTeachers = mysqlTable("regular_class_teachers", {
  id: int("id").autoincrement().primaryKey(),
  cmsUserId: int("cms_user_id"),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  bio: text("bio"),
  imageUrl: text("image_url"),
  color: varchar("color", { length: 20 }).default("#648596").notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassTeacherAgreements = mysqlTable("regular_class_teacher_agreements", {
  id: int("id").autoincrement().primaryKey(),
  teacherId: int("teacher_id").notNull(),
  teacherShareBps: int("teacher_share_bps").notNull(),
  documentType: mysqlEnum("document_type", [
    "pending",
    "honorarium_receipt",
    "exempt_invoice",
    "taxable_invoice",
    "none",
  ]).default("pending").notNull(),
  withholdingBps: int("withholding_bps").default(1525).notNull(),
  vatBps: int("vat_bps").default(1900).notNull(),
  validFrom: date("valid_from", { mode: "string" }).notNull(),
  validTo: date("valid_to", { mode: "string" }),
  notes: text("notes"),
  createdByUserId: int("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const regularClassDisciplines = mysqlTable("regular_class_disciplines", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  shortDescription: varchar("short_description", { length: 300 }),
  description: text("description"),
  imageUrl: text("image_url"),
  location: varchar("location", { length: 180 }),
  capacity: int("capacity"),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassSchedules = mysqlTable("regular_class_schedules", {
  id: int("id").autoincrement().primaryKey(),
  disciplineId: int("discipline_id").notNull(),
  teacherId: int("teacher_id").notNull(),
  dayOfWeek: int("day_of_week").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  validFrom: date("valid_from", { mode: "string" }).notNull(),
  validTo: date("valid_to", { mode: "string" }),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassSessions = mysqlTable("regular_class_sessions", {
  id: int("id").autoincrement().primaryKey(),
  scheduleId: int("schedule_id"),
  disciplineId: int("discipline_id").notNull(),
  teacherId: int("teacher_id").notNull(),
  sessionDate: date("session_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled"]).default("scheduled").notNull(),
  notes: text("notes"),
  closedAt: timestamp("closed_at"),
  closedByUserId: int("closed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassPlans = mysqlTable("regular_class_plans", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  priceClp: int("price_clp").notNull(),
  creditsPerPeriod: int("credits_per_period").notNull(),
  benefits: text("benefits"),
  displayOrder: int("display_order").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassStudents = mysqlTable("regular_class_students", {
  id: int("id").autoincrement().primaryKey(),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  status: mysqlEnum("status", ["prospect", "active", "inactive"]).default("prospect").notNull(),
  source: mysqlEnum("source", ["teacher", "reception", "admin", "web"]).default("admin").notNull(),
  communicationsConsent: int("communications_consent").default(0).notNull(),
  notes: text("notes"),
  createdByUserId: int("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassMemberships = mysqlTable("regular_class_memberships", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("student_id").notNull(),
  planId: int("plan_id").notNull(),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  pricePaidClp: int("price_paid_clp").notNull(),
  originalAmountClp: int("original_amount_clp").notNull(),
  discountAmountClp: int("discount_amount_clp").default(0).notNull(),
  discountCodeId: int("discount_code_id"),
  discountCode: varchar("discount_code", { length: 50 }),
  creditsTotal: int("credits_total").notNull(),
  status: mysqlEnum("status", ["pending_payment", "active", "postponed", "completed", "cancelled"]).default("pending_payment").notNull(),
  paymentStatus: mysqlEnum("payment_status", ["pending", "paid", "refunded"]).default("pending").notNull(),
  paymentMethod: varchar("payment_method", { length: 60 }),
  paymentReference: varchar("payment_reference", { length: 160 }),
  paidAt: timestamp("paid_at"),
  carriedFromMembershipId: int("carried_from_membership_id"),
  carriedToMembershipId: int("carried_to_membership_id"),
  notes: text("notes"),
  createdByUserId: int("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassAttendances = mysqlTable("regular_class_attendances", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("session_id").notNull(),
  studentId: int("student_id").notNull(),
  membershipId: int("membership_id"),
  status: mysqlEnum("status", ["present", "pending_payment", "void"]).default("present").notNull(),
  notes: text("notes"),
  markedByUserId: int("marked_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassPaymentInvitations = mysqlTable("regular_class_payment_invitations", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("student_id").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "sent", "opened", "completed", "expired"]).default("pending").notNull(),
  paymentUrl: text("payment_url"),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const regularClassClosures = mysqlTable("regular_class_closures", {
  id: int("id").autoincrement().primaryKey(),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  status: mysqlEnum("status", ["draft", "closed"]).default("draft").notNull(),
  snapshot: mediumtext("snapshot"),
  notes: text("notes"),
  createdByUserId: int("created_by_user_id").notNull(),
  closedByUserId: int("closed_by_user_id"),
  closedAt: timestamp("closed_at"),
  reopenedByUserId: int("reopened_by_user_id"),
  reopenedAt: timestamp("reopened_at"),
  reopenReason: text("reopen_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassAudit = mysqlTable("regular_class_audit", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entity_type", { length: 60 }).notNull(),
  entityId: int("entity_id").notNull(),
  action: varchar("action", { length: 60 }).notNull(),
  detail: text("detail"),
  userId: int("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const regularClassSettings = mysqlTable("regular_class_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassBenefitEntitlements = mysqlTable("regular_class_benefit_entitlements", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("student_id").notNull(),
  membershipId: int("membership_id").notNull(),
  benefitCode: varchar("benefit_code", { length: 80 }).notNull(),
  benefitName: varchar("benefit_name", { length: 220 }).notNull(),
  eligibleAt: date("eligible_at", { mode: "string" }).notNull(),
  status: mysqlEnum("status", ["available", "notified", "redeemed", "expired"]).default("available").notNull(),
  notifiedAt: timestamp("notified_at"),
  redeemedAt: timestamp("redeemed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const regularClassCampaigns = mysqlTable("regular_class_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  subject: varchar("subject", { length: 250 }).notNull(),
  message: text("message").notNull(),
  audience: mysqlEnum("audience", ["all_active", "2x_plus", "3x_plus", "4x_plus", "5x", "pending_payment"]).notNull(),
  status: mysqlEnum("status", ["draft", "sending", "sent", "failed"]).default("draft").notNull(),
  sentCount: int("sent_count").default(0).notNull(),
  failedCount: int("failed_count").default(0).notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const regularClassCampaignDeliveries = mysqlTable("regular_class_campaign_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaign_id").notNull(),
  studentId: int("student_id").notNull(),
  recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
  status: mysqlEnum("status", ["sent", "failed", "skipped"]).notNull(),
  providerId: varchar("provider_id", { length: 160 }),
  error: text("error"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Ficha diaria de mantención.
 *
 * Dominio separado del de averías (maintenance_reports): esto es el checklist
 * que el equipo llena en cada turno —tareas por hora, rondas de temperatura,
 * ciclos de hot tubs y saunas, calidad del agua y traspaso al turno siguiente—,
 * no una orden de trabajo.
 */
export const maintenanceShiftReports = mysqlTable("maintenance_shift_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportDate: date("report_date").notNull(),
  shift: mysqlEnum("shift", ["apertura", "cierre"]).notNull(),
  status: mysqlEnum("status", ["draft", "submitted"]).default("draft").notNull(),
  staffName: varchar("staff_name", { length: 200 }),
  weatherSummary: varchar("weather_summary", { length: 255 }),
  // Referencia del filtrado: la temperatura de MAÑANA temprano, no la máxima de hoy.
  tomorrowEarlyTemp: decimal("tomorrow_early_temp", { precision: 4, scale: 1 }),
  filteringStart: varchar("filtering_start", { length: 5 }),
  filteringEnd: varchar("filtering_end", { length: 5 }),
  filteringRule: varchar("filtering_rule", { length: 255 }),
  pendingNotes: text("pending_notes"),
  handoverNotes: text("handover_notes"),
  submittedAt: timestamp("submitted_at"),
  createdById: int("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MaintenanceShiftReport = typeof maintenanceShiftReports.$inferSelect;
export type InsertMaintenanceShiftReport = typeof maintenanceShiftReports.$inferInsert;

/**
 * Una fila por tarea del checklist.
 *
 * `taskKey` incluye turno y hora, no solo el texto: "Avanzar con tareas extras"
 * existe en los dos turnos y con una llave por texto marcar una marcaba la otra.
 */
export const maintenanceShiftTasks = mysqlTable("maintenance_shift_tasks", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("report_id").references(() => maintenanceShiftReports.id, { onDelete: "cascade" }).notNull(),
  taskKey: varchar("task_key", { length: 191 }).notNull(),
  scheduledTime: varchar("scheduled_time", { length: 5 }),
  label: varchar("label", { length: 500 }).notNull(),
  // "Otras labores" es una bolsa sin horario: no se traspasa al turno siguiente.
  isPool: int("is_pool").default(0).notNull(),
  done: int("done").default(0).notNull(),
  doneAt: varchar("done_at", { length: 5 }),
  responsible: varchar("responsible", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MaintenanceShiftTask = typeof maintenanceShiftTasks.$inferSelect;
export type InsertMaintenanceShiftTask = typeof maintenanceShiftTasks.$inferInsert;

/** Rondas de temperatura: 2 biopiscinas y 6 hot tubs, a primera hora y cada 2 horas. */
export const maintenanceShiftTemperatures = mysqlTable("maintenance_shift_temperatures", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("report_id").references(() => maintenanceShiftReports.id, { onDelete: "cascade" }).notNull(),
  venue: varchar("venue", { length: 60 }).notNull(),
  roundTime: varchar("round_time", { length: 5 }).notNull(),
  temperature: decimal("temperature", { precision: 4, scale: 1 }),
  inRange: int("in_range").default(1).notNull(),
  note: varchar("note", { length: 255 }),
  responsible: varchar("responsible", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MaintenanceShiftTemperature = typeof maintenanceShiftTemperatures.$inferSelect;
export type InsertMaintenanceShiftTemperature = typeof maintenanceShiftTemperatures.$inferInsert;

/** Calidad del agua por recinto, con las medidas que gatilla. */
export const maintenanceShiftWaterQuality = mysqlTable("maintenance_shift_water_quality", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("report_id").references(() => maintenanceShiftReports.id, { onDelete: "cascade" }).notNull(),
  venue: varchar("venue", { length: 60 }).notNull(),
  transparency: int("transparency"),
  suspendedParticles: mysqlEnum("suspended_particles", ["ausente", "pocas", "muchas"]),
  settledParticles: mysqlEnum("settled_particles", ["ausente", "pocas", "muchas"]),
  observation: text("observation"),
  actions: text("actions"),
  recordedAt: varchar("recorded_at", { length: 5 }),
  responsible: varchar("responsible", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MaintenanceShiftWaterQuality = typeof maintenanceShiftWaterQuality.$inferSelect;
export type InsertMaintenanceShiftWaterQuality = typeof maintenanceShiftWaterQuality.$inferInsert;

/**
 * Un paso del ciclo de un hot tub o de un sauna reservado.
 * `bookingRef` es el UUID de la cita en Skedu, cuando la hay.
 */
export const maintenanceShiftCycles = mysqlTable("maintenance_shift_cycles", {
  id: int("id").autoincrement().primaryKey(),
  reportId: int("report_id").references(() => maintenanceShiftReports.id, { onDelete: "cascade" }).notNull(),
  cycleType: mysqlEnum("cycle_type", ["hot_tub", "sauna"]).notNull(),
  venue: varchar("venue", { length: 60 }).notNull(),
  bookingRef: varchar("booking_ref", { length: 80 }),
  step: mysqlEnum("step", ["llenado", "entrega", "vaciado", "higienizado", "encendido"]).notNull(),
  plannedTime: varchar("planned_time", { length: 5 }),
  actualTime: varchar("actual_time", { length: 5 }),
  temperature: decimal("temperature", { precision: 4, scale: 1 }),
  done: int("done").default(0).notNull(),
  responsible: varchar("responsible", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MaintenanceShiftCycle = typeof maintenanceShiftCycles.$inferSelect;
export type InsertMaintenanceShiftCycle = typeof maintenanceShiftCycles.$inferInsert;
