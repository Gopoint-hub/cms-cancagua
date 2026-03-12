import { eq, gte, and, desc, sql, asc, like, or, isNull, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance for MySQL
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    // Lista de emails autorizados como administradores
    const authorizedAdminEmails = [
      'eventos@cancagua.cl',
      'sebastian.jara.b@gmail.com',
    ];

    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId || (user.email && authorizedAdminEmails.includes(user.email))) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByInvitationToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users)
    .where(eq(users.invitationToken, token))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByResetToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users)
    .where(eq(users.resetToken, token))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Gestión de usuarios
export async function getAllUsers() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get users: database not available");
    return [];
  }

  const result = await db.select().from(users).orderBy(desc(users.createdAt));
  return result;
}

export async function createUser(userData: {
  openId: string;
  email: string;
  name?: string;
  passwordHash?: string;
  role: "super_admin" | "admin" | "user" | "seller";
  status: "active" | "pending" | "inactive";
  invitationToken?: string;
  invitationExpiresAt?: Date;
  invitedBy?: number;
  allowedModules?: string;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.insert(users).values({
      ...userData,
      loginMethod: "email",
    });
    return await getUserByEmail(userData.email);
  } catch (error) {
    console.error("[Database] Failed to create user:", error);
    throw error;
  }
}

export async function updateUserRole(userId: number, role: "super_admin" | "admin" | "user" | "seller") {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update user role: database not available");
    return false;
  }

  try {
    await db.update(users).set({ role }).where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update user role:", error);
    return false;
  }
}

export async function updateUserStatus(userId: number, status: "active" | "pending" | "inactive") {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(users).set({ status }).where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update user status:", error);
    return false;
  }
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(users).set({
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
    }).where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update user password:", error);
    return false;
  }
}

export async function activateUser(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(users).set({
      passwordHash,
      status: "active",
      invitationToken: null,
      invitationExpiresAt: null,
    }).where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to activate user:", error);
    return false;
  }
}

export async function setResetToken(userId: number, resetToken: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(users).set({
      resetToken,
      resetTokenExpiresAt: expiresAt,
    }).where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to set reset token:", error);
    return false;
  }
}

export async function updateUserLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(users).set({
      lastSignedIn: new Date(),
    }).where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update last signed in:", error);
    return false;
  }
}

export async function updateUserProfile(userId: number, data: { name?: string; email?: string }) {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(users).set(data).where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update user profile:", error);
    return false;
  }
}

export async function updateUserModules(userId: number, allowedModules: string[]) {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.update(users).set({
      allowedModules: JSON.stringify(allowedModules),
    }).where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update user modules:", error);
    return false;
  }
}

export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete user: database not available");
    return false;
  }

  try {
    await db.delete(users).where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete user:", error);
    return false;
  }
}

// Servicios
export async function getAllServices() {
  const db = await getDb();
  if (!db) return [];
  const { services } = await import("../drizzle/schema");
  return await db.select().from(services).where(eq(services.active, 1));
}

export async function getServiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { services } = await import("../drizzle/schema");
  const result = await db.select().from(services).where(eq(services.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertService(service: any) {
  const db = await getDb();
  if (!db) return;
  const { services } = await import("../drizzle/schema");

  if (service.skeduId) {
    const existing = await db.select().from(services).where(eq(services.skeduId, service.skeduId)).limit(1);
    if (existing.length > 0) {
      await db.update(services).set({ ...service, lastSyncedAt: new Date() }).where(eq(services.skeduId, service.skeduId));
      return;
    }
  }

  await db.insert(services).values({ ...service, lastSyncedAt: new Date() });
}

// Eventos
export async function getActiveEvents() {
  const db = await getDb();
  if (!db) return [];
  const { events } = await import("../drizzle/schema");
  return await db.select().from(events).where(eq(events.active, 1));
}

export async function getAllEvents() {
  const db = await getDb();
  if (!db) return [];
  const { events } = await import("../drizzle/schema");
  return await db.select().from(events);
}

export async function getEventBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { events } = await import("../drizzle/schema");
  // Convertir slug a título (reemplazar guiones con espacios y capitalizar)
  const title = slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  const result = await db.select().from(events).where(eq(events.title, title)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUpcomingEvents() {
  const db = await getDb();
  if (!db) return [];
  const { events } = await import("../drizzle/schema");
  return await db.select().from(events)
    .where(gte(events.startDate, new Date()))
    .orderBy(events.startDate);
}

export async function getEventById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { events } = await import("../drizzle/schema");
  const result = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertEvent(event: any) {
  const db = await getDb();
  if (!db) return;
  const { events } = await import("../drizzle/schema");

  if (event.skeduId) {
    const existing = await db.select().from(events).where(eq(events.skeduId, event.skeduId)).limit(1);
    if (existing.length > 0) {
      await db.update(events).set({ ...event, lastSyncedAt: new Date() }).where(eq(events.skeduId, event.skeduId));
      return;
    }
  }

  await db.insert(events).values({ ...event, lastSyncedAt: new Date() });
}

// Clientes
export async function getAllClients() {
  const db = await getDb();
  if (!db) return [];
  const { clients } = await import("../drizzle/schema");
  return await db.select().from(clients);
}

export async function getClientByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { clients } = await import("../drizzle/schema");
  const result = await db.select().from(clients).where(eq(clients.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertClient(client: any) {
  const db = await getDb();
  if (!db) return;
  const { clients } = await import("../drizzle/schema");

  if (client.skeduId) {
    const existing = await db.select().from(clients).where(eq(clients.skeduId, client.skeduId)).limit(1);
    if (existing.length > 0) {
      await db.update(clients).set({
        ...client,
        lastSyncedAt: new Date(),
        updatedAt: new Date()
      }).where(eq(clients.skeduId, client.skeduId));
      return;
    }
  }

  await db.insert(clients).values({ ...client, lastSyncedAt: new Date() });
}

// Reservas (Bookings/Appointments) con soporte para montos y UTMs
export async function upsertBooking(booking: any) {
  const db = await getDb();
  if (!db) return;
  const { bookings } = await import("../drizzle/schema");

  if (booking.skeduId) {
    const existing = await db.select().from(bookings).where(eq(bookings.skeduId, booking.skeduId)).limit(1);
    if (existing.length > 0) {
      await db.update(bookings).set({
        ...booking,
        updatedAt: new Date()
      }).where(eq(bookings.skeduId, booking.skeduId));
      return;
    }
  }

  await db.insert(bookings).values(booking);
}

// Newsletter Subscribers
export async function subscribeToNewsletter(email: string, name?: string) {
  const db = await getDb();
  if (!db) return;
  const { newsletterSubscribers } = await import("../drizzle/schema");

  const existing = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email)).limit(1);
  if (existing.length > 0) {
    if (existing[0].status === "unsubscribed") {
      await db.update(newsletterSubscribers)
        .set({ status: "active", name: name || existing[0].name, updatedAt: new Date() })
        .where(eq(newsletterSubscribers.email, email));
    }
    return;
  }

  await db.insert(newsletterSubscribers).values({ email, name, status: "active" });
}

export async function confirmNewsletterSubscription(email: string) {
  const db = await getDb();
  if (!db) return;
  const { newsletterSubscribers } = await import("../drizzle/schema");
  await db.update(newsletterSubscribers)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(newsletterSubscribers.email, email));
}

export async function unsubscribeFromNewsletter(email: string) {
  const db = await getDb();
  if (!db) return;
  const { newsletterSubscribers } = await import("../drizzle/schema");
  await db.update(newsletterSubscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(eq(newsletterSubscribers.email, email));
}

export async function getActiveNewsletterSubscribers() {
  const db = await getDb();
  if (!db) return [];
  const { newsletterSubscribers } = await import("../drizzle/schema");
  return await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.status, "active"));
}

// Webhook Logs
export async function logWebhook(event: string, payload: any, processed: boolean = false, error?: string) {
  const db = await getDb();
  if (!db) return;
  const { webhookLogs } = await import("../drizzle/schema");
  await db.insert(webhookLogs).values({
    event,
    payload: JSON.stringify(payload),
    processed: processed ? 1 : 0,
    error,
  });
}

// Analytics Events
export async function logAnalyticsEvent(eventData: {
  eventType: string;
  page?: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
  metadata?: string;
}) {
  const db = await getDb();
  if (!db) return;
  const { analyticsEvents } = await import("../drizzle/schema");
  await db.insert(analyticsEvents).values(eventData);
}

export async function getAnalyticsEvents(days: number = 30) {
  const db = await getDb();
  if (!db) return [];
  const { analyticsEvents } = await import("../drizzle/schema");
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return await db.select().from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, startDate))
    .orderBy(desc(analyticsEvents.createdAt));
}

