import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("B2B Quotation Module Fixes", () => {
  // ============================================
  // Backend: Schema validation
  // ============================================
  describe("Backend Schema Validation", () => {
    it("quotes.create schema accepts name, dealId, clientWhatsapp, termsOfPurchase fields", () => {
      const routersContent = fs.readFileSync(
        path.resolve(__dirname, "routers.ts"),
        "utf-8"
      );

      // The create mutation should accept these fields
      expect(routersContent).toContain("name: z.string().optional()");
      expect(routersContent).toContain("dealId: z.number().optional()");
      expect(routersContent).toContain("clientWhatsapp: z.string().optional()");
      expect(routersContent).toContain("termsOfPurchase: z.string().optional()");
    });

    it("quotes.create schema accepts item-level discountType, discountValue, scheduleTime", () => {
      const routersContent = fs.readFileSync(
        path.resolve(__dirname, "routers.ts"),
        "utf-8"
      );

      // Items should accept discount and schedule fields
      expect(routersContent).toContain('discountType: z.enum(["percentage", "fixed"]).optional()');
      expect(routersContent).toContain("discountValue: z.number().optional()");
      expect(routersContent).toContain("scheduleTime: z.string().optional()");
    });

    it("quotes.update schema accepts all the same fields as create", () => {
      const routersContent = fs.readFileSync(
        path.resolve(__dirname, "routers.ts"),
        "utf-8"
      );

      // Find the update mutation section
      const updateSection = routersContent.substring(
        routersContent.indexOf("update: protectedProcedure")
      );

      expect(updateSection).toContain("clientWhatsapp: z.string().optional()");
      expect(updateSection).toContain("termsOfPurchase: z.string().optional()");
    });

    it("createQuote db function returns { success: true } on success", () => {
      const dbContent = fs.readFileSync(
        path.resolve(__dirname, "db.ts"),
        "utf-8"
      );

      // The createQuote function should return { success: true, ...quote }
      expect(dbContent).toContain("return { success: true, ...quote }");
      // And return { success: false } on failure
      expect(dbContent).toContain("return { success: false }");
    });
  });

  // ============================================
  // Frontend: Wizard steps
  // ============================================
  describe("Frontend Wizard Steps", () => {
    const wizardContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/cms/CotizacionWizard.tsx"),
      "utf-8"
    );

    it("wizard has exactly 5 steps (payment step removed)", () => {
      // Count WIZARD_STEPS entries
      const stepMatches = wizardContent.match(/\{ id: \d+, title:/g);
      expect(stepMatches).toHaveLength(5);
    });

    it("wizard does NOT include 'Firma y pago' as a step definition", () => {
      // The step definitions should not include payment step
      expect(wizardContent).not.toContain('title: "Firma y pago"');
      // CreditCard icon should not be imported
      expect(wizardContent).not.toContain("CreditCard");
    });

    it("wizard steps are: Negocio, Comprador, Pedido, Plantilla, Revisión", () => {
      expect(wizardContent).toContain('"Negocio"');
      expect(wizardContent).toContain('"Información del comprador"');
      expect(wizardContent).toContain('"Elementos de pedido"');
      expect(wizardContent).toContain('"Plantilla y detalles"');
      expect(wizardContent).toContain('"Revisión"');
    });

    it("wizard shows 'Paso X de 5' (not 6)", () => {
      expect(wizardContent).toContain("Paso {currentStep} de 5");
    });

    it("last step is 5 for save/publish buttons", () => {
      expect(wizardContent).toContain("currentStep === 5 ?");
    });
  });

  // ============================================
  // Phone number fix
  // ============================================
  describe("Phone Number Fix", () => {
    it("wizard uses correct phone number +56 9 8224 3411", () => {
      const wizardContent = fs.readFileSync(
        path.resolve(__dirname, "../client/src/pages/cms/CotizacionWizard.tsx"),
        "utf-8"
      );

      // Should use the correct phone number
      expect(wizardContent).toContain("+56 9 8224 3411");
      // Should NOT use the old phone number
      expect(wizardContent).not.toContain("940073999");
    });

    it("PDF generator uses correct phone number +56 9 8224 3411 everywhere", () => {
      const pdfContent = fs.readFileSync(
        path.resolve(__dirname, "pdfGenerator.ts"),
        "utf-8"
      );

      // Should use the correct phone number
      expect(pdfContent).toContain("+56 9 8224 3411");
      // Should NOT have placeholder XXXX
      expect(pdfContent).not.toContain("XXXX XXXX");
    });
  });

  // ============================================
  // Multi-select products
  // ============================================
  describe("Multi-select Products", () => {
    const wizardContent = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/cms/CotizacionWizard.tsx"),
      "utf-8"
    );

    it("wizard has selectedProductIds state for multi-select", () => {
      expect(wizardContent).toContain("selectedProductIds");
      expect(wizardContent).toContain("setSelectedProductIds");
    });

    it("wizard has handleAddSelectedProducts function for bulk add", () => {
      expect(wizardContent).toContain("handleAddSelectedProducts");
    });

    it("wizard has toggleProductSelection function", () => {
      expect(wizardContent).toContain("toggleProductSelection");
    });

    it("product dialog uses Checkbox component for multi-select", () => {
      expect(wizardContent).toContain("Checkbox");
    });

    it("product dialog shows count of selected products", () => {
      expect(wizardContent).toContain("producto(s) seleccionado(s)");
    });
  });

  // ============================================
  // Edit functionality
  // ============================================
  describe("Edit Functionality", () => {
    it("wizard loads existing quote data when editing", () => {
      const wizardContent = fs.readFileSync(
        path.resolve(__dirname, "../client/src/pages/cms/CotizacionWizard.tsx"),
        "utf-8"
      );

      // Should query existing quote
      expect(wizardContent).toContain("existingQuote");
      expect(wizardContent).toContain("existingItems");
      // Should have isEditing flag
      expect(wizardContent).toContain("isEditing");
      // Should use updateQuoteMutation when editing
      expect(wizardContent).toContain("updateQuoteMutation");
    });

    it("wizard shows loading state when editing", () => {
      const wizardContent = fs.readFileSync(
        path.resolve(__dirname, "../client/src/pages/cms/CotizacionWizard.tsx"),
        "utf-8"
      );

      expect(wizardContent).toContain("Cargando cotización");
      expect(wizardContent).toContain("Loader2");
    });

    it("Cotizaciones list has Edit button for each quote", () => {
      const listContent = fs.readFileSync(
        path.resolve(__dirname, "../client/src/pages/cms/Cotizaciones.tsx"),
        "utf-8"
      );

      expect(listContent).toContain("Editar cotización");
      expect(listContent).toContain("cotizacion-wizard/${quote.id}");
    });

    it("wizard header shows 'Editar cotización' when editing", () => {
      const wizardContent = fs.readFileSync(
        path.resolve(__dirname, "../client/src/pages/cms/CotizacionWizard.tsx"),
        "utf-8"
      );

      expect(wizardContent).toContain('"Editar cotización"');
      expect(wizardContent).toContain('"Nueva cotización"');
    });
  });

  // ============================================
  // Bank details in review
  // ============================================
  describe("Bank Details in Review", () => {
    it("review step includes bank account information", () => {
      const wizardContent = fs.readFileSync(
        path.resolve(__dirname, "../client/src/pages/cms/CotizacionWizard.tsx"),
        "utf-8"
      );

      expect(wizardContent).toContain("Datos bancarios");
      expect(wizardContent).toContain("Santander");
      expect(wizardContent).toContain("9569934-0");
      expect(wizardContent).toContain("77.926.863-2");
      expect(wizardContent).toContain("eventos@cancagua.cl");
    });
  });
});
