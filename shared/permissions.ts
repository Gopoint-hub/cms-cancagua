export const CANCAGUA_STAFF_ROLE = "cancagua_staff" as const;
export const MASSAGE_THERAPIST_ROLE = "massage_therapist" as const;
export const REGULAR_CLASSES_MODULE = "regular_classes" as const;

export const CMS_PERMISSION_GROUPS = [
  {
    id: "modules",
    label: "Módulos visibles",
    description: "Define qué áreas aparecen en el menú y pueden abrirse.",
    permissions: [
      { key: "module.b2c", label: "B2C: servicios, reservas y clientes" },
      { key: "module.b2b", label: "B2B: cotizaciones y CRM" },
      { key: "module.sales", label: "Ventas y canales comerciales" },
      { key: "module.marketing", label: "Marketing y newsletters" },
      { key: "module.metrics", label: "Métricas y analítica general" },
      { key: "module.operations", label: "Operaciones y mantención" },
      { key: "module.massages", label: "Módulo Masajes" },
      { key: "module.regular_classes", label: "Módulo Clases Regulares" },
      { key: "module.admin", label: "Administración e integraciones" },
      { key: "module.help", label: "Ayuda y documentación" },
    ],
  },
  {
    id: "massages",
    label: "Funciones de Masajes",
    description: "Permisos operativos y de información sensible del área.",
    permissions: [
      { key: "massages.manage_agenda", label: "Crear y editar reservas" },
      { key: "massages.assign_therapists", label: "Asignar o cambiar terapeutas" },
      { key: "massages.manage_therapists", label: "Gestionar terapeutas y disponibilidad" },
      { key: "massages.manage_catalog", label: "Gestionar técnicas y catálogo" },
      { key: "massages.manage_inventory", label: "Gestionar inventario" },
      { key: "massages.view_clients", label: "Ver clientes de masajes" },
      { key: "massages.view_sales", label: "Ver ventas y analítica de masajes" },
      { key: "massages.area_admin", label: "Ver administración y cierre del área" },
      { key: "massages.manage_discounts", label: "Gestionar descuentos" },
      { key: "massages.view_hr", label: "Ver RR.HH. de terapeutas" },
      { key: "massages.manage_settings", label: "Configurar el módulo" },
    ],
  },
  {
    id: "regular_classes",
    label: "Funciones de Clases Regulares",
    description: "Acceso operativo y financiero del programa.",
    permissions: [
      { key: "regular_classes.attendance", label: "Registrar asistencia" },
      { key: "regular_classes.students", label: "Gestionar alumnos y pagos" },
      { key: "regular_classes.my_settlements", label: "Ver liquidación propia" },
      { key: "regular_classes.manage", label: "Configurar clases y profesores" },
      { key: "regular_classes.settlements", label: "Ver y cerrar liquidaciones" },
      { key: "regular_classes.communications", label: "Enviar beneficios y correos" },
    ],
  },
] as const;

export type CmsPermissionKey =
  (typeof CMS_PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_CMS_PERMISSIONS = CMS_PERMISSION_GROUPS.flatMap(
  (group) => group.permissions.map((permission) => permission.key),
) as CmsPermissionKey[];

export type CmsUserRole =
  | "super_admin"
  | "admin"
  | "editor"
  | "user"
  | "seller"
  | "concierge"
  | typeof CANCAGUA_STAFF_ROLE
  | typeof MASSAGE_THERAPIST_ROLE;

const ADMIN_ROLES = new Set<CmsUserRole>(["super_admin", "admin"]);
const CONTENT_ROLES = new Set<CmsUserRole>(["super_admin", "admin", "editor"]);
const STAFF_OPERATION_ROLES = new Set<CmsUserRole>([
  "super_admin",
  "admin",
  "editor",
  CANCAGUA_STAFF_ROLE,
]);
const MASSAGE_READ_ROLES = new Set<CmsUserRole>([
  "super_admin",
  "admin",
  "editor",
  CANCAGUA_STAFF_ROLE,
  MASSAGE_THERAPIST_ROLE,
]);

type PermissionUser = {
  role?: string | null;
  permissions?: string | null;
  regularClassesTeacher?: number | boolean | null;
};

const ADMIN_DEFAULT_PERMISSIONS = ALL_CMS_PERMISSIONS.filter(
  (permission) => permission !== "massages.area_admin",
);

const ROLE_DEFAULT_PERMISSIONS: Record<string, CmsPermissionKey[]> = {
  admin: [...ADMIN_DEFAULT_PERMISSIONS],
  editor: [
    "module.sales",
    "module.massages",
    "massages.manage_agenda",
    "massages.assign_therapists",
    "massages.manage_therapists",
    "massages.manage_catalog",
    "massages.manage_inventory",
    "massages.view_clients",
    "massages.view_sales",
    "massages.manage_discounts",
    "massages.view_hr",
    "massages.manage_settings",
  ],
  user: ["module.sales"],
  seller: ["module.sales"],
  concierge: ["module.sales"],
  [CANCAGUA_STAFF_ROLE]: [
    "module.b2c",
    "module.sales",
    "module.operations",
    "module.massages",
    "massages.manage_agenda",
    "massages.assign_therapists",
  ],
  [MASSAGE_THERAPIST_ROLE]: ["module.massages"],
};

export function parseCmsPermissions(value?: string | null): CmsPermissionKey[] | null {
  if (value == null || value.trim() === "") return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const allowed = new Set<string>(ALL_CMS_PERMISSIONS);
    return parsed.filter(
      (permission): permission is CmsPermissionKey =>
        typeof permission === "string" && allowed.has(permission),
    );
  } catch {
    return null;
  }
}