// Menú - Categorías
export async function getAllMenuCategories() {
  const db = await getDb();
  if (!db) return [];
  const { menuCategories } = await import("../drizzle/schema");
  return await db.select().from(menuCategories).orderBy(asc(menuCategories.displayOrder));
}

export async function getActiveMenuCategories() {
  const db = await getDb();
  if (!db) return [];
  const { menuCategories } = await import("../drizzle/schema");
  return await db.select().from(menuCategories)
    .where(eq(menuCategories.active, 1))
    .orderBy(asc(menuCategories.displayOrder));
}

export async function createMenuCategory(category: any) {
  const db = await getDb();
  if (!db) return;
  const { menuCategories } = await import("../drizzle/schema");
  await db.insert(menuCategories).values(category);
}

export async function updateMenuCategory(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { menuCategories } = await import("../drizzle/schema");
  await db.update(menuCategories).set(data).where(eq(menuCategories.id, id));
}

export async function deleteMenuCategory(id: number) {
  const db = await getDb();
  if (!db) return;
  const { menuCategories } = await import("../drizzle/schema");
  await db.delete(menuCategories).where(eq(menuCategories.id, id));
}

// Menú - Items
export async function getAllMenuItems() {
  const db = await getDb();
  if (!db) return [];
  const { menuItems } = await import("../drizzle/schema");
  return await db.select().from(menuItems).orderBy(asc(menuItems.displayOrder));
}

export async function getMenuItemsByCategory(categoryId: number) {
  const db = await getDb();
  if (!db) return [];
  const { menuItems } = await import("../drizzle/schema");
  return await db.select().from(menuItems)
    .where(eq(menuItems.categoryId, categoryId))
    .orderBy(asc(menuItems.displayOrder));
}

export async function getActiveMenuItemsByCategory(categoryId: number) {
  const db = await getDb();
  if (!db) return [];
  const { menuItems } = await import("../drizzle/schema");
  return await db.select().from(menuItems)
    .where(and(eq(menuItems.categoryId, categoryId), eq(menuItems.active, 1)))
    .orderBy(asc(menuItems.displayOrder));
}

export async function createMenuItem(item: any) {
  const db = await getDb();
  if (!db) return;
  const { menuItems } = await import("../drizzle/schema");
  await db.insert(menuItems).values(item);
}

export async function updateMenuItem(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { menuItems } = await import("../drizzle/schema");
  await db.update(menuItems).set(data).where(eq(menuItems.id, id));
}

export async function deleteMenuItem(id: number) {
  const db = await getDb();
  if (!db) return;
  const { menuItems } = await import("../drizzle/schema");
  await db.delete(menuItems).where(eq(menuItems.id, id));
}

// Menú completo con categorías e items
export async function getFullMenu() {
  const db = await getDb();
  if (!db) return [];
  const { menuCategories, menuItems } = await import("../drizzle/schema");

  const categories = await db.select().from(menuCategories)
    .where(eq(menuCategories.active, 1))
    .orderBy(asc(menuCategories.displayOrder));

  const items = await db.select().from(menuItems)
    .where(eq(menuItems.active, 1))
    .orderBy(asc(menuItems.displayOrder));

  return categories.map(cat => ({
    ...cat,
    items: items.filter(item => item.categoryId === cat.id),
  }));
}

// Reservas
export async function createBooking(booking: any) {
  const db = await getDb();
  if (!db) return { success: false };
  const { bookings } = await import("../drizzle/schema");
  await db.insert(bookings).values(booking);
  return { success: true };
}

export async function getAllBookings() {
  const db = await getDb();
  if (!db) return [];
  const { bookings } = await import("../drizzle/schema");
  return await db.select().from(bookings).orderBy(desc(bookings.createdAt));
}

export async function updateBookingStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) return;
  const { bookings } = await import("../drizzle/schema");
  await db.update(bookings).set({ status: status as any }).where(eq(bookings.id, id));
}

export async function deleteBooking(id: number) {
  const db = await getDb();
  if (!db) return;
  const { bookings } = await import("../drizzle/schema");
  await db.delete(bookings).where(eq(bookings.id, id));
}

export async function bulkDeleteBookings(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const { bookings } = await import("../drizzle/schema");
  await db.delete(bookings).where(sql`${bookings.id} IN (${sql.join(ids, sql`, `)})`);
}

export async function bulkUpdateBookingsStatus(ids: number[], status: string) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const { bookings } = await import("../drizzle/schema");
  await db.update(bookings).set({ status: status as any }).where(sql`${bookings.id} IN (${sql.join(ids, sql`, `)})`);
}

// Mensajes de contacto
export async function createContactMessage(message: any) {
  const db = await getDb();
  if (!db) return;
  const { contactMessages } = await import("../drizzle/schema");
  await db.insert(contactMessages).values(message);
}

export async function getAllContactMessages() {
  const db = await getDb();
  if (!db) return [];
  const { contactMessages } = await import("../drizzle/schema");
  return await db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt));
}

export async function getContactMessageById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const { contactMessages } = await import("../drizzle/schema");
  const result = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
  return result[0] || null;
}

export async function updateContactMessageStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) return;
  const { contactMessages } = await import("../drizzle/schema");
  await db.update(contactMessages).set({ status: status as any }).where(eq(contactMessages.id, id));
}

export async function deleteContactMessage(id: number) {
  const db = await getDb();
  if (!db) return;
  const { contactMessages } = await import("../drizzle/schema");
  await db.delete(contactMessages).where(eq(contactMessages.id, id));
}

export async function bulkDeleteContactMessages(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const { contactMessages } = await import("../drizzle/schema");
  await db.delete(contactMessages).where(sql`${contactMessages.id} IN (${sql.join(ids, sql`, `)})`);
}

export async function bulkUpdateContactMessagesStatus(ids: number[], status: string) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const { contactMessages } = await import("../drizzle/schema");
  await db.update(contactMessages).set({ status: status as any }).where(sql`${contactMessages.id} IN (${sql.join(ids, sql`, `)})`);
}

// Newsletter Subscribers - funciones adicionales
export async function getAllNewsletterSubscribers() {
  const db = await getDb();
  if (!db) return [];
  const { newsletterSubscribers } = await import("../drizzle/schema");
  return await db.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.subscribedAt));
}

export async function getNewsletterSubscriberById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { newsletterSubscribers } = await import("../drizzle/schema");
  const result = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateNewsletterSubscriber(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { newsletterSubscribers } = await import("../drizzle/schema");
  await db.update(newsletterSubscribers).set({ ...data, updatedAt: new Date() }).where(eq(newsletterSubscribers.id, id));
}

export async function deleteNewsletterSubscriber(id: number) {
  const db = await getDb();
  if (!db) return;
  const { newsletterSubscribers } = await import("../drizzle/schema");
  await db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.id, id));
}

// Aliases y funciones adicionales para Newsletter
export const getAllSubscribers = getAllNewsletterSubscribers;
export const getSubscriberById = getNewsletterSubscriberById;
export const updateSubscriber = updateNewsletterSubscriber;
export const deleteSubscriber = deleteNewsletterSubscriber;

export async function createSubscriber(data: any) {
  return await subscribeToNewsletter(data.email, data.name);
}

export async function getSubscriberByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { newsletterSubscribers } = await import("../drizzle/schema");
  const result = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function bulkDeleteSubscribers(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const { newsletterSubscribers } = await import("../drizzle/schema");
  await db.delete(newsletterSubscribers).where(sql`${newsletterSubscribers.id} IN (${sql.join(ids, sql`, `)})`);
}

export async function bulkUpdateSubscribersStatus(ids: number[], status: string) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const { newsletterSubscribers } = await import("../drizzle/schema");
  await db.update(newsletterSubscribers).set({ status: status as any }).where(sql`${newsletterSubscribers.id} IN (${sql.join(ids, sql`, `)})`);
}

export async function getListsForSubscriber(subscriberId: number) {
  const db = await getDb();
  if (!db) return [];
  const { subscriberLists, listSubscribers } = await import("../drizzle/schema");
  return await db.select()
    .from(subscriberLists)
    .innerJoin(listSubscribers, eq(subscriberLists.id, listSubscribers.listId))
    .where(eq(listSubscribers.subscriberId, subscriberId));
}

