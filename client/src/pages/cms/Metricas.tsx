import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart3, TrendingUp, ArrowRight, Eye, MousePointer, Clock
} from "lucide-react";
import { useLocation } from "wouter";

export default function CMSMetricas() {
  const [, setLocation] = useLocation();

  const modules = [
    {
      title: "Analytics",
      description: "Estadísticas de visitas y comportamiento",
      icon: BarChart3,
      path: "/cms/analytics",
      color: "bg-amber-500",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Métricas</h1>
          <p className="text-muted-foreground">
            Analytics y reportes de rendimiento
          </p>
        </div>

        {/* Stats placeholder */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Visitas Hoy</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
              <p className="text-xs text-muted-foreground">Ver en Analytics</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Páginas Vistas</CardTitle>
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
              <p className="text-xs text-muted-foreground">Ver en Analytics</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tiempo Promedio</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
              <p className="text-xs text-muted-foreground">Ver en Analytics</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tasa de Rebote</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
              <p className="text-xs text-muted-foreground">Ver en Analytics</p>
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
            </Card>
          ))}

          {/* Placeholder para futuros reportes */}
          <Card className="border-dashed opacity-60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-muted">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
              <CardTitle className="text-lg">Reportes de Ventas</CardTitle>
              <CardDescription>Próximamente - Análisis de ingresos y conversiones</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