export function getDefaultCmsPermissions(
  role?: string | null,
  regularClassesTeacher?: number | boolean | null,
): CmsPermissionKey[] {
  if (role === "super_admin") return [...ALL_CMS_PERMISSIONS];
  const defaults = new Set<CmsPermissionKey>(ROLE_DEFAULT_PERMISSIONS[role ?? ""] ?? []);
  if (regularClassesTeacher) {
    defaults.add("module.regular_classes");
    defaults.add("regular_classes.attendance");
    defaults.add("regular_classes.my_settlements");
  }
  return Array.from(defaults);
}

export function getEffectiveCmsPermissions(user: PermissionUser): CmsPermissionKey[] {
  if (user.role === "super_admin") return [...ALL_CMS_PERMISSIONS];
  return parseCmsPermissions(user.permissions)
    ?? getDefaultCmsPermissions(user.role, user.regularClassesTeacher);
}

export function hasCmsPermission(
  user: PermissionUser,
  permission: CmsPermissionKey,
): boolean {
  if (user.role === "super_admin") return true;
  return getEffectiveCmsPermissions(user).includes(permission);
}

export const isAdminRole = (role?: string | null) => ADMIN_ROLES.has(role as CmsUserRole);
export const hasContentAdminAccess = (role?: string | null) => CONTENT_ROLES.has(role as CmsUserRole);
export const hasB2CAccess = (role?: string | null) => STAFF_OPERATION_ROLES.has(role as CmsUserRole);
export const hasMaintenanceAccess = (role?: string | null) => STAFF_OPERATION_ROLES.has(role as CmsUserRole);
export const hasMassageOperationsAccess = (role?: string | null) => STAFF_OPERATION_ROLES.has(role as CmsUserRole);
export const hasMassageReadAccess = (role?: string | null) => MASSAGE_READ_ROLES.has(role as CmsUserRole);
export const hasMassageAdminAccess = (role?: string | null) => CONTENT_ROLES.has(role as CmsUserRole);
export const hasRegularClassesAdminAccess = (role?: string | null) =>
  ADMIN_ROLES.has(role as CmsUserRole);
export const hasRegularClassesReceptionAccess = (role?: string | null) =>
  role === CANCAGUA_STAFF_ROLE || ADMIN_ROLES.has(role as CmsUserRole);
export const hasRegularClassesTeacherAccess = (
  role?: string | null,
  regularClassesTeacher?: number | boolean | null,
) => ADMIN_ROLES.has(role as CmsUserRole) || Boolean(regularClassesTeacher);
export const hasRegularClassesAccess = (
  role?: string | null,
  regularClassesTeacher?: number | boolean | null,
) => hasRegularClassesReceptionAccess(role)
  || hasRegularClassesTeacherAccess(role, regularClassesTeacher);

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
  "/cms/mantencion-turnos",
  "/cms/masajes",
  "/cms/masajes/agenda",
]);

export const MASSAGE_THERAPIST_ALLOWED_PATHS = new Set([
  "/",
  "/cms",
  "/cms/masajes",
  "/cms/masajes/agenda",
  "/cms/masajes/admin",
]);

export const REGULAR_CLASSES_TEACHER_ALLOWED_PATHS = new Set([
  "/",
  "/cms",
  "/cms/clases-regulares",
  "/cms/clases-regulares/asistencia",
  "/cms/clases-regulares/mis-liquidaciones",
]);

export const REGULAR_CLASSES_RECEPTION_ALLOWED_PATHS = new Set([
  "/cms/clases-regulares",
  "/cms/clases-regulares/alumnos",
]);

