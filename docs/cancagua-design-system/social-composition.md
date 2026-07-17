# Cancagua — Composición para Redes Sociales

> Reglas de composición para piezas sociales de Cancagua, extraídas del archivo
> *"Composición Cancagua v1"* de la agencia. Cubre formatos, grilla y márgenes,
> fondos sensoriales, ubicación de texto, escala tipográfica social y cómo se
> arman los carruseles. **Regla rectora:** *narración, no invitación literal* —
> la pieza cuenta el mundo de Cancagua; el aire y la imagen pesan más que el texto.

---

## 1. Formatos (lienzo)

| Pieza | Tamaño | Ratio | Uso |
|---|---|---|---|
| **Feed** | 1080 × 1350 px | 4:5 | post de feed / portada de carrusel |
| **Story / Reel** | 1080 × 1920 px | 9:16 | historias y reels |
| (Cuadrado) | 1080 × 1080 px | 1:1 | solo si la grilla lo exige; el formato base es 4:5 |

Todas las piezas se diseñan a **1080 px de ancho**. Fondo base del lienzo:
charcoal `rgb(30,30,30)` (cercano a `--stone-800 #262422`) o blanco/papel según
el tratamiento (ver §4).

---

## 2. Grilla y márgenes (safe area)

Toda pieza se construye sobre una **grilla modular** con un **margen de seguridad**
constante. Nada de texto ni logo fuera de esa caja.

- **Margen lateral:** `57 px` izquierda y derecha (≈ 5.3 % del ancho).
- **Margen superior:** `113 px`. **Margen inferior:** ~`118 px`.
- **Caja de contenido (safe area), feed 4:5:** x 57 · y 113 · 951 × 1119 px.
- **Módulo de grilla:** ~`90 px` (1080 / 12). La grilla roja del archivo es la
  referencia de alineación; el texto y el logo se anclan a sus líneas.
- En el archivo de la agencia las guías se dibujan en **rojo** (grilla + caja) y
  **celeste** (baseline / borde de safe area). Son ayudas de montaje, **no** se
  exportan en la pieza final.

> Regla práctica: deja el margen de `57 px` siempre libre. El contenido respira
> dentro de la caja; el vacío es parte de la composición, no un error.

---

## 3. Logo — ubicación

- **Marca:** wordmark CANCAGUA, **solo blanco o negro** (nunca teñido), según
  contraste con el fondo.
- **Esquina:** wordmark a ~`215 px` de ancho (≈ 20 % del lienzo), anclado a una
  esquina dentro de la safe area — **arriba-izquierda** (x 57, y 113) o
  **arriba-derecha** (x ≈ 793, y ≈ 251 en story).
- **Lockup de portada (hero):** wordmark centrado a ~`512 px` de ancho cerca del
  borde inferior (y ≈ 1102 en feed), con un **descriptor** debajo
  (p. ej. `ESSENCE`, `ANATOMY`) en sans de caja alta y tracking amplio.

---

## 4. Fondos

Cuatro tratamientos. Todos buscan calma, textura natural y baja saturación.

### 4.1 Fondo sensorial *(el sello)*
Fotografía natural **fuera de foco**, abstracta y atmosférica — agua, follaje,
luz filtrada, piel, cerámica, vapor. Características:
- **Desenfoque** suave (sujeto irreconocible, lectura emocional, no literal).
- **Grano** de película visible — da textura analógica.
- **Tonos minerales** apagados (verde musgo, piedra cálida, agua, luz).
- Suele llevar un **velo de gradiente** diagonal en tonos piedra/arcilla a muy
  baja opacidad, que suaviza los bordes y levanta el contraste del texto:
  ```css
  /* sobre base charcoal rgb(30,30,30) */
  background: linear-gradient(219deg,
    rgb(206,202,192) 1%,
    rgba(231,229,225,0.06) 16%,
    rgba(233,231,227,0) 79%,
    rgb(206,202,192) 106%);
  ```

### 4.2 Foto a sangre / oscura
Fotografía full-bleed, a menudo a contraluz u oscura, con el texto **centrado**
en serif blanco. Para portadas emocionales.

### 4.3 Papel blanco
Fondo blanco (o `--paper`) plano, con texto serif **negro abajo-izquierda**.
Para slides informativos / de texto dentro de un carrusel (stories, reels,
"Educar").

