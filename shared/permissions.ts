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
      { key: "module.gift_cards", label: "Gift Cards" },
      { key: "module.marketing", label: "Marketing y newsletters" },
      { key: "module.metrics", label: "Métricas y analítica general" },
      { key: "module.operations", label: "Operaciones y mantención" },
      { key: "module.biopools", label: "Módulo Biopiscinas" },
      { key: "module.sauna", label: "Módulo Sauna" },
      { key: "module.massages", label: "Módulo Masajes" },
      { key: "module.regular_classes", label: "Módulo Clases Regulares" },
      { key: "module.admin", label: "Administración e integraciones" },
      { key: "module.help", label: "Ayuda y documentación" },
    ],
  },
  {
    id: "sauna",
    label: "Funciones de Sauna",
    description: "Permisos de agenda, aforo, bloqueos, ventas y sincronización Skedu.",
    permissions: [
      { key: "sauna.manage_agenda", label: "Crear, cancelar y reagendar reservas" },
      { key: "sauna.manage_blocks", label: "Gestionar bloqueos y aforo" },
      { key: "sauna.view_clients", label: "Ver clientes de Sauna" },
      { key: "sauna.view_sales", label: "Ver pagos y ventas de Sauna" },
      { key: "sauna.manage_sync", label: "Sincronizar agenda con Skedu" },
      { key: "sauna.manage_settings", label: "Configurar horarios y políticas" },
    ],
  },
  {
    id: "biopools",
    label: "Funciones de Biopiscinas",
    description: "Permisos de agenda, bloqueos, catálogo e información comercial.",
    permissions: [
      { key: "biopools.manage_agenda", label: "Crear, cancelar y reagendar reservas" },
      { key: "biopools.manage_blocks", label: "Gestionar bloqueos y aforo" },
      { key: "biopools.manage_catalog", label: "Gestionar servicio, tickets y fotografías" },
      { key: "biopools.view_clients", label: "Ver clientes de Biopiscinas" },
      { key: "biopools.view_sales", label: "Ver ventas de Biopiscinas" },
      { key: "biopools.manage_settings", label: "Configurar horarios, políticas y mensajes" },
    ],
  },
  {
    id: "massages",
    label: "Funciones de Masajes",
    description: "Permisos operativos y de información sensible del área.",
    permissions: [
      { key: "massages.manage_agenda", label: "Crear y editar reservas" },
      { key: "massages.assign_therapists", label: "Asignar o cambiar terapeutas" },
      { key: "massages.manage_payments", label: "Ver y actualizar pagos en la agenda" },
      { key: "massages.manage_therapists", label: "Gestionar terapeutas y disponibilidad" },
      { key: "massages.manage_catalog", label: "Gestionar técnicas y catálogo" },
      { key: "massages.manage_inventory", label: "Gestionar inventario" },
      { key: "massages.view_clients", label: "Ver clientes de masajes" },
      { key: "massages.view_sales", label: "Ver ventas y analítica de masajes" },
      { key: "massages.area_admin", label: "Ver administración y cierre del área" },
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

export type PermissionUser = {
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
    "module.biopools",
    "biopools.manage_agenda",
    "biopools.manage_blocks",
    "biopools.manage_catalog",
    "biopools.view_clients",
    "biopools.view_sales",
    "biopools.manage_settings",
    "module.sauna",
    "sauna.manage_agenda",
    "sauna.manage_blocks",
    "sauna.view_clients",
    "sauna.view_sales",
    "sauna.manage_sync",
    "sauna.manage_settings",
    "module.massages",
    "massages.manage_agenda",
    "massages.assign_therapists",
    "massages.manage_payments",
    "massages.manage_therapists",
    "massages.manage_catalog",
    "massages.manage_inventory",
    "massages.view_clients",
    "massages.view_sales",
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
    "module.biopools",
    "biopools.manage_agenda",
    "biopools.manage_blocks",
    "biopools.view_clients",
    "module.sauna",
    "sauna.manage_agenda",
    "sauna.manage_blocks",
    "sauna.view_clients",
    "module.massages",
    "massages.manage_agenda",
    "massages.assign_therapists",
    "massages.manage_payments",
    // Recepción atiende al cliente que llega preguntando por su reserva y no
    // sabe la fecha: sin esto el buscador del Calendario 360 no puede leer nada
    // y la pantalla queda inservible justo para quien la necesita.
    "massages.view_clients",
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

export function hasAnyCmsPermission(
  user: PermissionUser,
  permissions: readonly CmsPermissionKey[],
): boolean {
  return permissions.some((permission) => hasCmsPermission(user, permission));
}

/**
 * `module.sales` conserva el acceso histórico de los usuarios de Ventas,
 * mientras `module.gift_cards` permite entregar solo Gift Cards a Recepción.
 */
export function hasGiftCardAccess(user: PermissionUser): boolean {
  return hasAnyCmsPermission(user, ["module.gift_cards", "module.sales"]);
}

/** Permite operar pagos en agenda sin abrir Ventas ni Analítica de Masajes. */
export function hasMassagePaymentAccess(user: PermissionUser): boolean {
  return hasAnyCmsPermission(user, ["massages.manage_payments", "massages.view_sales"]);
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
  "/cms/calendario",
  "/cms/clientes-360",
  "/cms/b2c",
  "/cms/carta",
  "/cms/reservas",
  "/cms/servicios",
  "/cms/gift-cards-sales",
  "/cms/mensajes",
  "/cms/clientes",
  "/cms/reportes-mantencion",
  "/cms/mantencion-turnos",
  "/cms/mantencion-dashboard",
  "/cms/biopiscinas",
  "/cms/biopiscinas/agenda",
  "/cms/biopiscinas/bloqueos",
  "/cms/sauna",
  "/cms/sauna/agenda",
  "/cms/sauna/bloqueos",
  "/cms/sauna/programas",
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
  ["/cms/gift-cards-sales", "module.gift_cards"],
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
  ["/cms/codigos-descuento", "module.admin"],
  ["/cms/analytics", "module.metrics"],
  ["/cms/reportes-mantencion", "module.operations"],
  ["/cms/mantencion-turnos", "module.operations"],
  ["/cms/mantencion-dashboard", "module.operations"],
  ["/cms/usuarios", "module.admin"],
  ["/cms/cerebro", "module.admin"],
  ["/cms/traducciones", "module.admin"],
  ["/cms/integraciones", "module.admin"],
  ["/cms/configuracion", "module.admin"],
  ["/cms/caja-efectivo", "module.admin"],
  ["/cms/ayuda/newsletters", "module.help"],
  ["/cms/biopiscinas", "module.biopools"],
  ["/cms/biopiscinas/agenda", "biopools.manage_agenda"],
  ["/cms/biopiscinas/bloqueos", "biopools.manage_blocks"],
  ["/cms/biopiscinas/servicios", "biopools.manage_catalog"],
  ["/cms/biopiscinas/configuracion", "biopools.manage_settings"],
  ["/cms/sauna", "module.sauna"],
  ["/cms/sauna/agenda", "module.sauna"],
  ["/cms/sauna/bloqueos", "sauna.manage_blocks"],
  ["/cms/sauna/programas", "sauna.manage_agenda"],
  ["/cms/sauna/servicios", "module.sauna"],
  ["/cms/sauna/configuracion", "sauna.manage_settings"],
  ["/cms/masajes", "module.massages"],
  ["/cms/masajes/agenda", "module.massages"],
  ["/cms/masajes/terapeutas", "massages.manage_therapists"],
  ["/cms/masajes/tecnicas", "massages.manage_catalog"],
  ["/cms/masajes/inventario", "massages.manage_inventory"],
  ["/cms/masajes/clientes", "massages.view_clients"],
  ["/cms/masajes/analytics", "massages.view_sales"],
  ["/cms/masajes/admin", "massages.area_admin"],
  ["/cms/masajes/descuentos", "module.admin"],
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
  if (path === "/cms/clientes-360/dashboard-bi" || path === "/cms/clientes") return false;
  const explicitPermissions = parseCmsPermissions(permissions);
  if (explicitPermissions) {
    if (path === "/" || path === "/cms") return true;
    if (path === "/cms/calendario") {
      return ["module.massages", "module.biopools", "module.sauna", "module.regular_classes"]
        .some(permission => explicitPermissions.includes(permission as CmsPermissionKey));
    }
    if (path === "/cms/clientes-360") {
      return ["massages.view_clients", "biopools.view_clients", "regular_classes.students"]
        .some(permission => explicitPermissions.includes(permission as CmsPermissionKey));
    }
    const required = resolvePathPermission(path);
    if (required === "module.gift_cards") {
      return hasGiftCardAccess({ role, permissions, regularClassesTeacher });
    }
    return required ? explicitPermissions.includes(required) : false;
  }

  if (path === "/cms/calendario") {
    return hasAnyCmsPermission(
      { role, permissions, regularClassesTeacher },
      ["module.massages", "module.biopools", "module.sauna", "module.regular_classes"],
    );
  }
  if (path === "/cms/clientes-360") {
    return hasAnyCmsPermission(
      { role, permissions, regularClassesTeacher },
      ["massages.view_clients", "biopools.view_clients", "regular_classes.students"],
    );
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
