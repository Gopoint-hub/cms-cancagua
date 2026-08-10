import { describe, expect, it } from "vitest";
import { generateQuotePDF } from "./quotePdfGenerator";

describe("branded quotation PDF", () => {
  it("generates a valid multi-section PDF", async () => {
    const pdf = await generateQuotePDF({
      quoteNumber: "COT-TEST",
      date: "10-08-2026",
      clientName: "María Olga Muñoz",
      clientEmail: "presente@mindfull.cl",
      clientCompany: "South Mindfulness SpA",
      clientPhone: "+56 9 9051 0956",
      numberOfPeople: 40,
      dealName: "Jornada de bienestar corporativo",
      validUntil: "20-08-2026",
      notes: "El arriendo del yurt tiene un valor fijo. Los servicios se ajustarán según la cantidad final de inscritos.",
      items: [
        {
          productName: "Coffee Break Full",
          description: "Incluye café americano, agua saborizada, fruta de estación y alternativas dulces y saladas.",
          quantity: 40,
          unitPrice: 12000,
          total: 480000,
          sortOrder: 1,
        },
        {
          productName: "Arriendo de Yurt",
          description: "Espacio para jornada de equipo.",
          quantity: 1,
          unitPrice: 238000,
          total: 238000,
          scheduleTime: "09:00 a 13:00",
          sortOrder: 2,
        },
      ],
      subtotal: 718000,
      tax: 0,
      total: 718000,
      termsOfPurchase: "Cotización válida por 10 días\nPara garantizar la reserva se debe abonar el 50% del valor total",
    });

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});
