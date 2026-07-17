# Cancagua — Sistema de Diseño para Mailing (guía para el generador IA del CMS)

> Base de diseño que la **IA de creación de mailing** del CMS de Cancagua debe
> seguir al generar el HTML de un email a partir del contenido que le pasa el
> usuario. La IA **no crea imágenes**: usa la imagen de header que sube el usuario
> (o, si no sube, una imagen de marca de `assets/`) y las imágenes que el usuario
> adjunta para el cuerpo. Este documento define tipografía y jerarquía, cómo armar
> el hero, qué logo usar y dónde, cómo narrar la información, y las reglas técnicas
> de email. Fuente de verdad de marca: `readme.md` y `cancagua-design-system.md`.

---

## 0. Cómo debe usar esta guía la IA

Al recibir `{tipo, solicitud, imagen_header?, imagenes_cuerpo?}`:

1. **Detecta el tipo** (Promoción · Newsletter · Evento · Bienvenida) y toma su
   patrón narrativo y de secciones de §9.
2. **Compón sobre la plantilla base** de §3 (contenedor 600px, tablas, estilos
   inline). Copia el esqueleto de la plantilla HTML del tipo correspondiente en
   `email/`.
3. **Aplica la jerarquía tipográfica** de §4 — cada nivel de información tiene una
   fuente y un tamaño fijos. No inventes tamaños.
4. **Arma el hero** según §5 (con imagen subida, o hero tipográfico si no hay).
5. **Coloca el logo** según §6.
6. **Escribe/adapta el copy** en la voz de Cancagua (§8): narración, no invitación
   literal; español de Chile; calmo y sensorial.
7. **Inserta las imágenes del usuario** en los slots (§7). Nunca generes imágenes
   propias ni dibujes ilustraciones; si faltan, usa color/tipografía o una foto de
   `assets/`.
8. **Cierra** siempre con footer de marca (§11) y respeta las reglas técnicas de
   email (§10).

Regla rectora: **el aire y la imagen pesan más que el texto.** Un email de
Cancagua se siente editorial y calmo, no un flyer promocional recargado.

---

## 1. Anatomía del contenido (jerarquía de información)

Todo email se piensa en estos niveles. La fuente **se elige según el nivel**, no
según el gusto:

| Nivel | Qué es | Fuente | Ejemplo |
|---|---|---|---|
| **Eyebrow** | categoría / kicker sobre el título | **Spline Sans Mono** MAYÚS | `SONOTERAPIA` · `ENCUENTRO DE INMERSIÓN` |
| **Titular** | el mensaje editorial / emocional | **P22 Mackinac Pro** (serif) | *"El cuerpo recuerda cómo descansar."* |
| **Bajada / intro** | 1–2 frases que enmarcan | **IBM Plex Sans** | contexto breve, calmo |
| **Cuerpo** | párrafos, explicación, relato | **IBM Plex Sans** | lectura cómoda |
| **Información científica** | dato, mecanismo, término | **P22 Mackinac Pro** (término/cita) + **IBM Plex Sans** (explicación) | ver §4.4 |
| **Botón / CTA** | acción | **Spline Sans Mono** MAYÚS | `RESERVAR →` |
| **Metadatos** | fecha, hora, lugar, código | **Spline Sans Mono** | `26 JUL · 10:00 HRS` |
| **Footer / legal** | firma, links, baja | **IBM Plex Sans** (pequeño) | — |

> Principio: **serif = voz editorial y ciencia** (lo que se contempla). **Mono =
> etiquetas, acción y datos** (lo funcional, en mayúscula). **Plex Sans = lectura**
> (todo lo que se lee de corrido).

---

## 2. Las tres tipografías

```
Serif  →  "P22 Mackinac Pro", "Newsreader", Georgia, "Times New Roman", serif
Sans   →  "IBM Plex Sans", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif
Mono   →  "Spline Sans Mono", "IBM Plex Mono", "Courier New", monospace
```

- **P22 Mackinac Pro** — serif de la marca para **titulares e información
  científica** (términos, citas, datos con peso editorial). Sustituto libre si no
  está licenciada en el CMS: **Newsreader** (Google Fonts). Última red: Georgia.
- **IBM Plex Sans** — el cuerpo y la lectura: bajadas, párrafos, explicaciones,
  footer. Pesos 400 / 500 / 600.
- **Spline Sans Mono** — **solo botones, eyebrows en mayúscula y metadatos**
  (fecha, hora, código). Nunca para párrafos largos.

