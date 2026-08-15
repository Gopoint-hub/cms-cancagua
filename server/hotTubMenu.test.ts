import { describe, expect, it } from "vitest";
import {
  findHotTubCatalogItem,
  HOT_TUB_CATALOG,
  resolveHotTubCatalogPrice,
} from "./hotTubMenu";

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

  it("maps each public presentation to its editable CMS price", () => {
    expect(findHotTubCatalogItem("charcuteria-2-3")?.cmsPriceKey).toBe("for_2");
    expect(findHotTubCatalogItem("charcuteria-4-6")?.cmsPriceKey).toBe("for_4");
    expect(findHotTubCatalogItem("espumante-berla")?.cmsPriceKey).toBe("default");
    expect(findHotTubCatalogItem("berla-chardonnay")?.cmsPriceKey).toBe("default");
  });

  it("maps every public item to an existing CMS menu item", () => {
    for (const section of HOT_TUB_CATALOG) {
      for (const item of section.items) {
        expect(item.menuItemId).toBeGreaterThan(0);
        expect(item.priceClp).toBeGreaterThan(0);
      }
    }
  });

  it("resolves the current value from the CMS instead of the template value", () => {
    const wine = findHotTubCatalogItem("berla-chardonnay")!;
    const table = findHotTubCatalogItem("charcuteria-4-6")!;

    expect(resolveHotTubCatalogPrice(wine, { default: 15_000 })).toBe(15_000);
    expect(resolveHotTubCatalogPrice(table, { for_2: 28_000, for_4: 42_000 })).toBe(42_000);
    expect(resolveHotTubCatalogPrice(table, { for_2: 28_000 })).toBeNull();
  });
});
