# Propuesta de implementación — Sistema interno Cancagua

**Documento técnico-estratégico**
**Audiencia:** Mario (Cancagua)
**Fecha:** Mayo 2026
**Alcance:** Plan por etapas para internalizar reservas, operación y reportería, reduciendo dependencia de sistemas externos cuando convenga, sin disrupción operativa para el equipo.

---

## 1. Resumen ejecutivo

El documento que circuló internamente en Cancagua identifica fricciones reales en cuatro áreas (Masajes, F&B, Recepción y Coordinación/Eventos) y propone construir un sistema propio que reemplace gradualmente Skedu, y automatice tareas que hoy se hacen sobre Fudo y Chipax.

Esta propuesta toma esa visión y la traduce en un plan ejecutable de **seis etapas**, distribuidas en **10 a 13 meses**, con dos principios rectores:

1. **Convivencia, no reemplazo abrupto.** Skedu sigue operando hasta que el sistema propio demuestre estabilidad por tipo de servicio. La migración es gradual.
2. **Una vertical por etapa.** No se ataca todo en paralelo. El equipo absorbe cambios uno a uno.

La recomendación principal de este documento, antes de entrar al detalle, es:

- **Reemplazar Skedu**: sí, gradualmente. Es el proyecto con mayor retorno.
- **Reemplazar Fudo**: no. Se integra en lectura y se automatiza alrededor.
- **Reemplazar Chipax**: no. Se integra en lectura para cierre mensual automático.

Esta decisión está fundamentada en la sección 3 de este documento.

---

## 2. Contexto y lectura del estado actual

### 2.1 Lo que ya existe

Cancagua ya cuenta con un **CMS propio** que incluye módulos de productos, cotizaciones B2B, gift cards (con flujo de canje) y reportería operativa. Ese CMS es la base sobre la cual se construye este plan: no se parte de cero.

### 2.2 Las cuatro áreas con dolor identificado

| Área | Dolor principal | Fuente actual |
|---|---|---|
| Masajes | Reservas rígidas, sin gestión de terapeutas, sin inventario de insumos | Skedu |
| F&B | Cierre mensual manual, ingreso de inventario propenso a errores | Fudo + Chipax + Excel |
| Recepción | Sin vista del día clara, sin tracking de comisiones, atención manual de WhatsApp | Skedu + planillas |
| Coordinación / Eventos | Liquidación de facilitadores manual, sin flujo B2B integrado | Skedu + Excel + Sheets |

### 2.3 Supuesto de equipo de desarrollo

El plan asume **un desarrollador full-time** sostenido durante todo el proyecto. Los plazos pueden comprimirse a 7–9 meses sumando un segundo desarrollador a partir de la Etapa 3. Las Etapas 0 y 1 conviene mantenerlas con un único responsable arquitectónico para preservar coherencia del modelo de datos.

---

## 3. Recomendaciones estratégicas previas al plan

### 3.1 Qué conviene reemplazar y qué no

| Sistema | ¿Reemplazar? | Justificación |
|---|---|---|
| **Skedu** (reservas) | Sí, gradualmente | El reemplazo entrega valor de marca, control sobre la experiencia del cliente y elimina trabajo manual mensual. Alto ROI. |
| **Fudo** (POS gastronómico) | **No** | Reemplazarlo implica certificación SII de boleta electrónica, hardware de comandera, integración con tarjetas, manejo tributario de propinas y entrenamiento del equipo en un sistema crítico bajo presión. Es un proyecto en sí mismo de 6–12 meses con riesgo operativo alto. La sección F&B del documento original lo intuye correctamente: pide automatizar **alrededor** de Fudo, no reemplazarlo. |
| **Chipax** (contabilidad / SII) | **No** | Lo que entrega Chipax es cumplimiento contable-tributario chileno. Construir eso in-house no rinde y agrega responsabilidad regulatoria que hoy está delegada. Conviene integrar en lectura para automatizar el cierre mensual. |

### 3.2 Distinguir IA real de automatización

