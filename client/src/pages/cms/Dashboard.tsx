import DashboardLayout, { CategoryId, categories } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  Store, Briefcase, Megaphone, TrendingUp, Shield,
  ArrowRight, Users, CalendarCheck, MessageSquare, FileText,
  Newspaper, BarChart3
} from "lucide-react";
import { useLocation } from "wouter";
import { SEOHead } from "@/components/SEOHead";
import { useEffect } from "react";

export default function CMSDashboard() {
  console.log("[Dashboard] 🏠 Dashboard renderizando");

  useEffect(() => {
    console.log("[Dashboard] ✅ Dashboard montado correctamente");
  }, []);

  // SEO - Página oculta de Google (noindex)
  const seoData = {
    title: "Dashboard | Cancagua CMS",
    description: "Panel de control de Cancagua Spa",
    canonical: "/cms",
    noindex: true
  };
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
  };

  return (
    <DashboardLayout>
      <SEOHead {...seoData} />
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Panel de Control</h1>
          <p className="text-muted-foreground mt-1">
            Bienvenido al CMS de Cancagua. Selecciona una categoría para comenzar.
          </p>
        </div>

        {/* Categorías Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category) => (
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

                {/* Items de la categoría */}
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Módulos:</p>
                  <div className="flex flex-wrap gap-1">
                    {category.items.slice(1).map((item) => (
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
          ))}
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
