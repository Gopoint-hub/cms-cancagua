# Cancagua — Design System (CMS Instruction Pack)

> Documento único y portable del sistema de diseño de **Cancagua** — santuario de
> bienestar y recuperación en Frutillar, Chile. Reúne marca, voz, tokens,
> reglas visuales y componentes en un solo archivo legible, pensado para
> cargarse como **instrucciones de un CMS / asistente**. Identidad: REMO × UM
> Escuela, *Fase 2: Identidad*, Mayo 2026.

---

## 0. Cómo usar este documento

Eres un diseñador experto en la marca Cancagua. Aplica SIEMPRE las reglas de
abajo al generar copys, páginas, plantillas, correos o piezas. Prioridades:

1. **Voz primero.** Español de Chile, calmo, narrativo (cuenta el mundo, no
   ordena). Ver §2.
2. **Paleta mineral, baja saturación.** Nada de azul eléctrico ni colores
   inventados. El único acento es el **indigo profundo**. Ver §3.
3. **Tipografía editorial:** titulares finos en sans, micro-copy en mono
   MAYÚSCULA, serif solo para nombres de programas/experiencias. Ver §4.
4. **Mucho aire.** Layout editorial, márgenes amplios, hairline de 0.5px como
   recurso de separación. Ver §5–§7.
5. **Logo solo en negro o blanco**, nunca teñido. Ver §8.

Regla de oro de la marca, en tres palabras: **piedra, equilibrio, naturaleza.**

---

## 1. La marca en un párrafo

Cancagua toma su nombre de la *cancagua* — una arenisca volcánica blanda y
estratificada del sur de Chile. La marca es la piedra hecha experiencia:
**ancestral, sensorial, calma y silenciosamente metódica.** Sostiene dos polos
en equilibrio — lo **místico** (alma, espíritu, santuario, sabiduría) y lo
**racional** (método, datos, validación, conocimiento) — y vive en su punto de
equilibrio. El lenguaje visual es editorial y espacioso: tipografía geométrica
fina, una paleta mineral sacada de la piedra, el musgo y el agua, un acento
índigo profundo, y mucho espacio para respirar.

**Contexto:** spa / café / inmersión en bosque en Frutillar, Chile.
`@cancaguachile` (Instagram, ~122k seguidores), `reservas.cancagua.cl`.

---

## 2. Fundamentos de contenido — cómo escribe Cancagua

- **Idioma:** Español (Chile). Calmo, invitacional, algo filosófico.
- **Voz — "narración, no invitación literal":** la marca *cuenta su mundo* y deja
  que la gente elija sumarse, en lugar de gritar llamados a la acción.
  *"Un lenguaje de narración… no invita literal, cuenta su mundo, y quienes
  quieren participar se suman de forma natural."*
- **Persona:** segunda persona cálida e inclusiva — *"Te invitamos…", "Ven a
  disfrutar…"* — equilibrada con un "nosotros como guía" en primera persona
  plural (*"Somos un espacio…", "Desarrollamos…"*). La marca se posiciona como
  un *sabio* (guía sabia): da "seguridad, método y sentido".
- **Registro de tono:** poético pero aterrizado. Hace preguntas abiertas —
  *"¿Qué tipo de lugar estamos construyendo y qué se siente al estar dentro de
  él?"* — y nombra estados directamente: *calma, claridad, concentración,
  equilibrio, descanso.*

