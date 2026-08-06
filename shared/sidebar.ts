export const SIDEBAR_MODULE_IDS = [
  "home",
  "calendar360",
  "clients360",
  "b2c",
  "b2b",
  "ventas",
  "marketing",
  "metrics",
  "operations",
  "admin",
  "biopools",
  "masajes",
  "regular_classes",
  "ayuda",
] as const;

export type SidebarModuleId = (typeof SIDEBAR_MODULE_IDS)[number];

export const DEFAULT_SIDEBAR_MODULE_ORDER: SidebarModuleId[] = [
  ...SIDEBAR_MODULE_IDS,
];

const SIDEBAR_MODULE_ID_SET = new Set<string>(SIDEBAR_MODULE_IDS);

/**
 * Conserva solamente identificadores conocidos, elimina duplicados y agrega al
 * final cualquier modulo nuevo que todavia no exista en una configuracion
 * guardada.
 */
export function normalizeSidebarModuleOrder(value: unknown): SidebarModuleId[] {
  const received = Array.isArray(value) ? value : [];
  const normalized: SidebarModuleId[] = [];

  for (const id of received) {
    if (
      typeof id === "string"
      && SIDEBAR_MODULE_ID_SET.has(id)
      && !normalized.includes(id as SidebarModuleId)
    ) {
      normalized.push(id as SidebarModuleId);
    }
  }

  for (const id of DEFAULT_SIDEBAR_MODULE_ORDER) {
    if (!normalized.includes(id)) normalized.push(id);
  }

  return normalized;
}
