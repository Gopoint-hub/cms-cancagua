import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CalendarCheck,
  CircleDollarSign,
  Droplets,
  UsersRound,
} from "lucide-react";
import { Link } from "wouter";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default function BiopiscinasDashboard() {
  const { data, isLoading } = trpc.biopools.dashboard.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  if (isLoading)
    return (
      <DashboardLayout>
        <div className="p-6 grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(item => (
            <Skeleton key={item} className="h-32" />
          ))}
        </div>
      </DashboardLayout>
    );

  const cards = [
    {
      label: "Reservas de hoy",
      value: data?.bookings ?? 0,
      icon: CalendarCheck,
      tone: "text-cyan-700",
    },
    {
      label: "Personas con reserva",
      value: data?.guests ?? 0,
      icon: UsersRound,
      tone: "text-blue-700",
    },
    {
      label: "Ventas pagadas",
      value: clp.format(data?.revenueClp ?? 0),
      icon: CircleDollarSign,
      tone: "text-emerald-700",
    },
    {
      label: "Pagos pendientes",
      value: data?.pendingPayment ?? 0,
      icon: AlertTriangle,
      tone: "text-amber-700",
    },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-700">
              Operación diaria
            </p>
            <h1 className="text-3xl font-semibold">Biopiscinas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cupos independientes por servicio y hora de ingreso.
            </p>
          </div>
          <Badge
            className={
              data?.services?.some(service => service.status === "published")
                ? "bg-emerald-600"
                : "bg-slate-500"
            }
          >
            {data?.services?.length
              ? `${data.services.length} servicios activos`
              : "Sin servicios"}
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, tone }) => (
            <Card key={label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </div>
                <p className="text-3xl font-semibold mt-5">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Droplets className="h-5 w-5 text-cyan-700" /> Capacidad por
                ingreso
              </CardTitle>
              <Link
                href="/cms/biopiscinas/agenda"
                className="text-sm text-cyan-700 hover:underline"
              >
                Abrir agenda
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              {(data?.slots ?? []).map(slot => {
                const used = slot.occupiedSeats;
                const percentage = slot.capacity
                  ? Math.round((used / slot.capacity) * 100)
                  : 0;
                return (
                  <div key={`${slot.serviceId}-${slot.startTime}`} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span>
                        <strong>{slot.serviceName}</strong>
                        <span className="text-muted-foreground"> · ingreso {slot.startTime} · salida {slot.endTime}</span>
                      </span>
                      <span className="text-muted-foreground">
                        {slot.availableSeats} disponibles de {slot.capacity}
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
              {!data?.slots?.length && (
                <p className="py-8 text-center text-muted-foreground">
                  Hoy no hay ingresos habilitados.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Reglas activas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl bg-cyan-50 p-4">
                <strong>Aforo total</strong>
                <p className="text-muted-foreground mt-1">
                  Cada servicio administra sus cupos por hora de ingreso.
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 p-4">
                <strong>Niños</strong>
                <p className="text-muted-foreground mt-1">
                  De 5 a 12 años, siempre con al menos un adulto.
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 p-4">
                <strong>Servicios incluidos</strong>
                <p className="text-muted-foreground mt-1">
                  Full Day, 4 horas y Late Hour se muestran juntos.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
