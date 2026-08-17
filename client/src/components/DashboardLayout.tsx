import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard, LogOut, PanelLeft, Users, Calendar, CalendarDays, Mail, BarChart3,
  FileText, FileSpreadsheet, MessageSquare, Package, Newspaper, Settings, Store, Briefcase,
  TrendingUp, Shield, Megaphone, ChevronDown, ChevronRight, Home, UtensilsCrossed,
  CalendarCheck, UserCheck, Kanban, ListChecks, MailPlus, UsersRound, Tag, Languages, RefreshCw, Gift,
  Wrench, HardHat, Handshake, ShoppingCart, DollarSign, HelpCircle, Sparkles, Brain, BookOpen, Dumbbell, ClipboardList, Waves, Ban,
  GripVertical, Check, Flame, Banknote
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState, createContext, useContext } from "react";
import { useLocation, Link } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  canAccessCmsPath,
  CANCAGUA_STAFF_ROLE,
  CmsPermissionKey,
  hasAnyCmsPermission,
  hasCmsPermission,
  MASSAGE_THERAPIST_ROLE,
  parseCmsPermissions,
} from "@shared/permissions";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  DEFAULT_SIDEBAR_MODULE_ORDER,
  normalizeSidebarModuleOrder,
  SidebarModuleId,
} from "@shared/sidebar";

// Definición de categorías y sus items de menú
export type CategoryId = "clients360" | "b2c" | "b2b" | "ventas" | "marketing" | "metrics" | "operations" | "admin" | "ayuda" | "biopools" | "sauna" | "masajes" | "regular_classes";

interface MenuItem {
  icon: any;
  label: string;
  path: string;
  /** If set, only these roles can see this item. If not set, all roles can see it. */
  roles?: string[];
  /** Restricted massage-area accounting close (Tamara and superadmins). */
  areaAdminOnly?: boolean;
  regularClassesAccess?: "teacher" | "reception" | "admin";
  superAdminOnly?: boolean;
  permission?: CmsPermissionKey;
  permissionsAny?: CmsPermissionKey[];
}

interface Category {
  id: CategoryId;
  label: string;
  icon: any;
  description: string;
  color: string;
  items: MenuItem[];
  /** If set, only these roles can see this category. If not set, all roles can see it. */
  roles?: string[];
  requiresRegularClassesAccess?: boolean;
  permission: CmsPermissionKey;
  permissionsAny?: CmsPermissionKey[];
}

type SidebarEntry =
  | {
      id: SidebarModuleId;
      kind: "quick";
      item: MenuItem & { id: SidebarModuleId; permissionsAny: CmsPermissionKey[] };
    }
  | {
      id: SidebarModuleId;
      kind: "category";
      category: Category;
      visibleItems: MenuItem[];
    };

const quickMenuItems: Array<MenuItem & { id: SidebarModuleId; permissionsAny: CmsPermissionKey[] }> = [
  {
    id: "home",
    icon: Home,
    label: "Inicio",
    path: "/cms",
    permissionsAny: [
      "module.b2c", "module.b2b", "module.sales", "module.gift_cards",
      "module.marketing", "module.metrics", "module.operations", "module.admin",
      "module.biopools", "module.sauna", "module.massages", "module.regular_classes", "module.help",
    ],
  },
  {
    id: "calendar360",
    icon: CalendarDays,
    label: "Calendario 360",
    path: "/cms/calendario",
    permissionsAny: ["module.massages", "module.biopools", "module.sauna", "module.regular_classes"],
  },
];

