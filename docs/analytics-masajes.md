# Medición del embudo de masajes

## Qué queda medido

El sitio público y las dos pantallas públicas del CMS usan el mismo contenedor
`GTM-NNGGT92W`. El CMS no carga GTM en las páginas internas autenticadas.

Eventos enviados al `dataLayer`:

| Etapa | Evento |
| --- | --- |
| Catálogo visible | `view_item_list` |
| Agregar, quitar o ver carrito | `add_to_cart`, `remove_from_cart`, `view_cart` |
| Salir del sitio público hacia la agenda | `begin_checkout` |
| Abrir agenda | `checkout_schedule_started` |
| Elegir un horario | `select_massage_slot`, `schedule_selected` |
| Completar datos | `checkout_details_completed` |
| Ir a Getnet | `add_payment_info`, `payment_redirect` |
| Error al crear pago | `payment_start_failed` |
| Resultado visto en el navegador | `payment_approved`, `payment_failed` |
| Compra aprobada | `purchase` desde el servidor |

Los eventos de comercio incluyen moneda CLP, valor, técnica, duración, precio,
cantidad y cupón. No se envía nombre, email, teléfono ni notas a GA4.

Además, `massage_checkout_sessions` conserva el estado anónimo de cada checkout.
El panel **Masajes → Ventas & Analytics** muestra el embudo, conversión, aprobación
de Getnet y abandonos por etapa. Un checkout sin actividad se marca abandonado:

- dos horas después de haber sido enviado a Getnet;
- 24 horas en cualquier etapa anterior.

La medición no es retroactiva: comienza al desplegar esta versión.

## Configuración pendiente en Google Tag Manager

1. En el contenedor `GTM-NNGGT92W`, conservar una sola etiqueta **Google tag**
   con ID `G-Z39NWW3H26`, activada en todas las páginas donde carga el contenedor.
2. Crear etiquetas de evento GA4 para los eventos de la tabla. Para los eventos
   de ecommerce, habilitar **Send Ecommerce data → Data Layer**.
3. Usar un activador **Custom Event** con los nombres exactos. Puede emplearse
   una expresión regular para agrupar los eventos.
4. Registrar `checkout_id`, `booking_date`, `booking_time`, `payment_type` y
   `payment_status` como dimensiones personalizadas si se quieren usar en
   exploraciones. No registrar información personal.
5. Probar en Preview/Tag Assistant ambos hosts y publicar el contenedor.

## Configuración pendiente en GA4

En **Administrar → Flujos de datos → Web → Configurar ajustes de etiqueta →
Configurar tus dominios**, incluir:

- `cancagua.cl`
- `cms.cancagua.cl`

La navegación se realiza mediante un enlace real para que el linker de Google
pueda adjuntar `_gl` y conservar la sesión entre ambos hosts.

Crear un secreto de Measurement Protocol en el mismo flujo web y configurar en
el entorno de producción del CMS:

```text
GA4_MEASUREMENT_ID=G-Z39NWW3H26
GA4_API_SECRET=<secreto generado en GA4>
```

Sin `GA4_API_SECRET`, el embudo propio y los eventos del navegador funcionan,
pero el servidor omite `purchase`. El secreto nunca debe llevar prefijo `VITE_`
ni incluirse en el frontend.

## Verificación antes de publicar

1. Abrir Tag Assistant en `cancagua.cl/servicios/masajes`.
2. Agregar un masaje y comprobar `view_item_list`, `add_to_cart`,
   `view_cart` y `begin_checkout`.
3. Confirmar que la URL del CMS recibe `checkout_id` y, tras la decoración de
   Google, `_gl`.
4. Elegir fecha/hora, completar los datos y comprobar
   `schedule_selected`, `checkout_details_completed` y `add_payment_info`.
5. Hacer un pago de prueba en Getnet.
6. Comprobar una sola fila `paid` en `massage_checkout_sessions`, un solo
   `transaction_id` en GA4 DebugView y la venta correspondiente en
   `massage_sales`.
7. Revisar que una página interna como `/cms/masajes/agenda` no cargue GTM.

## Fuente de verdad

- GA4: adquisición, campañas y análisis de comportamiento.
- `massage_checkout_sessions`: etapas y abandonos operativos.
- Getnet + `massage_bookings`: estado del pago y de la reserva.
- `massage_sales`: libro histórico de ventas.

Una compra se confirma desde el webhook de Getnet. La página de retorno conserva
el mecanismo de respaldo si el webhook se demora. El envío server-side usa
`getnetRequestId` como `transaction_id` y un reclamo atómico para evitar
duplicados entre ambos caminos.
