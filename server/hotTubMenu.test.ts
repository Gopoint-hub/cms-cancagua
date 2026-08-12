import { describe, expect, it } from "vitest";
import { findHotTubCatalogItem, HOT_TUB_CATALOG } from "./hotTubMenu";

describe("Hot Tub menu catalog", () => {
  it("keeps the approved section order and includes desserts", () => {
    expect(HOT_TUB_CATALOG.map(section => section.key)).toEqual([
      "tablas",
      "vinos",
      "jugos",
      "kombucha",
      "aguas",
      "tropera",
      "chester",
      "sour",
      "postres",
    ]);
  });

  it("uses the prototype prices for tables and wine", () => {
    expect(findHotTubCatalogItem("charcuteria-2-3")?.priceClp).toBe(28_000);
    expect(findHotTubCatalogItem("charcuteria-4-6")?.priceClp).toBe(38_000);
    expect(findHotTubCatalogItem("espumante-berla")?.priceClp).toBe(13_000);
    expect(findHotTubCatalogItem("berla-chardonnay")?.priceClp).toBe(12_000);
  });

  it("maps every public item to an existing CMS menu item", () => {
    for (const section of HOT_TUB_CATALOG) {
      for (const item of section.items) {
        expect(item.menuItemId).toBeGreaterThan(0);
        expect(item.priceClp).toBeGreaterThan(0);
      }
    }
  });
});