export const categories: Category[] = [
  {
    id: "clients360",
    label: "Cliente 360",
    icon: UsersRound,
    description: "Historial y análisis de clientes",
    color: "bg-slate-500",
    permission: "massages.view_clients",
    permissionsAny: ["massages.view_clients", "biopools.view_clients", "sauna.view_clients", "regular_classes.students"],
    items: [
      {
        icon: Users,
        label: "Clientes",
        path: "/cms/clientes-360",
        permission: "massages.view_clients",
        permissionsAny: ["massages.view_clients", "biopools.view_clients", "sauna.view_clients", "regular_classes.students"],
      },
      {
        icon: TrendingUp,
        label: "Dashboard BI",
        path: "/cms/clientes-360/dashboard-bi",
        superAdminOnly: true,
      },
    ],
  },
  {
    id: "b2c",
    label: "B2C",
    icon: Store,
    description: "Clientes & Servicios",
    color: "bg-emerald-500",
    permission: "module.b2c",
    roles: ["super_admin", "admin", CANCAGUA_STAFF_ROLE],
    items: [
      { icon: UtensilsCrossed, label: "Carta", path: "/cms/carta" },
      { icon: MessageSquare, label: "Mensajes", path: "/cms/mensajes" },
    ],
  },
  {
    id: "b2b",
    label: "B2B",
    icon: Briefcase,
    description: "Eventos Corporativos",
    color: "bg-blue-500",
    permission: "module.b2b",
    roles: ["super_admin", "admin"],
    items: [
      { icon: FileText, label: "Cotizaciones", path: "/cms/cotizaciones" },
      { icon: Package, label: "Catálogo Productos", path: "/cms/productos-corporativos" },
      { icon: Kanban, label: "CRM Pipeline", path: "/cms/crm-pipeline" },
    ],
  },
  {
    id: "ventas",
    label: "Ventas",
    icon: ShoppingCart,
    description: "Canales de Venta",
    color: "bg-teal-500",
    permission: "module.sales",
    permissionsAny: ["module.sales", "module.gift_cards"],
    roles: ["super_admin", "admin", "editor", "seller", "concierge", "user", CANCAGUA_STAFF_ROLE],
    items: [
      { icon: Gift, label: "Gift Cards", path: "/cms/gift-cards-sales", permission: "module.gift_cards", permissionsAny: ["module.gift_cards", "module.sales"] },
      { icon: Handshake, label: "Concierge", path: "/cms/concierge/venta", roles: ["super_admin", "admin", "editor", "seller", "concierge"], permission: "module.sales" },
      { icon: Package, label: "Servicios Concierge", path: "/cms/concierge/servicios", roles: ["super_admin", "admin"], permission: "module.sales" },
      { icon: DollarSign, label: "Comisiones", path: "/cms/concierge/vendedores", roles: ["super_admin", "admin"], permission: "module.sales" },
      { icon: DollarSign, label: "Mis Comisiones", path: "/cms/concierge/mis-comisiones", roles: ["super_admin", "admin", "editor", "seller", "concierge"], permission: "module.sales" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    description: "Newsletters & Campañas",
    color: "bg-purple-500",
    permission: "module.marketing",
    roles: ["super_admin", "admin"],
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/cms/marketing" },
      { icon: Newspaper, label: "Newsletters", path: "/cms/newsletter" },
      { icon: MailPlus, label: "Crear Newsletter", path: "/cms/crear-newsletter" },
      { icon: UsersRound, label: "Suscriptores", path: "/cms/suscriptores" },
      { icon: ListChecks, label: "Listas", path: "/cms/listas" },
      { icon: Mail, label: "Envío Personal", path: "/cms/envio-personal" },
      { icon: Calendar, label: "Calendario", path: "/cms/calendario-marketing" },
      { icon: BookOpen, label: "Blog & Contenido", path: "/cms/blog-contenido" },
      { icon: TrendingUp, label: "ROI de Marketing", path: "/cms/marketing-roi" },
    ],
  },
  {
    id: "metrics",
    label: "Métricas",
    icon: TrendingUp,
    description: "Analytics & Reportes",
    color: "bg-amber-500",
    permission: "module.metrics",
    roles: ["super_admin", "admin"],
    items: [
      { icon: BarChart3, label: "Analytics", path: "/cms/analytics" },
    ],
  },
  {
    id: "operations",
    label: "Operaciones",
    icon: HardHat,
    description: "Mantención & Operaciones",
    color: "bg-orange-500",
    permission: "module.operations",
    roles: ["super_admin", "admin", CANCAGUA_STAFF_ROLE],
    items: [
      { icon: Wrench, label: "Reportes Mantención", path: "/cms/reportes-mantencion" },
      { icon: ClipboardList, label: "Ficha Diaria Mantención", path: "/cms/mantencion-turnos" },
      { icon: LayoutDashboard, label: "Dashboard Mantención", path: "/cms/mantencion-dashboard" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: Shield,
    description: "Usuarios & Configuración",
    color: "bg-slate-500",
    permission: "module.admin",
    roles: ["super_admin", "admin"],
    items: [
      { icon: Users, label: "Usuarios", path: "/cms/usuarios" },
      { icon: Brain, label: "Cerebro", path: "/cms/cerebro" },
      { icon: Languages, label: "Traducciones", path: "/cms/traducciones" },
      { icon: RefreshCw, label: "Integraciones", path: "/cms/integraciones" },
      { icon: Tag, label: "Códigos de descuento", path: "/cms/codigos-descuento" },
      { icon: Banknote, label: "Caja efectivo", path: "/cms/caja-efectivo" },
      { icon: Settings, label: "Configuración", path: "/cms/configuracion" },
    ],
  },
  {
    id: "biopools",
    label: "Biopiscinas",
    icon: Waves,
    description: "Agenda, aforo & operación",
    color: "bg-cyan-600",
    permission: "module.biopools",
    roles: ["super_admin", "admin", "editor", CANCAGUA_STAFF_ROLE],
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/cms/biopiscinas" },
      { icon: CalendarCheck, label: "Agenda", path: "/cms/biopiscinas/agenda", permission: "biopools.manage_agenda" },
      { icon: DollarSign, label: "Ventas", path: "/cms/biopiscinas/ventas", permission: "biopools.manage_agenda" },
      { icon: Ban, label: "Bloqueos", path: "/cms/biopiscinas/bloqueos", permission: "biopools.manage_blocks" },
      { icon: Waves, label: "Servicios", path: "/cms/biopiscinas/servicios", permission: "biopools.manage_catalog" },
      { icon: Settings, label: "Configuración", path: "/cms/biopiscinas/configuracion", permission: "biopools.manage_settings" },
    ],
  },
  {
    id: "sauna",
    label: "Sauna",
    icon: Flame,
    description: "Agenda, aforo & operación",
    color: "bg-amber-700",
    permission: "module.sauna",
    roles: ["super_admin", "admin", "editor", CANCAGUA_STAFF_ROLE],
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/cms/sauna" },
      { icon: CalendarCheck, label: "Agenda", path: "/cms/sauna/agenda" },
      { icon: Sparkles, label: "Pases Detox", path: "/cms/sauna/programas", permission: "sauna.manage_agenda" },
      { icon: Ban, label: "Bloqueos", path: "/cms/sauna/bloqueos", permission: "sauna.manage_blocks" },
      { icon: Package, label: "Servicios", path: "/cms/sauna/servicios" },
      { icon: Settings, label: "Configuración", path: "/cms/sauna/configuracion", permission: "sauna.manage_settings" },
    ],
  },
  {
    id: "masajes",
    label: "Masajes",
    icon: Sparkles,
    description: "Área de Masajes & Spa",
    color: "bg-rose-500",
    permission: "module.massages",
    roles: ["super_admin", "admin", "editor", CANCAGUA_STAFF_ROLE, MASSAGE_THERAPIST_ROLE],
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/cms/masajes", roles: ["super_admin", "admin", "editor", CANCAGUA_STAFF_ROLE, MASSAGE_THERAPIST_ROLE] },
      { icon: CalendarCheck, label: "Agenda", path: "/cms/masajes/agenda", roles: ["super_admin", "admin", "editor", CANCAGUA_STAFF_ROLE, MASSAGE_THERAPIST_ROLE] },
      { icon: Users, label: "Terapeutas", path: "/cms/masajes/terapeutas", roles: ["super_admin", "admin", "editor"], permission: "massages.manage_therapists" },
      { icon: Sparkles, label: "Técnicas", path: "/cms/masajes/tecnicas", roles: ["super_admin", "admin", "editor"], permission: "massages.manage_catalog" },
      { icon: Package, label: "Inventario", path: "/cms/masajes/inventario", roles: ["super_admin", "admin", "editor"], permission: "massages.manage_inventory" },
      { icon: UsersRound, label: "Clientes", path: "/cms/masajes/clientes", roles: ["super_admin", "admin", "editor"], permission: "massages.view_clients" },
      { icon: BarChart3, label: "Ventas", path: "/cms/masajes/analytics", roles: ["super_admin", "admin", "editor"], permission: "massages.view_sales" },
      { icon: FileSpreadsheet, label: "Admin área", path: "/cms/masajes/admin", areaAdminOnly: true, permission: "massages.area_admin" },
      { icon: Users, label: "RRHH", path: "/cms/masajes/rrhh", roles: ["super_admin", "admin", "editor"], permission: "massages.view_hr" },
      { icon: Settings, label: "Configuración", path: "/cms/masajes/configuracion", roles: ["super_admin", "admin", "editor"], permission: "massages.manage_settings" },
    ],
  },
  {
    id: "regular_classes",
    label: "Clases Regulares",
    icon: Dumbbell,
    description: "Programa, asistencia & comisiones",
    color: "bg-sky-700",
    permission: "module.regular_classes",
    roles: ["super_admin", "admin", "user", CANCAGUA_STAFF_ROLE, MASSAGE_THERAPIST_ROLE],
    requiresRegularClassesAccess: true,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/cms/clases-regulares" },
      { icon: UserCheck, label: "Asistencia", path: "/cms/clases-regulares/asistencia", regularClassesAccess: "teacher", permission: "regular_classes.attendance" },
      { icon: DollarSign, label: "Mi liquidación", path: "/cms/clases-regulares/mis-liquidaciones", regularClassesAccess: "teacher", permission: "regular_classes.my_settlements" },
      { icon: UsersRound, label: "Alumnos y pagos", path: "/cms/clases-regulares/alumnos", regularClassesAccess: "reception", permission: "regular_classes.students" },
      { icon: CalendarDays, label: "Clases y horarios", path: "/cms/clases-regulares/clases", regularClassesAccess: "admin", permission: "regular_classes.manage" },
      { icon: Users, label: "Profesores", path: "/cms/clases-regulares/profesores", regularClassesAccess: "admin", permission: "regular_classes.manage" },
      { icon: FileSpreadsheet, label: "Liquidaciones", path: "/cms/clases-regulares/liquidaciones", regularClassesAccess: "admin", permission: "regular_classes.settlements" },
      { icon: Mail, label: "Beneficios y correos", path: "/cms/clases-regulares/comunicaciones", regularClassesAccess: "admin", permission: "regular_classes.communications" },
      { icon: Settings, label: "Configuración", path: "/cms/clases-regulares/configuracion", regularClassesAccess: "admin", permission: "regular_classes.manage" },
    ],
  },
  {
    id: "ayuda",
    label: "Ayuda",
    icon: HelpCircle,
    description: "Documentación & Guías",
    color: "bg-cyan-500",
    permission: "module.help",
    roles: ["super_admin", "admin"],
    items: [
      { icon: Mail, label: "Newsletters", path: "/cms/ayuda/newsletters" },
    ],
  },
];

