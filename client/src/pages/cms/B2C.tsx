import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { 
  Package, UtensilsCrossed, CalendarCheck, MessageSquare, Users,
  ArrowRight, TrendingUp, Clock
} from "lucide-react";
import { useLocation } from "wouter";

export default function CMSB2C() {
  const [, setLocation] = useLocation();

  const { data: bookingsData } = trpc.bookings.list.useQuery();
  const { data: messagesData } = trpc.contactMessages.list.useQuery();

  const pendingBookings = bookingsData?.filter((b: any) => b.status === "pending").length || 0;
  const confirmedBookings = bookingsData?.filter((b: any) => b.status === "confirmed").length || 0;
  const unreadMessages = messagesData?.filter((m: any) => m.status === "new").length || 0;
  const totalMessages = messagesData?.length || 0;

  const modules = [
    {
      title: "Servicios",
      description: "Gestiona los servicios del spa",
      icon: Package,
      path: "/cms/servicios",
      color: "bg-emerald-500",
      comingSoon: true,
    },
    {
      title: "Carta",
      description: "Menú de cafetería y restaurante",
      icon: UtensilsCrossed,
      path: "/cms/carta",
      color: "bg-amber-500",
    },
    {
      title: "Reservas",
      description: "Gestiona las reservas de clientes",
      icon: CalendarCheck,
      path: "/cms/reservas",
      color: "bg-blue-500",
      badge: pendingBookings > 0 ? `${pendingBookings} pendientes` : undefined,
      comingSoon: true,
    },
    {
      title: "Mensajes",
      description: "Consultas y contactos",
      icon: MessageSquare,
      path: "/cms/mensajes",
      color: "bg-purple-500",
      badge: unreadMessages > 0 ? `${unreadMessages} nuevos` : undefined,
    },
    {
      title: "Clientes",
      description: "Base de datos de clientes",
      icon: Users,
      path: "/cms/clientes",
      color: "bg-pink-500",
      comingSoon: true,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">B2C - Clientes & Servicios</h1>
          <p className="text-muted-foreground">
            Gestiona la experiencia de tus clientes directos
          </p>
        </div>

        {/* Stats rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reservas Pendientes</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingBookings}</div>
              <p className="text-xs text-muted-foreground">Requieren confirmación</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reservas Confirmadas</CardTitle>
              <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{confirmedBookings}</div>
              <p className="text-xs text-muted-foreground">Próximas visitas</p>
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
              <CardTitle className="text-sm font-medium">Total Mensajes</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMessages}</div>
              <p className="text-xs text-muted-foreground">Este mes</p>
            </CardContent>
          </Card>
        </div>

        {/* Módulos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((module) => (
            <Card 
              key={module.path}
              className={`transition-all group ${module.comingSoon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}`}
              onClick={() => !module.comingSoon && setLocation(module.path)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${module.color}`}>
                    <module.icon className="h-5 w-5 text-white" />
                  </div>
                  {!module.comingSoon && (
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  )}
                </div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {module.title}
                  {module.comingSoon && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-normal">
                      Coming Soon
                    </span>
                  )}
                </CardTitle>
                <CardDescription>{module.description}</CardDescription>
              </CardHeader>
              {module.badge && !module.comingSoon && (
                <CardContent className="pt-0">
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                    {module.badge}
                  </span>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
