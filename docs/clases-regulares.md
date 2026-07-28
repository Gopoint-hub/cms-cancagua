# Módulo Clases Regulares

## Alcance

El módulo vive bajo `/cms/clases-regulares` y administra:

- clases, fotografías y horarios recurrentes;
- profesores, usuarios CMS y acuerdos económicos vigentes por fecha;
- alumnos, planes, pagos, créditos y postergaciones;
- sesiones y asistencias sin reserva previa;
- liquidaciones congeladas por período;
- beneficios de permanencia, sauna y Pulso;
- invitaciones de pago y campañas segmentadas.

La página pública `cancagua.cl/clases` y su checkout no forman parte de esta etapa. El
CMS conserva `payment_base_url` como configuración para conectar ese flujo después.

## Fórmula

Todos los montos son CLP.

```text
valor_asistencia = precio_pagado / créditos_incluidos
comisión_profesor = valor_asistencia × asistencias_con_profesor × porcentaje_profesor
ingreso_cancagua = precio_pagado - suma_comisiones_profesores
```

El denominador son los créditos contratados (4, 8, 12, 16 o 20), no las asistencias
realizadas. Los créditos no utilizados quedan como ingreso Cancagua y vencen al terminar
el período.

La comisión contiene los impuestos:

- boleta de honorarios: se descuenta la retención del líquido a transferir;
- factura afecta: el IVA se extrae del monto de la comisión, no se agrega;
- factura exenta: comisión y total del documento son iguales.

## Permisos

- `super_admin` y `admin`: administración completa.
- `cancagua_staff`: alumnos, pagos e inscripciones en recepción.
- Profesor vinculado: asistencia, alumnos nuevos y liquidación propia.

La capacidad `users.regular_classes_teacher` es acumulable. Un usuario puede conservar
su rol `massage_therapist` y, al mismo tiempo, operar como profesor de clases.

## Períodos y postergación

El inicio predeterminado es el día 26 y puede cambiarse para períodos futuros. Una
mensualidad pagada puede pasar al período siguiente sólo si tiene cero asistencias. La
acción exige motivo y queda en auditoría.

## Migración y compatibilidad de despliegue

- Migración: `drizzle/0030_regular_classes.sql`.
- Verificación idempotente al iniciar: `server/ensureRegularClassesSchema.ts`.

La verificación de inicio crea las tablas faltantes y carga los profesores, cinco
disciplinas, diez horarios y seis planes iniciales.

## Rutas del CMS

- `/cms/clases-regulares`
- `/cms/clases-regulares/asistencia`
- `/cms/clases-regulares/mis-liquidaciones`
- `/cms/clases-regulares/alumnos`
- `/cms/clases-regulares/clases`
- `/cms/clases-regulares/profesores`
- `/cms/clases-regulares/liquidaciones`
- `/cms/clases-regulares/comunicaciones`
- `/cms/clases-regulares/configuracion`

## Activación operacional

Antes de uso real:

1. Completar correo y tipo de documento de cada profesor.
2. Vincular o invitar su usuario CMS.
3. Completar descripciones, fotografías, ubicaciones y capacidades.
4. Verificar `payment_base_url`.
5. Cargar alumnos y sus períodos.
6. Ejecutar un cierre de prueba y compararlo con la planilla histórica.