export const getAllLists = getAllSubscriberLists;

export async function bulkCreateNewsletterSubscribers(subscribers: any[]) {
  const db = await getDb();
  if (!db) return { created: 0, skipped: 0 };
  const { newsletterSubscribers } = await import("../drizzle/schema");

  let created = 0;
  let skipped = 0;

  for (const sub of subscribers) {
    const existing = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, sub.email)).limit(1);
    if (existing.length > 0) {
      skipped++;
    } else {
      await db.insert(newsletterSubscribers).values({
        email: sub.email,
        name: sub.name,
        status: "active",
        source: sub.source || "import",
        metadata: sub.metadata ? JSON.stringify(sub.metadata) : null,
      });
      created++;
    }
  }

  return { created, skipped };
}

// Subscriber Lists
export async function getAllSubscriberLists() {
  const db = await getDb();
  if (!db) return [];
  const { subscriberLists } = await import("../drizzle/schema");
  return await db.select().from(subscriberLists).orderBy(desc(subscriberLists.createdAt));
}

export async function getListById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { subscriberLists } = await import("../drizzle/schema");
  const result = await db.select().from(subscriberLists).where(eq(subscriberLists.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createList(list: any) {
  const db = await getDb();
  if (!db) return;
  const { subscriberLists } = await import("../drizzle/schema");
  await db.insert(subscriberLists).values(list);
}

export async function updateList(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { subscriberLists } = await import("../drizzle/schema");
  await db.update(subscriberLists).set(data).where(eq(subscriberLists.id, id));
}

export async function deleteList(id: number) {
  const db = await getDb();
  if (!db) return;
  const { subscriberLists, listSubscribers } = await import("../drizzle/schema");
  await db.delete(listSubscribers).where(eq(listSubscribers.listId, id));
  await db.delete(subscriberLists).where(eq(subscriberLists.id, id));
}

export async function bulkDeleteLists(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const { subscriberLists, listSubscribers } = await import("../drizzle/schema");
  await db.delete(listSubscribers).where(inArray(listSubscribers.listId, ids));
  await db.delete(subscriberLists).where(inArray(subscriberLists.id, ids));
}

export async function getSubscribersInList(listId: number) {
  const db = await getDb();
  if (!db) return [];
  const { newsletterSubscribers, listSubscribers } = await import("../drizzle/schema");
  return await db.select({
    id: newsletterSubscribers.id,
    email: newsletterSubscribers.email,
    name: newsletterSubscribers.name,
    status: newsletterSubscribers.status,
  })
    .from(newsletterSubscribers)
    .innerJoin(listSubscribers, eq(newsletterSubscribers.id, listSubscribers.subscriberId))
    .where(eq(listSubscribers.listId, listId));
}

export async function getUniqueSubscriberCountForLists(listIds: number[]): Promise<number> {
  const db = await getDb();
  if (!db || listIds.length === 0) return 0;
  const { newsletterSubscribers, listSubscribers } = await import("../drizzle/schema");
  const result = await db.select({
    count: sql<number>`COUNT(DISTINCT ${newsletterSubscribers.id})`,
  })
    .from(newsletterSubscribers)
    .innerJoin(listSubscribers, eq(newsletterSubscribers.id, listSubscribers.subscriberId))
    .where(
      and(
        inArray(listSubscribers.listId, listIds),
        eq(newsletterSubscribers.status, 'active')
      )
    );
  return result[0]?.count || 0;
}

export async function getUniqueActiveSubscribersForLists(listIds: number[]) {
  const db = await getDb();
  if (!db || listIds.length === 0) return [];
  const { newsletterSubscribers, listSubscribers } = await import("../drizzle/schema");
  return await db.selectDistinct({
    id: newsletterSubscribers.id,
    email: newsletterSubscribers.email,
    name: newsletterSubscribers.name,
  })
    .from(newsletterSubscribers)
    .innerJoin(listSubscribers, eq(newsletterSubscribers.id, listSubscribers.subscriberId))
    .where(
      and(
        inArray(listSubscribers.listId, listIds),
        eq(newsletterSubscribers.status, 'active')
      )
    );
}

export async function bulkCreateNewsletterSends(sends: { newsletterId: number; subscriberId: number; status: string }[]) {
  const db = await getDb();
  if (!db || sends.length === 0) return;
  const { newsletterSends } = await import("../drizzle/schema");
  await db.insert(newsletterSends).values(sends);
}

export async function getTotalUniqueActiveSubscribers(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const { newsletterSubscribers } = await import("../drizzle/schema");
  const result = await db.select({
    count: sql<number>`COUNT(*)`,
  })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, 'active'));
  return result[0]?.count || 0;
}

export async function addSubscriberToList(subscriberId: number, listId: number) {
  const db = await getDb();
  if (!db) return;
  const { listSubscribers } = await import("../drizzle/schema");
  await db.insert(listSubscribers).values({ subscriberId, listId }).onDuplicateKeyUpdate({ set: { addedAt: new Date() } });
}

export async function removeSubscriberFromList(subscriberId: number, listId: number) {
  const db = await getDb();
  if (!db) return;
  const { listSubscribers } = await import("../drizzle/schema");
  await db.delete(listSubscribers).where(and(eq(listSubscribers.subscriberId, subscriberId), eq(listSubscribers.listId, listId)));
}

export async function bulkAddSubscribersToList(subscriberIds: number[], listId: number) {
  const db = await getDb();
  if (!db || subscriberIds.length === 0) return;
  const { listSubscribers } = await import("../drizzle/schema");
  const values = subscriberIds.map(id => ({ subscriberId: id, listId }));
  await db.insert(listSubscribers).values(values).onDuplicateKeyUpdate({ set: { addedAt: new Date() } });
}

export async function bulkRemoveSubscribersFromList(subscriberIds: number[], listId: number) {
  const db = await getDb();
  if (!db || subscriberIds.length === 0) return;
  const { listSubscribers } = await import("../drizzle/schema");
  await db.delete(listSubscribers).where(and(
    sql`${listSubscribers.subscriberId} IN (${sql.join(subscriberIds, sql`, `)})`,
    eq(listSubscribers.listId, listId)
  ));
}

// Corporate Products
export async function getAllCorporateProducts() {
  const db = await getDb();
  if (!db) return [];
  const { corporateProducts } = await import("../drizzle/schema");
  return await db.select().from(corporateProducts).orderBy(asc(corporateProducts.name));
}

export async function getActiveCorporateProducts() {
  const db = await getDb();
  if (!db) return [];
  const { corporateProducts } = await import("../drizzle/schema");
  return await db.select().from(corporateProducts).where(eq(corporateProducts.active, 1)).orderBy(asc(corporateProducts.name));
}