**Carga de fuentes (webfont, funciona en Apple Mail / iOS Mail):**
```html
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,18..72,400;0,18..72,500;1,18..72,400&family=IBM+Plex+Sans:wght@400;500;600&family=Spline+Sans+Mono:wght@500;600&display=swap" rel="stylesheet">
```
Muchos clientes (Gmail, Outlook) **ignoran** los webfonts → por eso cada elemento
lleva su **stack completo con fallback** en el `style` inline. El diseño debe verse
bien aunque solo cargue Georgia / Arial / Courier.

---

## 3. Estructura base del email

- **Ancho del contenedor:** `600px` (centrado). En móvil baja a 100%.
- **Fondo exterior (body):** `#F4F2ED` (paper). **Fondo del contenedor:** `#FCF9F9`
  (canvas) o `#FFFFFF`.
- **Maquetación:** tablas `role="presentation"`, estilos **inline**, sin flexbox ni
  grid, sin `position`. (Ver §10.)
- **Padding lateral del contenido:** `40px` en desktop (≈ `24px` en móvil).
- **Orden de bloques (esqueleto):**
  1. Preheader oculto (texto de preview del inbox)
  2. **Barra de logo** (paper, wordmark negro) — §6
  3. **Hero** (imagen subida o hero tipográfico) — §5
  4. **Bloque editorial** (eyebrow + titular serif + bajada Plex)
  5. **Cuerpo / secciones** (párrafos, imágenes, bloques científicos)
  6. **CTA** (botón mono) — §7
  7. **Footer** de marca — §11

Separadores entre secciones: **hairline** `border-top: 1px solid rgba(0,0,0,.12)`
y espacio generoso (32–48px). Nada de cajas con bordes de colores ni sombras
duras.

---

## 4. Escala tipográfica de email (px fijos)

| Rol | Fuente | Tamaño / interlínea | Peso | Caja | Color |
|---|---|---|---|---|---|
| Eyebrow | Mono | 12 / 16 · tracking 2px | 500 | MAYÚS | `#635E5A` |
| Titular hero (H1) | Serif | 34 / 40 | 400 | sentence | `#222221` (o `#FCF9F9` sobre oscuro) |
| Titular sección (H2) | Serif | 26 / 32 | 400 | sentence | `#222221` |
| Subhead | Sans | 18 / 26 | 600 | sentence | `#222221` |
| Bajada / intro | Sans | 18 / 28 | 400 | sentence | `#46423F` |
| Cuerpo | Sans | 16 / 26 | 400 | sentence | `#46423F` |
| Cita / dato serif | Serif *italic* | 22 / 30 | 400 | sentence | `#333D51` |
| Botón | Mono | 14 / 14 · tracking 1.5px | 600 | MAYÚS | `#FCF9F9` |
| Metadato | Mono | 14 / 20 · tracking 1px | 500 | MAYÚS | `#222221` |
| Footer | Sans | 13 / 20 | 400 | sentence | `#827D78` |

### 4.4 Bloque de información científica
El sello editorial de Cancagua. Estructura recomendada:
- **Término / titular del dato** en **serif** (P22 Mackinac / Newsreader), 22–26px,
  a veces en *itálica*.
- **Explicación** en **IBM Plex Sans** 16px, interlínea 1.6.
- Opcional: un **eyebrow mono** arriba (`FITONCIDAS`, `TERMOGÉNESIS`) como etiqueta
  del concepto.
- Fondo del bloque: papel `#F4F2ED` o un panel `#FCF9F9` con hairline arriba y
  abajo. Sin íconos infográficos, sin números gigantes decorativos.

```
┌───────────────────────────────────────────┐
│ TERMOGÉNESIS                    (mono, eyebrow)
│ El frío activa la grasa parda   (serif, término)
│ El cuerpo genera calor quemando energía…    (Plex, explicación)
└───────────────────────────────────────────┘
```

---

## 5. El hero del mailing

Dos modos. La IA elige según haya o no imagen de header.

### 5.1 Hero con imagen (por defecto cuando el usuario sube header)
- Imagen **full-width 600px**, alto ~320–360px, `display:block`, `width:100%`.
- **No** superponer texto crítico sobre la imagen (se bloquea por defecto en
  muchos inbox). El titular va **debajo**, en una banda de papel o charcoal.
- Debajo de la imagen: banda con **eyebrow mono + titular serif + bajada Plex**.
- Si el header es una **foto sensorial** de marca, respeta su look: puede llevar el
  velo de gradiente piedra (ver spec social), pero en email preferir la imagen
  limpia + texto debajo.
- Siempre `alt=""` descriptivo en la imagen.

### 5.2 Hero tipográfico (sin imagen / Bienvenida / editorial)
- Banda **charcoal** `#262422` a todo el ancho, alto ~300px.
- **Wordmark blanco** arriba + **titular serif blanco** centrado o abajo-izquierda.
- Eyebrow mono en `rgba(252,249,249,.7)`.
- Es el hero más "de marca": calmo, mineral, sin foto.