El documento original menciona "IA" en muchas propuestas. Conviene desde el inicio separarlas, porque tienen costo, plazo y riesgo distintos.

| Tipo | Ejemplos del documento | Tecnología |
|---|---|---|
| **Automatización pura** (sin LLM) | Comisiones automáticas, cálculo de propinas, recordatorios programados, alertas de stock, dashboard de KPI | Reglas de negocio + cron jobs |
| **IA real útil** (con LLM) | Bot WhatsApp conversacional, OCR de facturas, clasificación de gastos mixtos, redacción on-brand de mensajes, sugerencia de reseñas según sentimiento | Claude / GPT + APIs especializadas |

Recomendación: la IA real debe entrar a partir de la Etapa 5–6, cuando ya hay datos limpios y procesos estables. Antes, todo es automatización determinística.

### 3.3 Migración gradual por tipo de servicio

Cuando llegue el momento de reemplazar Skedu (Etapa 3), la migración no es de un solo golpe. Cada tipo de servicio se migra cuando opera dos semanas sin incidentes en el sistema propio. Hasta entonces, opera en ambos. El orden propuesto:

1. Clases regulares (yoga, danza) — flujo simple, volumen alto.
2. Masajes — incorpora terapeuta + sala + insumos.
3. Hot tubs y biopiscinas — capacidad por persona crítica.
4. Eventos puntuales y experiencias combinadas.

---

## 4. Plan por etapas

Cada etapa describe: **objetivo**, **alcance funcional**, **entregables**, **plazo estimado**, **impacto en el equipo** y **riesgo principal**.

---

### Etapa 0 — Preparación y arquitectura

**Plazo:** 3 semanas
**Sin código nuevo. Sin esto, las etapas siguientes se desordenan.**

#### Objetivo
Definir alcance, modelar datos y validar prioridades reales con cada área.

#### Alcance
- Auditoría del CMS actual: qué módulos existen, qué tablas, qué se reusa.
- Reuniones individuales con Berni (Coordinación), Constansa (Recepción), Luciana y Mario (Fundadores) para validar prioridades. El documento original mezcla peticiones de cuatro áreas con criterios distintos.
- Diseño del modelo de datos unificado: `clientes`, `servicios`, `recursos` (terapeuta / sala / biopiscina), `reservas`, `cupos`, `pagos`, `comisiones`.
- Decisión arquitectónica clave: **cupo por persona, no por reserva**. Esta decisión condiciona la Etapa 3.
- Acuerdo con Mario sobre qué propuestas de "IA" del documento son IA real y cuáles son automatización.

#### Entregables
- Documento técnico de alcance firmado.
- Modelo de datos diagramado.
- Roadmap consolidado con plazos y responsables.

#### Impacto en el equipo
Mínimo. Solo entrevistas.

#### Riesgo principal
Saltarse esta etapa o acortarla. Es la inversión que evita rehacer trabajo en las etapas 3 y 4.

---

### Etapa 1 — Cimientos invisibles

**Plazo:** 5–6 semanas
**Skedu sigue siendo el sistema oficial.**

#### Objetivo
Construir las bases internas y entregar dos victorias tempranas que el equipo empieza a usar de inmediato, sin reemplazar nada todavía.

