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

## Actualización: Módulo Concierge (Feb 6 2026)
- [x] Migrar esquema de tablas concierge (concierge_services, concierge_sellers, concierge_sales, concierge_seller_metrics)
- [x] Actualizar rol de usuario para incluir 'concierge'
- [x] Copiar conciergeDb.ts (505 líneas)
- [x] Copiar conciergeRouter.ts (417 líneas)
- [x] Copiar conciergeWebhook.ts (182 líneas) - adaptado sin Skedu real
- [x] Copiar skedu.ts (343 líneas) - adaptado como stub
- [x] Copiar páginas concierge: HerramientaVenta.tsx, ServiciosDisponibles.tsx, Vendedores.tsx
- [x] Actualizar DashboardLayout con categoría "Ventas" y eliminar resúmenes
- [x] Actualizar App.tsx con rutas concierge y eliminar rutas de resúmenes
- [x] Agregar router services.getAll y users.getByRole a routers.ts
- [x] Registrar webhook concierge en server/_core/index.ts
- [x] Ejecutar db:push para crear tablas concierge
- [x] Verificar y tests (10/10 pasando)

## Rehacer Módulo Concierge (Feb 8 2026)

### Backend
- [x] Configurar credenciales WebPay (API_KEY, COMMERCE_CODE, ENVIRONMENT)
- [x] Configurar FRONTEND_URL y CONTACT_EMAIL en env
- [x] Instalar transbank-sdk
- [x] Implementar webpay.ts real (initiate + confirm transaction)
- [x] Rehacer conciergeDb.ts con lógica de ventas, comisiones y estados
- [x] Rehacer conciergeRouter.ts con endpoints para vendedor y admin
- [x] Crear endpoints públicos para WebPay (initiate-payment, confirm-payment)
- [x] Implementar emails: link de pago al cliente, confirmación al vendedor, notificación a contacto@cancagua.cl
- [x] Implementar email de pago fallido al cliente y vendedor
- [x] Configurar CORS para permitir llamadas desde cancagua.cl

### Frontend - Vendedor (rol concierge)
- [x] Página de venta: seleccionar servicio → formulario datos cliente → enviar link de pago
- [x] Vista de estado de ventas del vendedor (pendientes, completadas, fallidas)
- [x] Página "Mis Comisiones": ver comisiones propias acumuladas

### Frontend - Admin
- [x] Vista de todas las ventas de todos los vendedores
- [x] Vista de comisiones por vendedor
- [x] CRUD de servicios concierge
- [x] CRUD de vendedores con porcentaje de comisión

### Página de confirmación (para el frontend en Render)
- [x] Preparar instrucciones para crear página cancagua.cl/concierge/payment-result
- [x] Documentar endpoint público del CMS para confirmar pago

### Tests
- [x] Test de estructura de router concierge (18 tests)
- [x] Test de endpoints de pago público
- [x] Test de funciones WebPay (buyOrder, sessionId, isApproved)
- [x] Test de credenciales WebPay producción
- [x] Test de acceso protegido (admin y concierge)
- [x] Todos los tests pasando (31/31)

## Mejoras Módulo Concierge (Feb 8 2026 - v2)

### Servicios con precios diferenciados
- [x] Crear tabla concierge_service_prices para precios diferenciados (adulto, niño, etc.)
- [x] Conectar servicios concierge con datos de Skedu (nombre, descripción del servicio)
- [x] Actualizar backend para CRUD de precios diferenciados por servicio
- [x] Actualizar frontend ServiciosDisponibles para mostrar/editar precios diferenciados
- [x] Actualizar HerramientaVenta para que vendedor seleccione tipo de precio al crear venta

### Vendedores → Módulo Usuarios
- [x] Botón "Añadir vendedor" redirige al módulo Usuarios
- [x] Simplificar vista de Vendedores para que trabaje con usuarios existentes

### Tests
- [x] Actualizar tests para nuevas funcionalidades (31/31 pasando)

## Importación de Traducciones desde CMS Antiguo
- [x] Verificar estado actual de tabla content_translations en CMS nuevo
- [x] Extraer las 1.408 traducciones del CMS antiguo
- [x] Importar traducciones a la base de datos del CMS nuevo (1408/1408, 0 errores)
- [x] Verificar que la importación sea correcta (en:690, pt:351, fr:253, de:114)

## Bug Fix: Link de validación de email 404
- [x] Corregir link de validación de email al invitar vendedores (APP_URL apuntaba a cancagua.cl en vez de cms.cancagua.cl)

## Bug Fix: Logo roto en newsletters
- [x] Corregir imagen del logo rota al crear/enviar newsletters (URLs de Cloudinary corregidas en upload-brand-images.ts, giftcardPdfGenerator.ts y ReportesMantencion.tsx)

