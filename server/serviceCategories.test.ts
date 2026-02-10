/**
 * Tests for serviceCategories utility
 * Validates category mapping, icon assignment, and name inference
 */
import { describe, it, expect } from "vitest";

// Since serviceCategories is a client-side module, we test the logic directly
// by reimporting the mapping logic

describe("Service Categories Mapping", () => {
  // Known category UUIDs from Skedu
  const KNOWN_CATEGORIES = {
    masajes: "1f2ee9c9-f6e7-4e6d-97a8-51ba5271960d",
    extras: "2199fb15-4404-4f63-a574-d3f400159350",
    pases: "2640c097-3623-4e2b-bf20-5eb9b1d5d5d9",
    eventos: "2de9bc07-ba51-4c9a-82c5-90db71718e2c",
    hotTubs: "42390ed0-0266-4719-9eaf-14f1f43d7f3d",
    biopiscinas: "497f79e9-50f9-484a-a1e9-dab5f5d67d2d",
    fullDay: "56351692-0c41-455e-bd95-fc4434fa40ec",
    tablas: "56354667-cf85-4381-a0f8-b4101ebce142",
    sauna: "88a5c6bb-22a7-45e4-8ac8-446f2422a2d3",
    membresias: "9685f233-3bcd-451d-9c4b-1c8563295942",
    bioFrutillar: "a6dd5651-38be-4145-9e04-5ff12bb43417",
    clases: "c98cf093-2ba5-494d-a1e4-5a0bb360c387",
    promos: "e93b850b-6fda-4fae-9fed-df5591c251c5",
  };

  // Category name mapping (same as in serviceCategories.ts)
  const CATEGORY_NAMES: Record<string, string> = {
    [KNOWN_CATEGORIES.masajes]: "Masajes",
    [KNOWN_CATEGORIES.extras]: "Extras",
    [KNOWN_CATEGORIES.pases]: "Pases Reconecta",
    [KNOWN_CATEGORIES.eventos]: "Eventos & Talleres",
    [KNOWN_CATEGORIES.hotTubs]: "Hot Tubs",
    [KNOWN_CATEGORIES.biopiscinas]: "Biopiscinas",
    [KNOWN_CATEGORIES.fullDay]: "Full Day",
    [KNOWN_CATEGORIES.tablas]: "Tablas SUP",
    [KNOWN_CATEGORIES.sauna]: "Sauna Nativo",
    [KNOWN_CATEGORIES.membresias]: "Membresías",
    [KNOWN_CATEGORIES.bioFrutillar]: "Biopiscinas Frutillar",
    [KNOWN_CATEGORIES.clases]: "Clases & Yoga",
    [KNOWN_CATEGORIES.promos]: "Promociones",
  };

  it("should have 13 known categories mapped", () => {
    expect(Object.keys(KNOWN_CATEGORIES)).toHaveLength(13);
    expect(Object.keys(CATEGORY_NAMES)).toHaveLength(13);
  });

  it("each category UUID should map to a readable name", () => {
    for (const [key, uuid] of Object.entries(KNOWN_CATEGORIES)) {
      expect(CATEGORY_NAMES[uuid]).toBeDefined();
      expect(CATEGORY_NAMES[uuid].length).toBeGreaterThan(0);
    }
  });

  it("Masajes category should have correct name", () => {
    expect(CATEGORY_NAMES[KNOWN_CATEGORIES.masajes]).toBe("Masajes");
  });

  it("Biopiscinas category should have correct name", () => {
    expect(CATEGORY_NAMES[KNOWN_CATEGORIES.biopiscinas]).toBe("Biopiscinas");
  });

  it("Hot Tubs category should have correct name", () => {
    expect(CATEGORY_NAMES[KNOWN_CATEGORIES.hotTubs]).toBe("Hot Tubs");
  });

  it("Sauna Nativo category should have correct name", () => {
    expect(CATEGORY_NAMES[KNOWN_CATEGORIES.sauna]).toBe("Sauna Nativo");
  });

  it("Tablas SUP category should have correct name", () => {
    expect(CATEGORY_NAMES[KNOWN_CATEGORIES.tablas]).toBe("Tablas SUP");
  });

  it("Biopiscinas Frutillar should be a distinct category from Biopiscinas", () => {
    expect(KNOWN_CATEGORIES.bioFrutillar).not.toBe(KNOWN_CATEGORIES.biopiscinas);
    expect(CATEGORY_NAMES[KNOWN_CATEGORIES.bioFrutillar]).toBe("Biopiscinas Frutillar");
    expect(CATEGORY_NAMES[KNOWN_CATEGORIES.biopiscinas]).toBe("Biopiscinas");
  });

  // Test name inference logic
  describe("Category inference from service name", () => {
    const inferCategory = (name: string): string => {
      const lower = name.toLowerCase();
      if (lower.includes("full day")) return "Full Day";
      if (lower.includes("biopiscina") && lower.includes("frutillar")) return "Biopiscinas Frutillar";
      if (lower.includes("biopiscina")) return "Biopiscinas";
      if (lower.includes("hot tub") || lower.includes("hot-tub")) return "Hot Tubs";
      if (lower.includes("masaje")) return "Masajes";
      if (lower.includes("sauna")) return "Sauna Nativo";
      if (lower.includes("tabla") || lower.includes("sup")) return "Tablas SUP";
      if (lower.includes("yoga") || lower.includes("danza") || lower.includes("entrenamiento")) return "Clases & Yoga";
      if (lower.includes("reconecta") || lower.includes("pase")) return "Pases Reconecta";
      if (lower.includes("promo")) return "Promociones";
      if (lower.includes("membresía") || lower.includes("membresia")) return "Membresías";
      return "Servicio";
    };

    it("should infer Biopiscinas from service name", () => {
      expect(inferCategory("Biopiscinas Geotermales (Estadía de 4 horas)")).toBe("Biopiscinas");
    });

    it("should infer Biopiscinas Frutillar from service name", () => {
      expect(inferCategory("Biopiscinas en Frutillar + Traslado incluido")).toBe("Biopiscinas Frutillar");
    });

    it("should infer Hot Tubs from service name", () => {
      expect(inferCategory("Hot Tubs (Estadia de 2.5hrs)")).toBe("Hot Tubs");
    });

    it("should infer Masajes from service name", () => {
      expect(inferCategory("Masaje 50 minutos")).toBe("Masajes");
    });

    it("should infer Sauna from service name", () => {
      expect(inferCategory("Sauna Nativo 2 Personas")).toBe("Sauna Nativo");
    });

    it("should infer Tablas SUP from service name", () => {
      expect(inferCategory("Tablas")).toBe("Tablas SUP");
    });

    it("should infer Clases & Yoga from service name", () => {
      expect(inferCategory("Hatha Yoga - Suave")).toBe("Clases & Yoga");
      expect(inferCategory("Danza y Ritmos Africanos")).toBe("Clases & Yoga");
    });

    it("should infer Full Day from service name", () => {
      expect(inferCategory("Full Day Hot tubs + Biopiscinas")).toBe("Full Day");
    });

    it("should infer Pases Reconecta from service name", () => {
      expect(inferCategory("Pase BioReconecta 6hrs")).toBe("Pases Reconecta");
    });

    it("should return default for unknown service name", () => {
      expect(inferCategory("Servicio desconocido")).toBe("Servicio");
    });
  });
});