// Función para detectar categoría basada en la ruta actual
function detectCategoryFromPath(path: string): CategoryId | null {
  for (const category of categories) {
    if (category.items.some(item => item.path === path)) {
      return category.id;
    }
  }
  return null;
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const EXPANDED_CATEGORIES_KEY = "cms-expanded-categories";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location] = useLocation();
  console.log("[DashboardLayout] 📐 Renderizando con location:", location);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  
  // Estado para categorías expandidas (acordeón)
  const [expandedCategories, setExpandedCategories] = useState<Set<CategoryId>>(() => {
    const saved = localStorage.getItem(EXPANDED_CATEGORIES_KEY);
    if (saved) {
      try {
        return new Set(JSON.parse(saved) as CategoryId[]);
      } catch {
        return new Set<CategoryId>();
      }
    }
    // Por defecto, expandir la categoría de la ruta actual
    const detected = detectCategoryFromPath(location);
    return detected ? new Set([detected]) : new Set<CategoryId>();
  });

  const { loading, user } = useAuth();

  // Expandir automáticamente la categoría cuando cambia la ruta
  useEffect(() => {
    const detected = detectCategoryFromPath(location);
    if (detected && !expandedCategories.has(detected)) {
      setExpandedCategories(prev => new Set(Array.from(prev).concat(detected)));
    }
  }, [location]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_CATEGORIES_KEY, JSON.stringify(Array.from(expandedCategories)));
  }, [expandedCategories]);

  const toggleCategory = (categoryId: CategoryId) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Iniciar sesión
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              El acceso a este panel requiere autenticación. Continúa para iniciar sesión.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Iniciar sesión
          </Button>
        </div>
      </div>
    );
  }

  if (!canAccessCmsPath(user.role, location, user.regularClassesTeacher, user.permissions)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
        <div className="max-w-md rounded-xl border bg-background p-8 text-center shadow-sm">
          <Shield className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Sin acceso a este módulo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu rol no tiene permisos para abrir esta sección.
          </p>
          <Button className="mt-6" onClick={() => window.location.assign("/cms")}>
            Volver al panel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      className="cms-shell"
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent 
        setSidebarWidth={setSidebarWidth}
        expandedCategories={expandedCategories}
        toggleCategory={toggleCategory}
      >
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
  expandedCategories: Set<CategoryId>;
  toggleCategory: (categoryId: CategoryId) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  expandedCategories,
  toggleCategory,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const hasExplicitPermissions = parseCmsPermissions(user?.permissions) !== null;
  const areaAdminAccess = trpc.masajes.areaAdmin.access.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const regularClassesAccess = trpc.regularClasses.access.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar, setOpenMobile } = useSidebar();
  const [isResizing, setIsResizing] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [draggedModuleId, setDraggedModuleId] = useState<SidebarModuleId | null>(null);
  const [dragOverModuleId, setDragOverModuleId] = useState<SidebarModuleId | null>(null);
  const [sidebarOrder, setSidebarOrder] = useState<SidebarModuleId[]>(
    DEFAULT_SIDEBAR_MODULE_ORDER,
  );
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isCollapsed = !isMobile && state === "collapsed";
  const isSuperAdmin = user?.role === "super_admin";
  const trpcUtils = trpc.useUtils();
  const sidebarOrderQuery = trpc.sidebar.getOrder.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const updateSidebarOrder = trpc.sidebar.updateOrder.useMutation();

  // Detectar categoría y módulo activo para el header móvil
  const activeCategory = categories.find(c => c.items.some(i => i.path === location));
  const activeMenuItem = activeCategory?.items.find(item => item.path === location);
  const activeQuickItem = quickMenuItems.find(item => item.path === location);

  useEffect(() => {
    if (sidebarOrderQuery.data?.order) {
      setSidebarOrder(normalizeSidebarModuleOrder(sidebarOrderQuery.data.order));
    }
  }, [sidebarOrderQuery.data?.order]);

  useEffect(() => {
    if (!isSuperAdmin) setIsReordering(false);
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const visibleQuickItems = quickMenuItems.filter(item =>
    hasAnyCmsPermission(user ?? {}, item.permissionsAny),
  );

  const visibleCategories = categories.flatMap(category => {
    const canSeeCategory = (
      category.permissionsAny
        ? hasAnyCmsPermission(user ?? {}, category.permissionsAny)
        : hasCmsPermission(user ?? {}, category.permission)
    )
      && (hasExplicitPermissions || !category.roles || category.roles.includes(user?.role || ""))
      && (!category.requiresRegularClassesAccess || hasExplicitPermissions || regularClassesAccess.data?.allowed === true);

    if (!canSeeCategory) return [];

    const visibleItems = category.items.filter(item =>
      (!item.permission || (item.permissionsAny
        ? hasAnyCmsPermission(user ?? {}, item.permissionsAny)
        : hasCmsPermission(user ?? {}, item.permission)))
      && (hasExplicitPermissions || !item.roles || item.roles.includes(user?.role || ""))
      && (!item.superAdminOnly || isSuperAdmin)
      && (!item.areaAdminOnly || hasExplicitPermissions || areaAdminAccess.data?.allowed === true)
      && (
        !item.regularClassesAccess
        || hasExplicitPermissions
        || (item.regularClassesAccess === "admin" && regularClassesAccess.data?.isAdmin)
        || (item.regularClassesAccess === "reception" && regularClassesAccess.data?.isReception)
        || (item.regularClassesAccess === "teacher" && (regularClassesAccess.data?.isTeacher || regularClassesAccess.data?.isAdmin))
      ),
    );

    return visibleItems.length > 0 ? [{ category, visibleItems }] : [];
  });

  const sidebarEntries = sidebarOrder.reduce<SidebarEntry[]>((entries, moduleId) => {
    const quickItem = visibleQuickItems.find(item => item.id === moduleId);
    if (quickItem) {
      entries.push({ id: moduleId, kind: "quick", item: quickItem });
      return entries;
    }

    const categoryEntry = visibleCategories.find(entry => entry.category.id === moduleId);
    if (categoryEntry) {
      entries.push({
        id: moduleId,
        kind: "category",
        category: categoryEntry.category,
        visibleItems: categoryEntry.visibleItems,
      });
    }

    return entries;
  }, []);

  const moveSidebarModule = async (
    targetId: SidebarModuleId,
    placeAfterTarget: boolean,
  ) => {
    if (!isSuperAdmin || !draggedModuleId || draggedModuleId === targetId) return;

    const previousOrder = sidebarOrder;
    const nextOrder = sidebarOrder.filter(id => id !== draggedModuleId);
    const targetIndex = nextOrder.indexOf(targetId);
    if (targetIndex < 0) return;
    nextOrder.splice(targetIndex + (placeAfterTarget ? 1 : 0), 0, draggedModuleId);

    setSidebarOrder(nextOrder);
    setDraggedModuleId(null);
    setDragOverModuleId(null);

    try {
      const result = await updateSidebarOrder.mutateAsync({ order: nextOrder });
      trpcUtils.sidebar.getOrder.setData(undefined, { order: result.order });
      toast.success("Orden del menú actualizado");
    } catch (error) {
      setSidebarOrder(previousOrder);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el orden del menú");
    }
  };

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-auto py-3">
            <div className="flex flex-col gap-2 px-2 transition-all w-full">
              {/* Logo y toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleSidebar}
                  className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                  aria-label="Toggle navigation"
                >
                  <PanelLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                {!isCollapsed && (
                  <Link href="/cms" className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
                    <span className="font-semibold tracking-tight truncate">
                      CMS Cancagua
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto">
            {/* Una sola columna evita que las vistas 360 se monten sobre los modulos. */}
            <div className="flex min-w-0 shrink-0 flex-col gap-1 px-2 pb-2">
              {sidebarEntries.map(entry => {
                const canDrag = isSuperAdmin && isReordering && !isCollapsed && !updateSidebarOrder.isPending;
                const isDragTarget = dragOverModuleId === entry.id && draggedModuleId !== entry.id;

                return (
                  <div
                    key={entry.id}
                    draggable={canDrag}
                    onDragStart={event => {
                      if (!canDrag) return;
                      setDraggedModuleId(entry.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", entry.id);
                    }}
                    onDragOver={event => {
                      if (!canDrag || !draggedModuleId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverModuleId(entry.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverModuleId === entry.id) setDragOverModuleId(null);
                    }}
                    onDrop={event => {
                      if (!canDrag) return;
                      event.preventDefault();
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const placeAfterTarget = event.clientY > bounds.top + bounds.height / 2;
                      void moveSidebarModule(entry.id, placeAfterTarget);
                    }}
                    onDragEnd={() => {
                      setDraggedModuleId(null);
                      setDragOverModuleId(null);
                    }}
                    className={cn(
                      "flex min-w-0 shrink-0 items-start gap-1 rounded-lg transition-colors",
                      canDrag && "cursor-grab active:cursor-grabbing",
                      isDragTarget && "bg-primary/10 ring-1 ring-primary/30",
                    )}
                  >
                    {canDrag && (
                      <button
                        type="button"
                        className="mt-1 flex h-8 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={`Mover ${entry.kind === "quick" ? entry.item.label : entry.category.label}`}
                        title="Arrastra para cambiar la posición"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    )}

                    <div className="min-w-0 flex-1">
                      {entry.kind === "quick" ? (() => {
                        const item = entry.item;
                        const isActive = location === item.path;
                        return (
                          <SidebarMenu>
                            <SidebarMenuItem>
                              <SidebarMenuButton
                                isActive={isActive}
                                onClick={() => {
                                  if (isReordering) return;
                                  setLocation(item.path);
                                  if (isMobile) setOpenMobile(false);
                                }}
                                tooltip={item.label}
                                className="h-11 font-medium md:h-10"
                              >
                                <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                                <span className="text-sm">{item.label}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          </SidebarMenu>
                        );
                      })() : (() => {
                        const { category, visibleItems } = entry;
                        const isExpanded = expandedCategories.has(category.id);
                        const hasActiveItem = visibleItems.some(item => item.path === location);

                        return (
                          <Collapsible
                            open={isExpanded}
                            onOpenChange={() => {
                              if (!isReordering) toggleCategory(category.id);
                            }}
                          >
                            <CollapsibleTrigger asChild>
                              <button
                                className={cn(
                                  "flex h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors md:h-10",
                                  "hover:bg-accent/50",
                                  hasActiveItem && "bg-accent/30",
                                )}
                              >
                                {!isCollapsed && (
                                  <ChevronRight
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                                      isExpanded && "rotate-90",
                                    )}
                                  />
                                )}
                                <div className={cn(
                                  "flex h-6 w-6 shrink-0 items-center justify-center rounded",
                                  category.color,
                                )}>
                                  <category.icon className="h-3.5 w-3.5 text-white" />
                                </div>
                                {!isCollapsed && (
                                  <span className={cn(
                                    "truncate text-sm font-medium",
                                    hasActiveItem && "text-foreground",
                                  )}>
                                    {category.label}
                                  </span>
                                )}
                              </button>
                            </CollapsibleTrigger>

                            {!isReordering && (
                              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                                <SidebarMenu className={cn("mt-1", !isCollapsed && "ml-5 border-l border-border/50 pl-2")}>
                                  {visibleItems.map(item => {
                                    const isActive = location === item.path;
                                    return (
                                      <SidebarMenuItem key={item.path}>
                                        <SidebarMenuButton
                                          isActive={isActive}
                                          onClick={() => {
                                            setLocation(item.path);
                                            if (isMobile) setOpenMobile(false);
                                          }}
                                          tooltip={item.label}
                                          className="h-11 font-normal transition-all md:h-10"
                                        >
                                          <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                                          <span className="text-sm">{item.label}</span>
                                        </SidebarMenuButton>
                                      </SidebarMenuItem>
                                    );
                                  })}
                                </SidebarMenu>
                              </CollapsibleContent>
                            )}
                          </Collapsible>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </SidebarContent>

          <SidebarFooter className="p-3">
            {isSuperAdmin && !isCollapsed && (
              <Button
                type="button"
                variant={isReordering ? "secondary" : "outline"}
                size="sm"
                className="h-9 w-full justify-start gap-2"
                disabled={updateSidebarOrder.isPending}
                onClick={() => setIsReordering(current => !current)}
              >
                {isReordering ? <Check className="h-4 w-4" /> : <GripVertical className="h-4 w-4" />}
                {isReordering ? "Terminar orden" : "Reordenar módulos"}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation("/")}
                  className="cursor-pointer"
                >
                  <Home className="mr-2 h-4 w-4" />
                  <span>Ir al sitio</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Cerrar sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 hidden w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors md:block ${isCollapsed ? "md:hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="sticky top-0 z-40 flex min-h-14 items-center border-b bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="h-10 w-10 shrink-0 rounded-lg bg-background" />
              <div className="flex min-w-0 items-center gap-3">
                {activeCategory && (
                  <div className={cn("h-6 w-6 shrink-0 rounded flex items-center justify-center", activeCategory.color)}>
                    <activeCategory.icon className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-xs text-muted-foreground">{activeCategory?.label ?? (activeQuickItem ? "Vista 360" : "CMS")}</span>
                  <span className="truncate text-sm tracking-tight text-foreground">
                    {activeMenuItem?.label ?? activeQuickItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="cms-main min-w-0 flex-1 p-3 sm:p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