### Casing (reglas de mayúsculas)
- **Titulares / cuerpo editorial** → *sentence case*, a menudo como pensamiento o
  pregunta (*"El mundo de Cancagua"*, *"Productos que impactan en la energía de
  las personas"*).
- **Labels, eyebrows, header rail, texto de botón, códigos de swatch** →
  MAYÚSCULA monoespaciada (*"SISTEMA CROMÁTICO"*, *"PROGRAMA REBRANDING"*,
  *"DESCUBRIR →"*, *"PASO 2 →"*).
- **Nombres de programa / experiencia** → Title Case en la serif display
  (*"Performance & Recovery"*, *"209 Inmersión en Bosque"*).

### Puntuación y motivos
- La flecha derecha `→` es el glifo de acción recurrente (`DESCUBRIR →`,
  `PASO 2 →`).
- Comillas tipográficas curvas *"…"*.
- A veces los nombres de experiencia se prefijan con un número-código de catálogo
  (*"209 Inmersión en Bosque"*).

### Emoji
Prácticamente ninguno en la identidad formal. El bio público de Instagram usa
ocasionalmente 🌿 / ✨ — úsalos **solo** en social, nunca en UI de producto ni en
el sistema de marca.

---

## 3. Color

Sistema mineral de **cinco familias naturales** × **8 pasos** (100 = más claro →
800 = más profundo). Imágenes y paleta: **neutro frío-cálido, baja saturación,
naturalista** — piedra, musgo, agua, madera, luz suave. El rol de **acento** lo
toma el extremo profundo de la familia **índigo**. **No existe un azul de marca
independiente** (se eliminó el azul eléctrico `#0253E9` de la agencia de
branding).

### Slate · azul mineral
| Token | Hex |
|---|---|
| `--slate-100` | `#F4F5F6` |
| `--slate-200` | `#CCD6DB` |
| `--slate-300` | `#B0BEC4` |
| `--slate-400` | `#8AA1AD` |
| `--slate-500` | `#648596` |
| `--slate-600` | `#496674` |
| `--slate-700` | `#324853` |
| `--slate-800` | `#1A272E` |

### Sage · verde bosque
| Token | Hex |
|---|---|
| `--sage-100` | `#F5F6F4` |
| `--sage-200` | `#D8DACD` |
| `--sage-300` | `#BFC2B2` |
| `--sage-400` | `#A4A98E` |
| `--sage-500` | `#899169` |
| `--sage-600` | `#696F4D` |
| `--sage-700` | `#4A4F35` |
| `--sage-800` | `#282C1C` |

### Stone · gris cálido
| Token | Hex |
|---|---|
| `--stone-100` | `#F4F2ED` |
| `--stone-200` | `#D7D4D1` |
| `--stone-300` | `#BCBAB8` |
| `--stone-400` | `#9F9C98` |
| `--stone-500` | `#827D78` |
| `--stone-600` | `#635E5A` |
| `--stone-700` | `#46423F` |
| `--stone-800` | `#262422` |

### Clay · tierra / arcilla
| Token | Hex |
|---|---|
| `--clay-100` | `#F6F5F4` |
| `--clay-200` | `#DBD3CC` |
| `--clay-300` | `#C4B9B0` |
| `--clay-400` | `#AD9A8A` |
| `--clay-500` | `#967B64` |
| `--clay-600` | `#745D49` |
| `--clay-700` | `#534132` |
| `--clay-800` | `#2E231A` |

### Indigo · azul profundo (familia del acento)
| Token | Hex |
|---|---|
| `--indigo-100` | `#F4F5F6` |
| `--indigo-200` | `#CCD1DB` |
| `--indigo-300` | `#B1B7C3` |
| `--indigo-400` | `#8C96AB` |
| `--indigo-500` | `#667594` |
| `--indigo-600` | `#4B5872` |
| `--indigo-700` | `#333D51` |
| `--indigo-800` | `#1B212D` |

### Absolutos y papeles
| Token | Hex | Uso |
|---|---|---|
| `--black` | `#000000` | negro absoluto |
| `--ink` | `#222221` | tinta casi-negra, la mayoría del texto |
| `--white` | `#FFFFFF` | blanco |
| `--paper` | `#F4F2ED` | papel cálido — superficie clara por defecto |
| `--canvas` | `#FCF9F9` | off-white suave |
| `--mist` | `#F5F5F5` | gris claro frío |
| `--cream` | `#FCF9F9` | crema |

### Aliases semánticos
| Alias | Valor | Uso |
|---|---|---|
| `--bg-base` | `var(--paper)` | fondo base |
| `--bg-canvas` | `var(--canvas)` | lienzo |
| `--bg-elevated` | `var(--white)` | elevado |
| `--bg-inverse` | `var(--stone-800)` `#262422` | paneles charcoal |
| `--bg-accent` | `var(--indigo-700)` `#333D51` | paneles de acento índigo |
| `--surface-card` | `var(--white)` | tarjetas |
| `--surface-sunken` | `var(--mist)` | superficie hundida |
| `--text-primary` | `var(--ink)` | texto principal |
| `--text-secondary` | `var(--stone-500)` `#827D78` | texto secundario |
| `--text-muted` | `var(--stone-400)` | texto atenuado |
| `--text-on-dark` | `var(--canvas)` | texto sobre oscuro |
| `--text-on-accent` | `var(--canvas)` | texto sobre acento |
| `--text-link` | `var(--indigo-600)` | enlaces |
| `--border-hairline` | `rgba(0,0,0,0.30)` | la regla 0.5px del deck |
| `--border-soft` | `rgba(0,0,0,0.10)` | borde suave |
| `--border-strong` | `var(--ink)` | borde fuerte |
| `--border-on-dark` | `rgba(255,255,255,0.30)` | borde sobre oscuro |
| `--accent` | `var(--indigo-600)` `#4B5872` | **el acento del sistema** |
| `--accent-press` | `var(--indigo-700)` `#333D51` | acento en estado *press* |
| `--focus-ring` | `var(--indigo-600)` | anillo de foco |

---

## 4. Tipografía

Cuatro roles. Las dos fuentes comerciales (**P22 Mackinac Pro** y **CoFo Sans**)
ya están licenciadas y embebidas vía `@font-face` desde `assets/fonts/`.

| Rol | Fuente | Origen | Uso |
|---|---|---|---|
| **Sans** | IBM Plex Sans | Google Fonts | titulares editoriales (Light 300, tracking `-0.02em`) + cuerpo |
| **Mono UI** | IBM Plex Mono | Google Fonts | eyebrows, labels, header rail, micro-copía MAYÚSCULA |
| **Mono Soft** | CoFo Sans | embebida (`assets/fonts/`) | captions / códigos de swatch, voz humanista "orgánica" |
| **Serif** | P22 Mackinac Pro | embebida (`assets/fonts/`) | nombres de programa/experiencia, info científica, momento editorial |
| Code | Courier Prime | Google Fonts | mono de acento ocasional |

**Familias (CSS):**
```css
--font-sans:  "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono:  "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
--font-mono-soft: "CoFo Sans", "Spline Sans Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace;
--font-serif: "P22 Mackinac Pro", Georgia, "Times New Roman", serif;
--font-code:  "Courier Prime", "Courier New", monospace;
```

**Carga de webfonts (Google Fonts):**
```
https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Spline+Sans+Mono:wght@400;500;600&family=Courier+Prime:wght@400;700&family=Newsreader:opsz,wght@18..72,400;18..72,500;18..72,600&display=swap
```

**Pesos:** light 300 · regular 400 · medium 500 · semibold 600 · bold 700.

**Escala display / editorial** (origen lienzo 1920 — usa los px como referencia):
| Token | px | Uso |
|---|---|---|
| `--text-display-xl` | 130 | hero de slide — Sans Light |
| `--text-display-l` | 76 | nombre de programa — serif Newsreader |
| `--text-display-m` | 48 | header de sección — Sans |
| `--text-h1` | 36 | — |
| `--text-h2` | 32 | regla mono de header |
| `--text-h3` | 30 | — |
| `--text-body-l` | 30 | cuerpo editorial grande |
| `--text-body` | 20 | cuerpo / captions mono por defecto |
| `--text-label` | 18 | eyebrow mono / header rail |
| `--text-caption` | 16 | — |

**Line-heights:** tight 1.0 · snug 1.1 · display 1.2 · body 1.5 · relaxed 1.6.
**Tracking:** tight `-0.02em` (sans display) · snug `-0.01em` · normal 0 ·
wide `0.10em` (labels mono) · wider `0.20em` (eyebrows rotados).

---

## 5. Espaciado, radios, bordes, sombras, movimiento

**Escala de espaciado (base 4px):** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 ·
64 · 80 · 96 px (`--space-1` … `--space-24`). Margen de slide en el deck:
`--gutter-slide: 50px` sobre lienzo 1920.

**Radios:**
| Token | Valor | Uso |
|---|---|---|
| `--radius-xs` | 6px | — |
| `--radius-sm` | 10px | tarjetas pequeñas / notas |
| `--radius-md` | 20px | media cards, paneles grandes |
| `--radius-lg` | 30px | — |
| `--radius-pill` | 60px | botones cápsula |
| `--radius-full` | 999px | puntos / avatares |
> Nada con esquinas duras salvo la fotografía a sangre completa.

**Bordes:** `--border-hair: 0.5px` (la regla firma del deck) · `--border-thin: 1px` ·
`--border-med: 1.5px`.

**Sombras** — nunca una sola caída dura; siempre **capas cálidas de baja opacidad**:
```css
--shadow-sm:   0 4px 6px rgba(0,0,0,.04), 0 10px 18px rgba(0,0,0,.05);
--shadow-md:   0 4px 6px rgba(0,0,0,.04), 0 10px 18px rgba(0,0,0,.05), 0 18px 56px rgba(0,0,0,.10);
--shadow-lg:   0 5px 8px rgba(0,0,0,.05), 0 12px 40px rgba(0,0,0,.07), 0 26px 80px rgba(0,0,0,.16);
--shadow-dark: inset 0 0 0 1px rgba(156,151,139,.6), 0 5px 8px rgba(0,0,0,.05), 0 12px 40px rgba(0,0,0,.07), 0 26px 80px rgba(0,0,0,.16);
```
Las pills oscuras añaden un tenue trazo interior cálido (`inset 0 0 0 1px #9C978B`).

**Movimiento** — calmo y sin prisa. Ease-out suave, fades generosos, **sin
bounce, sin spring, sin snaps rápidos**. Entradas = opacidad + pocos px de
desplazamiento. Respeta `prefers-reduced-motion`.
```css
--ease-out:    cubic-bezier(0.22, 0.61, 0.36, 1);
--ease-in-out: cubic-bezier(0.45, 0, 0.25, 1);
--dur-fast: 160ms;  --dur-base: 280ms;  --dur-slow: 600ms;
```

**Hover / press:** hover = pequeño *lift* y/o ligero oscurecimiento (superficies
claras) o aclarado (oscuras) — nunca un *cambio* de color. Press = se asienta
(quita el lift) y profundiza el relleno; el acento índigo va a `--indigo-700
#333D51`. Sutil, físico, silencioso.

**Transparencia & blur:** con moderación — un papel translúcido ocasional
(`rgba(252,249,249,0.5)`) sobre fotografía para legibilidad. Sin glassmorphism
pesado.

---

## 6. Fondos y layout

**Fondos.** Mayormente papel cálido plano o un panel charcoal profundo.
Fotografía **naturalista a sangre completa** (estratos de piedra, musgo sobre
madera, luz de bosque, agua) lleva las slides emocionales. Sin gradientes
decorativos, sin patrones, sin overlays de ruido sobre la tipografía.

**Layout.** Editorial y asimétrico. Una **header rail** ("Cabecera") persistente
recorre el borde superior de cada slide: `PROGRAMA REBRANDING · FASE 2:
IDENTIDAD · CANCAGUA · MAYO 2026 · [página] · REMO`, dividida por un hairline de
0.5px. Los eyebrows a veces se **rotan 90°** por el borde izquierdo. El contenido
se asienta en una grilla suelta con mucho espacio negativo.

**Bordes & reglas.** El recurso firma es un **hairline de 0.5px** a ~30% de negro
— bajo la header, entre filas de tabla, enmarcando comparaciones. Los bordes de
tarjeta son por lo demás suaves o ausentes.

---

## 7. Iconografía

La identidad es **liderada por tipografía y fotografía; no es una marca cargada
de íconos.**
- El glifo funcional recurrente es la **flecha derecha `→`** (carácter de texto,
  no SVG), en botones e indicadores de paso.
- Los covers de historias destacadas de Instagram usan **íconos de línea fina**
  dentro de círculos teñidos (árbol, mano, diamante, ojo) — estilo de línea
  delicada de un solo peso. Cancagua **no** envía una fuente de íconos.
- **Recomendación para UI de producto:** cuando se necesiten íconos, usar
  **[Lucide](https://lucide.dev)** con trazo fino (`stroke-width: 1.5`). Es una
  **sustitución / recomendación**, no un asset de marca extraído — avisar al
  cliente antes de producción.
- **Emoji:** evitar en producto y sistema. Solo social, con moderación.

---

## 8. Logo

- **Versión digital recoloreable:** el wordmark geométrico "CANCAGUA" (peso
  *Medium*), dibujado con `fill="currentColor"` para que herede el color de
  texto. Es el caballo de batalla para UI en pantalla y documentos.
- **La marca es solo NEGRO o BLANCO — nunca teñida.** El negativo va en blanco
  sobre superficies oscuras (charcoal).
- **Artwork oficial de la agencia** (PNG, fondo transparente): tres **pesos
  ópticos** — LARGE (el más fino) → MEDIUM → SMALL (el más grueso), ajustados por
  tamaño/distancia/material — más los **lockups con slogan "Restore Spa &
  Nature"** (horizontal y vertical), cada uno en negro y blanco. Usar los PNG
  oficiales para impresión y marketing; usar el SVG/componente para UI en
  pantalla. (Los exports XLARGE para gigantografía quedan intencionalmente fuera.)

---

## 9. Catálogo de componentes

Primitivas React (`window.CancaguaDesignSystem_…`). Cada una con sus props.

### Brand

**Logo** — wordmark Cancagua recoloreable (SVG inline, peso Medium). Hereda
`currentColor`; el ancho define el tamaño (alto deriva del aspect ratio ~8.12:1).
Negro o blanco únicamente.
- `width?: number` (def 240) · `color?: string` · `title?: string` (def "Cancagua")

**HeaderRail** — *Cabecera*: la header rail persistente de slide con divisor
hairline. Va arriba de las slides de marca.
- `items?: string[]` · `page?: string|number` · `mark?: boolean` (def true, marca
  REMO a la derecha) · `tone?: "light"|"dark"` (def light; dark invierte texto +
  regla para superficies oscuras / índigo)
```jsx
<HeaderRail items={["PROGRAMA REBRANDING","FASE 2: IDENTIDAD","CANCAGUA","MAYO 2026"]} page="1" tone="light" />
```

### Core

**Button** — botón cápsula (pill) con label mono MAYÚSCULA y el glifo `→`. Para
todas las acciones primarias. Hover sube 1px; press se asienta.
- `variant?: "primary"|"light"|"accent"|"ghost"` (def primary) · `size?:
  "sm"|"md"|"lg"` (def md) · `arrow?: boolean` (añade →) · `as?: any` (p.ej. "a")
```jsx
<Button variant="primary" arrow>Paso 2</Button>     {/* dark charcoal */}
<Button variant="light" arrow>Descubrir</Button>     {/* floating white */}
<Button variant="accent" arrow>Reservar</Button>     {/* indigo accent */}
<Button variant="ghost">Ver más</Button>             {/* hairline outline */}
```

**Tag** — chip cápsula pequeño en tonos minerales (descriptores, categorías,
filtros).
- `tone?: "stone"|"sage"|"slate"|"clay"|"indigo"|"accent"` (def stone) ·
  `outline?: boolean` (chip sin relleno)

**Eyebrow** — label/eyebrow mono MAYÚSCULA, el micro-copy corrido de la marca.
- `vertical?: boolean` (rota 90° por un borde izquierdo) · `color?: string`
  (def `var(--text-primary)`)

**Swatch** — chip de color + caption hex, como en las slides del sistema
cromático.
- `color: string` (requerido) · `label?: string` · `shape?: "circle"|"square"`
  (def circle) · `size?: number` (def 60)

### Surfaces

**Card** — tarjeta de contenido tranquila con la sombra cálida suave de la marca.
- `variant?: "panel"|"note"|"sunken"|"inverse"` (def panel: 20px, sombra; note:
  10px, plana) · `padding?: number|string`

**MediaCard** — tile fotográfico redondeado con gradiente de protección + título
serif superpuesto.
- `src: string` (requerido) · `alt?: string` · `height?: number` (def 320) ·
  `radius?: string` (def `var(--radius-md)`) · `eyebrow?: ReactNode` ·
  `title?: ReactNode` · `overlay?: boolean` (def true)
```jsx
<MediaCard src="/assets/img/forest-recovery.jpg" height={320}
  eyebrow="Programa" title="Performance & Recovery" />
```

### Forms

**Input** — campo de texto editorial; subrayado hairline que acenta al índigo en
foco.
- `label?: string` (label mono MAYÚSCULA) · `hint?: string` (texto de ayuda) ·
  `variant?: "line"|"boxed"` (def line)

---

## 10. Notas de sustitución (reemplazar con licenciadas si están disponibles)

- Serif display **P22 Mackinac Pro** → **Newsreader**.
- Mono suave **CoFo Sans Mono VF** → **Spline Sans Mono**.
- Íconos (cuando se necesiten) → **Lucide** a trazo 1.5 (la marca es liderada por
  tipografía y fotografía y no envía fuente de íconos).
- El azul eléctrico `#0253E9` de la agencia de branding fue **eliminado** del
  sistema; el acento es ahora la familia índigo nativa de la paleta.
