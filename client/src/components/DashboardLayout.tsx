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
  LayoutDashboard, LogOut, PanelLeft, Users, Calendar, Mail, BarChart3,
  FileText, MessageSquare, Package, Newspaper, Settings, Store, Briefcase,
  TrendingUp, Shield, Megaphone, ChevronDown, ChevronRight, Home, UtensilsCrossed,
  CalendarCheck, UserCheck, Kanban, ListChecks, MailPlus, UsersRound, Tag, Languages, RefreshCw, Gift,
  Wrench, HardHat, Handshake, ShoppingCart, DollarSign, HelpCircle
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

// Definición de categorías y sus items de menú
export type CategoryId = "b2c" | "b2b" | "ventas" | "marketing" | "metrics" | "operations" | "admin" | "ayuda";

interface MenuItem {
  icon: any;
  label: string;
  path: string;
  /** If set, only these roles can see this item. If not set, all roles can see it. */
  roles?: string[];
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
}

export const categories: Category[] = [
  {
    id: "b2c",
    label: "B2C",
    icon: Store,
    description: "Clientes & Servicios",
    color: "bg-emerald-500",
    roles: ["super_admin", "admin"],
    items: [
      { icon: Gift, label: "Gift Cards", path: "/cms/gift-cards-sales" },
      { icon: MessageSquare, label: "Mensajes", path: "/cms/mensajes" },
      { icon: Users, label: "Clientes", path: "/cms/clientes" },
    ],
  },
  {
    id: "b2b",
    label: "B2B",
    icon: Briefcase,
    description: "Eventos Corporativos",
    color: "bg-blue-500",
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
    items: [
      { icon: Handshake, label: "Concierge", path: "/cms/concierge/venta" },
      { icon: Package, label: "Servicios Concierge", path: "/cms/concierge/servicios", roles: ["super_admin", "admin"] },
      { icon: DollarSign, label: "Comisiones", path: "/cms/concierge/vendedores", roles: ["super_admin", "admin"] },
      { icon: DollarSign, label: "Mis Comisiones", path: "/cms/concierge/mis-comisiones" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    description: "Newsletters & Campañas",
    color: "bg-purple-500",
    roles: ["super_admin", "admin"],
    items: [
      { icon: Newspaper, label: "Newsletters", path: "/cms/newsletter" },
      { icon: MailPlus, label: "Crear Newsletter", path: "/cms/crear-newsletter" },
      { icon: UsersRound, label: "Suscriptores", path: "/cms/suscriptores" },
      { icon: ListChecks, label: "Listas", path: "/cms/listas" },
      { icon: TrendingUp, label: "ROI de Marketing", path: "/cms/marketing-roi" },
      { icon: Tag, label: "Códigos Dcto.", path: "/cms/codigos-descuento" },
    ],
  },
  {
    id: "metrics",
    label: "Métricas",
    icon: TrendingUp,
    description: "Analytics & Reportes",
    color: "bg-amber-500",
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
    roles: ["super_admin", "admin"],
    items: [
      { icon: Wrench, label: "Reportes Mantención", path: "/cms/reportes-mantencion" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: Shield,
    description: "Usuarios & Configuración",
    color: "bg-slate-500",
    roles: ["super_admin", "admin"],
    items: [
      { icon: Users, label: "Usuarios", path: "/cms/usuarios" },
      { icon: Languages, label: "Traducciones", path: "/cms/traducciones" },
      { icon: RefreshCw, label: "Integraciones", path: "/cms/integraciones" },
      { icon: Settings, label: "Configuración", path: "/cms/configuracion" },
    ],
  },
  {
    id: "ayuda",
    label: "Ayuda",
    icon: HelpCircle,
    description: "Documentación & Guías",
    color: "bg-cyan-500",
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

  return (
    <SidebarProvider
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
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Detectar categoría y módulo activo para el header móvil
  const activeCategory = categories.find(c => c.items.some(i => i.path === location));
  const activeMenuItem = activeCategory?.items.find(item => item.path === location);

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
            {/* Menú Acordeón - Categorías filtradas por rol */}
            <div className="px-2 py-1">
              {categories
                .filter(cat => !cat.roles || cat.roles.includes(user?.role || ""))
                .map((category) => {
                // Filter items by role too
                const visibleItems = category.items.filter(item => !item.roles || item.roles.includes(user?.role || ""));
                if (visibleItems.length === 0) return null;
                const isExpanded = expandedCategories.has(category.id);
                const hasActiveItem = visibleItems.some(item => item.path === location);
                
                return (
                  <Collapsible
                    key={category.id}
                    open={isExpanded}
                    onOpenChange={() => toggleCategory(category.id)}
                    className="mb-1"
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-2 rounded-lg transition-colors text-left",
                          "hover:bg-accent/50",
                          hasActiveItem && "bg-accent/30"
                        )}
                      >
                        {!isCollapsed && (
                          <ChevronRight 
                            className={cn(
                              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
                              isExpanded && "rotate-90"
                            )} 
                          />
                        )}
                        <div className={cn(
                          "h-6 w-6 rounded flex items-center justify-center shrink-0",
                          category.color
                        )}>
                          <category.icon className="h-3.5 w-3.5 text-white" />
                        </div>
                        {!isCollapsed && (
                          <span className={cn(
                            "text-sm font-medium truncate",
                            hasActiveItem && "text-foreground"
                          )}>
                            {category.label}
                          </span>
                        )}
                      </button>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                      <SidebarMenu className={cn("mt-1", !isCollapsed && "ml-5 pl-2 border-l border-border/50")}>
                        {visibleItems.map((item) => {
                          const isActive = location === item.path;
                          return (
                            <SidebarMenuItem key={item.path}>
                              <SidebarMenuButton
                                isActive={isActive}
                                onClick={() => setLocation(item.path)}
                                tooltip={item.label}
                                className="h-9 transition-all font-normal"
                              >
                                <item.icon
                                  className={cn("h-4 w-4", isActive && "text-primary")}
                                />
                                <span className="text-sm">{item.label}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          );
                        })}
                      </SidebarMenu>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </SidebarContent>

          <SidebarFooter className="p-3">
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
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                {activeCategory && (
                  <div className={cn("h-6 w-6 rounded flex items-center justify-center", activeCategory.color)}>
                    <activeCategory.icon className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{activeCategory?.label ?? "CMS"}</span>
                  <span className="tracking-tight text-foreground text-sm">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
