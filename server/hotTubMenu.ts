export type HotTubMenuArea = "cafe" | "reception";

export type HotTubCatalogItem = {
  key: string;
  menuItemId: number;
  name: string;
  subtitle?: string;
  description?: string;
  priceClp: number;
  preparationArea: HotTubMenuArea;
};

export type HotTubCatalogSection = {
  key: string;
  title: string;
  note?: string;
  preparationArea: HotTubMenuArea;
  items: HotTubCatalogItem[];
};

const item = (
  menuItemId: number,
  key: string,
  name: string,
  priceClp: number,
  preparationArea: HotTubMenuArea,
  subtitle?: string,
  description?: string,
): HotTubCatalogItem => ({
  key,
  menuItemId,
  name,
  subtitle,
  description,
  priceClp,
  preparationArea,
});

const charcuterie =
  "Quesos de Los Bajos, charcutería Nueva Braun, 3 tipos de salsa untable, galletitas sacapita, papitas Gololo, fruta de la estación y aceitunas.";
const vegan =
  "Quesos veganos Pepilú, pepinillos dill, tomates cherry, fruta de la estación, salsas untables veganas, papitas Gololo, galletitas sacapita y frutos secos.";

/**
 * Carta específica para Hot Tubs. Los nombres, descripciones y valores son los
 * aprobados en el prototipo histórico. `menuItemId` conserva el vínculo con el
 * CMS para respetar activo/agotado y mantener la trazabilidad de las comandas.
 */
export const HOT_TUB_CATALOG: HotTubCatalogSection[] = [
  {
    key: "tablas",
    title: "Tablas",
    preparationArea: "cafe",
    items: [
      item(2, "charcuteria-2-3", "Charcutería & Quesos", 28_000, "cafe", "para 2 a 3 personas", charcuterie),
      item(2, "charcuteria-4-6", "Charcutería & Quesos", 38_000, "cafe", "para 4 a 6 personas", charcuterie),
      item(
        3,
        "tabla-ninos-3",
        "Tabla de Niños",
        28_000,
        "cafe",
        "para 3 personas",
        "Queso de Los Bajos, salame, pepinillos dill, tomates cherry, fruta de la estación, pocillo de mermelada, galletas bañadas en chocolate, galletas saladas, papitas Gololo, palomitas y frutos secos.",
      ),
      item(1, "otono-2-3", "Tabla Otoño (vegana)", 28_000, "cafe", "para 2 a 3 personas", vegan),
      item(1, "otono-4-6", "Tabla Otoño (vegana)", 38_000, "cafe", "para 4 a 6 personas", vegan),
    ],
  },
  {
    key: "vinos",
    title: "Vinos y espumante",
    preparationArea: "reception",
    items: [
      item(60001, "espumante-berla", "Espumante Berla Extra Brut", 13_000, "reception", "botella 750 cc"),
      item(90001, "berla-chardonnay", "Vino Berla Chardonnay Moscatel", 12_000, "reception", "botella 750 cc"),
      item(90002, "berla-cinsault", "Vino Berla Cinsault", 12_000, "reception", "botella 750 cc"),
    ],
  },
  {
    key: "jugos",
    title: "Jugos Rubén Avilés",
    note: "100% natural · 300 cc",
    preparationArea: "reception",
    items: [
      item(90003, "jugo-manzana-maqui", "Manzana - Maqui", 4_000, "reception"),
      item(90003, "jugo-manzana-naranja", "Manzana - Naranja", 4_000, "reception"),
      item(90003, "jugo-manzana-cranberry", "Manzana - Cranberry", 4_000, "reception"),
      item(90003, "jugo-manzana", "Manzana", 4_000, "reception"),
    ],
  },
  {
    key: "kombucha",
    title: "Kombucha La Ida",
    note: "355 cc",
    preparationArea: "reception",
    items: [
      item(6, "kombucha-maracuya", "Maracuyá Cardamomo", 4_000, "reception"),
      item(6, "kombucha-maqui", "Maqui Hops", 4_000, "reception"),
      item(6, "kombucha-lemon", "Lemon Fresh", 4_000, "reception"),
      item(6, "kombucha-te-verde", "Té verde y lúpulo", 4_000, "reception"),
      item(6, "kombucha-pina", "Piña Albahaca", 4_000, "reception"),
    ],
  },
  {
    key: "aguas",
    title: "Aguas Puyehue",
    note: "330 cc",
    preparationArea: "reception",
    items: [
      item(4, "agua-con-gas", "Agua con gas", 3_000, "reception"),
      item(4, "agua-sin-gas", "Agua sin gas", 3_000, "reception"),
    ],
  },
  {
    key: "tropera",
    title: "Cervezas Tropera",
    note: "473 cc",
    preparationArea: "reception",
    items: [
      item(90004, "tropera-crazy-juan", "Crazy Juan", 4_000, "reception", "Brown Ale"),
      item(90004, "tropera-strong-47", "Strong #47", 4_000, "reception", "Strong Ale"),
      item(90004, "tropera-don-manu", "Don Manu", 4_000, "reception", "Classic IPA"),
      item(90004, "tropera-guadalina", "Guadalina", 4_000, "reception", "Blonde Ale"),
      item(90004, "tropera-blanche", "Blanché", 4_000, "reception", "bota sucia"),
    ],
  },
  {
    key: "chester",
    title: "Cervezas Chester",
    note: "473 cc",
    preparationArea: "reception",
    items: [
      item(90005, "chester-dos-kombis", "Dos Kombis", 4_000, "reception", "Summer Ale"),
      item(90005, "chester-rustic-99", "Rustic 99", 4_000, "reception", "Chilean Pale Ale"),
      item(90005, "chester-obama", "Obama´s Redemption", 4_000, "reception", "Stout"),
      item(90005, "chester-che-ipa", "Che´s IPA", 4_000, "reception", "India Pale Ale"),
    ],
  },
  {
    key: "sour",
    title: "Sour Catedral",
    note: "330 cc",
    preparationArea: "reception",
    items: [
      item(90006, "sour-menta", "Menta jengibre", 7_900, "reception"),
      item(90006, "sour-murta", "Murta", 7_900, "reception"),
    ],
  },
  {
    key: "postres",
    title: "Postres",
    preparationArea: "cafe",
    items: [
      item(7, "postre-helado-pucia", "Helados Pucía", 6_000, "cafe", undefined, "Frutos del Bosque / Chocolate 80% / Manjar Playa Venado / Limón, menta y jengibre / Frambuesa"),
      item(8, "postre-cheesecake", "Cheesecake de Chocolate", 5_500, "cafe", undefined, "Cheesecake artesanal de chocolate"),
      item(9, "postre-keto", "Postres Keto", 5_500, "cafe", undefined, "Opciones de postres keto"),
      item(10, "postre-fraguitos", "Postres Fraguitos", 5_000, "cafe", undefined, "Postres artesanales Fraguitos"),
    ],
  },
];

const ITEMS_BY_KEY = new Map(
  HOT_TUB_CATALOG.flatMap(section => section.items).map(entry => [entry.key, entry]),
);

export function findHotTubCatalogItem(key: string): HotTubCatalogItem | null {
  return ITEMS_BY_KEY.get(key) ?? null;
}
