export const CANCAGUA_STAFF_ROLE = "cancagua_staff" as const;

export type CmsUserRole =
  | "super_admin"
  | "admin"
  | "editor"
  | "user"
  | "seller"
  | "concierge"
  | typeof CANCAGUA_STAFF_ROLE;

const ADMIN_ROLES = new Set<CmsUserRole>(["super_admin", "admin"]);
const CONTENT_ROLES = new Set<CmsUserRole>(["super_admin", "admin", "editor"]);
const STAFF_OPERATION_ROLES = new Set<CmsUserRole>([
  "super_admin",
  "admin",
  "editor",
  CANCAGUA_STAFF_ROLE,
]);

export const isAdminRole = (role?: string | null) => ADMIN_ROLES.has(role as CmsUserRole);
export const hasContentAdminAccess = (role?: string | null) => CONTENT_ROLES.has(role as CmsUserRole);
export const hasB2CAccess = (role?: string | null) => STAFF_OPERATION_ROLES.has(role as CmsUserRole);
export const hasMaintenanceAccess = (role?: string | null) => STAFF_OPERATION_ROLES.has(role as CmsUserRole);
export const hasMassageOperationsAccess = (role?: string | null) => STAFF_OPERATION_ROLES.has(role as CmsUserRole);
export const hasMassageAdminAccess = (role?: string | null) => CONTENT_ROLES.has(role as CmsUserRole);

export const CANCAGUA_STAFF_ALLOWED_PATHS = new Set([
  "/",
  "/cms",
  "/cms/b2c",
  "/cms/carta",
  "/cms/reservas",
  "/cms/servicios",
  "/cms/gift-cards-sales",
  "/cms/mensajes",
  "/cms/clientes",
  "/cms/reportes-mantencion",
  "/cms/masajes",
  "/cms/masajes/agenda",
]);

export function canAccessCmsPath(role: string | null | undefined, path: string): boolean {
  if (role !== CANCAGUA_STAFF_ROLE) return true;
  return CANCAGUA_STAFF_ALLOWED_PATHS.has(path);
}
