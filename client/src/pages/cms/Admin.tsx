import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, Settings, ArrowRight, Shield, Key, RefreshCw
} from "lucide-react";
import { useLocation } from "wouter";
import { SEOHead } from "@/components/SEOHead";

export default function CMSAdmin() {
  // SEO - Página oculta de Google (noindex)
  const seoData = {
    title: "Administración | Cancagua CMS",
    description: "Panel de administración de Cancagua Spa",
    canonical: "/cms/admin",
    noindex: true
  };
  const [, setLocation] = useLocation();

  const modules = [
    {
      title: "Usuarios",
      description: "Gestiona usuarios y permisos",
      icon: Users,
      path: "/cms/usuarios",
      color: "bg-slate-500",
    },
    {
      title: "Configuración",
      description: "Ajustes generales del sistema",
      icon: Settings,
      path: "/cms/configuracion",
      color: "bg-slate-600",
    },
    {
      title: "Integraciones",
      description: "Skedu API y servicios externos",
      icon: RefreshCw,
      path: "/cms/integraciones",
      color: "bg-blue-600",
    },
  ];

  return (
    <DashboardLayout>
      <SEOHead {...seoData} />
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administración</h1>
          <p className="text-muted-foreground">
            Usuarios, permisos y configuración del sistema
          </p>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Seguridad</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">Activa</div>
              <p className="text-xs text-muted-foreground">Autenticación OAuth</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API Keys</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Configuradas</div>
              <p className="text-xs text-muted-foreground">Resend, Analytics</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Base de Datos</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">Conectada</div>
              <p className="text-xs text-muted-foreground">TiDB Cloud</p>
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
        </div>
      </div>
    </DashboardLayout>
  );
}
