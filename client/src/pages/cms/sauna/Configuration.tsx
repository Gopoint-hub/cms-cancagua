import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { addMonths, format, subMonths } from "date-fns";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const dayNames: Record<string, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

export default function SaunaConfiguration() {
  const settings = trpc.sauna.settings.useQuery();
  const runs = trpc.sauna.sync.status.useQuery();
  const [from, setFrom] = useState(
    format(subMonths(new Date(), 3), "yyyy-MM-dd")
  );
  const [to, setTo] = useState(format(addMonths(new Date(), 12), "yyyy-MM-dd"));
  const utils = trpc.useUtils();
  const sync = trpc.sauna.sync.run.useMutation({
    onSuccess: result => {
      toast.success(
        `Skedu sincronizado: ${result.bookingsUpserted} reservas y ${result.programsQueued} pases`
      );
      void utils.sauna.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateCheckout = trpc.sauna.updateCheckout.useMutation({
    onSuccess: result => {
      toast.success(
        result.enabled ? "Checkout Sauna habilitado" : "Checkout Sauna pausado"
      );
      void utils.sauna.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const row = settings.data;
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-amber-700">Sauna</p>
          <h1 className="text-3xl font-bold">Configuración e integración</h1>
          <p className="text-muted-foreground">
            Reglas operacionales oficiales y estado de sincronización con Skedu.
          </p>
        </div>
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Políticas confirmadas</AlertTitle>
          <AlertDescription>
            Cancelación con 72 horas, reagendamiento con 48 horas y máximo 2
            cambios. Aforo físico invariable de 6 personas.
          </AlertDescription>
        </Alert>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <div className="flex items-center gap-2">
                <strong>Checkout público con Transbank</strong>
                <Badge variant={row?.checkoutEnabled ? "default" : "secondary"}>
                  {row?.checkoutEnabled ? "Habilitado" : "Pausado"}
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Déjalo pausado mientras Skedu siga vendiendo Sauna en paralelo.
                Habilítalo al hacer el cambio oficial hacia la agenda del CMS.
              </p>
            </div>
            <Button
              variant={row?.checkoutEnabled ? "destructive" : "default"}
              disabled={!row || updateCheckout.isPending}
              onClick={() =>
                updateCheckout.mutate({
                  enabled: !Boolean(row?.checkoutEnabled),
                })
              }
            >
              {row?.checkoutEnabled ? "Pausar checkout" : "Habilitar checkout"}
            </Button>
          </CardContent>
        </Card>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Capacidad y horarios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Info
                  label="Aforo físico"
                  value={`${row?.capacity ?? 6} personas`}
                />
                <Info
                  label="Duración"
                  value={`${row?.durationMinutes ?? 60} minutos`}
                />
                <Info
                  label="Cadencia"
                  value={`${row?.slotIntervalMinutes ?? 90} minutos`}
                />
                <Info
                  label="Anticipación mínima"
                  value={`${row?.bookingLeadHours ?? 2} horas`}
                />
              </div>
              <div className="space-y-2">
                {Object.entries(row?.schedule ?? {}).map(
                  ([day, schedule]: [string, any]) => (
                    <div
                      key={day}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <span>{dayNames[day]}</span>
                      {schedule.enabled ? (
                        <Badge variant="outline">
                          {schedule.open}–{schedule.close}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Cerrado</Badge>
                      )}
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sincronización Skedu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Desde</Label>
                  <Input
                    className="mt-1"
                    type="date"
                    value={from}
                    onChange={event => setFrom(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Hasta</Label>
                  <Input
                    className="mt-1"
                    type="date"
                    value={to}
                    onChange={event => setTo(event.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => sync.mutate({ from, to })}
                disabled={sync.isPending}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`}
                />
                {sync.isPending ? "Sincronizando…" : "Sincronizar ahora"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Incluye agenda Sauna Nativo y detecta pases
                Reconecta/Bio-Reconecta Detox. Los pases no consumen cupos hasta
                que se les asigna hora.
              </p>
              <div className="space-y-2">
                {runs.data?.slice(0, 5).map(run => (
                  <div key={run.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between">
                      <strong>
                        {new Date(run.startedAt).toLocaleString("es-CL")}
                      </strong>
                      <Badge
                        variant={
                          run.status === "completed"
                            ? "default"
                            : run.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {run.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {run.bookingsUpserted} reservas · {run.programsQueued}{" "}
                      pases Detox
                    </p>
                    {run.error && (
                      <p className="mt-1 text-xs text-red-600">{run.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Skedu sigue siendo la fuente externa</AlertTitle>
          <AlertDescription>
            Skedu no tiene un endpoint documentado para disponibilidad cruzada.
            El CMS protege sus propias ventas y suma reservas Skedu después de
            cada sincronización; conviene automatizarla con webhook o tarea
            periódica antes de abrir ventas públicas.
          </AlertDescription>
        </Alert>
      </div>
    </DashboardLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
