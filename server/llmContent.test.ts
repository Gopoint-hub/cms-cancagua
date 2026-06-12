import { describe, expect, it } from "vitest";
import { extractHtmlContent, extractJsonObject } from "./llmContent";

const SAMPLE_HTML = `<!DOCTYPE html>\n<html>\n<body>\n<table><tr><td><h1>Un Regalo de Plenitud Para Ti</h1><a href="{{unsubscribe_url}}">Darse de baja</a></td></tr></table>\n</body>\n</html>`;

describe("extractJsonObject", () => {
  it("parsea JSON limpio", () => {
    const raw = JSON.stringify({ subject: "Hola", htmlContent: SAMPLE_HTML });
    const parsed = extractJsonObject(raw);
    expect(parsed?.subject).toBe("Hola");
    expect(parsed?.htmlContent).toBe(SAMPLE_HTML);
  });

  it("parsea JSON envuelto en ```json", () => {
    const raw = "```json\n" + JSON.stringify({ subject: "Hola", htmlContent: SAMPLE_HTML }) + "\n```";
    const parsed = extractJsonObject(raw);
    expect(parsed?.htmlContent).toBe(SAMPLE_HTML);
  });

  it("parsea JSON con preámbulo conversacional y fence (caso del bug en producción)", () => {
    const raw =
      'Claro, aquí tienes el email promocional. He interpretado la solicitud de "100% de descuento" como una invitación especial.\n\n' +
      "```json\n" +
      JSON.stringify({ subject: "✨ Un regalo de serenidad te espera en Cancagua", htmlContent: SAMPLE_HTML }) +
      "\n```\n\nEspero que te guste el diseño.";
    const parsed = extractJsonObject(raw);
    expect(parsed?.subject).toBe("✨ Un regalo de serenidad te espera en Cancagua");
    expect(parsed?.htmlContent).toBe(SAMPLE_HTML);
  });

  it("parsea JSON con preámbulo sin fence", () => {
    const raw = "Aquí está el resultado:\n" + JSON.stringify({ subject: "Hola", htmlContent: SAMPLE_HTML });
    const parsed = extractJsonObject(raw);
    expect(parsed?.htmlContent).toBe(SAMPLE_HTML);
  });

  it("parsea JSON aunque el preámbulo contenga llaves sueltas", () => {
    const raw =
      "Aquí está el JSON con {subject, htmlContent}: " +
      JSON.stringify({ subject: "Hola", htmlContent: SAMPLE_HTML });
    const parsed = extractJsonObject(raw);
    expect(parsed?.htmlContent).toBe(SAMPLE_HTML);
  });

  it("parsea JSON con htmlContent que contiene ``` interno dentro de un fence", () => {
    const raw = "```json\n" + JSON.stringify({ htmlContent: "<div>usa ``` aquí</div>" }) + "\n```";
    const parsed = extractJsonObject(raw);
    expect(parsed?.htmlContent).toBe("<div>usa ``` aquí</div>");
  });

  it("prefiere el candidato que cumple el predicado sobre objetos previos", () => {
    const raw =
      "El formato {} es este:\n" +
      JSON.stringify({ subject: "Hola", htmlContent: SAMPLE_HTML });
    const parsed = extractJsonObject(raw, (o) => typeof o.htmlContent === "string");
    expect(parsed?.htmlContent).toBe(SAMPLE_HTML);
  });

  it("devuelve null para JSON truncado a mitad de string", () => {
    const raw = '{"subject":"Hola","htmlContent":"<html><body><p class=\\"title\\">Hola';
    expect(extractJsonObject(raw)).toBeNull();
  });

  it("devuelve null si no hay JSON", () => {
    expect(extractJsonObject("No pude generar el email, lo siento.")).toBeNull();
  });
});

describe("extractHtmlContent", () => {
  it("extrae HTML envuelto en ```html con preámbulo", () => {
    const raw = "Claro, aquí está el HTML modificado:\n```html\n" + SAMPLE_HTML + "\n```";
    expect(extractHtmlContent(raw)).toBe(SAMPLE_HTML);
  });

  it("extrae documento HTML con preámbulo sin fence", () => {
    const raw = "Aquí tienes:\n\n" + SAMPLE_HTML + "\n\nSaludos.";
    expect(extractHtmlContent(raw)).toBe(SAMPLE_HTML);
  });

  it("devuelve HTML puro tal cual", () => {
    expect(extractHtmlContent(SAMPLE_HTML)).toBe(SAMPLE_HTML);
  });

  it("extrae fragmento que empieza con etiqueta tras quitar fences", () => {
    const raw = "```\n<table><tr><td>Hola</td></tr></table>\n```";
    expect(extractHtmlContent(raw)).toBe("<table><tr><td>Hola</td></tr></table>");
  });

  it("no trunca un documento fenceado con ``` interno en el contenido", () => {
    const doc = "<html><body><pre>Instala con:\n```\nnpm install\n```\n</pre><p>Saludos</p></body></html>";
    const raw = "```html\n" + doc + "\n```";
    expect(extractHtmlContent(raw)).toBe(doc);
  });

  it("no trunca un fragmento fenceado con ``` interno en el contenido", () => {
    const fragment = "<table><tr><td>Escribe ``` para abrir un bloque</td></tr></table>";
    const raw = "```html\n" + fragment + "\n```";
    expect(extractHtmlContent(raw)).toBe(fragment);
  });

  it("no incrusta prosa posterior que menciona </html>", () => {
    const doc = "<!DOCTYPE html><html><body>Hola</body></html>";
    const raw = "Aquí tienes:\n" + doc + "\n\nNota: siempre cierro el documento con </html> como pediste.";
    expect(extractHtmlContent(raw)).toBe(doc);
  });

  it("recupera un documento sin cierre aunque el preámbulo mencione </html>", () => {
    const doc = "<html><body><p>Hola</p></body>";
    const raw = "Recuerda que todo documento termina en </html>. Aquí va:\n" + doc;
    expect(extractHtmlContent(raw)).toBe(doc);
  });

  it("recupera un fragmento dentro de un fence ```html sin cierre", () => {
    const fragment = "<table><tr><td>Hola</td></tr></table>";
    const raw = "Claro, aquí está:\n```html\n" + fragment;
    expect(extractHtmlContent(raw)).toBe(fragment);
  });

  it("excluye el cierre del fence al recuperar un documento sin </html>", () => {
    const doc = "<html><body><p>Hola</p></body>";
    const raw = "```html\n" + doc + "\n```\nEspero que te sirva.";
    expect(extractHtmlContent(raw)).toBe(doc);
  });

  it("devuelve null si no hay HTML", () => {
    expect(extractHtmlContent("No pude generar el email.")).toBeNull();
  });
});
