import { date, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Supports email/password authentication with role-based access control.
 * Roles:
 * - super_admin: Full access, cannot be removed by admins (owner and advisors)
 * - admin: Full access to all modules, can manage users except super_admins
 * - user: Access to specific modules only
 * - seller: Access to sales-related modules
 * - concierge: Access only to concierge sales tool
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
  role: mysqlEnum("role", ["super_admin", "admin", "editor", "user", "seller", "concierge"]).default("user").notNull(),
  /** User status: active, pending (invited but not activated), inactive */
  status: mysqlEnum("status", ["active", "pending", "inactive"]).default("pending").notNull(),
  /** Modules the user has access to (JSON array, null = all modules for admin roles) */
  allowedModules: text("allowedModules"),
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
export type UserRole = "super_admin" | "admin" | "user" | "seller" | "concierge";
export type UserStatus = "active" | "pending" | "inactive";

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
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

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
  htmlContent: text("html_content").notNull(), // HTML generado por IA
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

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
  discountType: mysqlEnum("discount_type", ["fixed", "percentage"]).default("percentage").notNull(),
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
  active: int("active").default(1).notNull(),
  createdBy: int("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;

// Uso de códigos de descuento (historial)
export const discountCodeUsages = mysqlTable("discount_code_usages", {
  id: int("id").autoincrement().primaryKey(),
  discountCodeId: int("discount_code_id").references(() => discountCodes.id, { onDelete: "cascade" }).notNull(),
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

// Gift Cards
export const giftCards = mysqlTable("gift_cards", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(), // Código único de la gift card
  amount: int("amount").notNull(), // Monto en CLP
  balance: int("balance").notNull(), // Saldo restante
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
  expiresAt: timestamp("expires_at").notNull(), // Fecha de expiración (1 año por defecto)
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