const EXACT_PATH_PERMISSIONS = new Map<string, CmsPermissionKey>([
  ["/cms/servicios", "module.b2c"],
  ["/cms/carta", "module.b2c"],
  ["/cms/reservas", "module.b2c"],
  ["/cms/mensajes", "module.b2c"],
  ["/cms/clientes", "module.b2c"],
  ["/cms/cotizaciones", "module.b2b"],
  ["/cms/cotizacion-wizard", "module.b2b"],
  ["/cms/productos-corporativos", "module.b2b"],
  ["/cms/crm-pipeline", "module.b2b"],
  ["/cms/gift-cards-sales", "module.sales"],
  ["/cms/concierge", "module.sales"],
  ["/cms/concierge/venta", "module.sales"],
  ["/cms/concierge/servicios", "module.sales"],
  ["/cms/concierge/vendedores", "module.sales"],
  ["/cms/concierge/mis-comisiones", "module.sales"],
  ["/cms/marketing", "module.marketing"],
  ["/cms/newsletter", "module.marketing"],
  ["/cms/crear-newsletter", "module.marketing"],
  ["/cms/suscriptores", "module.marketing"],
  ["/cms/listas", "module.marketing"],
  ["/cms/envio-personal", "module.marketing"],
  ["/cms/calendario-marketing", "module.marketing"],
  ["/cms/blog-contenido", "module.marketing"],
  ["/cms/marketing-roi", "module.marketing"],
  ["/cms/codigos-descuento", "module.marketing"],
  ["/cms/analytics", "module.metrics"],
  ["/cms/reportes-mantencion", "module.operations"],
  ["/cms/mantencion-turnos", "module.operations"],
  ["/cms/usuarios", "module.admin"],
  ["/cms/cerebro", "module.admin"],
  ["/cms/traducciones", "module.admin"],
  ["/cms/integraciones", "module.admin"],
  ["/cms/configuracion", "module.admin"],
  ["/cms/ayuda/newsletters", "module.help"],
  ["/cms/masajes", "module.massages"],
  ["/cms/masajes/agenda", "module.massages"],
  ["/cms/masajes/terapeutas", "massages.manage_therapists"],
  ["/cms/masajes/tecnicas", "massages.manage_catalog"],
  ["/cms/masajes/inventario", "massages.manage_inventory"],
  ["/cms/masajes/clientes", "massages.view_clients"],
  ["/cms/masajes/analytics", "massages.view_sales"],
  ["/cms/masajes/admin", "massages.area_admin"],
  ["/cms/masajes/descuentos", "massages.manage_discounts"],
  ["/cms/masajes/rrhh", "massages.view_hr"],
  ["/cms/masajes/configuracion", "massages.manage_settings"],
  ["/cms/clases-regulares", "module.regular_classes"],
  ["/cms/clases-regulares/asistencia", "regular_classes.attendance"],
  ["/cms/clases-regulares/mis-liquidaciones", "regular_classes.my_settlements"],
  ["/cms/clases-regulares/alumnos", "regular_classes.students"],
  ["/cms/clases-regulares/clases", "regular_classes.manage"],
  ["/cms/clases-regulares/profesores", "regular_classes.manage"],
  ["/cms/clases-regulares/liquidaciones", "regular_classes.settlements"],
  ["/cms/clases-regulares/comunicaciones", "regular_classes.communications"],
  ["/cms/clases-regulares/configuracion", "regular_classes.manage"],
]);

function resolvePathPermission(path: string): CmsPermissionKey | null {
  const exact = EXACT_PATH_PERMISSIONS.get(path);
  if (exact) return exact;
  const match = Array.from(EXACT_PATH_PERMISSIONS.entries())
    .filter(([candidate]) => path.startsWith(`${candidate}/`))
    .sort(([left], [right]) => right.length - left.length)[0];
  return match?.[1] ?? null;
}

export function canAccessCmsPath(
  role: string | null | undefined,
  path: string,
  regularClassesTeacher?: number | boolean | null,
  permissions?: string | null,
): boolean {
  if (role === "super_admin") return true;
  const explicitPermissions = parseCmsPermissions(permissions);
  if (explicitPermissions) {
    if (path === "/" || path === "/cms") return true;
    const required = resolvePathPermission(path);
    return required ? explicitPermissions.includes(required) : false;
  }

  if (path.startsWith("/cms/clases-regulares")) {
    if (ADMIN_ROLES.has(role as CmsUserRole)) return true;
    if (role === CANCAGUA_STAFF_ROLE) return REGULAR_CLASSES_RECEPTION_ALLOWED_PATHS.has(path);
    if (regularClassesTeacher) return REGULAR_CLASSES_TEACHER_ALLOWED_PATHS.has(path);
    return false;
  }
  if (REGULAR_CLASSES_TEACHER_ALLOWED_PATHS.has(path) && regularClassesTeacher) return true;
  if (REGULAR_CLASSES_RECEPTION_ALLOWED_PATHS.has(path) && role === CANCAGUA_STAFF_ROLE) return true;
  if (role === CANCAGUA_STAFF_ROLE) return CANCAGUA_STAFF_ALLOWED_PATHS.has(path);
  if (role === MASSAGE_THERAPIST_ROLE) {
    return MASSAGE_THERAPIST_ALLOWED_PATHS.has(path)
      || (Boolean(regularClassesTeacher) && REGULAR_CLASSES_TEACHER_ALLOWED_PATHS.has(path));
  }
  if (role === "user" && regularClassesTeacher) {
    return REGULAR_CLASSES_TEACHER_ALLOWED_PATHS.has(path);
  }
  return true;
}
