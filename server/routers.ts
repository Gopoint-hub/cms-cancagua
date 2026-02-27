import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { generateQuoteNumber, calculateValidUntil } from "./quoteHelpers";
import { invokeLLM } from "./_core/llm";
import { conciergeRouter } from "./conciergeRouter";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  // Módulo Concierge - Sistema de ventas para afiliados
  concierge: conciergeRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    // Login con email y contraseña
    login: publicProcedure
      .input(z.object({
        email: z.string().email("Email inválido"),
        password: z.string().min(1, "La contraseña es requerida"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { loginWithEmailPassword, setSessionCookie } = await import("./_core/auth");

        try {
          const { user, token } = await loginWithEmailPassword(input.email, input.password);
          setSessionCookie(ctx.res, token);

          return {
            success: true,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
            },
          };
        } catch (error: any) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: error.message || "Credenciales inválidas",
          });
        }
      }),

    // Verificar token de invitación
    verifyInvitation: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const user = await db.getUserByInvitationToken(input.token);

        if (!user) {
          return { valid: false, error: "Token inválido" };
        }

        if (user.status !== "pending") {
          return { valid: false, error: "Esta cuenta ya ha sido activada" };
        }

        if (user.invitationExpiresAt && new Date() > user.invitationExpiresAt) {
          return { valid: false, error: "El enlace de invitación ha expirado" };
        }

        return {
          valid: true,
          user: {
            email: user.email,
            name: user.name,
            role: user.role,
          },
        };
      }),

    // Activar cuenta con contraseña
    activateAccount: publicProcedure
      .input(z.object({
        token: z.string(),
        password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
        name: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { hashPassword, validatePassword, createSessionToken, setSessionCookie } = await import("./_core/auth");
        const { sendWelcomeEmail } = await import("./_core/email");

        // Validar contraseña
        const validation = validatePassword(input.password);
        if (!validation.valid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: validation.message });
        }

        // Verificar token
        const user = await db.getUserByInvitationToken(input.token);
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
        }

        if (user.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Esta cuenta ya ha sido activada" });
        }

        if (user.invitationExpiresAt && new Date() > user.invitationExpiresAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "El enlace de invitación ha expirado" });
        }

        // Hash de la contraseña
        const passwordHash = await hashPassword(input.password);

        // Activar usuario
        await db.activateUser(user.id, passwordHash);

        // Actualizar nombre si se proporcionó
        if (input.name) {
          await db.updateUserProfile(user.id, { name: input.name });
        }

        // Enviar email de bienvenida
        await sendWelcomeEmail(user.email!, input.name || user.name || undefined);

        // Crear sesión
        const token = await createSessionToken({
          userId: user.id,
          openId: user.openId,
          email: user.email!,
          role: user.role as any,
        });
        setSessionCookie(ctx.res, token);

        return { success: true };
      }),

    // Solicitar recuperación de contraseña
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const { generateToken } = await import("./_core/auth");
        const { sendPasswordResetEmail } = await import("./_core/email");

        const user = await db.getUserByEmail(input.email);

        // Siempre retornamos success para no revelar si el email existe
        if (!user || user.status === "inactive") {
          return { success: true };
        }

        // Generar token de reset
        const resetToken = generateToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // 1 hora para resetear

        await db.setResetToken(user.id, resetToken, expiresAt);

        // Enviar email
        await sendPasswordResetEmail(input.email, resetToken, user.name || undefined);

        return { success: true };
      }),

    // Verificar token de reset
    verifyResetToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const user = await db.getUserByResetToken(input.token);

        if (!user) {
          return { valid: false, error: "Token inválido" };
        }

        if (user.resetTokenExpiresAt && new Date() > user.resetTokenExpiresAt) {
          return { valid: false, error: "El enlace ha expirado" };
        }

        return { valid: true, email: user.email };
      }),

    // Restablecer contraseña
    resetPassword: publicProcedure
      .input(z.object({
        token: z.string(),
        password: z.string().min(8),
      }))
      .mutation(async ({ ctx, input }) => {
        const { hashPassword, validatePassword, createSessionToken, setSessionCookie } = await import("./_core/auth");

        // Validar contraseña
        const validation = validatePassword(input.password);
        if (!validation.valid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: validation.message });
        }

        const user = await db.getUserByResetToken(input.token);
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Token inválido" });
        }

        if (user.resetTokenExpiresAt && new Date() > user.resetTokenExpiresAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "El enlace ha expirado" });
        }

        // Actualizar contraseña
        const passwordHash = await hashPassword(input.password);
        await db.updateUserPassword(user.id, passwordHash);

        // Crear sesión automáticamente
        const token = await createSessionToken({
          userId: user.id,
          openId: user.openId,
          email: user.email!,
          role: user.role as any,
        });
        setSessionCookie(ctx.res, token);

        return { success: true };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Menú público
  menu: router({
    getFullMenu: publicProcedure.query(async () => {
      return await db.getFullMenu();
    }),

    getCategories: publicProcedure.query(async () => {
      return await db.getActiveMenuCategories();
    }),

    getItemsByCategory: publicProcedure
      .input(z.object({ categoryId: z.number() }))
      .query(async ({ input }) => {
        return await db.getActiveMenuItemsByCategory(input.categoryId);
      }),
  }),

  // Formulario de contacto público
  contact: router({
    submit: publicProcedure
      .input(z.object({
        nombre: z.string().min(2, "El nombre es requerido"),
        email: z.string().email("Email inválido"),
        telefono: z.string().min(8, "Teléfono inválido"),
        mensaje: z.string().min(10, "El mensaje debe tener al menos 10 caracteres"),
        origen: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Importar funciones de email y WhatsApp
        const { sendContactFormEmail } = await import("./email");
        const { formatContactFormMessage, generateWhatsAppLink, WHATSAPP_INFO } = await import("./whatsapp");

        // 1. Enviar email a contacto@cancagua.cl
        const emailResult = await sendContactFormEmail(input);

        // 2. Generar mensaje y enlace de WhatsApp
        const whatsappMessage = formatContactFormMessage(input);
        const whatsappLink = generateWhatsAppLink(whatsappMessage);

        // 3. Guardar en base de datos (mensajes de contacto)
        await db.createContactMessage({
          name: input.nombre,
          email: input.email,
          phone: input.telefono,
          message: input.mensaje,
          source: input.origen || "web",
          status: "new",
        });

        return {
          success: emailResult.success,
          emailSent: emailResult.success,
          whatsappLink,
          whatsappNumber: WHATSAPP_INFO.formatted,
          message: emailResult.success
            ? "Mensaje enviado correctamente. Nos pondremos en contacto pronto."
            : "Hubo un problema al enviar el mensaje. Por favor, inténtalo de nuevo.",
        };
      }),
  }),

  // Gestión de menú (CMS - solo admin y editor)
  menuAdmin: router({
    // Categorías
    getAllCategories: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos para gestionar el menú" });
      }
      return await db.getAllMenuCategories();
    }),

    createCategory: protectedProcedure
      .input(z.object({
        name: z.string(),
        slug: z.string(),
        description: z.string().optional(),
        displayOrder: z.number().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.createMenuCategory(input);
        return { success: true };
      }),

    updateCategory: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        slug: z.string().optional(),
        description: z.string().optional(),
        displayOrder: z.number().optional(),
        active: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...data } = input;
        await db.updateMenuCategory(id, data);
        return { success: true };
      }),

    deleteCategory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores pueden eliminar categorías" });
        }
        await db.deleteMenuCategory(input.id);
        return { success: true };
      }),

    // Items
    getAllItems: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getAllMenuItems();
    }),

    getItemsByCategory: protectedProcedure
      .input(z.object({ categoryId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getMenuItemsByCategory(input.categoryId);
      }),

    createItem: protectedProcedure
      .input(z.object({
        categoryId: z.number(),
        name: z.string(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        prices: z.string(), // JSON string
        dietaryTags: z.string().optional(), // JSON string
        specialNotes: z.string().optional(),
        displayOrder: z.number().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.createMenuItem(input);
        return { success: true };
      }),

    updateItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        categoryId: z.number().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        prices: z.string().optional(),
        dietaryTags: z.string().optional(),
        specialNotes: z.string().optional(),
        displayOrder: z.number().optional(),
        active: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...data } = input;
        await db.updateMenuItem(id, data);
        return { success: true };
      }),

    deleteItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.deleteMenuItem(input.id);
        return { success: true };
      }),
  }),

  // Subida de imágenes para productos del menú
  upload: router({
    menuItemImage: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        imageData: z.string(), // base64
        mimeType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.imageData, 'base64');
        const extension = input.mimeType.split('/')[1];
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileKey = `menu-items/${input.itemId}-${randomSuffix}.${extension}`;

        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        // Actualizar el item con la nueva URL de imagen
        await db.updateMenuItem(input.itemId, { imageUrl: url });

        return { success: true, url };
      }),
  }),

  // Reservas (público)
  bookings: router({
    create: publicProcedure
      .input(z.object({
        name: z.string().min(2),
        email: z.string().email(),
        phone: z.string().min(8),
        serviceType: z.string(),
        preferredDate: z.string(), // ISO string
        numberOfPeople: z.number().min(1),
        message: z.string().optional(),
        utmSource: z.string().optional(),
        utmMedium: z.string().optional(),
        utmCampaign: z.string().optional(),
        utmTerm: z.string().optional(),
        utmContent: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const booking = {
          ...input,
          preferredDate: new Date(input.preferredDate),
        };

        const result = await db.createBooking(booking);

        // Enviar notificación al propietario
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `Nueva reserva de ${input.name}`,
          content: `Servicio: ${input.serviceType}\nFecha: ${input.preferredDate}\nPersonas: ${input.numberOfPeople}\nEmail: ${input.email}\nTeléfono: ${input.phone}${input.message ? `\nMensaje: ${input.message}` : ''}`,
        });

        return result;
      }),

    // Admin: listar todas las reservas
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getAllBookings();
    }),

    // Admin: actualizar estado
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "confirmed", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const result = await db.updateBookingStatus(input.id, input.status);
        return result;
      }),

    // Admin: eliminar reserva
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.deleteBooking(input.id);
        return { success: true };
      }),

    // Admin: eliminar múltiples reservas
    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkDeleteBookings(input.ids);
        return { success: true, count: input.ids.length };
      }),

    // Admin: actualizar estado de múltiples reservas
    bulkUpdateStatus: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()),
        status: z.enum(["pending", "confirmed", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkUpdateBookingsStatus(input.ids, input.status);
        return { success: true, count: input.ids.length };
      }),
  }),

  // Mensajes de contacto (público)
  contactMessages: router({
    send: publicProcedure
      .input(z.object({
        name: z.string().min(2),
        email: z.string().email(),
        phone: z.string().min(8, "El teléfono es obligatorio"),
        message: z.string().min(10),
      }))
      .mutation(async ({ input }) => {
        // Importar funciones de email y WhatsApp
        const { sendContactFormEmail } = await import("./email");
        const { formatContactFormMessage, generateWhatsAppLink, WHATSAPP_INFO } = await import("./whatsapp");

        // 1. Guardar en base de datos
        const result = await db.createContactMessage(input);

        // 2. Enviar email a contacto@cancagua.cl
        const emailResult = await sendContactFormEmail({
          nombre: input.name,
          email: input.email,
          telefono: input.phone,
          mensaje: input.message,
          origen: "Formulario de Contacto Web",
        });

        // 3. Generar mensaje y enlace de WhatsApp
        const whatsappMessage = formatContactFormMessage({
          nombre: input.name,
          email: input.email,
          telefono: input.phone,
          mensaje: input.message,
          origen: "Formulario de Contacto Web",
        });
        const whatsappLink = generateWhatsAppLink(whatsappMessage);

        // 4. Enviar notificación al propietario
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `Nuevo mensaje de contacto: ${input.name}`,
          content: `Nombre: ${input.name}\nEmail: ${input.email}\nTeléfono: ${input.phone}\n\nMensaje:\n${input.message}`,
        });

        return {
          success: true,
          id: (result as any)?.id,
          emailSent: emailResult.success,
          whatsappLink,
          whatsappNumber: WHATSAPP_INFO.formatted,
        };
      }),

    // Admin: listar todos los mensajes
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getAllContactMessages();
    }),

    // Admin: actualizar estado
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["new", "read", "replied"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const result = await db.updateContactMessageStatus(input.id, input.status);
        return result;
      }),

    // Admin: eliminar mensaje
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.deleteContactMessage(input.id);
        return { success: true };
      }),

    // Admin: eliminar múltiples mensajes
    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkDeleteContactMessages(input.ids);
        return { success: true, count: input.ids.length };
      }),

    // Admin: actualizar estado de múltiples mensajes
    bulkUpdateStatus: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()),
        status: z.enum(["new", "read", "replied"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkUpdateContactMessagesStatus(input.ids, input.status);
        return { success: true, count: input.ids.length };
      }),

    // Admin: reenviar mensaje a contacto@cancagua.cl
    resendToEmail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        
        // Obtener el mensaje
        const message = await db.getContactMessageById(input.id);
        if (!message) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Mensaje no encontrado" });
        }
        
        // Reenviar email
        const { sendContactFormEmail } = await import("./email");
        const emailResult = await sendContactFormEmail({
          nombre: message.name,
          email: message.email,
          telefono: message.phone || "",
          mensaje: message.message,
          origen: "Reenvío desde CMS",
        });
        
        if (!emailResult.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al enviar email" });
        }
        
        return { success: true };
      }),
  }),

  // Servicios (para selector en Concierge)
  services: router({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores pueden listar servicios" });
      }
      return await db.getAllServices();
    }),
  }),

  // Gestión de usuarios (solo admin)
  users: router({
    // Listar todos los usuarios (solo super_admin y admin)
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores pueden listar usuarios" });
      }
      return await db.getAllUsers();
    }),

    // Obtener usuarios por rol (para selector de vendedores concierge)
    getByRole: protectedProcedure
      .input(z.object({ role: z.string() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores pueden listar usuarios" });
        }
        const allUsers = await db.getAllUsers();
        return allUsers.filter(u => u.role === input.role);
      }),

    // Obtener usuario por ID
    getById: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Solo admins o el propio usuario pueden ver detalles
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin" && ctx.user.id !== input.userId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getUserById(input.userId);
      }),

    // Invitar nuevo usuario
    invite: protectedProcedure
      .input(z.object({
        email: z.string().email("Email inválido"),
        name: z.string().min(2, "El nombre es requerido"),
        role: z.enum(["super_admin", "admin", "user", "seller"]),
        allowedModules: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Solo super_admin y admin pueden invitar usuarios
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos para invitar usuarios" });
        }

        // Solo super_admin puede crear otros super_admin
        if (input.role === "super_admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Solo super administradores pueden crear otros super administradores" });
        }

        // Verificar si el email ya existe
        const existingUser = await db.getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({ code: "CONFLICT", message: "Ya existe un usuario con este email" });
        }

        // Generar token de invitación
        const { generateToken, generateOpenId } = await import("./_core/auth");
        const invitationToken = generateToken();
        const openId = generateOpenId();

        // Crear usuario con estado pendiente
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 días para activar

        const newUser = await db.createUser({
          openId,
          email: input.email,
          name: input.name,
          role: input.role,
          status: "pending",
          invitationToken,
          invitationExpiresAt: expiresAt,
          invitedBy: ctx.user.id || undefined,
          allowedModules: input.allowedModules ? JSON.stringify(input.allowedModules) : undefined,
        });

        // Enviar email de invitación
        const { sendInvitationEmail } = await import("./_core/email");
        const emailResult = await sendInvitationEmail(
          input.email,
          invitationToken,
          ctx.user.name || ctx.user.email || "Administrador",
          input.role
        );

        if (!emailResult.success) {
          console.error("[Users] Failed to send invitation email:", emailResult.error);
          // No fallamos la operación, el usuario puede reenviar la invitación
        }

        return { success: true, user: newUser, emailSent: emailResult.success };
      }),

    // Reenviar invitación
    resendInvitation: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const targetUser = await db.getUserById(input.userId);
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado" });
        }

        if (targetUser.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "El usuario ya ha activado su cuenta" });
        }

        // Generar nuevo token
        const { generateToken } = await import("./_core/auth");
        const invitationToken = generateToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Actualizar token en BD (usando update directo)
        const dbInstance = await db.getDb();
        if (dbInstance) {
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          await dbInstance.update(users).set({
            invitationToken,
            invitationExpiresAt: expiresAt,
          }).where(eq(users.id, input.userId));
        }

        // Enviar email
        const { sendInvitationEmail } = await import("./_core/email");
        const emailResult = await sendInvitationEmail(
          targetUser.email!,
          invitationToken,
          ctx.user.name || ctx.user.email || "Administrador",
          targetUser.role
        );

        return { success: emailResult.success };
      }),

    // Actualizar rol de usuario
    updateRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["super_admin", "admin", "user", "seller"])
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores pueden cambiar roles" });
        }

        const targetUser = await db.getUserById(input.userId);
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado" });
        }

        // Solo super_admin puede modificar otros super_admin
        if (targetUser.role === "super_admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "No puedes modificar a un super administrador" });
        }

        // Solo super_admin puede asignar rol super_admin
        if (input.role === "super_admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Solo super administradores pueden asignar ese rol" });
        }

        const success = await db.updateUserRole(input.userId, input.role);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al actualizar rol" });
        }
        return { success: true };
      }),

    // Actualizar módulos permitidos
    updateModules: protectedProcedure
      .input(z.object({
        userId: z.number(),
        allowedModules: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const targetUser = await db.getUserById(input.userId);
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        if (targetUser.role === "super_admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const success = await db.updateUserModules(input.userId, input.allowedModules);
        return { success };
      }),

    // Actualizar estado de usuario
    updateStatus: protectedProcedure
      .input(z.object({
        userId: z.number(),
        status: z.enum(["active", "inactive"])
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const targetUser = await db.getUserById(input.userId);
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // No permitir desactivar super_admin si no eres super_admin
        if (targetUser.role === "super_admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "No puedes desactivar a un super administrador" });
        }

        // No permitir desactivarse a sí mismo
        if (ctx.user.id === input.userId && input.status === "inactive") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes desactivar tu propia cuenta" });
        }

        const success = await db.updateUserStatus(input.userId, input.status);
        return { success };
      }),

    // Eliminar usuario
    delete: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores pueden eliminar usuarios" });
        }

        const targetUser = await db.getUserById(input.userId);
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // No permitir eliminar super_admin si no eres super_admin
        if (targetUser.role === "super_admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "No puedes eliminar a un super administrador" });
        }

        // No permitir que el usuario se elimine a sí mismo
        if (ctx.user.id === input.userId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes eliminar tu propio usuario" });
        }

        const success = await db.deleteUser(input.userId);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al eliminar usuario" });
        }
        return { success: true };
      }),

    // Cambiar contraseña (usuario autenticado)
    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { verifyPassword, hashPassword, validatePassword } = await import("./_core/auth");

        // Validar nueva contraseña
        const validation = validatePassword(input.newPassword);
        if (!validation.valid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: validation.message });
        }

        // Verificar contraseña actual
        if (!ctx.user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Tu cuenta no tiene contraseña configurada" });
        }

        const isValid = await verifyPassword(input.currentPassword, ctx.user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Contraseña actual incorrecta" });
        }

        // Actualizar contraseña
        const newHash = await hashPassword(input.newPassword);
        const success = await db.updateUserPassword(ctx.user.id, newHash);

        return { success };
      }),

    // Actualizar perfil propio
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().min(2).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.updateUserProfile(ctx.user.id, input);
        return { success };
      }),
  }),

  // Productos corporativos (CMS - solo admin y editor)
  corporateProducts: router({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos para gestionar productos corporativos" });
      }
      return await db.getAllCorporateProducts();
    }),

    getActive: publicProcedure.query(async () => {
      return await db.getActiveCorporateProducts();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getCorporateProductById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        category: z.string(),
        priceType: z.enum(["per_person", "flat"]),
        unitPrice: z.number(),
        duration: z.number().optional(),
        maxCapacity: z.number().optional(),
        includes: z.string().optional(),
        active: z.number().default(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.createCorporateProduct(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        priceType: z.enum(["per_person", "flat"]).optional(),
        unitPrice: z.number().optional(),
        duration: z.number().optional(),
        maxCapacity: z.number().optional(),
        includes: z.string().optional(),
        active: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...data } = input;
        return await db.updateCorporateProduct(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.deleteCorporateProduct(input.id);
      }),

    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const results = await Promise.all(
          input.ids.map(id => db.deleteCorporateProduct(id))
        );
        return { success: true, deleted: results.filter(r => r).length };
      }),

    bulkDuplicate: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const products = await Promise.all(
          input.ids.map(id => db.getCorporateProductById(id))
        );
        const duplicated = await Promise.all(
          products.filter((p): p is NonNullable<typeof p> => p !== null && p !== undefined).map(product =>
            db.createCorporateProduct({
              name: `${product.name} (Copia)`,
              description: product.description || undefined,
              category: product.category,
              priceType: product.priceType as "per_person" | "flat",
              unitPrice: product.unitPrice,
              duration: product.duration || undefined,
              maxCapacity: product.maxCapacity || undefined,
              includes: product.includes || undefined,
              active: 1,
            })
          )
        );
        return { success: true, duplicated: duplicated.length };
      }),

    importFromCSV: protectedProcedure
      .input(z.object({
        products: z.array(z.object({
          name: z.string(),
          description: z.string().optional(),
          category: z.string(),
          priceType: z.enum(["per_person", "flat"]),
          unitPrice: z.number(),
          duration: z.number().optional(),
          maxCapacity: z.number().optional(),
          includes: z.string().optional(),
          active: z.number().default(1),
        }))
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const results = await Promise.all(
          input.products.map(product => db.createCorporateProduct(product))
        );
        return { success: true, imported: results.filter(r => r).length };
      }),
  }),

  // Clientes corporativos (CMS - solo admin y editor)
  corporateClients: router({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getAllCorporateClients();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getCorporateClientById(input.id);
      }),

    getByEmail: protectedProcedure
      .input(z.object({ email: z.string() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getCorporateClientByEmail(input.email);
      }),

    create: protectedProcedure
      .input(z.object({
        companyName: z.string(),
        contactName: z.string(),
        contactPosition: z.string().optional(),
        contactEmail: z.string().email(),
        contactPhone: z.string().optional(),
        contactWhatsapp: z.string().optional(),
        rut: z.string().optional(),
        giro: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        country: z.string().default("Chile"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.createCorporateClient(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        companyName: z.string().optional(),
        contactName: z.string().optional(),
        contactPosition: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        contactWhatsapp: z.string().optional(),
        rut: z.string().optional(),
        giro: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...data } = input;
        return await db.updateCorporateClient(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.deleteCorporateClient(input.id);
      }),
  }),

  // Cotizaciones (CMS - solo admin y editor)
  quotes: router({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getAllQuotes();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getQuoteById(input.id);
      }),

    getItems: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getQuoteItems(input.quoteId);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        dealId: z.number().optional(),
        clientId: z.number().optional(),
        clientName: z.string(),
        clientEmail: z.string().email(),
        clientCompany: z.string().optional(),
        clientPosition: z.string().optional(),
        clientPhone: z.string().optional(),
        clientWhatsapp: z.string().optional(),
        clientRut: z.string().optional(),
        clientAddress: z.string().optional(),
        clientGiro: z.string().optional(),
        numberOfPeople: z.number(),
        eventDate: z.string().optional(),
        eventDescription: z.string().optional(),
        itinerary: z.string().optional(),
        subtotal: z.number(),
        total: z.number(),
        validUntil: z.string(),
        status: z.enum(["draft", "sent", "approved", "event_completed", "paid", "invoiced"]).default("draft"),
        notes: z.string().optional(),
        termsOfPurchase: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          productName: z.string(),
          description: z.string().optional(),
          quantity: z.number(),
          unitPrice: z.number(),
          discountType: z.enum(["percentage", "fixed"]).optional(),
          discountValue: z.number().optional(),
          total: z.number(),
          sortOrder: z.number().default(0),
          scheduleTime: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { items, ...quoteData } = input;

        // Generar número de cotización automáticamente
        const quoteNumber = await generateQuoteNumber();

        // Crear cotización
        const quoteResult = await db.createQuote({
          ...quoteData,
          quoteNumber,
          createdBy: ctx.user.id,
        });

        if (!quoteResult.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al crear cotización" });
        }

        // Obtener la cotización recién creada para obtener su ID
        const quote = await db.getQuoteByNumber(quoteNumber);
        if (!quote) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al recuperar cotización" });
        }

        // Crear items de cotización
        for (const item of items) {
          await db.createQuoteItem({
            ...item,
            quoteId: quote.id,
          });
        }

        return { success: true, quoteId: quote.id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        dealId: z.number().optional(),
        clientId: z.number().optional(),
        clientName: z.string().optional(),
        clientEmail: z.string().email().optional(),
        clientCompany: z.string().optional(),
        clientPosition: z.string().optional(),
        clientPhone: z.string().optional(),
        clientWhatsapp: z.string().optional(),
        clientRut: z.string().optional(),
        clientAddress: z.string().optional(),
        clientGiro: z.string().optional(),
        numberOfPeople: z.number().optional(),
        eventDate: z.string().optional(),
        eventDescription: z.string().optional(),
        itinerary: z.string().optional(),
        subtotal: z.number().optional(),
        total: z.number().optional(),
        validUntil: z.string().optional(),
        status: z.enum(["draft", "sent", "approved", "event_completed", "paid", "invoiced"]).optional(),
        notes: z.string().optional(),
        termsOfPurchase: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          productName: z.string(),
          description: z.string().optional(),
          quantity: z.number(),
          unitPrice: z.number(),
          discountType: z.enum(["percentage", "fixed"]).optional(),
          discountValue: z.number().optional(),
          total: z.number(),
          sortOrder: z.number().default(0),
          scheduleTime: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { id, items, ...quoteData } = input;

        // Actualizar cotización
        await db.updateQuote(id, quoteData);

        // Si se proporcionan items, reemplazar todos
        if (items) {
          await db.deleteQuoteItems(id);
          for (const item of items) {
            await db.createQuoteItem({
              ...item,
              quoteId: id,
            });
          }
        }

        return { success: true };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "sent", "approved", "event_completed", "paid", "invoiced"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.updateQuoteStatus(input.id, input.status);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.deleteQuote(input.id);
      }),

    // Bulk actions
    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkDeleteQuotes(input.ids);
        return { success: true, count: input.ids.length };
      }),

    bulkUpdateStatus: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()),
        status: z.enum(["draft", "sent", "approved", "event_completed", "paid", "invoiced"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkUpdateQuotesStatus(input.ids, input.status);
        return { success: true, count: input.ids.length };
      }),

    bulkDuplicate: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const duplicatedIds: number[] = [];

        for (const id of input.ids) {
          // Obtener cotización original
          const original = await db.getQuoteById(id);
          if (!original) continue;

          const items = await db.getQuoteItems(id);

          // Generar nuevo número de cotización
          const quoteNumber = await generateQuoteNumber();

          // Crear cotización duplicada
          const result = await db.createQuote({
            quoteNumber,
            clientId: original.clientId,
            clientName: original.clientName,
            clientEmail: original.clientEmail,
            clientCompany: original.clientCompany,
            clientPosition: original.clientPosition,
            clientPhone: original.clientPhone,
            clientRut: original.clientRut,
            clientAddress: original.clientAddress,
            clientGiro: original.clientGiro,
            numberOfPeople: original.numberOfPeople,
            eventDate: original.eventDate,
            eventDescription: original.eventDescription,
            itinerary: original.itinerary,
            subtotal: original.subtotal,
            total: original.total,
            validUntil: calculateValidUntil(),
            status: "draft",
            notes: original.notes,
            createdBy: ctx.user.id,
          });

          if (result.success) {
            const newQuote = await db.getQuoteByNumber(quoteNumber);
            if (newQuote) {
              // Duplicar items
              for (const item of items) {
                await db.createQuoteItem({
                  quoteId: newQuote.id,
                  productId: item.productId,
                  productName: item.productName,
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  total: item.total,
                  sortOrder: item.sortOrder,
                });
              }
              duplicatedIds.push(newQuote.id);
            }
          }
        }

        return { success: true, count: duplicatedIds.length, ids: duplicatedIds };
      }),

    generatePDF: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { generateQuotePDF } = await import("./pdfGenerator");

        // Obtener cotización y sus items
        const quote = await db.getQuoteById(input.id);
        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cotización no encontrada" });
        }

        const items = await db.getQuoteItems(input.id);

        // Calcular IVA (19%)
        const subtotal = quote.subtotal || 0;
        const tax = Math.round(subtotal * 0.19);

        // Preparar datos para el PDF
        const pdfData = {
          quoteNumber: quote.quoteNumber || `COT-${quote.id}`,
          date: new Date(quote.createdAt).toLocaleDateString("es-CL"),
          clientName: quote.clientName,
          clientEmail: quote.clientEmail,
          clientCompany: quote.clientCompany || "",
          clientPosition: quote.clientPosition || undefined,
          clientPhone: quote.clientPhone || undefined,
          clientRut: quote.clientRut || undefined,
          clientAddress: quote.clientAddress || undefined,
          clientGiro: quote.clientGiro || undefined,
          numberOfPeople: quote.numberOfPeople,
          eventDescription: quote.eventDescription || undefined,
          itinerary: quote.itinerary || undefined,
          items: items.map((item: any) => ({
            productName: item.productName,
            description: item.description || "",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          })),
          subtotal,
          tax,
          total: quote.total || 0,
          validUntil: quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("es-CL") : undefined,
        };

        // Generar PDF
        const pdfBuffer = await generateQuotePDF(pdfData);

        // Convertir a base64 para enviar al cliente
        return {
          pdf: pdfBuffer.toString("base64"),
          filename: `Cotizacion_${pdfData.quoteNumber}.pdf`,
        };
      }),

    sendByEmail: protectedProcedure
      .input(z.object({
        id: z.number(),
        customMessage: z.string().optional(),
        additionalEmails: z.array(z.string().email()).optional(), // Emails adicionales para enviar
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { generateQuotePDF } = await import("./pdfGenerator");
        const { sendQuoteEmail } = await import("./email");

        // Obtener cotización y sus items
        const quote = await db.getQuoteById(input.id);
        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cotización no encontrada" });
        }

        const items = await db.getQuoteItems(input.id);

        // Calcular IVA (19%)
        const subtotal = quote.subtotal || 0;
        const tax = Math.round(subtotal * 0.19);

        // Preparar datos para el PDF
        const pdfData = {
          quoteNumber: quote.quoteNumber || `COT-${quote.id}`,
          date: new Date(quote.createdAt).toLocaleDateString("es-CL"),
          clientName: quote.clientName,
          clientEmail: quote.clientEmail,
          clientCompany: quote.clientCompany || "",
          clientPosition: quote.clientPosition || undefined,
          clientPhone: quote.clientPhone || undefined,
          clientRut: quote.clientRut || undefined,
          clientAddress: quote.clientAddress || undefined,
          clientGiro: quote.clientGiro || undefined,
          numberOfPeople: quote.numberOfPeople,
          eventDescription: quote.eventDescription || undefined,
          itinerary: quote.itinerary || undefined,
          items: items.map((item: any) => ({
            productName: item.productName,
            description: item.description || "",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          })),
          subtotal,
          tax,
          total: quote.total || 0,
          validUntil: quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("es-CL") : undefined,
        };

        // Generar PDF
        const pdfBuffer = await generateQuotePDF(pdfData);

        // Combinar email del cliente con emails adicionales
        const allRecipients = [quote.clientEmail];
        if (input.additionalEmails && input.additionalEmails.length > 0) {
          input.additionalEmails.forEach(email => {
            if (!allRecipients.includes(email)) {
              allRecipients.push(email);
            }
          });
        }

        // Enviar email con PDF adjunto a todos los destinatarios
        const result = await sendQuoteEmail({
          to: allRecipients.join(", "),
          clientName: quote.clientName,
          quoteNumber: pdfData.quoteNumber,
          pdfBuffer,
          customMessage: input.customMessage,
        });

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Error al enviar email" });
        }

        // Actualizar estado de la cotización a "sent"
        await db.updateQuoteStatus(input.id, "sent");

        return { success: true, emailId: result.id };
      }),
  }),

  // ============================================
  // NEWSLETTERS
  // ============================================
  newsletters: router({
    getAll: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getAllNewsletters();
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getNewsletterById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        subject: z.string(),
        senderName: z.string().optional().default("Cancagua"),
        htmlContent: z.string(),
        textContent: z.string().optional(),
        designPrompt: z.string().optional(),
        listIds: z.array(z.number()).optional(),
        scheduledAt: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { listIds, scheduledAt, ...newsletterData } = input;

        const result = await db.createNewsletter({
          ...newsletterData,
          status: scheduledAt ? "scheduled" : "draft",
          scheduledAt: scheduledAt || null,
          createdBy: ctx.user.id,
        });

        // Obtener el newsletter recién creado para tener el id
        const newsletters = await db.getAllNewsletters();
        const newNewsletter = newsletters[0]; // La más reciente

        // Si se proporcionaron listas, asociarlas
        if (listIds && listIds.length > 0) {
          for (const listId of listIds) {
            await db.addListToNewsletter(newNewsletter.id, listId);
          }
        }

        return { success: true, id: newNewsletter.id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        subject: z.string().optional(),
        htmlContent: z.string().optional(),
        textContent: z.string().optional(),
        designPrompt: z.string().optional(),
        scheduledAt: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...updateData } = input;
        return await db.updateNewsletter(id, updateData);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.deleteNewsletter(input.id);
      }),

    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkDeleteNewsletters(input.ids);
        return { success: true, count: input.ids.length };
      }),

    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const newNewsletter = await db.duplicateNewsletter(input.id);
        return { success: true, id: newNewsletter?.id };
      }),

    generateDesign: protectedProcedure
      .input(z.object({
        prompt: z.string(),
        headerImage: z.string().optional(),
        bodyImages: z.array(z.string()).optional(),
        // Legacy field kept for backwards compatibility
        images: z.array(z.string()).optional(),
        generateImages: z.boolean().optional().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { invokeLLM } = await import("./_core/llm");
        const { generateImage } = await import("./_core/imageGeneration");
        const { getBrandImageUrls, BRAND_IMAGE_CATALOG } = await import("./upload-brand-images");

        // Obtener las URLs de imágenes de marca desde S3
        const brandImages = getBrandImageUrls();

        // Determinar si el usuario proporcionó imagen de header
        const userHeaderImage = input.headerImage || null;
        const userBodyImages = input.bodyImages || input.images || [];

        // Paso 1: Generar imagen hero con IA SOLO si el usuario NO proporcionó una imagen de header
        let generatedHeaderUrl: string | null = null;
        let generatedBodyUrls: string[] = [];

        if (!userHeaderImage && input.generateImages) {
          try {
            // Generar imagen hero basada en el prompt del usuario
            const imagePrompt = `Fotografía profesional de alta calidad para email marketing de CANCAGUA, un spa y centro de retiro en el sur de Chile. La imagen debe transmitir serenidad, paz y conexión con la naturaleza. Estilo: elegante, cálido, tonos tierra y naturales. Contexto: ${input.prompt}. NO incluir texto ni logos en la imagen.`;

            const heroImage = await generateImage({ prompt: imagePrompt });
            if (heroImage.url) {
              generatedHeaderUrl = heroImage.url;
            }
          } catch (error) {
            console.error('Error generando imagen hero:', error);
            // Continuar sin imagen si falla la generación
          }
        }

        // Si no hay imágenes de cuerpo y se solicita generación, generar una
        if (userBodyImages.length === 0 && input.generateImages && !generatedHeaderUrl && !userHeaderImage) {
          // No generar imágenes de cuerpo extra si ya se generó header
        }

        // Determinar la imagen de header final
        const finalHeaderImage = userHeaderImage || generatedHeaderUrl;
        // Combinar imágenes de cuerpo proporcionadas
        const allBodyImages = [...userBodyImages, ...generatedBodyUrls];
        // Legacy: combinar todas las imágenes para el catálogo
        const allImages = [finalHeaderImage, ...allBodyImages].filter(Boolean) as string[];

        // Construir el catálogo de imágenes disponibles para el prompt
        const imagesCatalog = BRAND_IMAGE_CATALOG.map(img => {
          const url = brandImages[img.name] || '';
          return `- ${img.name}: ${img.description} | URL: ${url}`;
        }).join('\n');

        // Construir sección de imagen de header
        const headerImageSection = finalHeaderImage
          ? `\n\nIMAGEN DE HEADER/HERO (OBLIGATORIO usar esta imagen como banner principal del email):\n- URL: ${finalHeaderImage}\n- Origen: ${userHeaderImage ? 'Proporcionada por el usuario' : 'Generada por IA'}`
          : '';

        // Construir sección de imágenes de cuerpo
        const bodyImagesSection = allBodyImages.length > 0
          ? `\n\nIMÁGENES PARA EL CUERPO DEL EMAIL (incluir dentro del contenido del email):\n${allBodyImages.map((url, i) => `- imagen_cuerpo_${i + 1}: ${url}`).join('\n')}`
          : '';

        // Construir el prompt para generar HTML de email con estilo de marca Cancagua
        const systemPrompt = `Eres un experto diseñador de emails HTML para CANCAGUA, un spa y centro de retiro en Frutillar, Chile. Crea emails profesionales que reflejen la identidad de marca: serenidad, paz y conexión con la naturaleza.

## IDENTIDAD DE MARCA CANCAGUA
- Personalidad: Servicial, amorosa, serena, sabia
- Emoción a transmitir: Serenidad - Paz - Plenitud
- Mensaje clave: "Uno es parte de la naturaleza cuando se siente parte de ella"

## PALETA DE COLORES (OBLIGATORIO)
- Color Principal (Tierra/Arena): #D3BC8D - Usar para headers, botones, acentos
- Color Secundario (Crema): #F1E7D9 - Usar para fondos de sección
- Gris Medio: #AAAAAA - Textos secundarios
- Gris Oscuro: #8C8C8C - Textos de cuerpo
- Fondo principal: #FFFFFF o #F1E7D9
- Texto principal: #3a3a3a o #2d2d2d

## TIPOGRAFÍAS
- Títulos: font-family: 'Josefin Sans', Arial, sans-serif; font-weight: 300; letter-spacing: 2px; text-transform: uppercase;
- Cuerpo: font-family: 'Fira Sans', Arial, sans-serif; font-weight: 400;
- Acentos elegantes: font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic;

## REQUISITOS TÉCNICOS
- HTML completo con estilos inline (no CSS externo)
- Responsive (mobile-first, max-width: 600px para contenido)
- Compatible con Gmail, Outlook, Apple Mail
- Usa tablas para layout (no flexbox/grid)
- Incluye alt text en imágenes
- Botones CTA con fondo #D3BC8D, texto #3a3a3a, bordes redondeados 4px

## ESTILO VISUAL
- Diseño limpio y minimalista
- Espaciado generoso (padding 20-40px)
- Imágenes con bordes sutiles o sin bordes
- Evitar colores saturados o brillantes
- Líneas divisorias sutiles en #D3BC8D con opacidad

## ESTRUCTURA SUGERIDA
1. Header con logo (centrado, fondo blanco o crema)
2. Imagen hero (si aplica)
3. Contenido principal con tipografía elegante
4. CTA claro y visible
5. Footer con información de contacto y redes sociales

## CATÁLOGO DE IMÁGENES DE MARCA (URLs REALES - USAR ESTAS)
Logo principal: ${brandImages.logo || 'No disponible'}
Logo footer: ${brandImages.logoFooter || 'No disponible'}

Imágenes de marca disponibles:
${imagesCatalog}${headerImageSection}${bodyImagesSection}

## INSTRUCCIONES PARA IMÁGENES
1. SIEMPRE usa el logo real de la URL proporcionada arriba en el header del email (logo de Cancagua)
2. Si hay una IMAGEN DE HEADER/HERO proporcionada, DEBES usarla como imagen principal/banner del email justo debajo del logo. NO la ignores.
3. Si hay IMÁGENES PARA EL CUERPO, inclúyelas dentro del contenido del email en posiciones relevantes al contexto.
4. Si NO hay imagen de header ni de cuerpo proporcionadas, selecciona imágenes del catálogo de marca según el contexto.
5. Usa las URLs EXACTAS proporcionadas, no inventes URLs.
6. Incluye alt text descriptivo en todas las imágenes.

## REDES SOCIALES (URLs REALES)
- Instagram: https://www.instagram.com/cancaguachile/
- Facebook: https://www.facebook.com/Cancaguachile-100421855205587

En el footer del email, incluye links a estas redes sociales con texto simple (no imágenes).
Además, SIEMPRE incluye al final del footer un enlace de darse de baja con este formato exacto:
<a href="{{unsubscribe_url}}" style="color: #999999; text-decoration: underline; font-size: 12px;">Darse de baja de este newsletter</a>

IMPORTANTE: Devuelve un JSON con la siguiente estructura:
{
  "subject": "Asunto sugerido para el email (máximo 60 caracteres, atractivo y relevante)",
  "htmlContent": "El código HTML completo del email"
}

El asunto debe ser atractivo, relevante al contenido, y puede incluir emojis si es apropiado.
NO incluyas marcadores de código. Devuelve SOLO el JSON válido.`;

        // Construir prompt del usuario con información de imágenes
        let userImageInfo = '';
        if (userHeaderImage) {
          userImageInfo += `\n\nImagen de header proporcionada por el usuario (USAR como banner/hero): ${userHeaderImage}`;
        }
        if (allBodyImages.length > 0) {
          userImageInfo += `\n\nImágenes para el cuerpo del email: ${allBodyImages.join(", ")}`;
        }
        const userPrompt = `${input.prompt}${userImageInfo}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });

        const content = response.choices[0].message.content;
        let rawContent = typeof content === 'string' ? content : '';

        // Limpiar marcadores de código si la IA los incluyó
        rawContent = rawContent.replace(/^```json\s*/i, '').replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/g, '').trim();

        // Intentar parsear como JSON
        let htmlContent = '';
        let suggestedSubject = '';

        try {
          const parsed = JSON.parse(rawContent);
          htmlContent = parsed.htmlContent || '';
          suggestedSubject = parsed.subject || '';
        } catch {
          // Si no es JSON válido, asumir que es HTML puro
          htmlContent = rawContent;
          suggestedSubject = '';
        }

        return { htmlContent, suggestedSubject };
      }),

    refineDesign: protectedProcedure
      .input(z.object({
        currentHtml: z.string(),
        refinementRequest: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { invokeLLM } = await import("./_core/llm");

        const systemPrompt = `Eres un experto diseñador de emails HTML para CANCAGUA. Modifica el HTML del email según las instrucciones del usuario.

## MANTENER SIEMPRE LA IDENTIDAD DE MARCA:
- Colores: #D3BC8D (tierra/principal), #F1E7D9 (crema), #8C8C8C (gris)
- Tipografías: Josefin Sans (títulos), Fira Sans (cuerpo), Cormorant Garamond (acentos)
- Estilo: Elegante, sereno, minimalista
- Compatibilidad con clientes de email y estilos inline

## REDES SOCIALES (URLs REALES)
- Instagram: https://www.instagram.com/cancaguachile/
- Facebook: https://www.facebook.com/Cancaguachile-100421855205587

Para el logo, usa texto estilizado en lugar de imagen. Para redes sociales, usa texto simple con links.

IMPORTANTE: Devuelve SOLO el código HTML puro modificado, sin marcadores de código.`;

        const userPrompt = `HTML actual:\n${input.currentHtml}\n\nModificación solicitada: ${input.refinementRequest}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });

        const content = response.choices[0].message.content;
        let htmlContent = typeof content === 'string' ? content : '';

        // Limpiar marcadores de código si la IA los incluyó
        htmlContent = htmlContent.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/g, '').trim();

        return { htmlContent };
      }),

    getLists: protectedProcedure
      .input(z.object({ newsletterId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getListsForNewsletter(input.newsletterId);
      }),

    sendTest: protectedProcedure
      .input(z.object({
        newsletterId: z.number(),
        testEmail: z.string().email(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const newsletter = await db.getNewsletterById(input.newsletterId);
        if (!newsletter) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter no encontrado" });
        }

        const { sendTestEmail } = await import("./email");
        const result = await sendTestEmail(
          input.testEmail,
          newsletter.subject,
          newsletter.htmlContent || ''
        );

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Error al enviar email de prueba" });
        }

        return { success: true, message: "Email de prueba enviado" };
      }),

    send: protectedProcedure
      .input(z.object({
        newsletterId: z.number(),
        listIds: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const newsletter = await db.getNewsletterById(input.newsletterId);
        if (!newsletter) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter no encontrado" });
        }

        if (newsletter.status === 'sending') {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este newsletter ya se está enviando" });
        }

        // Obtener suscriptores únicos activos de todas las listas en una sola query (con deduplicación en DB)
        const allSubscribers = await db.getUniqueActiveSubscribersForLists(input.listIds);

        if (allSubscribers.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No hay suscriptores activos en las listas seleccionadas" });
        }

        // Actualizar estado a 'sending' y guardar recipientCount inmediatamente
        await db.updateNewsletter(input.newsletterId, {
          status: 'sending',
          recipientCount: allSubscribers.length,
        });

        // Lanzar envío en background (no await) para evitar timeout del HTTP request
        const newsletterId = input.newsletterId;
        const senderName = newsletter.senderName || 'Cancagua';
        const htmlContent = newsletter.htmlContent || '';
        const subject = newsletter.subject;

        (async () => {
          try {
            const { sendBulkEmails, htmlToPlainText } = await import("./email");
            const { ENV } = await import("./_core/env");
            const appUrl = ENV.appUrl || 'https://cancagua-cms.manus.space';

            // Procesar en chunks para evitar acumular toda la memoria de una vez
            const CHUNK_SIZE = 500;
            let totalSent = 0;
            let totalFailed = 0;

            console.log(`[Newsletter BG] Iniciando envío de ${allSubscribers.length} emails para newsletter ${newsletterId} en chunks de ${CHUNK_SIZE}`);

            for (let i = 0; i < allSubscribers.length; i += CHUNK_SIZE) {
              const chunk = allSubscribers.slice(i, i + CHUNK_SIZE);
              const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
              const totalChunks = Math.ceil(allSubscribers.length / CHUNK_SIZE);

              // Construir emails solo para este chunk (evita acumular 4000+ HTMLs en memoria)
              const chunkEmails = chunk.map(sub => {
                const encodedEmail = Buffer.from(sub.email).toString('base64');
                const unsubscribeUrl = `${appUrl}/api/unsubscribe?email=${encodedEmail}`;

                let htmlWithUnsub = htmlContent;

                if (htmlWithUnsub.includes('{{unsubscribe_url}}')) {
                  htmlWithUnsub = htmlWithUnsub.replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl);
                }

                if (!htmlWithUnsub.includes('/api/unsubscribe') && !htmlWithUnsub.includes('darse de baja')) {
                  const unsubFooter = `
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 16px; border-top: 1px solid #e0e0e0; padding-top: 16px;">
                    <tr>
                      <td align="center" style="font-family: 'Fira Sans', Arial, sans-serif; font-size: 12px; color: #999999; padding: 8px 0;">
                        <a href="${unsubscribeUrl}" style="color: #999999; text-decoration: underline;">Darse de baja de este newsletter</a>
                      </td>
                    </tr>
                  </table>`;

                  if (htmlWithUnsub.includes('</body>')) {
                    htmlWithUnsub = htmlWithUnsub.replace('</body>', `${unsubFooter}</body>`);
                  } else if (htmlWithUnsub.includes('</html>')) {
                    htmlWithUnsub = htmlWithUnsub.replace('</html>', `${unsubFooter}</html>`);
                  } else {
                    htmlWithUnsub += unsubFooter;
                  }
                }

                return {
                  to: sub.email,
                  subject,
                  html: htmlWithUnsub,
                  text: htmlToPlainText(htmlWithUnsub),
                };
              });

              console.log(`[Newsletter BG] Chunk ${chunkNum}/${totalChunks}: enviando ${chunkEmails.length} emails`);

              const chunkResult = await sendBulkEmails({ emails: chunkEmails, senderName });
              totalSent += chunkResult.sent;
              totalFailed += chunkResult.failed;

              // Registrar envíos en bulk (una sola query por chunk)
              await db.bulkCreateNewsletterSends(chunk.map(sub => ({
                newsletterId,
                subscriberId: sub.id,
                status: chunkResult.sent > 0 ? 'sent' : 'failed',
              })));

              console.log(`[Newsletter BG] Chunk ${chunkNum}/${totalChunks} completado. Acumulado: enviados=${totalSent}, fallidos=${totalFailed}`);

              // Pausa entre chunks para no saturar la API
              if (i + CHUNK_SIZE < allSubscribers.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }

            // Actualizar newsletter con resultados finales
            await db.updateNewsletter(newsletterId, {
              status: totalSent > 0 ? 'sent' : 'failed',
              sentAt: new Date(),
              recipientCount: allSubscribers.length,
            });

            console.log(`[Newsletter BG] Envío completado para newsletter ${newsletterId}. Enviados: ${totalSent}, Fallidos: ${totalFailed}`);
          } catch (bgError: any) {
            console.error(`[Newsletter BG] Error en envío background para newsletter ${newsletterId}:`, bgError);
            await db.updateNewsletter(newsletterId, {
              status: 'failed',
              recipientCount: allSubscribers.length,
            });
          }
        })();

        // Responder inmediatamente al frontend
        return {
          success: true,
          sent: 0,
          failed: 0,
          total: allSubscribers.length,
          errors: [],
          message: `Envío iniciado para ${allSubscribers.length} suscriptores. El proceso continúa en segundo plano.`,
        };
      }),

    // Consultar estado de envío de un newsletter
    sendStatus: protectedProcedure
      .input(z.object({ newsletterId: z.number() }))
      .query(async ({ input }) => {
        const newsletter = await db.getNewsletterById(input.newsletterId);
        if (!newsletter) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter no encontrado" });
        }
        return {
          status: newsletter.status,
          recipientCount: newsletter.recipientCount,
          sentAt: newsletter.sentAt,
        };
      }),

    // Subir imagen a S3 y obtener URL pública
    uploadImage: protectedProcedure
      .input(z.object({
        imageData: z.string(), // Base64 encoded image data
        fileName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { storagePut } = await import("./storage");

        // Extraer el tipo de imagen y datos del base64
        const matches = input.imageData.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de imagen inválido" });
        }

        const imageType = matches[1];
        const base64Data = matches[2];
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Generar nombre único para el archivo
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const fileName = input.fileName || `image-${timestamp}-${randomSuffix}.${imageType}`;
        const fileKey = `newsletter-images/${fileName}`;

        const { url } = await storagePut(fileKey, imageBuffer, `image/${imageType}`);

        return { url, key: fileKey };
      }),

    // Extraer contenido de una URL de Cancagua
    extractFromUrl: protectedProcedure
      .input(z.object({
        url: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { storagePut } = await import("./storage");

        try {
          // Hacer fetch de la página
          const response = await fetch(input.url);
          if (!response.ok) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "No se pudo acceder a la URL" });
          }

          const html = await response.text();
          const baseUrl = new URL(input.url);

          // Función para extraer texto limpio de HTML
          const cleanHtml = (htmlStr: string): string => {
            return htmlStr
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          };

          // PRIORIDAD 1: Extraer título del contenido visible (h1)
          const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          let title = h1Match ? cleanHtml(h1Match[1]) : '';

          // Si no hay h1, buscar en meta tags
          if (!title) {
            const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
              || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
            const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            title = ogTitleMatch ? ogTitleMatch[1] : (titleTagMatch ? titleTagMatch[1].trim() : '');
          }

          // PRIORIDAD 2: Extraer descripción del contenido visible
          // Buscar el primer párrafo significativo después del h1
          let description = '';

          // Buscar texto descriptivo en la página (párrafos con contenido sustancial)
          const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
          for (const p of paragraphs) {
            const text = cleanHtml(p);
            // Buscar párrafos con contenido significativo (más de 50 caracteres)
            if (text.length > 50 && !text.includes('cookie') && !text.includes('Copyright')) {
              description = text.substring(0, 300);
              break;
            }
          }

          // Si no encontramos descripción en párrafos, buscar en divs con clase descriptiva
          if (!description) {
            const descDivMatch = html.match(/<div[^>]*class=["'][^"']*(?:description|intro|subtitle|lead)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
            if (descDivMatch) {
              description = cleanHtml(descDivMatch[1]).substring(0, 300);
            }
          }

          // Fallback a meta description solo si no encontramos nada mejor
          if (!description) {
            const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
              || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
            description = metaDescMatch ? metaDescMatch[1] : '';
          }

          // PRIORIDAD 3: Extraer imágenes y hacer proxy a S3
          const imageUrls: string[] = [];

          // Buscar imágenes en el contenido
          const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
          let imgMatch;
          while ((imgMatch = imgRegex.exec(html)) !== null) {
            let src = imgMatch[1];
            // Resolver URLs relativas
            if (src.startsWith('/')) {
              src = `${baseUrl.protocol}//${baseUrl.host}${src}`;
            } else if (!src.startsWith('http')) {
              src = `${baseUrl.protocol}//${baseUrl.host}/${src}`;
            }
            // Filtrar imágenes relevantes (no iconos, logos pequeños, etc.)
            if (!src.includes('icon') && !src.includes('logo') && !src.includes('favicon')) {
              if (!imageUrls.includes(src)) {
                imageUrls.push(src);
              }
            }
          }

          // También buscar imágenes en background-image CSS inline
          const bgImageRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
          let bgMatch;
          while ((bgMatch = bgImageRegex.exec(html)) !== null) {
            let src = bgMatch[1];
            if (src.startsWith('/')) {
              src = `${baseUrl.protocol}//${baseUrl.host}${src}`;
            } else if (!src.startsWith('http')) {
              src = `${baseUrl.protocol}//${baseUrl.host}/${src}`;
            }
            if (!imageUrls.includes(src)) {
              imageUrls.push(src);
            }
          }

          // Hacer proxy de las primeras 3 imágenes a S3 para evitar CORS
          const proxiedImages: string[] = [];
          for (const imgUrl of imageUrls.slice(0, 3)) {
            try {
              const imgResponse = await fetch(imgUrl);
              if (imgResponse.ok) {
                const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
                const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
                const timestamp = Date.now();
                const randomSuffix = Math.random().toString(36).substring(2, 8);
                const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
                const fileKey = `newsletter-extracted/${timestamp}-${randomSuffix}.${ext}`;
                const { url } = await storagePut(fileKey, imgBuffer, contentType);
                proxiedImages.push(url);
              }
            } catch (imgError) {
              console.error('Error proxying image:', imgUrl, imgError);
              // Agregar la URL original como fallback
              proxiedImages.push(imgUrl);
            }
          }

          // Extraer contenido principal del body
          let mainContent = '';

          // Buscar el contenido principal en diferentes estructuras
          const contentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
            || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
            || html.match(/<section[^>]*>([\s\S]*?)<\/section>/i);

          if (contentMatch) {
            mainContent = cleanHtml(contentMatch[1]).substring(0, 2000);
          }

          // Extraer fecha si existe (formato común en eventos)
          const datePatterns = [
            /(Sábado|Domingo|Lunes|Martes|Miércoles|Jueves|Viernes)\s+\d{1,2}\s+de\s+(?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+\d{4}/i,
            /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?\d{4})?)/i,
            /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/
          ];

          let eventDate = '';
          for (const pattern of datePatterns) {
            const dateMatch = html.match(pattern);
            if (dateMatch) {
              eventDate = dateMatch[0];
              break;
            }
          }

          // Extraer precio si existe
          const priceMatch = html.match(/\$\s*([\d.,]+)/)
            || html.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:CLP|pesos)/i);
          const price = priceMatch ? `$${priceMatch[1]}` : '';

          // Extraer duración si existe
          const durationMatch = html.match(/(\d+\s*(?:hrs?|horas?)\s*(?:\d+\s*min(?:utos?)?)?)/i)
            || html.match(/(\d+\s*min(?:utos?)?)/i);
          const duration = durationMatch ? durationMatch[1] : '';

          return {
            title,
            description,
            images: proxiedImages, // Imágenes ya subidas a S3
            content: mainContent,
            eventDate,
            price,
            duration,
            url: input.url,
          };
        } catch (error: any) {
          console.error('Error extracting URL content:', error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message || "Error al extraer contenido de la URL"
          });
        }
      }),

    transcribeAudio: protectedProcedure
      .input(z.object({
        audioData: z.string(), // Base64 encoded audio data
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { storagePut } = await import("./storage");
        const { transcribeAudio } = await import("./_core/voiceTranscription");

        // Extraer el audio del base64
        const base64Data = input.audioData.replace(/^data:audio\/\w+;base64,/, '');
        const audioBuffer = Buffer.from(base64Data, 'base64');

        // Subir a S3 con nombre único
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const fileKey = `audio-transcriptions/audio-${timestamp}-${randomSuffix}.webm`;

        const { url: audioUrl } = await storagePut(fileKey, audioBuffer, 'audio/webm');

        // Transcribir el audio
        const result = await transcribeAudio({
          audioUrl,
          language: 'es',
          prompt: 'Transcribe la solicitud del usuario para crear un email de newsletter',
        });

        // Verificar si hay error
        if ('error' in result) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error,
          });
        }

        return { text: result.text };
      }),
  }),

  // ============================================
  // SUBSCRIBERS
  // ============================================
  subscribers: router({
    getAll: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getAllSubscribers();
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getSubscriberById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        name: z.string().optional(),
        metadata: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.createSubscriber({
          ...input,
          source: "manual",
          status: "active",
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        email: z.string().email().optional(),
        name: z.string().optional(),
        metadata: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...updateData } = input;
        return await db.updateSubscriber(id, updateData);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.deleteSubscriber(input.id);
      }),

    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkDeleteSubscribers(input.ids);
        return { success: true, count: input.ids.length };
      }),

    bulkUpdateStatus: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()),
        status: z.enum(["active", "unsubscribed"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkUpdateSubscribersStatus(input.ids, input.status);
        return { success: true, count: input.ids.length };
      }),

    subscribe: publicProcedure
      .input(z.object({
        email: z.string().email(),
        name: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.subscribeToNewsletter(input.email, input.name);
        return { success: true };
      }),

    unsubscribe: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        await db.unsubscribeFromNewsletter(input.email);
        return { success: true };
      }),

    importCSV: protectedProcedure
      .input(z.object({
        csvData: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        // Parsear CSV simple (asume formato: email,name,metadata)
        const lines = input.csvData.split("\n").filter(line => line.trim());
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

        const emailIndex = headers.findIndex(h => h.includes("email") || h.includes("correo"));
        const nameIndex = headers.findIndex(h => h.includes("name") || h.includes("nombre"));

        if (emailIndex === -1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No se encontró columna de email" });
        }

        let imported = 0;
        let skipped = 0;

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map(v => v.trim());
          const email = values[emailIndex];
          const name = nameIndex !== -1 ? values[nameIndex] : undefined;

          if (!email || !email.includes("@")) {
            skipped++;
            continue;
          }

          // Verificar si ya existe
          const existing = await db.getSubscriberByEmail(email);
          if (existing) {
            skipped++;
            continue;
          }

          // Crear metadata con todos los campos adicionales
          const metadata: any = {};
          headers.forEach((header, idx) => {
            if (idx !== emailIndex && idx !== nameIndex && values[idx]) {
              metadata[header] = values[idx];
            }
          });

          await db.createSubscriber({
            email,
            name,
            source: "import",
            status: "active",
            metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
          });

          imported++;
        }

        return { success: true, imported, skipped };
      }),

    analyzeAndSegment: protectedProcedure
      .input(z.object({
        csvData: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { invokeLLM } = await import("./_core/llm");

        // Analizar primeras 50 filas para obtener estructura
        const lines = input.csvData.split("\n").slice(0, 51);
        const sample = lines.join("\n");

        const systemPrompt = `Eres un experto en segmentación de audiencias para CANCAGUA, un spa y centro de retiro en Frutillar, Chile. Analiza el CSV proporcionado y sugiere listas de segmentación útiles para marketing de bienestar y turismo.

## CONTEXTO DEL NEGOCIO CANCAGUA:
- Spa y centro de retiro de lujo
- Ubicado en Frutillar, Región de Los Lagos, Chile
- Servicios: masajes, tratamientos de spa, retiros de bienestar, eventos corporativos
- Clientes: turistas nacionales e internacionales, empresas para eventos, personas buscando bienestar

## SEGMENTACIONES RECOMENDADAS:
- Por ciudad/región de origen (Santiago, Región de Los Lagos, etc.)
- Por tipo de cliente (individual, corporativo, turista)
- Por fecha de última compra/visita
- Por monto gastado (VIP, regular, nuevo)
- Por interés (spa, eventos, retiros, gastronomía)
- Por frecuencia de visita

Devuelve un JSON con este formato:
{
  "segments": [
    {
      "name": "Nombre de la lista (en español)",
      "description": "Descripción clara de la segmentación",
      "rules": {
        "field": "nombre_campo_del_csv",
        "operator": "equals|contains|greater_than|less_than",
        "value": "valor"
      }
    }
  ],
  "insights": "Observaciones útiles sobre los datos para estrategia de marketing"
}`;

        const userPrompt = `Analiza este CSV y sugiere segmentaciones útiles:\n\n${sample}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });

        const content = response.choices[0].message.content;
        const analysis = JSON.parse(typeof content === 'string' ? content : '{}');

        return analysis;
      }),

    getLists: protectedProcedure
      .input(z.object({ subscriberId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getListsForSubscriber(input.subscriberId);
      }),
  }),

  // ============================================
  // SUBSCRIBER LISTS
  // ============================================
  lists: router({
    getAll: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getAllLists();
      }),

    uniqueSubscriberCount: protectedProcedure
      .input(z.object({ listIds: z.array(z.number()) }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (input.listIds.length === 0) {
          return { count: 0 };
        }
        const count = await db.getUniqueSubscriberCountForLists(input.listIds);
        return { count };
      }),

    totalActiveSubscribers: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const count = await db.getTotalUniqueActiveSubscribers();
        return { count };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getListById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        segmentationRules: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.createList(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        segmentationRules: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...updateData } = input;
        return await db.updateList(id, updateData);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.deleteList(input.id);
      }),

    getSubscribers: protectedProcedure
      .input(z.object({ listId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getSubscribersInList(input.listId);
      }),

    addSubscriber: protectedProcedure
      .input(z.object({
        listId: z.number(),
        subscriberId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.addSubscriberToList(input.subscriberId, input.listId);
      }),

    removeSubscriber: protectedProcedure
      .input(z.object({
        listId: z.number(),
        subscriberId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.removeSubscriberFromList(input.subscriberId, input.listId);
      }),

    bulkAddSubscribers: protectedProcedure
      .input(z.object({
        listId: z.number(),
        subscriberIds: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkAddSubscribersToList(input.subscriberIds, input.listId);
        return { success: true, count: input.subscriberIds.length };
      }),

    bulkRemoveSubscribers: protectedProcedure
      .input(z.object({
        listId: z.number(),
        subscriberIds: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkRemoveSubscribersFromList(input.subscriberIds, input.listId);
        return { success: true, count: input.subscriberIds.length };
      }),

    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.bulkDeleteLists(input.ids);
        return { success: true, count: input.ids.length };
      }),
  }),

  // ============================================
  // DISCOUNT CODES
  // ============================================
  discountCodes: router({
    getAll: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getAllDiscountCodes();
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getDiscountCodeById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        code: z.string().min(3).max(50),
        name: z.string(),
        description: z.string().optional(),
        discountType: z.enum(["percentage", "fixed"]),
        discountValue: z.number().min(1),
        minPurchase: z.number().default(0),
        maxDiscount: z.number().optional(),
        maxUses: z.number().optional(),
        maxUsesPerUser: z.number().default(1),
        assignedUserId: z.number().optional(),
        applicableServices: z.array(z.string()).optional(),
        startsAt: z.date().optional(),
        expiresAt: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        // Verificar que el código no exista
        const existing = await db.getDiscountCodeByCode(input.code);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Ya existe un código con ese nombre" });
        }

        return await db.createDiscountCode({
          ...input,
          applicableServices: input.applicableServices ? JSON.stringify(input.applicableServices) : null,
          createdBy: ctx.user.id,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().min(3).max(50).optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        discountType: z.enum(["percentage", "fixed"]).optional(),
        discountValue: z.number().min(1).optional(),
        minPurchase: z.number().optional(),
        maxDiscount: z.number().optional(),
        maxUses: z.number().optional(),
        maxUsesPerUser: z.number().optional(),
        assignedUserId: z.number().optional(),
        applicableServices: z.array(z.string()).optional(),
        startsAt: z.date().optional(),
        expiresAt: z.date().optional(),
        active: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const { id, applicableServices, ...updateData } = input;

        if (applicableServices) {
          (updateData as any).applicableServices = JSON.stringify(applicableServices);
        }

        return await db.updateDiscountCode(id, updateData);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.deleteDiscountCode(input.id);
      }),

    validate: publicProcedure
      .input(z.object({
        code: z.string(),
        serviceType: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const userId = ctx.user?.id;
        const valid = await db.validateDiscountCode(input.code);
      }),

    getUsages: protectedProcedure
      .input(z.object({ discountCodeId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getUsagesForDiscountCode(input.discountCodeId);
      }),
  }),

  // ============================================
  // GIFT CARDS
  // ============================================
  giftCards: router({
    getAll: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getAllGiftCards();
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getGiftCardById(input.id);
      }),

    getByCode: publicProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        const giftCard = await db.getGiftCardByCode(input.code);
        if (!giftCard) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gift card no encontrada" });
        }
        // Solo devolver información pública
        return {
          code: giftCard.code,
          amount: giftCard.amount,
          balance: giftCard.balance,
          expiresAt: giftCard.expiresAt,
          purchaseStatus: giftCard.purchaseStatus,
        };
      }),

    create: publicProcedure
      .input(z.object({
        amount: z.number().min(5000),
        backgroundImage: z.string().default("default"),
        recipientName: z.string().optional(),
        recipientEmail: z.string().email().optional(),
        recipientPhone: z.string().optional(),
        senderName: z.string().optional(),
        senderEmail: z.string().email().optional(),
        personalMessage: z.string().optional(),
        deliveryMethod: z.enum(["email", "whatsapp", "download"]).default("email"),
      }))
      .mutation(async ({ input }) => {
        return await db.createGiftCard(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        purchaseStatus: z.enum(["pending", "completed", "rejected", "aborted", "timeout", "abandoned"]).optional(),
        paymentMethod: z.string().optional(),
        paymentReference: z.string().optional(),
        deliveredAt: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...updateData } = input;
        return await db.updateGiftCard(id, updateData);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.deleteGiftCard(input.id);
      }),

    // Simular compra (para pruebas sin pasarela de pago)
    simulatePurchase: publicProcedure
      .input(z.object({
        giftCardId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const giftCard = await db.getGiftCardById(input.giftCardId);
        if (!giftCard) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gift card no encontrada" });
        }

        // Simular pago exitoso
        await db.updateGiftCard(input.giftCardId, {
          purchaseStatus: "completed",
          paymentMethod: "simulated",
          paymentReference: `SIM-${Date.now()}`,
        });

        // Registrar transacción de compra
        await db.createGiftCardTransaction({
          giftCardId: input.giftCardId,
          transactionType: "purchase",
          amount: giftCard.amount,
          balanceBefore: 0,
          balanceAfter: giftCard.amount,
          notes: "Compra simulada para pruebas",
        });

        return { success: true, giftCard: await db.getGiftCardById(input.giftCardId) };
      }),

    redeem: protectedProcedure
      .input(z.object({
        code: z.string(),
        amount: z.number().min(1),
        orderId: z.string().optional(),
        orderType: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const result = await db.redeemGiftCard(input.code, input.amount, ctx.user?.name ?? undefined);
      }),

    getTransactions: protectedProcedure
      .input(z.object({ giftCardId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getGiftCardTransactions(input.giftCardId);
      }),

    // Obtener imágenes de fondo disponibles
    getBackgroundImages: publicProcedure
      .query(async () => {
        return [
          { id: "spa-green", name: "Spa Verde", url: "https://res.cloudinary.com/dhuln9b1n/image/upload/v1769474119/giftcard-backgrounds/spa-green.jpg" },
          { id: "spa-pink", name: "Spa Rosa", url: "https://res.cloudinary.com/dhuln9b1n/image/upload/v1769474119/giftcard-backgrounds/spa-pink.jpg" },
          { id: "wellness-nature", name: "Naturaleza", url: "https://res.cloudinary.com/dhuln9b1n/image/upload/v1769474120/giftcard-backgrounds/wellness-nature.jpg" },
          { id: "spa-stones", name: "Piedras", url: "https://res.cloudinary.com/dhuln9b1n/image/upload/v1769474121/giftcard-backgrounds/spa-stones.jpg" },
          { id: "spa-elegant", name: "Elegante", url: "https://res.cloudinary.com/dhuln9b1n/image/upload/v1769474122/giftcard-backgrounds/spa-elegant.jpg" },
        ];
      }),

    // Generar PDF de gift card
    generatePDF: publicProcedure
      .input(z.object({
        giftCardId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const giftCard = await db.getGiftCardById(input.giftCardId);
        if (!giftCard) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gift card no encontrada" });
        }

        const { generateGiftCardPDF } = await import("./giftcardPdfGenerator");
        const pdfBuffer = await generateGiftCardPDF({
          amount: giftCard.amount,
          recipientName: giftCard.recipientName || "Destinatario",
          recipientEmail: giftCard.recipientEmail || "",
          message: giftCard.personalMessage || undefined,
          backgroundImage: giftCard.backgroundImage || "/images/giftcard-backgrounds/spa-green.jpg",
          code: giftCard.code,
        });

        // Convertir buffer a base64 para enviar al cliente
        return {
          pdf: pdfBuffer.toString("base64"),
          filename: `giftcard-${giftCard.code}.pdf`,
        };
      }),

    // ============================================
    // WEBPAY PLUS INTEGRATION
    // ============================================

    /**
     * Iniciar transacción de pago con WebPay Plus
     * Crea la gift card y genera la transacción de pago
     */
    initiatePayment: publicProcedure
      .input(z.object({
        amount: z.number().min(5000, "El monto mínimo es $5.000"),
        backgroundImage: z.string().default("default"),
        recipientName: z.string().optional(),
        recipientEmail: z.string().email().optional(),
        recipientPhone: z.string().optional(),
        senderName: z.string().optional(),
        senderEmail: z.string().email().optional(),
        personalMessage: z.string().optional(),
        deliveryMethod: z.enum(["email", "whatsapp", "download"]).default("email"),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createTransaction, generateGiftCardBuyOrder, generateSessionId } = await import("./webpay");

        // Generar código único para la gift card
        const code = `GC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        
        // Crear la gift card con estado pendiente
        const giftCardData = {
          code,
          amount: input.amount,
          balance: input.amount,
          backgroundImage: input.backgroundImage,
          recipientName: input.recipientName,
          recipientEmail: input.recipientEmail,
          recipientPhone: input.recipientPhone,
          senderName: input.senderName,
          senderEmail: input.senderEmail,
          personalMessage: input.personalMessage,
          deliveryMethod: input.deliveryMethod,
          purchaseStatus: "pending" as const,
          status: "active" as const,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año
        };
        
        const createdGiftCard = await db.createGiftCard(giftCardData);
        
        // Obtener el ID de la gift card recién creada
        const giftCard = await db.getGiftCardByCode(code);
        if (!giftCard) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al crear gift card" });
        }
        
        // Generar identificadores para WebPay
        const buyOrder = generateGiftCardBuyOrder(giftCard.id);
        const sessionId = generateSessionId();
        
        // Determinar la URL de retorno
        const baseUrl = process.env.NODE_ENV === "production" 
          ? "https://cancagua.cl" 
          : ctx.req?.headers?.origin || "http://localhost:3000";
        const returnUrl = `${baseUrl}/gift-cards/payment-result`;
        
        try {
          // Crear transacción en WebPay
          const webpayResponse = await createTransaction(
            buyOrder,
            sessionId,
            input.amount,
            returnUrl
          );
          
          // Actualizar la gift card con los datos de WebPay
          await db.updateGiftCard(giftCard.id, {
            webpayToken: webpayResponse.token,
            webpayBuyOrder: buyOrder,
            webpaySessionId: sessionId,
            paymentMethod: "webpay",
          });
          
          return {
            success: true,
            giftCardId: giftCard.id,
            giftCardCode: code,
            paymentUrl: webpayResponse.url,
            token: webpayResponse.token,
          };
        } catch (error: any) {
          // Si falla WebPay, eliminar la gift card creada
          await db.deleteGiftCard(giftCard.id);
          throw new TRPCError({ 
            code: "INTERNAL_SERVER_ERROR", 
            message: `Error al iniciar pago: ${error.message}` 
          });
        }
      }),

    /**
     * Confirmar transacción de WebPay Plus
     * Se llama cuando el usuario vuelve de WebPay
     */
    confirmPayment: publicProcedure
      .input(z.object({
        token_ws: z.string().optional(),
        TBK_TOKEN: z.string().optional(),
        TBK_ORDEN_COMPRA: z.string().optional(),
        TBK_ID_SESION: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { commitTransaction, isTransactionApproved } = await import("./webpay");
        
        // Caso 1: Pago exitoso o rechazado (viene token_ws)
        if (input.token_ws) {
          try {
            const result = await commitTransaction(input.token_ws);
            
            // Buscar la gift card por buyOrder
            const giftCard = await db.getGiftCardByBuyOrder(result.buyOrder);
            if (!giftCard) {
              throw new TRPCError({ code: "NOT_FOUND", message: "Gift card no encontrada" });
            }
            
            const isApproved = isTransactionApproved(result.responseCode, result.status);
            
            if (isApproved) {
              // Pago exitoso
              await db.updateGiftCard(giftCard.id, {
                purchaseStatus: "completed",
                webpayAuthorizationCode: result.authorizationCode,
                webpayCardNumber: result.cardNumber,
                webpayTransactionDate: new Date(result.transactionDate),
                webpayResponseCode: result.responseCode,
                paymentReference: result.authorizationCode,
              });
              
              // Registrar transacción de compra
              await db.createGiftCardTransaction({
                giftCardId: giftCard.id,
                transactionType: "purchase",
                amount: giftCard.amount,
                balanceBefore: 0,
                balanceAfter: giftCard.amount,
                notes: `Pago WebPay - Auth: ${result.authorizationCode}`,
              });
              
              // Enviar email con la gift card
              try {
                const { sendGiftCardEmail } = await import("./_core/email");
                const { generateGiftCardPDF } = await import("./giftcardPdfGenerator");
                
                const pdfBuffer = await generateGiftCardPDF({
                  amount: giftCard.amount,
                  recipientName: giftCard.recipientName || "Destinatario",
                  recipientEmail: giftCard.recipientEmail || "",
                  message: giftCard.personalMessage || undefined,
                  backgroundImage: giftCard.backgroundImage || "/images/giftcard-backgrounds/spa-green.jpg",
                  code: giftCard.code,
                });
                
                const emailTo = giftCard.recipientEmail || giftCard.senderEmail;
                if (emailTo) {
                  await sendGiftCardEmail({
                    to: emailTo,
                    recipientName: giftCard.recipientName || "Estimado/a",
                    senderName: giftCard.senderName,
                    amount: giftCard.amount,
                    code: giftCard.code,
                    message: giftCard.personalMessage,
                    pdfBuffer,
                  });
                  
                  await db.updateGiftCard(giftCard.id, {
                    deliveredAt: new Date(),
                  });
                }
              } catch (emailError) {
                console.error("Error enviando email de gift card:", emailError);
                // No lanzar error, el pago fue exitoso
              }
              
              return {
                success: true,
                status: "approved",
                giftCard: {
                  id: giftCard.id,
                  code: giftCard.code,
                  amount: giftCard.amount,
                  recipientName: giftCard.recipientName,
                  recipientEmail: giftCard.recipientEmail,
                  senderName: giftCard.senderName,
                  senderEmail: giftCard.senderEmail,
                  personalMessage: giftCard.personalMessage,
                  backgroundImage: giftCard.backgroundImage,
                },
                message: "¡Pago exitoso! Tu Gift Card ha sido enviada.",
              };
            } else {
              // Pago rechazado por el banco/tarjeta
              await db.updateGiftCard(giftCard.id, {
                purchaseStatus: "rejected",
                webpayResponseCode: result.responseCode,
              });
              
              return {
                success: false,
                status: "rejected",
                giftCard: null,
                message: "El pago fue rechazado. Por favor, intenta con otra tarjeta o verifica los fondos disponibles.",
              };
            }
          } catch (error: any) {
            console.error("Error confirmando pago WebPay:", error);
            throw new TRPCError({ 
              code: "INTERNAL_SERVER_ERROR", 
              message: `Error al confirmar pago: ${error.message}` 
            });
          }
        }
        
        // Caso 2: Usuario abortó el pago manualmente (viene TBK_TOKEN)
        if (input.TBK_TOKEN && input.TBK_ORDEN_COMPRA) {
          const giftCard = await db.getGiftCardByBuyOrder(input.TBK_ORDEN_COMPRA);
          if (giftCard) {
            await db.updateGiftCard(giftCard.id, {
              purchaseStatus: "aborted",
            });
          }
          
          return {
            success: false,
            status: "aborted",
            message: "El pago fue cancelado.",
          };
        }
        
        // Caso 3: Timeout - tiempo expirado en WebPay (solo viene TBK_ORDEN_COMPRA y TBK_ID_SESION)
        if (input.TBK_ORDEN_COMPRA && input.TBK_ID_SESION && !input.TBK_TOKEN) {
          const giftCard = await db.getGiftCardByBuyOrder(input.TBK_ORDEN_COMPRA);
          if (giftCard) {
            await db.updateGiftCard(giftCard.id, {
              purchaseStatus: "timeout",
            });
          }
          
          return {
            success: false,
            status: "timeout",
            message: "El tiempo para completar el pago ha expirado.",
          };
        }
        
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Parámetros de pago inválidos" 
        });
      }),

    /**
     * Obtener estado de pago de una gift card
     */
    getPaymentStatus: publicProcedure
      .input(z.object({
        giftCardId: z.number(),
      }))
      .query(async ({ input }) => {
        const giftCard = await db.getGiftCardById(input.giftCardId);
        if (!giftCard) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gift card no encontrada" });
        }
        
        return {
          id: giftCard.id,
          code: giftCard.code,
          amount: giftCard.amount,
          purchaseStatus: giftCard.purchaseStatus,
          paymentMethod: giftCard.paymentMethod,
          webpayAuthorizationCode: giftCard.webpayAuthorizationCode,
        };
      }),
  }),

  // Gift Cards Admin (CMS)
  giftCardsAdmin: router({
    getAll: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos" });
        }
        // Auto-cleanup: marcar como abandonadas las gift cards pendientes por más de 30 minutos
        try {
          const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
          await db.markAbandonedGiftCards(thirtyMinutesAgo);
        } catch (e) {
          console.error("Error en auto-cleanup de gift cards:", e);
        }
        return await db.getAllGiftCards();
      }),

    resendEmail: protectedProcedure
      .input(z.object({ giftCardId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos" });
        }

        const giftCard = await db.getGiftCardById(input.giftCardId);
        if (!giftCard) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gift card no encontrada" });
        }

        if (giftCard.purchaseStatus !== "completed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se pueden reenviar gift cards completadas" });
        }

        const emailTo = giftCard.recipientEmail || giftCard.senderEmail;
        if (!emailTo) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No hay email de destino" });
        }

        try {
          const { sendGiftCardEmail } = await import("./_core/email");
          const { generateGiftCardPDF } = await import("./giftcardPdfGenerator");

          const pdfBuffer = await generateGiftCardPDF({
            amount: giftCard.amount,
            recipientName: giftCard.recipientName || "Destinatario",
            recipientEmail: giftCard.recipientEmail || "",
            message: giftCard.personalMessage || undefined,
            backgroundImage: giftCard.backgroundImage || "/images/giftcard-backgrounds/spa-green.jpg",
            code: giftCard.code,
          });

          await sendGiftCardEmail({
            to: emailTo,
            recipientName: giftCard.recipientName || "Estimado/a",
            senderName: giftCard.senderName,
            amount: giftCard.amount,
            code: giftCard.code,
            message: giftCard.personalMessage,
            pdfBuffer,
          });

          await db.updateGiftCard(giftCard.id, {
            deliveredAt: new Date(),
          });

          return { success: true, message: "Email reenviado correctamente" };
        } catch (error: any) {
          console.error("Error reenviando email de gift card:", error);
          throw new TRPCError({ 
            code: "INTERNAL_SERVER_ERROR", 
            message: `Error al reenviar email: ${error.message}` 
          });
        }
      }),

    /**
     * Marcar gift cards pendientes antiguas como abandonadas
     * Gift cards en estado "pending" por más de 30 minutos se consideran abandonadas
     */
    markAbandonedGiftCards: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos" });
        }

        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const result = await db.markAbandonedGiftCards(thirtyMinutesAgo);
        
        return { 
          success: true, 
          message: `${result.count} gift cards marcadas como abandonadas`,
          count: result.count
        };
      }),
  }),

  // Eventos (público)
  events: router({
    getActive: publicProcedure.query(async () => {
      return await db.getActiveEvents();
    }),

    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        return await db.getEventBySlug(input.slug);
      }),

    // Admin: listar todos los eventos
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getAllEvents();
    }),
  }),

  // ============================================
  // TRADUCCIONES AUTOMÁTICAS
  // ============================================
  translations: router({
    // Obtener traducción de un contenido específico
    get: publicProcedure
      .input(z.object({
        contentKey: z.string(),
        language: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getTranslation(input.contentKey, input.language);
      }),

    // Obtener múltiples traducciones de una vez
    getBatch: publicProcedure
      .input(z.object({
        contentKeys: z.array(z.string()),
        language: z.string(),
      }))
      .query(async ({ input }) => {
        const translations: Record<string, string> = {};
        for (const key of input.contentKeys) {
          const t = await db.getTranslation(key, input.language);
          if (t) {
            translations[key] = t.translatedContent;
          }
        }
        return translations;
      }),

    // Traducir contenido automáticamente con IA
    translate: publicProcedure
      .input(z.object({
        contentKey: z.string(),
        originalContent: z.string(),
        targetLanguage: z.string(),
        context: z.string().optional(), // Contexto para mejor traducción (ej: "página de servicios de spa")
      }))
      .mutation(async ({ input }) => {
        // Verificar si ya existe y no necesita actualización
        const needsUpdate = await db.needsRetranslation(
          input.contentKey,
          input.targetLanguage,
          input.originalContent
        );

        if (!needsUpdate) {
          const existing = await db.getTranslation(input.contentKey, input.targetLanguage);
          return { translatedContent: existing?.translatedContent, cached: true };
        }

        // Mapeo de códigos de idioma a nombres
        const languageNames: Record<string, string> = {
          en: "English",
          pt: "Portuguese (Brazilian)",
          fr: "French",
          de: "German",
        };

        const targetLanguageName = languageNames[input.targetLanguage] || input.targetLanguage;

        // Generar traducción con IA
        const systemPrompt = `You are a professional translator for a luxury spa and wellness center website called "Cancagua Spa & Retreat Center" located in southern Chile (Lago Llanquihue area).

Translate the following Spanish text to ${targetLanguageName}.

Guidelines:
- Maintain the tone: professional, warm, and inviting
- Keep proper nouns unchanged (Cancagua, Frutillar, Lago Llanquihue, etc.)
- Preserve any HTML tags or formatting
- Use appropriate terminology for spa/wellness industry
- For prices in CLP (Chilean Pesos), keep the format as-is
- Adapt cultural references appropriately
${input.context ? `\nContext: ${input.context}` : ""}

Respond ONLY with the translated text, no explanations.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.originalContent },
          ],
        });

        const translatedContent = response.choices[0].message.content as string;

        // Guardar en base de datos
        await db.createOrUpdateTranslation({
          contentKey: input.contentKey,
          language: input.targetLanguage,
          originalContent: input.originalContent,
          translatedContent: translatedContent.trim(),
        });

        return { translatedContent: translatedContent.trim(), cached: false };
      }),

    // Traducir múltiples contenidos en batch
    translateBatch: publicProcedure
      .input(z.object({
        items: z.array(z.object({
          contentKey: z.string(),
          originalContent: z.string(),
        })),
        targetLanguage: z.string(),
        context: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const results: Record<string, string> = {};

        // Filtrar los que necesitan traducción
        const toTranslate: Array<{ key: string; content: string }> = [];

        for (const item of input.items) {
          const needsUpdate = await db.needsRetranslation(
            item.contentKey,
            input.targetLanguage,
            item.originalContent
          );

          if (!needsUpdate) {
            const existing = await db.getTranslation(item.contentKey, input.targetLanguage);
            if (existing) {
              results[item.contentKey] = existing.translatedContent;
            }
          } else {
            toTranslate.push({ key: item.contentKey, content: item.originalContent });
          }
        }

        // Si hay contenido para traducir, hacerlo en batch
        if (toTranslate.length > 0) {
          const languageNames: Record<string, string> = {
            en: "English",
            pt: "Portuguese (Brazilian)",
            fr: "French",
            de: "German",
          };

          const targetLanguageName = languageNames[input.targetLanguage] || input.targetLanguage;

          // Crear un JSON con todos los textos a traducir
          const textsToTranslate = toTranslate.reduce((acc, item) => {
            acc[item.key] = item.content;
            return acc;
          }, {} as Record<string, string>);

          const systemPrompt = `You are a professional translator for a luxury spa website called "Cancagua Spa & Retreat Center".

Translate ALL the following Spanish texts to ${targetLanguageName}.

Guidelines:
- Maintain professional, warm tone
- Keep proper nouns unchanged
- Preserve HTML tags
${input.context ? `\nContext: ${input.context}` : ""}

Respond with a JSON object using the same keys, with translated values.
Example input: {"key1": "Hola mundo"}
Example output: {"key1": "Hello world"}`;

          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: JSON.stringify(textsToTranslate) },
            ],
          });

          try {
            const content = response.choices[0].message.content as string;
            // Limpiar el contenido de posibles backticks de markdown
            const cleanContent = content.replace(/```json\n?|```\n?/g, "").trim();
            const translations = JSON.parse(cleanContent);

            // Guardar cada traducción
            for (const item of toTranslate) {
              if (translations[item.key]) {
                await db.createOrUpdateTranslation({
                  contentKey: item.key,
                  language: input.targetLanguage,
                  originalContent: item.content,
                  translatedContent: translations[item.key],
                });
                results[item.key] = translations[item.key];
              }
            }
          } catch (e) {
            console.error("Error parsing batch translation:", e);
            // Fallback: traducir uno por uno
            for (const item of toTranslate) {
              const singleResponse = await invokeLLM({
                messages: [
                  { role: "system", content: `Translate to ${targetLanguageName}. Respond only with the translation.` },
                  { role: "user", content: item.content },
                ],
              });
              const translated = (singleResponse.choices[0].message.content as string).trim();
              await db.createOrUpdateTranslation({
                contentKey: item.key,
                language: input.targetLanguage,
                originalContent: item.content,
                translatedContent: translated,
              });
              results[item.key] = translated;
            }
          }
        }

        return results;
      }),

    // Admin: listar todas las traducciones
    list: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getAllTranslations();
      }),

    // Admin: actualizar traducción manualmente
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        translatedContent: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.updateTranslationContent(input.id, input.translatedContent, ctx.user.id);
      }),

    // Admin: eliminar traducción
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.deleteTranslation(input.id);
      }),

    // Admin: regenerar traducción
    regenerate: protectedProcedure
      .input(z.object({
        id: z.number(),
        context: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        // Obtener la traducción actual
        const translations = await db.getAllTranslations();
        const current = translations.find(t => t.id === input.id);

        if (!current) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Eliminar la traducción actual para forzar regeneración
        await db.deleteTranslation(input.id);

        // La próxima vez que se solicite, se regenerará automáticamente
        return { success: true, message: "Traducción eliminada. Se regenerará automáticamente." };
      }),
  }),

  // Marketing ROI & Investments (CMS - solo admin y editor)
  marketing: router({
    getAllInvestments: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getAllMarketingInvestments();
    }),

    createInvestment: protectedProcedure
      .input(z.object({
        channel: z.enum(["seo", "facebook_organic", "instagram_organic", "tiktok_organic", "facebook_ads", "instagram_ads", "google_ads", "tiktok_ads", "other"]),
        amount: z.number(),
        startDate: z.date(),
        endDate: z.date(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.createMarketingInvestment(input);
        return { success: true };
      }),

    updateInvestment: protectedProcedure
      .input(z.object({
        id: z.number(),
        channel: z.enum(["seo", "facebook_organic", "instagram_organic", "tiktok_organic", "facebook_ads", "instagram_ads", "google_ads", "tiktok_ads", "other"]).optional(),
        amount: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...data } = input;
        await db.updateMarketingInvestment(id, data);
        return { success: true };
      }),

    deleteInvestment: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.deleteMarketingInvestment(input.id);
        return { success: true };
      }),

    getROIReport: protectedProcedure
      .input(z.object({
        startDate: z.date(),
        endDate: z.date(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getMarketingROIReport(input);
      }),
  }),

  // Integración Skedu

  // ============================================
  // DEALS (NEGOCIOS) - Sistema de Cotizaciones B2B
  // ============================================
  deals: router({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "seller") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getAllDeals();
    }),

    getWithQuoteCount: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "seller") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getDealsWithQuoteCount();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "seller") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getDealById(input.id);
      }),

    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "seller") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.searchDeals(input.query);
      }),

    getQuotes: protectedProcedure
      .input(z.object({ dealId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "seller") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getQuotesByDealId(input.dealId);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        pipeline: z.string().optional(),
        stage: z.string().optional(),
        value: z.number().optional(),
        closeDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "seller") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.createDeal({
          ...input,
          ownerId: ctx.user.id,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        pipeline: z.string().optional(),
        stage: z.string().optional(),
        value: z.number().optional(),
        closeDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "seller") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...data } = input;
        await db.updateDeal(id, data);
        return { success: true };
      }),

    updateStage: protectedProcedure
      .input(z.object({
        id: z.number(),
        stage: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "seller") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.updateDealStage(input.id, input.stage);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "seller") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.deleteDeal(input.id);
        return { success: true };
      }),
  }),

  // Búsqueda de clientes corporativos
  corporateClientsSearch: router({
    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "seller") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.searchCorporateClients(input.query);
      }),
  }),

  // ============================================
  // REPORTES DE MANTENCIÓN
  // ============================================
  maintenance: router({
    // Listar todos los reportes
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getAllMaintenanceReports();
    }),

    // Obtener un reporte por ID con sus fotos
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const report = await db.getMaintenanceReportById(input.id);
        if (!report) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Reporte no encontrado" });
        }
        return report;
      }),

    // Obtener estadísticas
    stats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getMaintenanceStats();
    }),

    // Crear un nuevo reporte
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1, "El título es requerido"),
        area: z.string().optional(),
        equipment: z.string().optional(),
        location: z.string().optional(),
        status: z.enum(["pending", "in_progress", "completed", "requires_follow_up"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        maintenanceType: z.enum(["preventive", "corrective", "emergency"]).optional(),
        description: z.string().optional(),
        resolution: z.string().optional(),
        materialsUsed: z.string().optional(),
        observations: z.string().optional(),
        assignedToId: z.number().optional(),
        scheduledDate: z.string().optional(),
        startedAt: z.string().optional(),
        completedAt: z.string().optional(),
        nextMaintenanceDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        
        const report = await db.createMaintenanceReport({
          ...input,
          reportedById: ctx.user.id,
          scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : undefined,
          startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
          completedAt: input.completedAt ? new Date(input.completedAt) : undefined,
          nextMaintenanceDate: input.nextMaintenanceDate ? new Date(input.nextMaintenanceDate) : undefined,
        });
        
        return report;
      }),

    // Actualizar un reporte
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        area: z.string().optional(),
        equipment: z.string().optional(),
        location: z.string().optional(),
        status: z.enum(["pending", "in_progress", "completed", "requires_follow_up"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        maintenanceType: z.enum(["preventive", "corrective", "emergency"]).optional(),
        description: z.string().optional(),
        resolution: z.string().optional(),
        materialsUsed: z.string().optional(),
        observations: z.string().optional(),
        assignedToId: z.number().optional(),
        scheduledDate: z.string().optional(),
        startedAt: z.string().optional(),
        completedAt: z.string().optional(),
        nextMaintenanceDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        
        const { id, ...data } = input;
        
        // Obtener reporte actual para registrar cambio de estado
        const currentReport = await db.getMaintenanceReportById(id);
        if (!currentReport) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Reporte no encontrado" });
        }
        
        // Si cambió el estado, registrar en historial
        if (data.status && data.status !== currentReport.status) {
          await db.addMaintenanceReportHistory({
            reportId: id,
            previousStatus: currentReport.status,
            newStatus: data.status,
            changedById: ctx.user.id,
          });
        }
        
        await db.updateMaintenanceReport(id, {
          ...data,
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined,
          startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
          nextMaintenanceDate: data.nextMaintenanceDate ? new Date(data.nextMaintenanceDate) : undefined,
        });
        
        return { success: true };
      }),

    // Eliminar un reporte
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.deleteMaintenanceReport(input.id);
        return { success: true };
      }),

    // Subir foto a un reporte
    addPhoto: protectedProcedure
      .input(z.object({
        reportId: z.number(),
        imageData: z.string(), // Base64 encoded image
        description: z.string().optional(),
        photoType: z.enum(["before", "during", "after", "evidence"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        
        const { storagePut } = await import("./storage");
        
        // Extraer el tipo de imagen y datos del base64
        const matches = input.imageData.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de imagen inválido" });
        }
        
        const imageType = matches[1];
        const base64Data = matches[2];
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Generar nombre único para el archivo
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const fileName = `maintenance-${input.reportId}-${timestamp}-${randomSuffix}.${imageType}`;
        const fileKey = `maintenance-reports/${fileName}`;
        
        const { url } = await storagePut(fileKey, imageBuffer, `image/${imageType}`);
        
        // Guardar referencia en la base de datos
        const photo = await db.addMaintenanceReportPhoto({
          reportId: input.reportId,
          url,
          description: input.description,
          photoType: input.photoType || "evidence",
          uploadedById: ctx.user.id,
        });
        
        return photo;
      }),

    // Eliminar foto de un reporte
    deletePhoto: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await db.deleteMaintenanceReportPhoto(input.photoId);
        return { success: true };
      }),

    // Obtener historial de cambios de un reporte
    getHistory: protectedProcedure
      .input(z.object({ reportId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin" && ctx.user.role !== "editor") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return await db.getMaintenanceReportHistory(input.reportId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
