import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Newsletter Image Separation Feature", () => {
  // ============================================
  // Backend: generateDesign schema
  // ============================================
  describe("Backend: generateDesign accepts separate image fields", () => {
    const routersContent = fs.readFileSync(
      path.resolve(__dirname, "routers.ts"),
      "utf-8"
    );

    it("accepts headerImage as optional string", () => {
      expect(routersContent).toContain("headerImage: z.string().optional()");
    });

    it("accepts bodyImages as optional array of strings", () => {
      expect(routersContent).toContain("bodyImages: z.array(z.string()).optional()");
    });

    it("still accepts legacy images field for backwards compatibility", () => {
      expect(routersContent).toContain("images: z.array(z.string()).optional()");
    });
  });

  // ============================================
  // Backend: Conditional AI image generation
  // ============================================
  describe("Backend: Conditional AI image generation", () => {
    const routersContent = fs.readFileSync(
      path.resolve(__dirname, "routers.ts"),
      "utf-8"
    );

    it("checks for userHeaderImage before generating AI hero", () => {
      expect(routersContent).toContain("const userHeaderImage = input.headerImage || null");
    });

    it("only generates AI hero when no user header image provided", () => {
      expect(routersContent).toContain("if (!userHeaderImage && input.generateImages)");
    });

    it("uses finalHeaderImage which prefers user image over generated", () => {
      expect(routersContent).toContain("const finalHeaderImage = userHeaderImage || generatedHeaderUrl");
    });
  });

  // ============================================
  // Backend: LLM prompt differentiation
  // ============================================
  describe("Backend: LLM prompt differentiates header vs body images", () => {
    const routersContent = fs.readFileSync(
      path.resolve(__dirname, "routers.ts"),
      "utf-8"
    );

    it("includes header image section in prompt", () => {
      expect(routersContent).toContain("IMAGEN DE HEADER/HERO (OBLIGATORIO usar esta imagen como banner principal del email)");
    });

    it("includes body images section in prompt", () => {
      expect(routersContent).toContain("IMÁGENES PARA EL CUERPO DEL EMAIL (incluir dentro del contenido del email)");
    });

    it("instructs AI to use provided header image as banner", () => {
      expect(routersContent).toContain("Si hay una IMAGEN DE HEADER/HERO proporcionada, DEBES usarla como imagen principal/banner del email");
    });

    it("instructs AI to include body images in content", () => {
      expect(routersContent).toContain("Si hay IMÁGENES PARA EL CUERPO, inclúyelas dentro del contenido del email");
    });
  });

  // ============================================
  // Frontend: Separate image upload fields
  // ============================================
  describe("Frontend: Separate image upload fields", () => {
    const wizardContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/cms/CrearNewsletter.tsx"),
      "utf-8"
    );

    it("has separate headerImage state", () => {
      expect(wizardContent).toContain("const [headerImage, setHeaderImage] = useState<string | null>(null)");
    });

    it("has separate bodyImages state", () => {
      expect(wizardContent).toContain("const [bodyImages, setBodyImages] = useState<string[]>([])");
    });

    it("has header image upload section with label", () => {
      expect(wizardContent).toContain("Imagen para header (opcional)");
    });

    it("has body images upload section with label", () => {
      expect(wizardContent).toContain("Imágenes dentro del emailing (opcional)");
    });

    it("indicates AI will generate header if not provided", () => {
      expect(wizardContent).toContain("Si no subes una, la IA generará una automáticamente");
    });

    it("indicates AI will select brand images if body images not provided", () => {
      expect(wizardContent).toContain("Si no subes ninguna, la IA seleccionará imágenes de la marca");
    });

    it("passes headerImage to generateDesign mutation", () => {
      expect(wizardContent).toContain("headerImage: headerImage || undefined");
    });

    it("passes bodyImages to generateDesign mutation", () => {
      expect(wizardContent).toContain("bodyImages: bodyImages.length > 0 ? bodyImages : undefined");
    });

    it("has separate file input refs for header and body", () => {
      expect(wizardContent).toContain("headerFileInputRef");
      expect(wizardContent).toContain("bodyFileInputRef");
    });
  });
});