#### Alcance
- Sincronización de lectura desde Skedu hacia el CMS (one-way). El CMS lee, no escribe.
- **Vista del día para recepción** dentro del CMS, en paralelo a Skedu (idea #4 de Recepción del documento original). Constansa empieza a usarla sin perder Skedu como fuente.
- **Códigos de descuento mejorados**: límite de usos + fecha de vencimiento (idea #10 Recepción).
- **Comisiones de recepcionistas automatizadas** (idea #11 Recepción): planilla generada automáticamente a partir de las ventas registradas en el CMS por cada usuario recepcionista. Reemplaza la planilla manual actual.
- Estructura de usuarios y roles: coordinación, recepción, fundadores, facilitadores.

#### Entregables
- Vista del día funcionando en el CMS.
- Módulo de comisiones de recepcionistas operativo.
- Códigos de descuento con límites configurables.
- Login con roles diferenciados.

#### Impacto en el equipo
Bajo. Constansa empieza a abrir el CMS para consultar la vista del día y registrar ventas extras. Es un cambio de hábito menor.

#### Riesgo principal
Subestimar el tiempo de la sincronización con Skedu. Hay que validar la API o el método de extracción antes de empezar.

---

### Etapa 2 — Operación interna

**Plazo:** 7–8 semanas
**Skedu sigue siendo la fuente de reservas.**

#### Objetivo
Eliminar el dolor mensual de Berni y dar visibilidad ejecutiva a Mario y Luciana.

#### Alcance
- **Módulo de facilitadores con liquidación** (sección 5 del documento original): % de comisión como **campo manual por facilitador**, exactamente como pide el documento. Reemplaza el Excel mensual.
- **Dashboard ejecutivo** para fundadores: ingresos por unidad de negocio (clases, eventos, masajes, B2B), ocupación promedio, comparativos mes a mes. Solo lectura.
- **Inventario básico de masajes**: ingreso manual de insumos, descuento automático según tipo de servicio realizado.
- **Recordatorios automáticos por email** on-brand (idea #6 Recepción, versión simple). WhatsApp queda para Etapa 6.
- **Encuesta post-visita** versión 1 (idea #7 Recepción): link al final del email, alerta interna a recepción si la nota baja un umbral.

#### Entregables
- Módulo de facilitadores con liquidación exportable en Excel/CSV.
- Dashboard ejecutivo accesible desde navegador.
- Inventario de masajes con descuento automático.
- Sistema de recordatorios y encuestas operativo.

#### Impacto en el equipo
Medio. Berni cambia su flujo de cierre mensual: en vez de armar Excel, valida y exporta. Capacitación: 2 sesiones.

#### Riesgo principal
Que el dashboard ejecutivo se diseñe sin alinear con Mario y Luciana qué métricas necesitan ver. Validar mockups antes de construir.

---

### Etapa 3 — Cara pública: reemplazo gradual de Skedu

**Plazo:** 10–12 semanas
**Aquí empieza la migración real.**

#### Objetivo
Construir el sitio público on-brand y migrar las reservas de Skedu al sistema propio, un tipo de servicio a la vez.

#### Alcance
- Sitio público con **navegación por intención** (sección 3.2 del documento original):

| Intención | Qué incluye |
|---|---|
| Venir a moverme | Yoga, danza, natación, funcional, meditación |
| Vivir una experiencia | Círculos, sonoterapia, danza consciente, encuentros |
| Cuidarme | Masajes y servicios individuales |
| Un día completo | Programa integrado de servicios |
| Traer a mi equipo | Retiros y jornadas corporativas (B2B) |

- Motor de reservas con **cupos por persona** (no por reserva), incluyendo capacidad por biopiscina y hot tub (idea #5 Recepción).
- **Pago integrado Transbank / GetNet** (la integración ya existe en el CMS, solo migrar).
- **Lista de espera automática** con notificación cuando se libera un cupo.
- **Cuenta de cliente** con historial de reservas y pagos.
- **Confirmación automática por email** on-brand.
- **Migración por servicio**, en este orden:
  1. Clases regulares.
  2. Masajes.
  3. Hot tubs y biopiscinas.
  4. Eventos puntuales.

Cada servicio convive con Skedu hasta dos semanas sin incidentes.

#### Entregables
- Sitio público en producción.
- Pago online operativo.
- Cuatro tipos de servicio migrados.
- Skedu apagado para esos servicios.

#### Impacto en el equipo
Alto. Recepción usa el sistema propio para ver reservas. Coordinación crea eventos en el sistema propio. Capacitación: ciclo completo, 1 sesión por tipo de servicio antes de su migración.

#### Riesgo principal
Pérdida de reservas durante la transición. Mitigación: convivencia obligatoria, no apagar Skedu hasta certificar estabilidad.

---

### Etapa 4 — Paquetes, B2B y gift cards integradas

**Plazo:** 7–8 semanas

#### Objetivo
Habilitar los flujos de venta más sofisticados que Skedu nunca permitió: paquetes combinados, B2B con cotización, gift cards trazables.

#### Alcance
- **Paquetes / experiencias combinadas** (idea #2 Recepción): el cliente arma su itinerario seleccionando varios servicios, el sistema toma cupos de cada agenda. Ejemplo: Pases Reconecta.
- **Flujo B2B completo** (sección 6 del documento original):
  1. Formulario de interés desde la web.
  2. Cotización editable generada desde el CMS.
  3. Link de pago de anticipo (50%) que confirma la fecha y la bloquea en el calendario interno.
  4. Link de pago del saldo post-evento.
  5. Registro automático en el cierre mensual.
- **Gift cards integradas al perfil del cliente** (idea #8 Recepción): saldo, vencimiento, historial de uso. Buena parte ya existe; esto la conecta al perfil.
- **Perfil de cliente con preferencias de bienestar** (idea #9 Recepción): alergias, técnicas preferidas, observaciones. Recepción lo ve antes de la llegada.

#### Entregables
- Editor de paquetes funcionando en cara pública.
- Flujo B2B completo de punta a punta.
- Gift cards conectadas al perfil de cliente.
- Ficha de preferencias por cliente.

#### Impacto en el equipo
Medio. Berni gestiona cotizaciones B2B desde el CMS en vez de Word/Excel. Recepción consulta preferencias antes de cada llegada.

#### Riesgo principal
Complejidad del cross-over de cupos en paquetes. Conviene diseñar el algoritmo de bloqueo de cupos en la Etapa 0.

---

### Etapa 5 — F&B sin reemplazar Fudo

**Plazo:** 6–8 semanas
**No se reemplaza Fudo ni Chipax. Se construye automatización encima.**

#### Objetivo
Eliminar el cierre manual y dar control de inventario sin tocar la operación de cafetería.

#### Alcance
- **Integración en lectura con Fudo** (API o exportación programada).
- **Integración en lectura con Chipax**.
- **Cierre mensual automatizado** (puntos 3.1 y 3.4 del documento original): cruce automático Fudo + CMS + Chipax, generación de reporte consolidado.
- **OCR de facturas** para sugerir clasificación de gastos mixtos (puntos 2.4 y 3.2). **Primera aplicación de IA real del proyecto.**
- **Alertas de stock** y predicción de reposición (3.3): alertas y sugerencias, **no compras automáticas**.
- **Distribución automática de propinas** (3.4): cálculo por turno, validación de inconsistencias.
- **Dashboard de KPI por garzona** (3.6): ventas, ticket promedio, ranking.

#### Entregables
- Cierre mensual automatizado de F&B.
- OCR de facturas con sugerencia de clasificación.
- Alertas de stock activas.
- Distribución de propinas automatizada.
- Dashboard de personal F&B.

#### Impacto en el equipo
Medio en F&B, nulo en el resto. La administración de cafetería pasa de hacer Excel a validar.

#### Riesgo principal
Calidad de la API o exportación de Fudo y Chipax. Validar viabilidad técnica al inicio de la etapa.

---

### Etapa 6 — Escala y conversación con IA

**Plazo:** 8 semanas o más, según alcance
**Solo cuando todo lo anterior esté estable.**

#### Objetivo
Aumentar ticket promedio, construir comunidad y reducir carga de atención humana.

#### Alcance
- **Membresías y packs recurrentes** (sección 8, Fase 3 del documento original): cobro automático, planes de frecuencia.
- **Bot de WhatsApp con IA** (idea #1 Recepción): consulta de disponibilidad, sugerencia de combos, reserva con pago integrado. Aclarando explícitamente al cliente que es IA, como pide el documento original.
- **Recordatorios por WhatsApp** vía Twilio o Meta WhatsApp Business API (idea #6 Recepción).
- **Encuesta post-visita con IA** (idea #7 Recepción versión avanzada): si la nota es alta, invita a dejar reseña en Google/TripAdvisor; si es baja, escala internamente antes de que se publique.
- **Generación de horarios sugeridos** por IA para F&B (3.5 del documento original): ya con seis o más meses de datos históricos limpios.
- **Predicción de demanda** para masajes y reservas en general.

#### Entregables
- Sistema de membresías operativo.
- Bot de WhatsApp en producción.
- Encuestas con escalamiento automático.

#### Impacto en el equipo
Alto positivo. Reduce carga de atención de WhatsApp y de seguimiento post-visita.

#### Riesgo principal
Sobrepromesa del bot. Definir desde el inicio qué casos resuelve solo y cuándo deriva a humano.

---

## 5. Lo que recomendamos no hacer

- **Reemplazar Fudo o Chipax.** Razones detalladas en sección 3.1.
- **Bot de WhatsApp en etapas tempranas.** Necesita datos limpios y reservas confiables primero.
- **Migración big-bang desde Skedu.** Sí o sí gradual por tipo de servicio.
- **Compras automáticas.** Sí alertas de stock; no acción autónoma sobre proveedores.
- **Generación automática de turnos del personal por IA antes de tener seis meses de datos consistentes.** Empezar con planilla, IA después.
- **Vender todo como "IA"** cuando es automatización determinística. Genera expectativas que no se cumplen.

---

## 6. Riesgos transversales del proyecto

| Riesgo | Mitigación |
|---|---|
| Período dual Skedu + sistema propio genera trabajo doble | Aceptarlo y compensarlo. Es transitorio y necesario. |
| Equipo resistente al cambio | Capacitación gradual desde Etapa 1. Cuando llegue Etapa 3, ya es herramienta conocida. |
| Pérdida de datos históricos al apagar Skedu | Importación de histórico al inicio de Etapa 3. |
| Bug crítico en pago online | Backups y rollback desde el día uno. Monitoreo activo en Etapa 3. |
| Sobrepromesa al cliente final con "IA" | Mensaje interno y externo claro: automatización vs IA. |
| Alcance creciente (cuatro áreas pidiendo cambios) | Una vertical por etapa. No se abren etapas en paralelo sin completar la anterior. |

---

## 7. Plazos consolidados

| Etapa | Foco | Plazo | Acumulado |
|---|---|---|---|
| 0 | Preparación y arquitectura | 3 semanas | 3 sem |
| 1 | Cimientos invisibles | 5–6 semanas | ~9 sem |
| 2 | Operación interna | 7–8 semanas | ~17 sem (4 meses) |
| 3 | Reemplazo gradual de Skedu | 10–12 semanas | ~28 sem (7 meses) |
| 4 | Paquetes, B2B, gift cards | 7–8 semanas | ~36 sem (9 meses) |
| 5 | F&B sin reemplazar Fudo | 6–8 semanas | ~44 sem (11 meses) |
| 6 | Escala e IA | 8+ semanas | ~52 sem (13 meses) |

**Total estimado: 10 a 13 meses** con un desarrollador full-time.
**Compresión posible a 7–9 meses** sumando un segundo desarrollador desde Etapa 3.

---

## 8. Próximos pasos sugeridos

1. **Validar este plan con Mario y Luciana** y ajustar prioridades si alguna etapa cambia de orden.
2. **Confirmar disponibilidad técnica de APIs** de Skedu, Fudo y Chipax (insumo crítico de Etapa 0).
3. **Agendar reuniones individuales con Berni y Constansa** para validar entregables de Etapas 1 y 2.
4. **Definir presupuesto** para las Etapas 0–2 como bloque inicial. Las Etapas 3–6 se presupuestan al cierre de la Etapa 2, con datos reales de velocidad del equipo.
5. **Acordar criterio de éxito por etapa**: cómo medimos que está lista antes de pasar a la siguiente.

---

*Documento elaborado por el equipo de desarrollo del CMS Cancagua.*