> El hero nunca mezcla más de 1 titular. Una idea, mucho aire.

---

## 6. Logo — qué usar y dónde

- **Marca solo en NEGRO o BLANCO**, nunca teñida.
- **Barra superior de logo** (siempre): wordmark **negro** sobre papel, alto ~26px,
  alineado a la izquierda con 40px de padding. Archivo:
  `assets/logo/cancagua-wordmark-large-black.png`.
- **Sobre hero charcoal o imagen oscura:** wordmark **blanco**
  (`assets/logo/cancagua-wordmark-large-white.png`).
- **Footer:** wordmark blanco (footer charcoal) o negro (footer papel), ~150px.
- **Lockup con slogan** ("Restore Spa & Nature", horizontal/vertical) solo para
  piezas de bienvenida o cierre de marca, no en cada email.
- Anchos de referencia (email, PNG @2x): barra superior 150px, footer 150px.
- Nunca estirar, rotar, agregar sombra ni cambiar el color del wordmark.

---

## 7. Imágenes y botones

### Imágenes (las sube el usuario — la IA NO las genera)
- **Header:** la imagen de header del paso "Solicitud" → hero §5.1.
- **Cuerpo:** las imágenes adjuntas → intercalar entre secciones, full-width 600px
  o en dos columnas 50/50 para galerías simples.
- Si **no hay imágenes**: usar hero tipográfico (§5.2) y fotos de marca de
  `assets/social/` o `assets/img/` **solo** si encajan con el tema; si no, componer
  con tipografía y color. **Jamás** dibujar ilustraciones o íconos infográficos
  como reemplazo.
- Todas las imágenes: `width:100%`, `display:block`, `border:0`, `alt` descriptivo.
- Slots en las plantillas marcados como `{{IMAGEN_HEADER}}`, `{{IMAGEN_1}}`, etc.

### Botón (CTA) — bulletproof, en Spline Sans Mono
- Tabla con `bgcolor`, no `<button>`. Texto mono MAYÚS, tracking 1.5px.
- Relleno oscuro por defecto: `#333D51` (indigo) o `#222221` (ink); texto `#FCF9F9`.
- Padding `16px 34px`, radio 60px (los clientes que no lo soporten lo muestran
  recto, ok). Glifo `→` al final del texto.
- **Un CTA primario por email.** CTAs secundarios como enlace de texto subrayado.

```html
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td bgcolor="#333D51" style="border-radius:60px;">
    <a href="{{CTA_URL}}" style="display:inline-block;padding:16px 34px;font-family:'Spline Sans Mono','IBM Plex Mono','Courier New',monospace;font-size:14px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#FCF9F9;text-decoration:none;">{{CTA_TEXTO}} &rarr;</a>
  </td>
</tr></table>
```

---

## 8. Voz y narración

- **Español de Chile**, calmo, sensorial, algo filosófico.
- **Narración, no invitación literal:** el email *cuenta el mundo de Cancagua* y
  deja que la persona se sume. Evita el grito promocional (`¡COMPRA YA!`).
- **Persona:** cálida e inclusiva (*"Te invitamos…", "Nos reunimos…"*), con la marca
  como guía sabia (*"Somos un espacio…"*).
- **Casing:** titulares y cuerpo en *sentence case*; eyebrows, botones y metadatos
  en MAYÚSCULA mono. Nombres de experiencia en Title Case serif.
- **Frases cortas y potentes** para lo emocional; párrafos breves para lo
  explicativo. Una idea por bloque.
- **Glifo `→`** en acciones. Comillas curvas *"…"*.
- **Emoji:** evitar en el cuerpo del email de marca (el CMS los usa solo como
  íconos de UI). Como mucho 🌿/✨ en un asunto, con mucha moderación.

---

## 9. Los cuatro tipos de email

### 9.1 Newsletter (novedades / editorial / ciencia)
Estructura: logo → hero (imagen o tipográfico) → eyebrow + titular serif → intro
Plex → 1–3 **secciones** (subhead + cuerpo + imagen) → **bloque científico** (§4.4)
si aplica → CTA suave (`LEER MÁS →`, `RESERVAR →`) → footer.
Tono: contar algo del mundo Cancagua; la ciencia se explica en serif+Plex.

### 9.2 Evento (invitaciones y anuncios)
Estructura: logo → hero con **fecha grande** (metadato mono `26 JUL · 10:00 HRS`) +
titular serif → intro → **qué vivirás** (lista de momentos: subhead serif + 1 línea
Plex cada uno, sin volcar todo el itinerario) → CTA `RESERVAR →` → datos prácticos
(lugar, hora, cupos) en mono → footer.
Tono: ritual de reconexión; invitación cálida.