export async function getCorporateProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { corporateProducts } = await import("../drizzle/schema");
  const result = await db.select().from(corporateProducts).where(eq(corporateProducts.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCorporateProduct(product: any) {
  const db = await getDb();
  if (!db) return;
  const { corporateProducts } = await import("../drizzle/schema");
  await db.insert(corporateProducts).values(product);
}

export async function updateCorporateProduct(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { corporateProducts } = await import("../drizzle/schema");
  await db.update(corporateProducts).set(data).where(eq(corporateProducts.id, id));
}

export async function deleteCorporateProduct(id: number) {
  const db = await getDb();
  if (!db) return;
  const { corporateProducts } = await import("../drizzle/schema");
  await db.delete(corporateProducts).where(eq(corporateProducts.id, id));
}

// Corporate Clients
export async function getAllCorporateClients() {
  const db = await getDb();
  if (!db) return [];
  const { corporateClients } = await import("../drizzle/schema");
  return await db.select().from(corporateClients).orderBy(desc(corporateClients.createdAt));
}

export async function getCorporateClientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { corporateClients } = await import("../drizzle/schema");
  const result = await db.select().from(corporateClients).where(eq(corporateClients.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getCorporateClientByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { corporateClients } = await import("../drizzle/schema");
  const result = await db.select().from(corporateClients).where(eq(corporateClients.contactEmail, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCorporateClient(client: any) {
  const db = await getDb();
  if (!db) return;
  const { corporateClients } = await import("../drizzle/schema");
  await db.insert(corporateClients).values(client);
}

export async function updateCorporateClient(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { corporateClients } = await import("../drizzle/schema");
  await db.update(corporateClients).set(data).where(eq(corporateClients.id, id));
}

export async function deleteCorporateClient(id: number) {
  const db = await getDb();
  if (!db) return;
  const { corporateClients } = await import("../drizzle/schema");
  await db.delete(corporateClients).where(eq(corporateClients.id, id));
}

// Quote Items
export async function getQuoteItems(quoteId: number) {
  const db = await getDb();
  if (!db) return [];
  const { quoteItems } = await import("../drizzle/schema");
  return await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
}

export async function createQuoteItem(item: any) {
  const db = await getDb();
  if (!db) return;
  const { quoteItems } = await import("../drizzle/schema");
  // Sanitize fields to match DB schema
  const subtotal = item.subtotal ?? (item.quantity * item.unitPrice) ?? 0;
  const sanitized = {
    ...item,
    scheduleTime: item.scheduleTime ? String(item.scheduleTime) : null,
    productId: item.productId || null,
    subtotal,
    discountPercent: item.discountPercent ?? item.discountValue ?? 0,
  };
  await db.insert(quoteItems).values(sanitized);
}

export async function deleteQuoteItems(quoteId: number) {
  const db = await getDb();
  if (!db) return;
  const { quoteItems } = await import("../drizzle/schema");
  await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
}

// Discount Codes
export async function getAllDiscountCodes() {
  const db = await getDb();
  if (!db) return [];
  const { discountCodes } = await import("../drizzle/schema");
  return await db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt));
}

export async function getDiscountCodeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { discountCodes } = await import("../drizzle/schema");
  const result = await db.select().from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getDiscountCodeByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { discountCodes } = await import("../drizzle/schema");
  const result = await db.select().from(discountCodes).where(eq(discountCodes.code, code.toUpperCase())).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createDiscountCode(codeData: any) {
  const db = await getDb();
  if (!db) return;
  const { discountCodes } = await import("../drizzle/schema");
  await db.insert(discountCodes).values({ ...codeData, code: codeData.code.toUpperCase() });
}

export async function updateDiscountCode(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { discountCodes } = await import("../drizzle/schema");
  if (data.code) data.code = data.code.toUpperCase();
  await db.update(discountCodes).set(data).where(eq(discountCodes.id, id));
}

export async function deleteDiscountCode(id: number) {
  const db = await getDb();
  if (!db) return;
  const { discountCodes } = await import("../drizzle/schema");
  await db.delete(discountCodes).where(eq(discountCodes.id, id));
}

export async function validateDiscountCode(code: string) {
  const db = await getDb();
  if (!db) return { valid: false, message: "Base de datos no disponible" };
  const discCode = await getDiscountCodeByCode(code);

  if (!discCode) return { valid: false, message: "Código no encontrado" };
  if (discCode.active === 0) return { valid: false, message: "Código inactivo" };
  if (discCode.expiresAt && new Date(discCode.expiresAt) < new Date()) {
    return { valid: false, message: "Código expirado" };
  }
  if (discCode.maxUses && discCode.currentUses >= discCode.maxUses) {
    return { valid: false, message: "Límite de usos alcanzado" };
  }

  return { valid: true, code: discCode };
}

export async function getUsagesForDiscountCode(codeId: number) {
  const db = await getDb();
  if (!db) return [];
  const { discountCodeUsages } = await import("../drizzle/schema");
  return await db.select().from(discountCodeUsages).where(eq(discountCodeUsages.discountCodeId, codeId));
}

// Newsletters
export async function getAllNewsletters() {
  const db = await getDb();
  if (!db) return [];
  const { newsletters } = await import("../drizzle/schema");
  return await db.select().from(newsletters).orderBy(desc(newsletters.createdAt));
}

export async function getNewsletterById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { newsletters } = await import("../drizzle/schema");
  const result = await db.select().from(newsletters).where(eq(newsletters.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createNewsletter(newsletter: any) {
  const db = await getDb();
  if (!db) return undefined;
  const { newsletters } = await import("../drizzle/schema");
  const result = await db.insert(newsletters).values(newsletter);
  return result;
}

export async function updateNewsletter(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { newsletters } = await import("../drizzle/schema");
  await db.update(newsletters).set(data).where(eq(newsletters.id, id));
}

export async function deleteNewsletter(id: number) {
  const db = await getDb();
  if (!db) return;
  const { newsletters, newsletterSends, newsletterLists } = await import("../drizzle/schema");
  await db.delete(newsletterSends).where(eq(newsletterSends.newsletterId, id));
  await db.delete(newsletterLists).where(eq(newsletterLists.newsletterId, id));
  await db.delete(newsletters).where(eq(newsletters.id, id));
}

export async function bulkDeleteNewsletters(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const { newsletters, newsletterSends, newsletterLists } = await import("../drizzle/schema");
  await db.delete(newsletterSends).where(sql`${newsletterSends.newsletterId} IN (${sql.join(ids, sql`, `)})`);
  await db.delete(newsletterLists).where(sql`${newsletterLists.newsletterId} IN (${sql.join(ids, sql`, `)})`);
  await db.delete(newsletters).where(sql`${newsletters.id} IN (${sql.join(ids, sql`, `)})`);
}

export async function createNewsletterSend(send: any) {
  const db = await getDb();
  if (!db) return;
  const { newsletterSends } = await import("../drizzle/schema");
  await db.insert(newsletterSends).values(send);
}

export async function addListToNewsletter(newsletterId: number, listId: number) {
  const db = await getDb();
  if (!db) return;
  const { newsletterLists } = await import("../drizzle/schema");
  await db.insert(newsletterLists).values({ newsletterId, listId });
}

export async function getListsForNewsletter(newsletterId: number) {
  const db = await getDb();
  if (!db) return [];
  const { subscriberLists, newsletterLists } = await import("../drizzle/schema");
  return await db.select()
    .from(subscriberLists)
    .innerJoin(newsletterLists, eq(subscriberLists.id, newsletterLists.listId))
    .where(eq(newsletterLists.newsletterId, newsletterId));
}

export async function duplicateNewsletter(id: number) {
  const db = await getDb();
  if (!db) return;
  const newsletter = await getNewsletterById(id);
  if (!newsletter) return;

  const { id: _, createdAt: __, updatedAt: ___, ...data } = newsletter;
  await createNewsletter({
    ...data,
    subject: `${data.subject} (Copia)`,
    status: "draft",
  });
  // Get the newly created newsletter (most recent)
  const { newsletters } = await import("../drizzle/schema");
  const allNewsletters = await db.select().from(newsletters).orderBy(desc(newsletters.createdAt)).limit(1);
  return allNewsletters.length > 0 ? allNewsletters[0] : undefined;
}

// Gift Cards
export async function getAllGiftCards() {
  const db = await getDb();
  if (!db) return [];
  const { giftCards } = await import("../drizzle/schema");
  return await db.select().from(giftCards).orderBy(desc(giftCards.createdAt));
}

export async function getGiftCardById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { giftCards } = await import("../drizzle/schema");
  const result = await db.select().from(giftCards).where(eq(giftCards.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getGiftCardByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { giftCards } = await import("../drizzle/schema");
  const result = await db.select().from(giftCards).where(eq(giftCards.code, code)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createGiftCard(giftCard: any) {
  const db = await getDb();
  if (!db) return undefined;
  const { giftCards } = await import("../drizzle/schema");
  await db.insert(giftCards).values(giftCard);
  return giftCard;
}

export async function updateGiftCard(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { giftCards } = await import("../drizzle/schema");
  await db.update(giftCards).set(data).where(eq(giftCards.id, id));
}

export async function deleteGiftCard(id: number) {
  const db = await getDb();
  if (!db) return;
  const { giftCards } = await import("../drizzle/schema");
  await db.delete(giftCards).where(eq(giftCards.id, id));
}

export async function getGiftCardByBuyOrder(buyOrder: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { giftCards } = await import("../drizzle/schema");
  const result = await db.select().from(giftCards).where(eq(giftCards.webpayBuyOrder, buyOrder)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Marcar gift cards pendientes antiguas como abandonadas
 * @param olderThan - Fecha límite: gift cards creadas antes de esta fecha serán marcadas como abandonadas
 * @returns Número de gift cards actualizadas
 */
export async function markAbandonedGiftCards(olderThan: Date): Promise<{ count: number }> {
  const db = await getDb();
  if (!db) return { count: 0 };
  const { giftCards } = await import("../drizzle/schema");
  const { and, lt } = await import("drizzle-orm");
  
  // Obtener gift cards pendientes antiguas
  const pendingCards = await db.select({ id: giftCards.id })
    .from(giftCards)
    .where(
      and(
        eq(giftCards.purchaseStatus, "pending"),
        lt(giftCards.createdAt, olderThan)
      )
    );
  
  // Actualizar cada una a "abandoned"
  for (const card of pendingCards) {
    await db.update(giftCards)
      .set({ purchaseStatus: "abandoned" })
      .where(eq(giftCards.id, card.id));
  }
  
  return { count: pendingCards.length };
}

// Quotes
export async function getAllQuotes() {
  const db = await getDb();
  if (!db) return [];
  const { quotes } = await import("../drizzle/schema");
  return await db.select().from(quotes).orderBy(desc(quotes.createdAt));
}

export async function getQuoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { quotes } = await import("../drizzle/schema");
  const result = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getQuoteByNumber(quoteNumber: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { quotes } = await import("../drizzle/schema");
  const result = await db.select().from(quotes).where(eq(quotes.quoteNumber, quoteNumber)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createQuote(quote: any) {
  const db = await getDb();
  if (!db) return { success: false };
  const { quotes } = await import("../drizzle/schema");
  await db.insert(quotes).values(quote);
  return { success: true, ...quote };
}

export async function updateQuote(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { quotes } = await import("../drizzle/schema");
  await db.update(quotes).set(data).where(eq(quotes.id, id));
}

export async function deleteQuote(id: number) {
  const db = await getDb();
  if (!db) return;
  const { quotes, quoteItems } = await import("../drizzle/schema");
  await db.delete(quoteItems).where(eq(quoteItems.quoteId, id));
  await db.delete(quotes).where(eq(quotes.id, id));
}

export async function updateQuoteStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) return;
  const { quotes } = await import("../drizzle/schema");
  await db.update(quotes).set({ status: status as any }).where(eq(quotes.id, id));
}

export async function bulkDeleteQuotes(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const { quotes, quoteItems } = await import("../drizzle/schema");
  await db.delete(quoteItems).where(sql`${quoteItems.quoteId} IN (${sql.join(ids, sql`, `)})`);
  await db.delete(quotes).where(sql`${quotes.id} IN (${sql.join(ids, sql`, `)})`);
}

export async function bulkUpdateQuotesStatus(ids: number[], status: string) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const { quotes } = await import("../drizzle/schema");
  await db.update(quotes).set({ status: status as any }).where(sql`${quotes.id} IN (${sql.join(ids, sql`, `)})`);
}

// Blog Articles
export async function getAllBlogArticles() {
  const db = await getDb();
  if (!db) return [];
  const { blogArticles } = await import("../drizzle/schema");
  return await db.select().from(blogArticles).orderBy(desc(blogArticles.publishedAt));
}

export async function getPublishedBlogArticles() {
  const db = await getDb();
  if (!db) return [];
  const { blogArticles } = await import("../drizzle/schema");
  return await db.select().from(blogArticles)
    .where(eq(blogArticles.status, "published"))
    .orderBy(desc(blogArticles.publishedAt));
}

export async function getBlogArticleById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { blogArticles } = await import("../drizzle/schema");
  const result = await db.select().from(blogArticles).where(eq(blogArticles.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getBlogArticleBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { blogArticles } = await import("../drizzle/schema");
  const result = await db.select().from(blogArticles).where(eq(blogArticles.slug, slug)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createBlogArticle(article: any) {
  const db = await getDb();
  if (!db) return undefined;
  const { blogArticles } = await import("../drizzle/schema");
  await db.insert(blogArticles).values(article);
  return article;
}

export async function updateBlogArticle(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { blogArticles } = await import("../drizzle/schema");
  await db.update(blogArticles).set(data).where(eq(blogArticles.id, id));
}

export async function deleteBlogArticle(id: number) {
  const db = await getDb();
  if (!db) return;
  const { blogArticles } = await import("../drizzle/schema");
  await db.delete(blogArticles).where(eq(blogArticles.id, id));
}

// Testimonials
export async function getAllTestimonials() {
  const db = await getDb();
  if (!db) return [];
  const { testimonials } = await import("../drizzle/schema");
  return await db.select().from(testimonials).orderBy(desc(testimonials.createdAt));
}

export async function getApprovedTestimonials() {
  const db = await getDb();
  if (!db) return [];
  const { testimonials } = await import("../drizzle/schema");
  return await db.select().from(testimonials)
    .where(eq(testimonials.approved, 1))
    .orderBy(desc(testimonials.createdAt));
}

export async function createTestimonial(testimonial: any) {
  const db = await getDb();
  if (!db) return;
  const { testimonials } = await import("../drizzle/schema");
  await db.insert(testimonials).values(testimonial);
}

export async function updateTestimonial(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { testimonials } = await import("../drizzle/schema");
  await db.update(testimonials).set(data).where(eq(testimonials.id, id));
}

export async function deleteTestimonial(id: number) {
  const db = await getDb();
  if (!db) return;
  const { testimonials } = await import("../drizzle/schema");
  await db.delete(testimonials).where(eq(testimonials.id, id));
}

// FAQs
export async function getAllFaqs() {
  const db = await getDb();
  if (!db) return [];
  const { faqs } = await import("../drizzle/schema");
  return await db.select().from(faqs).orderBy(asc(faqs.displayOrder));
}

export async function getActiveFaqs() {
  const db = await getDb();
  if (!db) return [];
  const { faqs } = await import("../drizzle/schema");
  return await db.select().from(faqs)
    .where(eq(faqs.active, 1))
    .orderBy(asc(faqs.displayOrder));
}

export async function createFaq(faq: any) {
  const db = await getDb();
  if (!db) return;
  const { faqs } = await import("../drizzle/schema");
  await db.insert(faqs).values(faq);
}

export async function updateFaq(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { faqs } = await import("../drizzle/schema");
  await db.update(faqs).set(data).where(eq(faqs.id, id));
}

export async function deleteFaq(id: number) {
  const db = await getDb();
  if (!db) return;
  const { faqs } = await import("../drizzle/schema");
  await db.delete(faqs).where(eq(faqs.id, id));
}

// Site Settings
export async function getSiteSettings() {
  const db = await getDb();
  if (!db) return {};
  try {
    const { siteSettings } = await import("../drizzle/schema");
    const settings = await db.select().from(siteSettings);
    return settings.reduce((acc: any, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
  } catch (error) {
    console.warn("[Database] Error fetching site settings, might not exist yet:", error);
    return {};
  }
}

export async function updateSiteSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) return;
  try {
    const { siteSettings } = await import("../drizzle/schema");

    const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(siteSettings).set({ value, updatedAt: new Date() }).where(eq(siteSettings.key, key));
    } else {
      await db.insert(siteSettings).values({ key, value });
    }
  } catch (error) {
    console.error(`[Database] Error updating site setting ${key}:`, error);
  }
}

// Galería
export async function getAllGalleryImages() {
  const db = await getDb();
  if (!db) return [];
  const { galleryImages } = await import("../drizzle/schema");
  return await db.select().from(galleryImages).orderBy(asc(galleryImages.displayOrder));
}

export async function getActiveGalleryImages() {
  const db = await getDb();
  if (!db) return [];
  const { galleryImages } = await import("../drizzle/schema");
  return await db.select().from(galleryImages)
    .where(eq(galleryImages.active, 1))
    .orderBy(asc(galleryImages.displayOrder));
}

export async function createGalleryImage(image: any) {
  const db = await getDb();
  if (!db) return;
  const { galleryImages } = await import("../drizzle/schema");
  await db.insert(galleryImages).values(image);
}

export async function updateGalleryImage(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { galleryImages } = await import("../drizzle/schema");
  await db.update(galleryImages).set(data).where(eq(galleryImages.id, id));
}

export async function deleteGalleryImage(id: number) {
  const db = await getDb();
  if (!db) return;
  const { galleryImages } = await import("../drizzle/schema");
  await db.delete(galleryImages).where(eq(galleryImages.id, id));
}


// ============================================
// SISTEMA DE TRADUCCIONES
// ============================================

export async function getTranslation(contentKey: string, language: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { contentTranslations } = await import("../drizzle/schema");
  const result = await db.select().from(contentTranslations)
    .where(and(
      eq(contentTranslations.contentKey, contentKey),
      eq(contentTranslations.language, language)
    ))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllTranslations() {
  const db = await getDb();
  if (!db) return [];
  const { contentTranslations } = await import("../drizzle/schema");
  return await db.select().from(contentTranslations).orderBy(desc(contentTranslations.createdAt));
}

export async function createOrUpdateTranslation(data: {
  contentKey: string;
  language: string;
  originalContent: string;
  translatedContent: string;
  contentHash?: string;
}) {
  const db = await getDb();
  if (!db) return;
  const { contentTranslations } = await import("../drizzle/schema");

  const existing = await db.select().from(contentTranslations)
    .where(and(
      eq(contentTranslations.contentKey, data.contentKey),
      eq(contentTranslations.language, data.language)
    ))
    .limit(1);

  // Generar hash si no se proporciona
  const contentHash = data.contentHash || Buffer.from(data.originalContent).toString('base64').slice(0, 64);

  if (existing.length > 0) {
    await db.update(contentTranslations)
      .set({
        originalContent: data.originalContent,
        translatedContent: data.translatedContent,
        contentHash: contentHash,
        updatedAt: new Date(),
      })
      .where(eq(contentTranslations.id, existing[0].id));
  } else {
    await db.insert(contentTranslations).values({
      ...data,
      contentHash: contentHash,
    });
  }
}

export async function updateTranslationContent(id: number, translatedContent: string, reviewedBy?: number) {
  const db = await getDb();
  if (!db) return;
  const { contentTranslations } = await import("../drizzle/schema");
  await db.update(contentTranslations)
    .set({
      translatedContent,
      isReviewed: 1,
      reviewedBy: reviewedBy || null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contentTranslations.id, id));
}

export async function deleteTranslation(id: number) {
  const db = await getDb();
  if (!db) return;
  const { contentTranslations } = await import("../drizzle/schema");
  await db.delete(contentTranslations).where(eq(contentTranslations.id, id));
}


// Gift Card Transactions
export async function redeemGiftCard(code: string, amount: number, usedBy?: string) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };
  const { giftCards, giftCardTransactions } = await import("../drizzle/schema");

  const card = await db.select().from(giftCards).where(eq(giftCards.code, code)).limit(1);
  if (card.length === 0) {
    return { success: false, error: "Gift card not found" };
  }

  const giftCard = card[0];
  if (giftCard.status !== 'active') {
    return { success: false, error: "Gift card is not active" };
  }

  if (giftCard.balance < amount) {
    return { success: false, error: "Insufficient balance" };
  }

  const newBalance = giftCard.balance - amount;
  const newStatus = newBalance === 0 ? 'redeemed' : 'active';

  await db.update(giftCards)
    .set({ balance: newBalance, status: newStatus as any })
    .where(eq(giftCards.id, giftCard.id));

  await db.insert(giftCardTransactions).values({
    giftCardId: giftCard.id,
    transactionType: 'redemption',
    amount: -amount,
    balanceBefore: giftCard.balance,
    balanceAfter: newBalance,
    notes: usedBy ? `Canjeado por ${usedBy}` : 'Canje de Gift Card',
  });

  return { success: true, newBalance };
}

export async function createGiftCardTransaction(transaction: any) {
  const db = await getDb();
  if (!db) return;
  const { giftCardTransactions } = await import("../drizzle/schema");
  await db.insert(giftCardTransactions).values(transaction);
}

export async function getGiftCardTransactions(giftCardId: number) {
  const db = await getDb();
  if (!db) return [];
  const { giftCardTransactions } = await import("../drizzle/schema");
  return await db.select().from(giftCardTransactions)
    .where(eq(giftCardTransactions.giftCardId, giftCardId))
    .orderBy(desc(giftCardTransactions.createdAt));
}

// Función para verificar si una traducción necesita actualización
export async function needsRetranslation(contentKey: string, language: string, currentHash: string) {
  const db = await getDb();
  if (!db) return true;
  const { contentTranslations } = await import("../drizzle/schema");

  const existing = await db.select().from(contentTranslations)
    .where(and(
      eq(contentTranslations.contentKey, contentKey),
      eq(contentTranslations.language, language)
    ))
    .limit(1);

  if (existing.length === 0) return true;
  return existing[0].contentHash !== currentHash;
}

// ============================================
// MARKETING ROI & INVESTMENTS
// ============================================

export async function getAllMarketingInvestments() {
  const db = await getDb();
  if (!db) return [];
  const { marketingInvestments } = await import("../drizzle/schema");
  return await db.select().from(marketingInvestments).orderBy(desc(marketingInvestments.startDate));
}

export async function createMarketingInvestment(investment: any) {
  const db = await getDb();
  if (!db) return;
  const { marketingInvestments } = await import("../drizzle/schema");
  await db.insert(marketingInvestments).values(investment);
}

export async function updateMarketingInvestment(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  const { marketingInvestments } = await import("../drizzle/schema");
  await db.update(marketingInvestments).set(data).where(eq(marketingInvestments.id, id));
}

export async function deleteMarketingInvestment(id: number) {
  const db = await getDb();
  if (!db) return;
  const { marketingInvestments } = await import("../drizzle/schema");
  await db.delete(marketingInvestments).where(eq(marketingInvestments.id, id));
}

/**
 * Reporte de ROI de Marketing
 * Cruza inversiones con ventas provenientes de bookings
 */
export async function getMarketingROIReport(params: { startDate: Date; endDate: Date }) {
  const db = await getDb();
  if (!db) return { channels: [], totals: { investment: 0, revenue: 0, roi: 0 }, comparison: { investment: 0, revenue: 0, roi: 0 } };

  const { marketingInvestments, bookings } = await import("../drizzle/schema");

  // Calcular periodo anterior (mismo rando de días inmediatamente antes)
  const rangeMs = params.endDate.getTime() - params.startDate.getTime();
  const prevEndDate = new Date(params.startDate.getTime() - 1);
  const prevStartDate = new Date(prevEndDate.getTime() - rangeMs);

  const fetchPeriodData = async (start: Date, end: Date) => {
    // 1. Obtener inversiones
    const investments = await db.select()
      .from(marketingInvestments)
      .where(and(
        gte(marketingInvestments.startDate, start),
        sql`${marketingInvestments.endDate} <= ${end}`
      ));

    // 2. Obtener ventas
    const sales = await db.select()
      .from(bookings)
      .where(and(
        or(eq(bookings.status, 'confirmed'), eq(bookings.status, 'pending')),
        gte(bookings.createdAt, start),
        sql`${bookings.createdAt} <= ${end}`
      ));

    // 3. Agrupar por canal
    const reportByChannel: Record<string, { investment: number, revenue: number, count: number }> = {};
    const channels = ["seo", "facebook_organic", "instagram_organic", "tiktok_organic", "facebook_ads", "instagram_ads", "google_ads", "tiktok_ads", "other"];
    channels.forEach(ch => { reportByChannel[ch] = { investment: 0, revenue: 0, count: 0 }; });

    investments.forEach(inv => {
      if (reportByChannel[inv.channel]) reportByChannel[inv.channel].investment += inv.amount;
    });

    sales.forEach(sale => {
      let channel = "other";
      const source = (sale.utmSource || "").toLowerCase();
      const medium = (sale.utmMedium || "").toLowerCase();

      if (source.includes("google") && (medium.includes("cpc") || medium.includes("ads"))) channel = "google_ads";
      else if (source.includes("google")) channel = "seo";
      else if (source.includes("facebook") && (medium.includes("cpc") || medium.includes("ads"))) channel = "facebook_ads";
      else if (source.includes("facebook")) channel = "facebook_organic";
      else if (source.includes("instagram") && (medium.includes("cpc") || medium.includes("ads"))) channel = "instagram_ads";
      else if (source.includes("instagram")) channel = "instagram_organic";
      else if (source.includes("tiktok") && (medium.includes("cpc") || medium.includes("ads"))) channel = "tiktok_ads";
      else if (source.includes("tiktok")) channel = "tiktok_organic";

      if (reportByChannel[channel]) {
        reportByChannel[channel].revenue += sale.amount;
        reportByChannel[channel].count += 1;
      }
    });

    const totals = { investment: 0, revenue: 0, roi: 0 };
    const channelsList = Object.entries(reportByChannel).map(([name, data]) => {
      const roi = data.investment > 0 ? (data.revenue - data.investment) / data.investment : 0;
      totals.investment += data.investment;
      totals.revenue += data.revenue;
      return { name, ...data, roi };
    });

    totals.roi = totals.investment > 0 ? (totals.revenue - totals.investment) / totals.investment : 0;
    return { channels: channelsList, totals };
  };

  const current = await fetchPeriodData(params.startDate, params.endDate);
  const previous = await fetchPeriodData(prevStartDate, prevEndDate);

  return {
    ...current,
    comparison: previous.totals
  };
}


// ============================================
// DEALS (NEGOCIOS) - Sistema de Cotizaciones B2B
// ============================================

export async function getAllDeals() {
  const db = await getDb();
  if (!db) return [];
  const { deals } = await import("../drizzle/schema");
  return await db.select().from(deals).orderBy(desc(deals.createdAt));
}

export async function getDealById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { deals } = await import("../drizzle/schema");
  const result = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getDealByName(name: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { deals } = await import("../drizzle/schema");
  const result = await db.select().from(deals).where(eq(deals.name, name)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function searchDeals(query: string) {
  const db = await getDb();
  if (!db) return [];
  const { deals } = await import("../drizzle/schema");
  return await db.select().from(deals)
    .where(like(deals.name, `%${query}%`))
    .orderBy(desc(deals.createdAt))
    .limit(20);
}

export async function createDeal(deal: {
  name: string;
  pipeline?: string;
  stage?: string;
  value?: number;
  closeDate?: string;
  ownerId?: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const { deals } = await import("../drizzle/schema");
  
  const result = await db.insert(deals).values({
    name: deal.name,
    pipeline: deal.pipeline || "jornada_autocuidado",
    stage: (deal.stage as any) || "nuevo",
    value: deal.value || 0,
    closeDate: deal.closeDate ? new Date(deal.closeDate) : null,
    ownerId: deal.ownerId,
    notes: deal.notes,
  });
  
  // Obtener el deal recién creado
  const inserted = await db.select().from(deals)
    .orderBy(desc(deals.id))
    .limit(1);
  return inserted.length > 0 ? inserted[0] : undefined;
}

export async function updateDeal(id: number, data: {
  name?: string;
  pipeline?: string;
  stage?: string;
  value?: number;
  closeDate?: string;
  ownerId?: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return;
  const { deals } = await import("../drizzle/schema");
  await db.update(deals).set(data as any).where(eq(deals.id, id));
}

export async function updateDealStage(id: number, stage: string) {
  const db = await getDb();
  if (!db) return;
  const { deals } = await import("../drizzle/schema");
  await db.update(deals).set({ stage: stage as any }).where(eq(deals.id, id));
}

export async function deleteDeal(id: number) {
  const db = await getDb();
  if (!db) return;
  const { deals } = await import("../drizzle/schema");
  await db.delete(deals).where(eq(deals.id, id));
}

export async function getDealsWithQuoteCount() {
  const db = await getDb();
  if (!db) return [];
  const { deals, quotes } = await import("../drizzle/schema");
  
  const result = await db.select({
    deal: deals,
    quoteCount: sql<number>`COUNT(${quotes.id})`,
    totalValue: sql<number>`COALESCE(SUM(${quotes.total}), 0)`,
  })
  .from(deals)
  .leftJoin(quotes, eq(deals.id, quotes.dealId))
  .groupBy(deals.id)
  .orderBy(desc(deals.createdAt));
  
  return result;
}

// Obtener cotizaciones por deal
export async function getQuotesByDealId(dealId: number) {
  const db = await getDb();
  if (!db) return [];
  const { quotes } = await import("../drizzle/schema");
  return await db.select().from(quotes)
    .where(eq(quotes.dealId, dealId))
    .orderBy(desc(quotes.createdAt));
}

// Buscar clientes corporativos
export async function searchCorporateClients(query: string) {
  const db = await getDb();
  if (!db) return [];
  const { corporateClients } = await import("../drizzle/schema");
  return await db.select().from(corporateClients)
    .where(
      or(
        like(corporateClients.companyName, `%${query}%`),
        like(corporateClients.contactName, `%${query}%`),
        like(corporateClients.contactEmail, `%${query}%`)
      )
    )
    .orderBy(desc(corporateClients.createdAt))
    .limit(20);
}

// Obtener cotización con items ordenados
export async function getQuoteWithItems(quoteId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { quotes, quoteItems } = await import("../drizzle/schema");
  
  const quote = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  if (quote.length === 0) return undefined;
  
  const items = await db.select().from(quoteItems)
    .where(eq(quoteItems.quoteId, quoteId))
    .orderBy(asc(quoteItems.sortOrder));
  
  return {
    ...quote[0],
    items,
  };
}

// Actualizar items de cotización (reemplaza todos los items)
export async function updateQuoteItems(quoteId: number, items: Array<{
  productId?: number;
  productName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountType?: string;
  discountValue?: number;
  total: number;
  sortOrder: number;
  scheduleTime?: string;
}>) {
  const db = await getDb();
  if (!db) return;
  const { quoteItems } = await import("../drizzle/schema");
  
  // Eliminar items existentes
  await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  
  // Insertar nuevos items
  if (items.length > 0) {
    await db.insert(quoteItems).values(
      items.map(item => ({
        quoteId,
        productId: item.productId || null,
        productName: item.productName,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: (item.discountType as any) || "percentage",
        discountValue: item.discountValue || 0,
        discountPercent: (item as any).discountPercent ?? item.discountValue ?? 0,
        subtotal: (item as any).subtotal ?? (item.quantity * item.unitPrice),
        total: item.total,
        sortOrder: item.sortOrder,
        scheduleTime: item.scheduleTime ? String(item.scheduleTime) : null,
      }))
    );
  }
}

// Obtener cotización por slug (para URL pública)
export async function getQuoteBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const { quotes } = await import("../drizzle/schema");
  const result = await db.select().from(quotes).where(eq(quotes.slug, slug)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Generar slug único para cotización
export async function generateQuoteSlug(): Promise<string> {
  const db = await getDb();
  if (!db) return Math.random().toString(36).substring(2, 15);
  const { quotes } = await import("../drizzle/schema");
  
  let slug: string;
  let exists = true;
  
  while (exists) {
    slug = Math.random().toString(36).substring(2, 15);
    const result = await db.select().from(quotes).where(eq(quotes.slug, slug)).limit(1);
    exists = result.length > 0;
  }
  
  return slug!;
}

// Duplicar cotización
export async function duplicateQuote(quoteId: number, newName?: string): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const { quotes, quoteItems } = await import("../drizzle/schema");
  const { generateQuoteNumber } = await import("./quoteHelpers");
  
  // Obtener cotización original
  const original = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  if (original.length === 0) return undefined;
  
  const quote = original[0];
  const newQuoteNumber = await generateQuoteNumber();
  const newSlug = await generateQuoteSlug();
  
  // Crear nueva cotización
  await db.insert(quotes).values({
    quoteNumber: newQuoteNumber,
    name: newName || `${quote.name || quote.clientCompany} (Copia)`,
    dealId: quote.dealId,
    clientId: quote.clientId,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    clientCompany: quote.clientCompany,
    clientPosition: quote.clientPosition,
    clientPhone: quote.clientPhone,
    clientWhatsapp: quote.clientWhatsapp,
    clientRut: quote.clientRut,
    clientAddress: quote.clientAddress,
    clientGiro: quote.clientGiro,
    numberOfPeople: quote.numberOfPeople,
    eventDate: quote.eventDate,
    eventDescription: quote.eventDescription,
    itinerary: quote.itinerary,
    subtotal: quote.subtotal,
    discountType: quote.discountType,
    discountValue: quote.discountValue,
    total: quote.total,
    validUntil: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    status: "draft",
    slug: newSlug,
    termsOfPurchase: quote.termsOfPurchase,
    notes: quote.notes,
    createdBy: quote.createdBy,
  });
  
  // Obtener el ID de la nueva cotización
  const newQuote = await db.select().from(quotes)
    .where(eq(quotes.quoteNumber, newQuoteNumber))
    .limit(1);
  
  if (newQuote.length === 0) return undefined;
  const newQuoteId = newQuote[0].id;
  
  // Copiar items
  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  if (items.length > 0) {
    await db.insert(quoteItems).values(
      items.map(item => ({
        quoteId: newQuoteId,
        productId: item.productId || null,
        productName: item.productName,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        discountPercent: (item as any).discountPercent ?? item.discountValue ?? 0,
        subtotal: (item as any).subtotal ?? (item.quantity * item.unitPrice),
        total: item.total,
        sortOrder: item.sortOrder,
        scheduleTime: item.scheduleTime ? String(item.scheduleTime) : null,
      }))
    );
  }
  
  return newQuoteId;
}


// ============================================
// REPORTES DE MANTENCIÓN
// ============================================

export async function getAllMaintenanceReports() {
  const db = await getDb();
  if (!db) return [];
  const { maintenanceReports, users } = await import("../drizzle/schema");
  
  const reports = await db.select({
    report: maintenanceReports,
    reportedByName: users.name,
    reportedByEmail: users.email,
  })
  .from(maintenanceReports)
  .leftJoin(users, eq(maintenanceReports.reportedById, users.id))
  .orderBy(desc(maintenanceReports.createdAt));
  
  return reports.map(r => ({
    ...r.report,
    reportedByName: r.reportedByName,
    reportedByEmail: r.reportedByEmail,
  }));
}

export async function getMaintenanceReportById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { maintenanceReports, maintenanceReportPhotos, users } = await import("../drizzle/schema");
  
  const reportResult = await db.select({
    report: maintenanceReports,
    reportedByName: users.name,
    reportedByEmail: users.email,
  })
  .from(maintenanceReports)
  .leftJoin(users, eq(maintenanceReports.reportedById, users.id))
  .where(eq(maintenanceReports.id, id))
  .limit(1);
  
  if (reportResult.length === 0) return undefined;
  
  const photos = await db.select().from(maintenanceReportPhotos)
    .where(eq(maintenanceReportPhotos.reportId, id))
    .orderBy(asc(maintenanceReportPhotos.createdAt));
  
  return {
    ...reportResult[0].report,
    reportedByName: reportResult[0].reportedByName,
    reportedByEmail: reportResult[0].reportedByEmail,
    photos,
  };
}

export async function generateMaintenanceReportNumber(): Promise<string> {
  const db = await getDb();
  if (!db) return `MR-${Date.now()}`;
  const { maintenanceReports } = await import("../drizzle/schema");
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `MR-${year}${month}${day}`;
  
  // Contar reportes del día usando formato ISO para las fechas
  const todayStart = `${year}-${month}-${day} 00:00:00`;
  const todayEnd = `${year}-${month}-${day} 23:59:59`;
  
  const count = await db.select({ count: sql<number>`COUNT(*)` })
    .from(maintenanceReports)
    .where(sql`${maintenanceReports.createdAt} >= ${todayStart} AND ${maintenanceReports.createdAt} <= ${todayEnd}`);
  
  const sequence = String((count[0]?.count || 0) + 1).padStart(3, '0');
  return `${prefix}-${sequence}`;
}

export async function createMaintenanceReport(report: {
  title: string;
  area?: string;
  equipment?: string;
  location?: string;
  status?: string;
  priority?: string;
  maintenanceType?: string;
  description?: string;
  resolution?: string;
  materialsUsed?: string;
  observations?: string;
  reportedById: number;
  assignedToId?: number;
  scheduledDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  nextMaintenanceDate?: Date;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const { maintenanceReports } = await import("../drizzle/schema");
  
  const reportNumber = await generateMaintenanceReportNumber();
  
  await db.insert(maintenanceReports).values({
    reportNumber,
    title: report.title,
    area: report.area,
    equipment: report.equipment,
    location: report.location,
    status: (report.status as any) || "pending",
    priority: (report.priority as any) || "medium",
    maintenanceType: (report.maintenanceType as any) || "corrective",
    description: report.description,
    resolution: report.resolution,
    materialsUsed: report.materialsUsed,
    observations: report.observations,
    reportedById: report.reportedById,
    assignedToId: report.assignedToId,
    scheduledDate: report.scheduledDate,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    nextMaintenanceDate: report.nextMaintenanceDate,
  });
  
  // Obtener el reporte recién creado
  const inserted = await db.select().from(maintenanceReports)
    .where(eq(maintenanceReports.reportNumber, reportNumber))
    .limit(1);
  
  return inserted.length > 0 ? inserted[0] : undefined;
}

export async function updateMaintenanceReport(id: number, data: {
  title?: string;
  area?: string;
  equipment?: string;
  location?: string;
  status?: string;
  priority?: string;
  maintenanceType?: string;
  description?: string;
  resolution?: string;
  materialsUsed?: string;
  observations?: string;
  assignedToId?: number;
  scheduledDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  nextMaintenanceDate?: Date;
}) {
  const db = await getDb();
  if (!db) return;
  const { maintenanceReports } = await import("../drizzle/schema");
  await db.update(maintenanceReports).set(data as any).where(eq(maintenanceReports.id, id));
}

export async function deleteMaintenanceReport(id: number) {
  const db = await getDb();
  if (!db) return;
  const { maintenanceReports } = await import("../drizzle/schema");
  await db.delete(maintenanceReports).where(eq(maintenanceReports.id, id));
}

// Fotos de reportes de mantención
export async function addMaintenanceReportPhoto(photo: {
  reportId: number;
  url: string;
  thumbnailUrl?: string;
  description?: string;
  photoType?: string;
  uploadedById?: number;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const { maintenanceReportPhotos } = await import("../drizzle/schema");
  
  await db.insert(maintenanceReportPhotos).values({
    reportId: photo.reportId,
    url: photo.url,
    thumbnailUrl: photo.thumbnailUrl,
    description: photo.description,
    photoType: (photo.photoType as any) || "evidence",
    uploadedById: photo.uploadedById,
  });
  
  // Obtener la foto recién creada
  const inserted = await db.select().from(maintenanceReportPhotos)
    .where(eq(maintenanceReportPhotos.reportId, photo.reportId))
    .orderBy(desc(maintenanceReportPhotos.id))
    .limit(1);
  
  return inserted.length > 0 ? inserted[0] : undefined;
}

export async function deleteMaintenanceReportPhoto(photoId: number) {
  const db = await getDb();
  if (!db) return;
  const { maintenanceReportPhotos } = await import("../drizzle/schema");
  await db.delete(maintenanceReportPhotos).where(eq(maintenanceReportPhotos.id, photoId));
}

export async function getMaintenanceReportPhotos(reportId: number) {
  const db = await getDb();
  if (!db) return [];
  const { maintenanceReportPhotos } = await import("../drizzle/schema");
  return await db.select().from(maintenanceReportPhotos)
    .where(eq(maintenanceReportPhotos.reportId, reportId))
    .orderBy(asc(maintenanceReportPhotos.createdAt));
}

// Historial de cambios de estado
export async function addMaintenanceReportHistory(entry: {
  reportId: number;
  previousStatus?: string;
  newStatus: string;
  changedById: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return;
  const { maintenanceReportHistory } = await import("../drizzle/schema");
  
  await db.insert(maintenanceReportHistory).values({
    reportId: entry.reportId,
    previousStatus: entry.previousStatus,
    newStatus: entry.newStatus,
    changedById: entry.changedById,
    notes: entry.notes,
  });
}

export async function getMaintenanceReportHistory(reportId: number) {
  const db = await getDb();
  if (!db) return [];
  const { maintenanceReportHistory, users } = await import("../drizzle/schema");
  
  const history = await db.select({
    entry: maintenanceReportHistory,
    changedByName: users.name,
  })
  .from(maintenanceReportHistory)
  .leftJoin(users, eq(maintenanceReportHistory.changedById, users.id))
  .where(eq(maintenanceReportHistory.reportId, reportId))
  .orderBy(desc(maintenanceReportHistory.createdAt));
  
  return history.map(h => ({
    ...h.entry,
    changedByName: h.changedByName,
  }));
}

// Estadísticas de mantención
export async function getMaintenanceStats() {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, inProgress: 0, completed: 0, requiresFollowUp: 0 };
  const { maintenanceReports } = await import("../drizzle/schema");
  
  const stats = await db.select({
    status: maintenanceReports.status,
    count: sql<number>`COUNT(*)`,
  })
  .from(maintenanceReports)
  .groupBy(maintenanceReports.status);
  
  const result = { total: 0, pending: 0, inProgress: 0, completed: 0, requiresFollowUp: 0 };
  stats.forEach(s => {
    const count = Number(s.count);
    result.total += count;
    if (s.status === "pending") result.pending = count;
    else if (s.status === "in_progress") result.inProgress = count;
    else if (s.status === "completed") result.completed = count;
    else if (s.status === "requires_follow_up") result.requiresFollowUp = count;
  });
  
  return result;
}
