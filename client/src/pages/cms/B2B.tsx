import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { 
  FileText, Package, Kanban, ArrowRight, TrendingUp, DollarSign, Clock
} from "lucide-react";
import { useLocation } from "wouter";

export default function CMSB2B() {
  const [, setLocation] = useLocation();

  const { data: quotesData } = trpc.quotes.getAll.useQuery();

  const draftQuotes = quotesData?.filter((q: any) => q.status === "draft").length || 0;
  const sentQuotes = quotesData?.filter((q: any) => q.status === "sent").length || 0;
  const approvedQuotes = quotesData?.filter((q: any) => q.status === "approved").length || 0;
  const totalValue = quotesData?.reduce((sum: number, q: any) => sum + (q.totalAmount || 0), 0) || 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const modules = [
    {
      title: "Cotizaciones",
      description: "Gestiona cotizaciones de eventos",
      icon: FileText,
      path: "/cms/cotizaciones",
      color: "bg-blue-500",
      badge: sentQuotes > 0 ? `${sentQuotes} enviadas` : undefined,
    },
    {
      title: "Catálogo de Productos",
      description: "Productos para eventos corporativos",
      icon: Package,
      path: "/cms/productos-corporativos",
      color: "bg-amber-500",
    },
    {
      title: "CRM Pipeline",
      description: "Embudo de ventas tipo Pipedrive",
      icon: Kanban,
      path: "/cms/crm-pipeline",
      color: "bg-purple-500",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">B2B - Eventos Corporativos</h1>
          <p className="text-muted-foreground">
            Gestiona cotizaciones y eventos para empresas
          </p>
        </div>

        {/* Stats rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Borradores</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{draftQuotes}</div>
              <p className="text-xs text-muted-foreground">Cotizaciones en preparación</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enviadas</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sentQuotes}</div>
              <p className="text-xs text-muted-foreground">Esperando respuesta</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aprobadas</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{approvedQuotes}</div>
              <p className="text-xs text-muted-foreground">Eventos confirmados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
              <p className="text-xs text-muted-foreground">En cotizaciones</p>
            </CardContent>
          </Card>
        </div>

        {/* Módulos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
