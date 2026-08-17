import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  CalendarDays,
  GraduationCap,
  CircleDollarSign,
  ClipboardCheck,
  Settings,
  Mail,
  Users,
  WalletCards,
  AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";
import { clp } from "./shared";

type ModuleCard = {
  href: string;
  label: string;
  description: string;
  icon: typeof ClipboardCheck;
  teacher?: boolean;
  reception?: boolean;
  admin?: boolean;
};

const modules: ModuleCard[] = [
  { href: "/cms/clases-regulares/asistencia", label: "Asistencia", description: "Clases del día y marcación", icon: ClipboardCheck, teacher: true },
  { href: "/cms/clases-regulares/mis-liquidaciones", label: "Mi liquidación", description: "Comisiones personales del período", icon: CircleDollarSign, teacher: true },
  { href: "/cms/clases-regulares/alumnos", label: "Alumnos y pagos", description: "Planes, créditos e inscripciones", icon: Users, reception: true },
  { href: "/cms/clases-regulares/clases", label: "Clases y horarios", description: "Disciplinas y parrilla semanal", icon: CalendarDays, admin: true },
  { href: "/cms/clases-regulares/profesores", label: "Profesores", description: "Acuerdos, documentos y usuarios", icon: GraduationCap, admin: true },
  { href: "/cms/clases-regulares/liquidaciones", label: "Liquidaciones", description: "Comisiones y cierres mensuales", icon: CircleDollarSign, admin: true },
  { href: "/cms/clases-regulares/comunicaciones", label: "Beneficios y correos", description: "Sauna, Pulso e invitaciones", icon: Mail, admin: true },
  { href: "/cms/clases-regulares/configuracion", label: "Planes y configuración", description: "Precios, créditos y período", icon: Settings, admin: true },
];

export default function RegularClassesDashboard() {
  const access = trpc.regularClasses.access.useQuery();
  const dashboard = trpc.regularClasses.dashboard.useQuery(undefined, {
    enabled: access.data?.allowed === true,
  });
  const plans = trpc.regularClasses.plans.list.useQuery(undefined, {
    enabled: access.data?.allowed === true,
  });

  const visibleModules = modules.filter((item) =>
    (item.admin && access.data?.isAdmin)
    || (item.reception && (access.data?.isReception || access.data?.isAdmin))
    || (item.teacher && (access.data?.isTeacher || access.data?.isAdmin)));

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Clases Regulares</h1>
            <Badge variant="outline">Programa integrado</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Alumnos, asistencias, créditos y liquidaciones en pesos chilenos.
          </p>
        </div>

        {access.data?.isAdmin && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { label: "Alumnos activos", value: dashboard.data?.activeStudents ?? 0, Icon: Users },
              { label: "Planes pagados", value: dashboard.data?.paidMemberships ?? 0, Icon: WalletCards },
              { label: "Pendientes de pago", value: dashboard.data?.pendingMemberships ?? 0, Icon: AlertTriangle, warning: Boolean(dashboard.data?.pendingMemberships) },
              { label: "Ingresos período", value: clp(dashboard.data?.incomeClp), Icon: CircleDollarSign },
              { label: "Sesiones", value: dashboard.data?.sessions ?? 0, Icon: CalendarDays },
              { label: "Asistencias", value: dashboard.data?.attendances ?? 0, Icon: ClipboardCheck },
            ].map(({ label, value, Icon, warning }) => (
              <Card key={label} className={warning ? "border-red-300 bg-red-50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Icon className="h-4 w-4" /> {label}
                  </CardTitle>
                </CardHeader>
                <CardContent><p className="text-2xl font-semibold">{value}</p></CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleModules.map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="h-full cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="font-semibold">{item.label}</h2>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {access.data?.isAdmin && (
          <Card>
            <CardHeader><CardTitle className="text-base">Planes vigentes</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.data?.filter((plan) => plan.active).map((plan) => (
                <div key={plan.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{plan.name}</span>
                    <strong>{clp(plan.priceClp)}</strong>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {plan.creditsPerPeriod} {plan.creditsPerPeriod === 1 ? "clase" : "clases"} por período
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
