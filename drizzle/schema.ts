import { date, decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Supports email/password authentication with role-based access control.
 * Roles:
 * - super_admin: Full access, cannot be removed by admins (owner and advisors)
 * - admin: Full access to all modules, can manage users except super_admins
 * - user: Access to specific modules only
 * - seller: Access to sales-related modules
 * - editor: Access to content editing modules
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("open_id", { length: 255 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: text("password_hash"),
  loginMethod: varchar("login_method", { length: 50 }).default("email"),
  role: varchar("role", { length: 50 }).default("user").notNull(),
  invitationToken: varchar("invitation_token", { length: 255 }),
  invitationTokenExpiry: timestamp("invitation_token_expiry"),
  passwordResetToken: varchar("password_reset_token", { length: 255 }),
  passwordResetTokenExpiry: timestamp("password_reset_token_expiry"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const analyticsCache = mysqlTable("analytics_cache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cache_key", { length: 255 }).notNull().unique(),
  data: text("data").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

// Relación many-to-many entre suscriptores y listas
export const listSubscribers = mysqlTable("list_subscribers", {
  id: int("id").autoincrement().primaryKey(),
  listId: int("list_id").references(() => subscriberLists.id, { onDelete: "cascade" }).notNull(),
  subscriberId: int("subscriber_id").references(() => newsletterSubscribers.id, { onDelete: "cascade" }).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const newsletters = mysqlTable("newsletters", {
  id: int("id").autoincrement().primaryKey(),
  subject: text("subject").notNull(),
  previewText: text("preview_text"),
  content: text("content").notNull(), // HTML content
  status: mysqlEnum("status", ["draft", "scheduled", "sending", "sent", "cancelled"]).default("draft").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  recipientCount: int("recipient_count").default(0).notNull(),
  openCount: int("open_count").default(0).notNull(),
  clickCount: int("click_count").default(0).notNull(),
  listId: int("list_id").references(() => subscriberLists.id),
  createdBy: int("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Newsletter = typeof newsletters.$inferSelect;
export type InsertNewsletter = typeof newsletters.$inferInsert;

export const newsletterSends = mysqlTable("newsletter_sends", {
  id: int("id").autoincrement().primaryKey(),
  newsletterId: int("newsletter_id").references(() => newsletters.id, { onDelete: "cascade" }).notNull(),
  subscriberId: int("subscriber_id").references(() => newsletterSubscribers.id, { onDelete: "cascade" }).notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed", "opened", "clicked"]).default("pending").notNull(),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  errorMessage: text("error_message"),
});

export type NewsletterSend = typeof newsletterSends.$inferSelect;

// Códigos de descuento
export const discountCodes = mysqlTable("discount_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: text("description"),
  discountType: mysqlEnum("discount_type", ["percentage", "fixed"]).notNull(),
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  minOrderValue: decimal("min_order_value", { precision: 10, scale: 2 }),
  maxUses: int("max_uses"),
  usedCount: int("used_count").default(0).notNull(),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  isActive: int("is_active").default(1).notNull(),
  createdBy: int("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;

// Gift Cards
export const giftCards = mysqlTable("gift_cards", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull(),
  recipientName: varchar("recipient_name", { length: 200 }),
  recipientEmail: varchar("recipient_email", { length: 320 }),
  senderName: varchar("sender_name", { length: 200 }),
  message: text("message"),
  isActive: int("is_active").default(1).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  redeemedAt: timestamp("redeemed_at"),
  paymentStatus: mysqlEnum("payment_status", ["pending", "paid", "refunded"]).default("pending").notNull(),
  orderId: varchar("order_id", { length: 100 }),
  notes: text("notes"),
});

export type GiftCard = typeof giftCards.$inferSelect;
export type InsertGiftCard = typeof giftCards.$inferInsert;

export const giftCardTransactions = mysqlTable("gift_card_transactions", {
  id: int("id").autoincrement().primaryKey(),
  giftCardId: int("gift_card_id").references(() => giftCards.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: mysqlEnum("type", ["credit", "debit"]).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Módulo Masajes
export const massageTechniques = mysqlTable("massage_techniques", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  durations: varchar("durations", { length: 50 }).notNull().default("50,80,110"), // "50,80,110"
  price50min: decimal("price_50min"),
  price80min: decimal("price_80min"),
  price110min: decimal("price_110min"),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageTechnique = typeof massageTechniques.$inferSelect;

export const massageTherapists = mysqlTable("massage_therapists", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["inhouse", "freelance"]).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  contractType: varchar("contract_type", { length: 100 }),
  leadTimeMinutes: int("lead_time_minutes").default(120),
  currentShift: mysqlEnum("current_shift", ["am", "pm"]).default("am"),
  notes: text("notes"),
  callPriority: int("call_priority").default(99),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageTherapist = typeof massageTherapists.$inferSelect;

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
  capacity: int("capacity").notNull(), // 1 o 2
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
  paymentStatus: mysqlEnum("payment_status", ["pending", "paid", "refunded"]).default("pending").notNull(),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }),
  discountCode: varchar("discount_code", { length: 50 }),
  notes: text("notes"),
  // Cross-sell: servicios adicionales contratados
  crossSellServices: text("cross_sell_services"), // JSON array
  // Reagendamiento
  rescheduleCount: int("reschedule_count").default(0).notNull(),
  originalBookingId: int("original_booking_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MassageBooking = typeof massageBookings.$inferSelect;
export type InsertMassageBooking = typeof massageBookings.$inferInsert;

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