### 4.4 Gradiente suave
Degradado de color tenue (variante "gradiente claro"), como base abstracta para
slides de transición o cita.

> Nunca: gradientes saturados, patrones, overlays de ruido sobre la tipografía,
> filtros de color fuertes. La textura viene de la foto y el grano, no de efectos.

---

## 5. Escala tipográfica social

Las piezas sociales usan una **escala propia sobre lienzo de 1080 px** (distinta
de la escala de slides 1920). Roles:

| Rol | Fuente (orig. → sustituto) | Tamaño / interlínea | Tracking | Caja | Alineación |
|---|---|---|---|---|---|
| **Eyebrow / categoría** | CoFo Sans Mono → `--font-mono-soft` | 35 / 50 px | normal | MAYÚSCULA | centrada |
| **Titular (feed / educar)** | P22 Mackinac → `--font-serif` | 60 / 70 px | tight | *sentence* | centrada |
| **Tagline bilingüe (hero)** | P22 Mackinac → `--font-serif` | 40 / 50 px | tight | *sentence* | centrada |
| **Cuerpo (story / reel)** | P22 Mackinac → `--font-serif` | 35 / 50 px | normal | *sentence* | izquierda |
| **Descriptor de lockup** | Sweet Sans Pro → sans geométrica | 35 / 40 px | `0.4em` | MAYÚSCULA | centrada |

Notas:
- El **serif** (Newsreader / P22 Mackinac) carga el peso editorial: titulares,
  taglines, cuerpo. El **mono** (Spline Sans Mono / CoFo) es solo eyebrows y
  micro-copy en mayúscula.
- El **tagline bilingüe** se compone en dos líneas — inglés sobre español
  (*"For the inner being" / "Para el ser interior"*).
- El **descriptor** bajo el lockup (`ESSENCE`, `ANATOMY`) es la única pieza en
  Sweet Sans Pro; si no está disponible, usar una sans geométrica de caja alta
  con tracking `0.4em`, o el mono de marca en mayúscula.

---

## 6. Ubicación del texto — patrones

1. **Portada / hero (foto):** tagline bilingüe centrado en la franja media;
   lockup (wordmark + descriptor) centrado abajo. Logo de esquina opcional.
2. **Educativo "Educar" (foto):** eyebrow (mono, categoría) centrado en el tercio
   medio; **titular serif** centrado debajo. Logo arriba-izquierda.
3. **Informativo (papel blanco):** cuerpo serif **abajo-izquierda** dentro de la
   safe area; logo arriba en una esquina.
4. **Story / Reel:** mismo principio que (3) en 9:16 — texto abajo-izquierda,
   logo en esquina superior; deja la mitad superior para imagen/aire.

Constante: el texto **nunca toca el borde**; vive dentro de los `57 px` y se
alinea a la grilla. Centrado para momentos emocionales/portada; izquierda para
lectura/explicación.

---

## 7. Cómo se arma un carrusel

Un carrusel es una **secuencia narrativa**, no slides sueltos:

1. **Portada (slide 1).** Gancho emocional: fondo sensorial o foto a sangre +
   tagline o titular + lockup. Invita a deslizar sin "pedir" nada.
2. **Desarrollo (slides 2…n).** Contenido educativo/explicativo. Alterna fondos:
   foto sensorial con eyebrow + titular, y papel blanco con cuerpo serif. Un
   ritmo de imagen → texto → imagen mantiene la calma.
3. **Cierre.** Remate con lockup de marca / descriptor / micro-CTA suave en clave
   de narración (cuenta, no ordena).

Mantén **una sola idea por slide**, márgenes y grilla constantes en toda la
secuencia, y coherencia de tratamiento de fondo entre slides hermanos.

---

## 8. Checklist de composición

- [ ] Formato correcto (4:5 feed · 9:16 story/reel), 1080 px de ancho.
- [ ] Margen de `57 px` respetado; texto y logo dentro de la safe area.
- [ ] Fondo sensorial desenfocado + grano, o foto a sangre, o papel blanco.
- [ ] Velo de gradiente si el texto necesita contraste sobre foto.
- [ ] Serif para editorial, mono solo para eyebrows en mayúscula.
- [ ] Logo blanco o negro según contraste — nunca teñido.
- [ ] Una idea por slide; secuencia con ritmo imagen/texto en carruseles.
- [ ] Tono de narración, no de llamado a la acción.