### 9.3 Promoción (descuentos y ofertas)
Estructura: logo → hero → eyebrow + titular serif con la propuesta → cuerpo breve →
**bloque de código/beneficio** (código en mono grande sobre panel papel, vigencia
en mono) → CTA `APROVECHAR →` → footer.
Tono: aunque sea oferta, **mantener la calma Cancagua** — nada de rojos, urgencias
ni signos de exclamación en cadena. El beneficio se presenta como una invitación.

### 9.4 Bienvenida (nuevos suscriptores)
Estructura: logo → **hero tipográfico charcoal** con wordmark blanco + titular
serif de bienvenida → intro cálida (quiénes somos) → 2–3 secciones que presentan el
mundo (spa, café, inmersión) → CTA `DESCUBRIR →` → footer con redes.
Tono: dar la bienvenida a un lugar, no vender; presentar el mundo sensorial.

---

## 10. Reglas técnicas de email (obligatorias)

- **Tablas** `role="presentation"` para todo el layout. Nada de `<div>` flex/grid,
  `position`, `float`.
- **Estilos inline** en cada elemento (los `<style>` en `<head>` se descartan en
  varios clientes; úsalos solo para `@media` responsive y como refuerzo).
- Contenedor **600px**; imágenes `width:100%; display:block; border:0;`.
- **Fuentes con fallback completo** en cada `style` (§2). El diseño debe funcionar
  sin webfonts.
- **Preheader** oculto (texto de preview) al inicio del body:
  `style="display:none;max-height:0;overflow:hidden;opacity:0;"`.
- **Colores** en HEX de 6 dígitos; usar `bgcolor` además de `background` en celdas.
- **Alt** en toda imagen; **enlaces** con `color` explícito y `text-decoration`.
- **Responsive** con un `@media (max-width:600px)` que pase columnas a 100% y baje
  paddings a 24px y titular a 28px.
- **Modo oscuro:** no depender de transparencias; fondos y textos con HEX sólidos.
- Peso: comprimir imágenes; email total idealmente < 1–2 MB.
- Accesibilidad: contraste AA (texto `#46423F`+ sobre papel; blanco sobre charcoal).

---

## 11. Footer de marca

- Banda **charcoal** `#262422` (o papel `#F4F2ED` si el email es claro).
- **Wordmark** (blanco sobre charcoal / negro sobre papel), ~150px, centrado.
- Línea de redes: `INSTAGRAM · WEB` en mono, links a `@cancaguachile` /
  `reservas.cancagua.cl`.
- Dirección física breve (Frutillar, Chile) en Plex 12px.
- **Baja obligatoria:** *"Recibes este correo porque eres parte de Cancagua.
  [Cancelar suscripción]({{UNSUBSCRIBE_URL}})"* — Plex 12px, `#827D78`.
- Nada de columnas de íconos sociales de colores; texto/enlaces sobrios.

---

## 12. Tokens de color para email (subset seguro)

| Uso | HEX |
|---|---|
| Fondo exterior (paper) | `#F4F2ED` |
| Contenedor (canvas) | `#FCF9F9` |
| Charcoal (hero/footer/botón alt) | `#262422` |
| Tinta (texto principal) | `#222221` |
| Texto cuerpo | `#46423F` |
| Texto secundario / footer | `#827D78` |
| Eyebrow | `#635E5A` |
| **Acento índigo (botón/enlaces)** | `#333D51` / `#4B5872` |
| Enlace | `#4B5872` |
| Hairline | `rgba(0,0,0,.12)` |
| Verde bosque (acento editorial suave) | `#696F4D` |

Nunca: azul eléctrico, rojos de urgencia, gradientes saturados, colores fuera de
la paleta mineral.

---

## 13. Merge tokens (para que el CMS rellene)

`{{ASUNTO}}` · `{{PREHEADER}}` · `{{IMAGEN_HEADER}}` · `{{EYEBROW}}` ·
`{{TITULAR}}` · `{{BAJADA}}` · `{{CUERPO}}` · `{{IMAGEN_1}}` · `{{IMAGEN_2}}` ·
`{{CTA_TEXTO}}` · `{{CTA_URL}}` · `{{FECHA}}` · `{{HORA}}` · `{{LUGAR}}` ·
`{{CODIGO}}` · `{{DESCUENTO}}` · `{{VIGENCIA}}` · `{{UNSUBSCRIBE_URL}}` ·
`{{INSTAGRAM_URL}}` · `{{WEB_URL}}`

Las plantillas HTML de referencia (una por tipo) están en `email/`:
`newsletter.html`, `evento.html`, `promocion.html`, `bienvenida.html`.
