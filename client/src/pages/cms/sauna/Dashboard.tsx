import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CalendarCheck,
  Flame,
  LockKeyhole,
  RefreshCw,
  Users,
} from "lucide-react";
import { Link } from "wouter";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default function SaunaDashboard() {
  const query = trpc.sauna.dashboard.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const data = query.data;
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-700">
              Operación · aforo máximo 6
            </p>
            <h1 className="text-3xl font-bold">Sauna Nativo</h1>
            <p className="text-muted-foreground">
              Reservas públicas compartidas, privados y pases Detox en una sola
              agenda.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
              Actualizar
            </Button>
            <Button asChild>
              <Link href="/cms/sauna/agenda">
                <CalendarCheck className="mr-2 h-4 w-4" />
                Abrir agenda
              </Link>
            </Button>
          </div>
        </div>

        {query.isLoading ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map(item => (
              <Skeleton key={item} className="h-28" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric
              icon={CalendarCheck}
              label="Reservas de hoy"
              value={data?.bookings.length ?? 0}
            />
            <Metric
              icon={Users}
              label="Personas de hoy"
              value={data?.guests ?? 0}
            />
            <Metric
              icon={LockKeyhole}
              label="Privados"
              value={data?.privateBookings ?? 0}
            />
            <Metric
              icon={Flame}
              label="Detox por agendar"
              value={data?.pendingPrograms ?? 0}
              warning={Boolean(data?.pendingPrograms)}
            />
          </div>
        )}

        {data?.alerts.length ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atención operativa</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {data.alerts.map((alert, index) => (
                  <li key={`${alert.type}-${index}`}>{alert.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Aforo por bloque</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.slots ?? []).map(slot => (
                <div
                  key={slot.startTime}
                  className={`rounded-xl border p-4 ${slot.availableSeats === 0 ? "border-red-200 bg-red-50" : slot.availableSeats <= 2 ? "border-amber-200 bg-amber-50" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <strong>{slot.startTime}</strong>
                    <Badge
                      variant={slot.availableSeats ? "outline" : "destructive"}
                    >
                      {slot.availableSeats} libres
                    </Badge>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-amber-700"
                      style={{ width: `${(slot.occupiedSeats / 6) * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {slot.occupiedSeats}/6 ocupados · termina {slot.endTime}
                  </p>
                </div>
              ))}
              {!data?.slots.length && (
                <p className="text-sm text-muted-foreground">
                  No hay bloques regulares para hoy.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Próximas llegadas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.bookings ?? []).map(booking => (
                <div key={booking.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{booking.startTime}</strong>
                    <Badge variant={booking.isPrivate ? "default" : "outline"}>
                      {booking.isPrivate
                        ? "Privado · 6 cupos"
                        : `${booking.guests} persona${booking.guests === 1 ? "" : "s"}`}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {booking.clientName || "Cliente Skedu"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {booking.serviceName} · {booking.origin || booking.source}
                  </p>
                  {booking.amountClp > 0 && (
                    <p className="mt-1 text-xs text-emerald-700">
                      {clp.format(booking.amountClp)}
                    </p>
                  )}
                </div>
              ))}
              {!data?.bookings.length && (
                <p className="text-sm text-muted-foreground">
                  Sin llegadas registradas para hoy.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground">
          Última sincronización:{" "}
          {data?.lastSync
            ? new Date(data.lastSync.startedAt).toLocaleString("es-CL")
            : "todavía no ejecutada"}
          .
        </p>
      </div>
    </DashboardLayout>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  warning = false,
}: {
  icon: any;
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <Card className={warning ? "border-amber-300 bg-amber-50" : ""}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-xl bg-amber-100 p-3 text-amber-800">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
