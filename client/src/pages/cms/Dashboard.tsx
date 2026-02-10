import DashboardLayout, { CategoryId, categories } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Store, Briefcase, Megaphone, TrendingUp, Shield,
  ArrowRight, Users, CalendarCheck, MessageSquare, FileText,
  Newspaper, BarChart3, Handshake, DollarSign, ShoppingCart
} from "lucide-react";
import { useLocation } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import { useEffect } from "react";

/** Dashboard simplificado para vendedores (rol concierge) */
function SellerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <DashboardLayout>
      <SEOHead title="Mi Panel | Cancagua" description="Panel de vendedor Cancagua" noindex />
      <div className="space-y-6 max-w-lg mx-auto">
        {/* Saludo */}
        <div className="text-center pt-4">
          <div className="h-16 w-16 rounded-2xl bg-teal-500 flex items-center justify-center mx-auto mb-4">
            <Handshake className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Hola, {user?.name?.split(" ")[0] || "Vendedor"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Selecciona una opción para comenzar
          </p>
        </div>

        {/* Acciones principales */}
        <div className="grid gap-4">
          <Card
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] group border-teal-200"
            onClick={() => setLocation("/cms/concierge/venta")}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className="h-14 w-14 rounded-xl bg-teal-500 flex items-center justify-center shrink-0">
                <ShoppingCart className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold">Nueva Venta</h2>
                <p className="text-sm text-muted-foreground">
                  Genera un link de pago para tu cliente
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform shrink-0" />
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] group"
            onClick={() => setLocation("/cms/concierge/mis-comisiones")}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className="h-14 w-14 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
                <DollarSign className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold">Mis Comisiones</h2>
                <p className="text-sm text-muted-foreground">
                  Revisa tus ventas y comisiones acumuladas
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform shrink-0" />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

/** Dashboard completo para admin/superadmin */
function AdminDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Obtener estadísticas rápidas
  const { data: bookingsData } = trpc.bookings.list.useQuery();
  const { data: messagesData } = trpc.contactMessages.list.useQuery();
  const { data: quotesData } = trpc.quotes.getAll.useQuery();
  const { data: subscribersData } = trpc.subscribers.getAll.useQuery();

  const pendingBookings = bookingsData?.filter((b: any) => b.status === "pending").length || 0;
  const unreadMessages = messagesData?.filter((m: any) => m.status === "new").length || 0;
  const pendingQuotes = quotesData?.filter((q: any) => q.status === "sent").length || 0;
  const totalSubscribers = subscribersData?.filter((s: any) => s.status === "active").length || 0;

  const userRole = user?.role || "";

  const handleCategoryClick = (categoryId: CategoryId) => {
    const category = categories.find(c => c.id === categoryId);
    if (category && category.items.length > 0) {
      setLocation(category.items[0].path);
    }
  };

  const categoryStats: Record<CategoryId, { label: string; value: number | string; icon: any }[]> = {
    b2c: [
      { label: "Reservas pendientes", value: pendingBookings, icon: CalendarCheck },
      { label: "Mensajes sin leer", value: unreadMessages, icon: MessageSquare },
    ],
    b2b: [
      { label: "Cotizaciones en proceso", value: pendingQuotes, icon: FileText },
    ],
    ventas: [
      { label: "Canal Concierge", value: "Ver", icon: BarChart3 },
    ],
    marketing: [
      { label: "Suscriptores activos", value: totalSubscribers, icon: Newspaper },
    ],
    metrics: [
      { label: "Analytics", value: "Ver", icon: BarChart3 },
    ],
    operations: [
      { label: "Reportes", value: "Ver", icon: BarChart3 },
    ],
    admin: [
      { label: "Usuarios", value: "Gestionar", icon: Users },
    ],
    ayuda: [
      { label: "Documentación", value: "Ver", icon: BarChart3 },
    ],
  };

  // Filter categories by role
  const visibleCategories = categories.filter(
    cat => !cat.roles || cat.roles.includes(userRole)
  );

  return (
    <DashboardLayout>
      <SEOHead title="Dashboard | Cancagua CMS" description="Panel de control de Cancagua Spa" canonical="/cms" noindex />
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Panel de Control</h1>
          <p className="text-muted-foreground mt-1">
            Bienvenido al CMS de Cancagua. Selecciona una categoría para comenzar.
          </p>
        </div>

        {/* Categorías Grid - filtered by role */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleCategories.map((category) => {
            // Also filter items by role
            const visibleItems = category.items.filter(
              item => !item.roles || item.roles.includes(userRole)
            );
            return (
              <Card 
                key={category.id}
                className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] group overflow-hidden"
                onClick={() => handleCategoryClick(category.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center",
                      category.color
                    )}>
                      <category.icon className="h-6 w-6 text-white" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                  <CardTitle className="text-xl mt-4">{category.label}</CardTitle>
                  <CardDescription>{category.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Mini stats de la categoría */}
                  <div className="space-y-2">
                    {categoryStats[category.id]?.map((stat, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <stat.icon className="h-4 w-4" />
                          <span>{stat.label}</span>
                        </div>
                        <span className={cn(
                          "font-medium",
                          typeof stat.value === "number" && stat.value > 0 && "text-primary"
                        )}>
                          {stat.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Items de la categoría - filtered by role */}
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Módulos:</p>
                    <div className="flex flex-wrap gap-1">
                      {visibleItems.slice(1).map((item) => (
                        <span 
                          key={item.path}
                          className="text-xs bg-muted px-2 py-1 rounded"
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Resumen rápido */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reservas Pendientes</CardTitle>
              <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingBookings}</div>
              <p className="text-xs text-muted-foreground">Requieren confirmación</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mensajes Nuevos</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{unreadMessages}</div>
              <p className="text-xs text-muted-foreground">Sin responder</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cotizaciones Activas</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingQuotes}</div>
              <p className="text-xs text-muted-foreground">En proceso</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suscriptores</CardTitle>
              <Newspaper className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSubscribers}</div>
              <p className="text-xs text-muted-foreground">Newsletter activos</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function CMSDashboard() {
  const { user, loading } = useAuth();

  useEffect(() => {
    console.log("[Dashboard] ✅ Dashboard montado, rol:", user?.role);
  }, [user]);

  if (loading) return null;

  // Vendedores ven un dashboard simplificado
  if (user?.role === "concierge" || user?.role === "seller") {
    return <SellerDashboard />;
  }

  // Admin y superadmin ven el dashboard completo
  return <AdminDashboard />;
}
