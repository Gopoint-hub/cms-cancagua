import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Newspaper, MailPlus, UsersRound, ListChecks, ArrowRight,
  TrendingUp, Send, Users
} from "lucide-react";
import { useLocation } from "wouter";

export default function CMSMarketing() {
  const [, setLocation] = useLocation();

  const { data: newslettersData } = trpc.newsletters.getAll.useQuery();
  const { data: subscribersData } = trpc.subscribers.getAll.useQuery();
  const { data: listsData } = trpc.lists.getAll.useQuery();

  const sentNewsletters = newslettersData?.filter((n: any) => n.status === "sent").length || 0;
  const draftNewsletters = newslettersData?.filter((n: any) => n.status === "draft").length || 0;
  const activeSubscribers = subscribersData?.filter((s: any) => s.status === "active").length || 0;
  const totalLists = listsData?.length || 0;

  const modules = [
    {
      title: "Newsletters",
      description: "Historial de campañas enviadas",
      icon: Newspaper,
      path: "/cms/newsletter",
      color: "bg-purple-500",
      badge: draftNewsletters > 0 ? `${draftNewsletters} borradores` : undefined,
    },
    {
      title: "Crear Newsletter",
      description: "Diseña emails con IA",
      icon: MailPlus,
      path: "/cms/crear-newsletter",
      color: "bg-pink-500",
    },
    {
      title: "Suscriptores",
      description: "Base de datos de contactos",
      icon: UsersRound,
      path: "/cms/suscriptores",
      color: "bg-blue-500",
      badge: `${activeSubscribers} activos`,
    },
    {
      title: "Listas",
      description: "Segmentación de audiencias",
      icon: ListChecks,
      path: "/cms/listas",
      color: "bg-amber-500",
      badge: totalLists > 0 ? `${totalLists} listas` : undefined,
    },
    {
      title: "ROI de Marketing",
      description: "Inversión vs Ventas Reales",
      icon: TrendingUp,
      path: "/cms/marketing-roi",
      color: "bg-emerald-500",
      badge: "Nuevo",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marketing</h1>
          <p className="text-muted-foreground">
            Newsletters, campañas y gestión de suscriptores
          </p>
        </div>

        {/* Stats rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Newsletters Enviados</CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sentNewsletters}</div>
              <p className="text-xs text-muted-foreground">Campañas completadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Borradores</CardTitle>
              <Newspaper className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{draftNewsletters}</div>
              <p className="text-xs text-muted-foreground">En preparación</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suscriptores Activos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeSubscribers}</div>
              <p className="text-xs text-muted-foreground">Reciben newsletters</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Listas</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLists}</div>
              <p className="text-xs text-muted-foreground">Segmentos creados</p>
            </CardContent>
          </Card>
        </div>

        {/* Módulos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((module) => (
            <Card
              key={module.path}
              className="cursor-pointer hover:shadow-md transition-all group"
              onClick={() => setLocation(module.path)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${module.color}`}>
                    <module.icon className="h-5 w-5 text-white" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
                <CardTitle className="text-lg">{module.title}</CardTitle>
                <CardDescription>{module.description}</CardDescription>
              </CardHeader>
              {module.badge && (
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
