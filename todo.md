# Cancagua CMS - TODO

## Esquema de Base de Datos
- [x] Migrar esquema completo de Drizzle (37+ tablas)
- [x] Ejecutar db:push para crear tablas
- [x] Adaptar conexión de TiDB a MySQL de Manus
- [x] Migrar db.ts completo (2400+ líneas de queries)

## Integraciones
- [x] Configurar Cloudinary (upload/delete archivos)
- [x] Configurar Resend (envío de emails)
- [x] Configurar IA de Manus (reemplazar Gemini/OpenAI) - usa invokeLLM integrado

## Sistema de Autenticación
- [x] Migrar auth.ts (email/password, JWT, bcrypt)
- [x] Migrar context.ts y trpc.ts (protectedProcedure, adminProcedure)
- [x] Configurar shared/const.ts y shared/_core/errors.ts
- [x] Verificar login funcional con credenciales reales

## Archivos de Servidor
- [x] Copiar pdfGenerator.ts y giftcardPdfGenerator.ts
- [x] Copiar quoteHelpers.ts
- [x] Copiar email.ts (_core)
- [x] Copiar cloudinaryStorage.ts
- [x] Crear stubs para WebPay (no necesario en CMS)
- [x] Crear stubs para WhatsApp
- [x] Crear stubs para upload-brand-images

## Routers tRPC del CMS
- [x] Router auth (login, me, logout, reset password, invitaciones)
- [x] Router menuAdmin (CRUD carta/menú)
- [x] Router upload (subir archivos a Cloudinary)
- [x] Router users (gestión de usuarios)
- [x] Router corporateProducts (productos corporativos)
- [x] Router corporateClients (clientes corporativos)
- [x] Router quotes (cotizaciones)
- [x] Router newsletters (envío de newsletters)
- [x] Router subscribers (gestión de suscriptores)
- [x] Router lists (listas de suscriptores)
- [x] Router discountCodes (códigos de descuento)
- [x] Router giftCardsAdmin (administración gift cards)
- [x] Router marketing (inversiones marketing)
- [x] Router deals (convenios)
- [x] Router maintenance (reportes de mantención)
- [x] Router translations (gestión de traducciones)
- [x] Router bookings (admin de reservas)
- [x] Router contactMessages (admin de mensajes)

## Páginas del CMS (React)
- [x] Login page
- [x] Dashboard principal
- [x] Administración de carta/menú
- [x] Gestión de reservas
- [x] Mensajes de contacto
- [x] Gift Cards Sales
- [x] Newsletters (crear, enviar, historial)
- [x] Suscriptores
- [x] Listas de suscriptores
- [x] Cotizaciones corporativas
- [x] Productos corporativos
- [x] Clientes corporativos (ComingSoon - igual que original)
- [x] Códigos de descuento
- [x] Marketing/inversiones
- [x] Convenios (Deals)
- [x] Reportes de mantención
- [x] Traducciones
- [x] Administración de usuarios
- [x] Integraciones (sin Skedu)
- [x] Analytics (ComingSoon - igual que original)
- [x] Admin/configuración (ComingSoon - igual que original)
- [x] Servicios (ComingSoon - igual que original)
- [x] Eventos (ComingSoon - igual que original)

## Componentes UI
- [x] DashboardLayout (sidebar navigation)
- [x] Componentes shadcn necesarios

## Estilos y Tema
- [x] Copiar index.css con colores de marca Cancagua
- [x] Configurar fuentes (Playfair Display, Inter)
- [x] Configurar const.ts con login por email/password

## Migración de Datos
- [x] Exportar datos de TiDB actual
- [x] Importar datos a DB de Manus
- [x] Verificar integridad de datos (5 usuarios, 12 gift cards, 38 servicios, etc.)

## Pruebas
- [x] Tests vitest para secrets (Cloudinary, Resend)
- [x] Tests vitest para auth (me, logout)
- [x] Tests vitest para estructura de routers
- [x] Tests vitest para procedimientos protegidos
- [x] Todos los tests pasando (10/10)

## Pendiente
- [ ] Verificar que todas las páginas cargan correctamente con datos reales
- [ ] Preparar instrucciones para separación del frontend en Render
