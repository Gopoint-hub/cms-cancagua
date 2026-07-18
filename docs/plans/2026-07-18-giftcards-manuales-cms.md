# Creación manual de Gift Cards en CMS — Plan de implementación

> **For Hermes:** Implementar con TDD y verificar en producción.

**Goal:** Permitir que cualquier usuario autenticado del CMS cree y registre Gift Cards con monto o por servicio, sin integrar pago ni enviar automáticamente.

**Architecture:** Extender el flujo manual existente. Un helper puro construirá el registro persistente; el router validará permisos e input; el formulario permitirá elegir modalidad, diseño y destinatario. Las Gift Cards se guardarán activas/completadas y quedarán disponibles para PDF o envío posterior.

**Tech Stack:** React, tRPC, Zod, TypeScript, Drizzle/MySQL, Vitest.

---

### Task 1: Modelo de creación manual
- Crear `server/manualGiftCards.ts` y `server/manualGiftCards.test.ts`.
- Probar modalidad con monto y modalidad por servicio sin monto.
- Garantizar que no se registre pago ni envío automático.

### Task 2: Endpoint CMS
- Modificar `server/routers.ts`.
- Aceptar `type`, monto opcional, servicio y detalle.
- Mantener autenticación CMS para creación y lectura; todos los roles autenticados pueden acceder.

### Task 3: Formulario e historial
- Modificar `client/src/pages/cms/GiftCardsSales.tsx`.
- Agregar selector “Con monto / Por servicio”.
- Mostrar servicio en vez de `$0`, permitir correo opcional y guardar sin enviar.

### Task 4: Verificación y publicación
- Ejecutar pruebas específicas, suite y build.
- Generar un PDF de prueba.
- Publicar en `main`, verificar despliegue Render y probar la pantalla en producción.