## Importación limpia de clientes con listas segmentadas
- [x] Eliminar suscriptores actuales y listas existentes
- [x] Importar 4.806 suscriptores únicos desde Excel
- [x] Crear 6 listas por servicio (Hot Tub, Masajes, Biopiscinas, Sauna, Tablas, Clases)
- [x] Crear 51 listas por evento
- [x] Crear 411 listas por ubicación con fuzzy matching
- [x] Asignar 9.669 suscriptores a listas correspondientes

## Unificación de listas y mejora UI
- [x] Analizar y proponer unificaciones de listas duplicadas
- [x] Unificar variantes de Osorno en una sola lista
- [x] Unificar variantes de Frutillar en una sola lista
- [x] Agrupar listas por países (Otros Países para países pequeños)
- [x] Eliminar listas basura (empresas, datos incorrectos)
- [x] Unificar comunas de Santiago en "Santiago"
- [x] Unificar todas las variantes de ciudades (Puerto Montt, Puerto Varas, Valdivia, Temuco, etc.)
- [x] Cambiar vista de listas de tarjetas a tabla con filtros por categoría
- [x] Agregar bulk actions (eliminar seleccionadas, seleccionar todo)
- [x] Agregar endpoint bulkDelete al router de listas
- [x] Resultado: 152 listas (6 servicios, 51 eventos, 95 ubicaciones)

## Correcciones Módulo B2B Cotizaciones
- [x] Fix: cotizaciones no se guardan como borrador (createQuote retornaba objeto sin .success)
- [x] Fix: error al guardar cotización (schema validation corregida)
- [x] Fix: error al publicar y enviar cotización
- [x] Permitir agregar múltiples servicios desde la biblioteca al mismo tiempo (checkboxes multi-select)
- [x] Quitar opción de pago online (reducido de 6 a 5 pasos, datos bancarios en vista previa)
- [x] Ajustar ancho de previsualización de cotización (max-w-4xl en revisión)
- [x] Cambiar teléfono del footer a +56 9 8224 3411 (wizard + pdfGenerator)
- [x] Permitir editar cotización desde el módulo cotizaciones (botón Edit + carga de datos)
- [x] Permitir crear nueva cotización desde el módulo cotizaciones (título 'Nueva cotización')

## Mejora Newsletter: Separar imágenes header y cuerpo
- [x] Backend: Actualizar generateDesign para aceptar headerImage y bodyImages por separado
- [x] Backend: Solo generar imagen hero con IA si no se proporciona headerImage
- [x] Backend: Actualizar prompt LLM para diferenciar imagen de header vs imágenes de cuerpo
- [x] Frontend: Separar campo de imágenes en "Imagen para header" e "Imágenes dentro del emailing"
- [x] Frontend: Indicar que la IA generará las imágenes si no se proporcionan
- [x] Tests: Verificar nueva estructura de campos (19 tests, 76 total pasando)

## Bug Fix: Editar cotización no carga datos existentes
- [x] Fix: Al editar una cotización, el wizard debe pre-llenar todos los campos con los datos existentes (useEffect corregido: evita re-ejecución, setea isCreatingDeal/isCreatingClient para mostrar formularios, carga deal data async)

## Bug Fix: PDF cotización - textos superpuestos
- [x] Fix: Los textos de descripción de productos se superponen entre filas cuando la descripción es extensa (altura de fila ahora se calcula dinámicamente con heightOfString + salto de página automático)

## Bug Fix: Copiar/editar emailing no carga contenido existente
- [x] Fix: Al copiar o editar un emailing, el wizard carga el HTML, subject, prompt y salta al paso 3 (diseño) directamente. Duplicar ahora redirige con el ID del nuevo newsletter.

## Agregar newsletter faltante
- [x] Newsletter San Valentín (ID 90007) cambiado de status "failed" a "draft" para poder reenviarlo

## Unsubscribe en newsletters
- [x] Agregar enlace de unsubscribe al pie de los emails enviados (inyección automática + placeholder {{unsubscribe_url}} en prompt LLM)
- [x] Crear endpoint/página de unsubscribe funcional (GET /api/unsubscribe?email=base64 con página de confirmación branded)

## Bug Fix: Error "Service Unavailable" al enviar newsletter
- [x] Fix: Error "Service Unavailable" al enviar newsletter (batch reducido de 100 a 50, retry con backoff exponencial hasta 3 intentos, pausa de 1s entre batches, logging detallado)
- [x] Fix: Convertir envío de newsletter a proceso asíncrono (respuesta inmediata, envío en background con retry)
- [x] Frontend: Mostrar toast con mensaje de envío iniciado, estado 'Enviando' visible en lista de newsletters
- [x] Backend: Endpoint sendStatus para consultar estado del envío
