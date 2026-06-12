/**
 * Helpers para extraer contenido estructurado de respuestas de LLM.
 * Los modelos a veces ignoran instrucciones de "devuelve SOLO JSON" y anteponen
 * texto conversacional o envuelven la respuesta en bloques ```json/```html.
 */

/** Busca el objeto JSON balanceado que comienza en el "{" en la posición `start`. */
function scanBalancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Extrae y parsea un objeto JSON de una respuesta de LLM, tolerando preámbulos
 * conversacionales (incluso con llaves sueltas), bloques de código markdown y
 * texto posterior. Si se entrega `isPreferred`, devuelve el primer candidato
 * que cumpla el predicado; si ninguno cumple, el primer objeto parseable.
 * Devuelve null si no se encuentra JSON válido.
 */
export function extractJsonObject(
  raw: string,
  isPreferred?: (obj: Record<string, unknown>) => boolean
): Record<string, unknown> | null {
  const candidates: string[] = [];

  candidates.push(raw.trim());

  // Contenido de bloques ```json ... ``` (o ``` ... ```) en cualquier posición
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(raw)) !== null) {
    candidates.push(match[1].trim());
  }

  // Objetos balanceados desde cada "{" — el primero puede ser una llave del
  // preámbulo (p. ej. el modelo eco-eando el formato pedido), así que se
  // reintenta desde los siguientes hasta encontrar uno parseable.
  let braceStart = raw.indexOf("{");
  for (let attempts = 0; braceStart !== -1 && attempts < 20; attempts++) {
    const balanced = scanBalancedObject(raw, braceStart);
    if (balanced) candidates.push(balanced);
    braceStart = raw.indexOf("{", braceStart + 1);
  }

  let fallback: Record<string, unknown> | null = null;
  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (!isPreferred || isPreferred(obj)) return obj;
        if (!fallback) fallback = obj;
      }
    } catch {
      // probar el siguiente candidato
    }
  }
  return fallback;
}

/**
 * Extrae HTML de una respuesta de LLM, tolerando preámbulos conversacionales,
 * bloques ```html (con o sin cierre) y prosa posterior.
 * Devuelve null si no hay HTML reconocible.
 */
export function extractHtmlContent(raw: string): string | null {
  // 1. Documento HTML completo embebido — la señal más fiable, inmune a
  //    ``` internos en el contenido y a menciones de </html> en la prosa.
  const docStart = raw.search(/<!DOCTYPE\s+html|<html[\s>]/i);
  if (docStart !== -1) {
    const closeIdx = raw.toLowerCase().indexOf("</html>", docStart);
    if (closeIdx !== -1) {
      return raw.slice(docStart, closeIdx + "</html>".length).trim();
    }
    // Documento sin cierre (respuesta cortada): no incluir el cierre del fence
    const fenceEnd = raw.indexOf("```", docStart);
    return raw.slice(docStart, fenceEnd !== -1 ? fenceEnd : raw.length).trim();
  }

  // 2. Fragmento dentro de un bloque ```html cerrado. El match lazy corta en el
  //    primer ``` interno y el greedy llega hasta el último: preferir el que
  //    termina en una etiqueta cerrada.
  const lazy = raw.match(/```(?:html)?\s*(<[\s\S]*?)```/i)?.[1]?.trim() ?? null;
  const greedy = raw.match(/```(?:html)?\s*(<[\s\S]*)```/i)?.[1]?.trim() ?? null;
  if (lazy && lazy.endsWith(">")) return lazy;
  if (greedy && greedy.endsWith(">")) return greedy;
  if (lazy) return lazy;

  // 3. Fence ```html sin cierre (respuesta cortada justo ahí)
  const openFence = /```(?:html)?\s*(<)/i.exec(raw);
  if (openFence) {
    return raw.slice(openFence.index + openFence[0].length - 1).trim();
  }

  // 4. Fragmento sin fences que empieza con una etiqueta
  const stripped = raw.replace(/```[a-z]*\s*/gi, "").trim();
  if (stripped.startsWith("<")) {
    return stripped;
  }

  return null;
}
