import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { UtensilsCrossed, MessageSquare, ArrowRight, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";

export default function CMSB2C() {
  const [, setLocation] = useLocation();

  const { data: messagesData } = trpc.contactMessages.list.useQuery();

  const unreadMessages = messagesData?.filter((m: any) => m.status === "new").length || 0;
  const totalMessages = messagesData?.length || 0;

  const modules = [
    {
      title: "Carta",
      description: "Menú de cafetería y restaurante",
      icon: UtensilsCrossed,
      path: "/cms/carta",
      color: "bg-amber-500",
    },
    {
      title: "Mensajes",
      description: "Consultas y contactos",
      icon: MessageSquare,
      path: "/cms/mensajes",
      color: "bg-purple-500",
      badge: unreadMessages > 0 ? `${unreadMessages} nuevos` : undefined,
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              className="group cursor-pointer transition-all hover:shadow-md"
              onClick={() => setLocation(module.path)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${module.color}`}>
                    <module.icon className="h-5 w-5 text-white" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {module.title}
                </CardTitle>
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
