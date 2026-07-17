import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANCAGUA_CONTENT_VOICE,
  CANCAGUA_EMAIL_REFINEMENT_RULES,
  getCancaguaEmailDesignSystem,
} from "./brand/cancaguaDesignSystem";

describe("Cancagua design system", () => {
  it("provides the complete email rules from one reusable source", () => {
    const prompt = getCancaguaEmailDesignSystem();

    expect(prompt).toContain("piedra, equilibrio, naturaleza");
    expect(prompt).toContain("#F4F2ED");
    expect(prompt).toContain("#333D51");
    expect(prompt).toContain("P22 Mackinac Pro");
    expect(prompt).toContain("CoFo Sans");
    expect(prompt).toContain("contenedor de 600px");
    expect(prompt).toContain('tablas role="presentation"');
    expect(prompt).toContain("{{unsubscribe_url}}");
  });

  it("shares brand voice with content generation and refinements", () => {
    expect(CANCAGUA_CONTENT_VOICE).toContain("Español de Chile");
    expect(CANCAGUA_EMAIL_REFINEMENT_RULES).toContain(CANCAGUA_CONTENT_VOICE);
  });

  it.each([
    "P22MackinacPro-Book.otf",
    "P22MackinacPro-BookItalic.otf",
    "P22MackinacPro-Medium.otf",
    "P22MackinacPro-Bold.otf",
    "CoFoSans-Regular.otf",
    "CoFoSans-Medium.otf",
  ])("ships licensed font asset %s", (file) => {
    const font = path.resolve(__dirname, "../client/public/brand/fonts", file);
    expect(fs.existsSync(font)).toBe(true);
    expect(fs.statSync(font).size).toBeGreaterThan(50_000);
  });
});
