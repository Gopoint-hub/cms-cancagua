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
  TrendingUp, Shield, Megaphone, ChevronDown, Home, UtensilsCrossed,
  CalendarCheck, UserCheck, Kanban, ListChecks, MailPlus, UsersRound, Tag, Languages, RefreshCw, Gift,
  Wrench, HardHat
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState, createContext, useContext } from "react";
import { useLocation, Link } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

// Definición de categorías y sus items de menú
export type CategoryId = "b2c" | "b2b" | "marketing" | "metrics" | "operations" | "admin";

interface MenuItem {
  icon: any;
  label: string;
  path: string;
}

interface Category {
  id: CategoryId;
  label: string;
  icon: any;
  description: string;
  color: string;
  items: MenuItem[];
}

export const categories: Category[] = [
  {
    id: "b2c",
    label: "B2C",
    icon: Store,
    description: "Clientes & Servicios",
    color: "bg-emerald-500",
    items: [
      { icon: LayoutDashboard, label: "Resumen B2C", path: "/cms/b2c" },
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
    items: [
      { icon: LayoutDashboard, label: "Resumen B2B", path: "/cms/b2b" },
      { icon: FileText, label: "Cotizaciones", path: "/cms/cotizaciones" },
      { icon: Package, label: "Catálogo Productos", path: "/cms/productos-corporativos" },
      { icon: Kanban, label: "CRM Pipeline", path: "/cms/crm-pipeline" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    description: "Newsletters & Campañas",
    color: "bg-purple-500",
    items: [
      { icon: LayoutDashboard, label: "Resumen Marketing", path: "/cms/marketing" },
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
    items: [
      { icon: LayoutDashboard, label: "Resumen Métricas", path: "/cms/metricas" },
      { icon: BarChart3, label: "Analytics", path: "/cms/analytics" },
    ],
  },
  {
    id: "operations",
    label: "Operaciones",
    icon: HardHat,
    description: "Mantención & Operaciones",
    color: "bg-orange-500",
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
    items: [
      { icon: LayoutDashboard, label: "Resumen Admin", path: "/cms/admin" },
      { icon: Users, label: "Usuarios", path: "/cms/usuarios" },
      { icon: Languages, label: "Traducciones", path: "/cms/traducciones" },
      { icon: RefreshCw, label: "Integraciones", path: "/cms/integraciones" },
      { icon: Settings, label: "Configuración", path: "/cms/configuracion" },
    ],
  },
];

// Context para compartir la categoría activa
interface CategoryContextType {
  activeCategory: CategoryId;
  setActiveCategory: (category: CategoryId) => void;
}

const CategoryContext = createContext<CategoryContextType | null>(null);

export function useCategoryContext() {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error("useCategoryContext must be used within DashboardLayout");
  }
  return context;
}

// Función para detectar categoría basada en la ruta actual
function detectCategoryFromPath(path: string): CategoryId {
  for (const category of categories) {
    if (category.items.some(item => item.path === path)) {
      return category.id;
    }
  }
  return "b2c"; // Default
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const CATEGORY_KEY = "cms-active-category";
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
  const [activeCategory, setActiveCategory] = useState<CategoryId>(() => {
    // Primero intentar detectar por la ruta actual
    const detectedCategory = detectCategoryFromPath(location);
    if (detectedCategory !== "b2c" || location.startsWith("/b2c") || location === "/") {
      return detectedCategory;
    }
    // Si no se detecta, usar el guardado en localStorage
    const saved = localStorage.getItem(CATEGORY_KEY) as CategoryId;
    return saved || "b2c";
  });
  const { loading, user } = useAuth();

  // Actualizar categoría cuando cambia la ruta
  useEffect(() => {
    const detected = detectCategoryFromPath(location);
    if (detected !== activeCategory) {
      // Solo actualizar si la ruta pertenece a una categoría diferente
      const belongsToCategory = categories.find(c => c.id === activeCategory)?.items.some(i => i.path === location);
      if (!belongsToCategory && location !== "/") {
        setActiveCategory(detected);
      }
    }
  }, [location]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(CATEGORY_KEY, activeCategory);
  }, [activeCategory]);

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
    <CategoryContext.Provider value={{ activeCategory, setActiveCategory }}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
          } as CSSProperties
        }
      >
        <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
          {children}
        </DashboardLayoutContent>
      </SidebarProvider>
    </CategoryContext.Provider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { activeCategory, setActiveCategory } = useCategoryContext();

  const currentCategory = categories.find(c => c.id === activeCategory) || categories[0];
  const menuItems = currentCategory.items;
  const activeMenuItem = menuItems.find(item => item.path === location);

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

  const handleCategoryChange = (categoryId: CategoryId) => {
    setActiveCategory(categoryId);
    const category = categories.find(c => c.id === categoryId);
    if (category && category.items.length > 0) {
      setLocation(category.items[0].path);
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
                  <Link href="/" className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
                    <span className="font-semibold tracking-tight truncate">
                      CMS Cancagua
                    </span>
                  </Link>
                )}
              </div>

              {/* Selector de categoría */}
              {!isCollapsed && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors w-full text-left">
                      <div className={cn("h-6 w-6 rounded flex items-center justify-center", currentCategory.color)}>
                        <currentCategory.icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{currentCategory.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{currentCategory.description}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {categories.map((category) => (
                      <DropdownMenuItem
                        key={category.id}
                        onClick={() => handleCategoryChange(category.id)}
                        className={cn(
                          "cursor-pointer",
                          activeCategory === category.id && "bg-accent"
                        )}
                      >
                        <div className={cn("h-6 w-6 rounded flex items-center justify-center mr-2", category.color)}>
                          <category.icon className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{category.label}</p>
                          <p className="text-xs text-muted-foreground">{category.description}</p>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Selector colapsado */}
              {isCollapsed && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className={cn(
                      "h-8 w-8 rounded flex items-center justify-center mx-auto",
                      currentCategory.color,
                      "hover:opacity-80 transition-opacity"
                    )}>
                      <currentCategory.icon className="h-4 w-4 text-white" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="right" className="w-56">
                    {categories.map((category) => (
                      <DropdownMenuItem
                        key={category.id}
                        onClick={() => handleCategoryChange(category.id)}
                        className={cn(
                          "cursor-pointer",
                          activeCategory === category.id && "bg-accent"
                        )}
                      >
                        <div className={cn("h-6 w-6 rounded flex items-center justify-center mr-2", category.color)}>
                          <category.icon className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{category.label}</p>
                          <p className="text-xs text-muted-foreground">{category.description}</p>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 transition-all font-normal"
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
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
                <div className={cn("h-6 w-6 rounded flex items-center justify-center", currentCategory.color)}>
                  <currentCategory.icon className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{currentCategory.label}</span>
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
