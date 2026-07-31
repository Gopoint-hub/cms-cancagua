/**
 * Dashboard de mantención — la vista de administración del día.
 *
 * La ficha (`/cms/mantencion-turnos`) es de quien está de turno y sirve para
 * registrar. Esto es para mirar: qué se hizo, qué falta y qué necesita atención.
 * Es solo lectura a propósito; nada de acá edita la ficha.
 *
 * Reemplaza la maqueta que estuvo publicada en `cancagua.cl/mantencion-dashboard.html`,
 * que mostraba datos inventados a mano porque cuando se hizo no había dónde
 * guardar los de verdad.
 */

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { hasMaintenanceAccess } from "@shared/permissions";
import { stepLabel } from "@shared/maintenanceShiftDashboard";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Droplets,
  Filter,
  Flame,
  Loader2,
  RefreshCw,
  Thermometer,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

/** Fecha de hoy en YYYY-MM-DD, en hora local del navegador. */
function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** Suma días a una fecha ISO sin pasar por zonas horarias. */
function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-CL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Verde si está dentro de rango, rojo si no, gris si nadie midió. */
function temperatureTone(value: number | null, inRange: boolean): string {
  if (value === null) return "text-muted-foreground";
  return inRange ? "text-emerald-600" : "text-red-600 font-semibold";
}

export default function MantencionDashboard() {
  const { user } = useAuth();
  const [reportDate, setReportDate] = useState(todayIso());

  const canRead = Boolean(user) && hasMaintenanceAccess(user?.role);
  const dashboardQuery = trpc.maintenanceShift.dashboard.useQuery(
    { reportDate },
    { enabled: canRead },
  );

  if (!user || !hasMaintenanceAccess(user.role)) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold">Acceso denegado</h2>
          <p className="text-muted-foreground">No tienes permisos para abrir esta sección</p>
        </div>
      </DashboardLayout>
    );
  }

  const data = dashboardQuery.data;
  const isToday = reportDate === todayIso();

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">
        {/* ---- cabecera ---- */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="w-6 h-6" />
              Mantención — el día de un vistazo
            </h1>
            <p className="text-muted-foreground capitalize">
              {prettyDate(reportDate)}
              {isToday ? " · hoy" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Día anterior"
              onClick={() => setReportDate(shiftIso(reportDate, -1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Input
              type="date"
              value={reportDate}
              onChange={(event) => setReportDate(event.target.value)}
              className="w-40"
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Día siguiente"
              onClick={() => setReportDate(shiftIso(reportDate, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Actualizar"
              onClick={() => void dashboardQuery.refetch()}
            >
              <RefreshCw className={`w-4 h-4 ${dashboardQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {dashboardQuery.isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Cargando el día…
          </div>
        )}

        {dashboardQuery.error && (
          <Card className="border-red-300">
            <CardContent className="pt-6 text-red-700">
              No se pudo cargar el día: {dashboardQuery.error.message}
            </CardContent>
          </Card>
        )}

        {data && !data.hasData && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nadie abrió la ficha este día.</p>
              <p className="text-sm">
                Cuando el turno empiece a registrar en{" "}
                <span className="font-mono">/cms/mantencion-turnos</span>, acá aparece solo.
              </p>
            </CardContent>
          </Card>
        )}

        {data && data.hasData && (
          <>
            {/* ---- cifras de arriba ---- */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Tareas del día</CardDescription>
                  <CardTitle className="text-3xl">
                    {data.tasksDone}
                    <span className="text-lg text-muted-foreground">/{data.tasksTotal}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.tasksPct !== null && (
                    <div className="h-2 w-full rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${data.tasksPct}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Necesita atención</CardDescription>
                  <CardTitle
                    className={`text-3xl ${data.alerts.length > 0 ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {data.alerts.length}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {data.alerts.filter((alert) => alert.level === "alta").length} de prioridad alta
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Filter className="w-3 h-3" /> Filtrado
                  </CardDescription>
                  <CardTitle className="text-2xl">{data.filtering ?? "—"}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {data.filtering ? "ventana guardada por el turno" : "el turno no la guardó"}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Turnos</CardDescription>
                  <CardTitle className="text-2xl">{data.shifts.length}/2</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {data.shifts.map((shift) => (
                    <div key={shift.shift} className="flex items-center justify-between gap-2">
                      <span className="truncate">{shift.staffName ?? "sin nombre"}</span>
                      <Badge variant={shift.status === "submitted" ? "default" : "outline"}>
                        {shift.status === "submitted" ? "cerrado" : "abierto"}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* ---- lo que necesita atención ---- */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Necesita atención
                </CardTitle>
                <CardDescription>
                  Ordenado por gravedad: lo de arriba es lo primero que hay que ir a mirar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.alerts.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Sin alertas. Todo lo registrado está dentro de lo esperado.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.alerts.map((alert, index) => (
                      <div
                        key={`${alert.kind}-${alert.venue ?? ""}-${alert.time ?? ""}-${index}`}
                        className={`rounded-lg border p-3 ${
                          alert.level === "alta"
                            ? "border-red-300 bg-red-50"
                            : "border-amber-300 bg-amber-50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={alert.level === "alta" ? "destructive" : "secondary"}>
                            {alert.level}
                          </Badge>
                          <span className="font-medium">{alert.title}</span>
                          {alert.time && (
                            <span className="text-sm text-muted-foreground">· {alert.time}</span>
                          )}
                          <span className="text-sm text-muted-foreground">
                            · turno de {alert.shift}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{alert.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ---- temperaturas ---- */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Thermometer className="w-5 h-5" />
                  Temperatura del agua
                </CardTitle>
                <CardDescription>
                  Rondas del día por recinto. En rojo lo que salió fuera de rango.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Recinto</th>
                      <th className="py-2 pr-4 font-medium">Rango</th>
                      <th className="py-2 pr-4 font-medium">Última</th>
                      <th className="py-2 font-medium">Rondas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.temperatures.map((venue) => (
                      <tr key={venue.key} className="border-t">
                        <td className="py-2 pr-4 font-medium whitespace-nowrap">{venue.name}</td>
                        <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                          {venue.min}–{venue.max}°
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {venue.last === null ? (
                            <span className="text-muted-foreground">sin medir</span>
                          ) : (
                            <span className={temperatureTone(venue.last, venue.lastInRange)}>
                              {venue.last}° <span className="text-xs">({venue.lastTime})</span>
                              {venue.lastInRange && venue.outOfRange && (
                                <span className="ml-1 text-xs text-amber-600">
                                  (hubo una fuera de rango antes)
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-2">
                            {venue.readings.length === 0 && (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {venue.readings.map((reading, index) => (
                              <span
                                key={`${venue.key}-${reading.roundTime}-${index}`}
                                className="rounded bg-muted px-2 py-0.5 whitespace-nowrap"
                              >
                                <span className="text-xs text-muted-foreground">
                                  {reading.roundTime}
                                </span>{" "}
                                <span className={temperatureTone(reading.temperature, reading.inRange)}>
                                  {reading.temperature === null ? "—" : `${reading.temperature}°`}
                                </span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* ---- ciclos ---- */}
            {data.cycles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Flame className="w-5 h-5" />
                    Hot tubs y saunas — ciclo por reserva
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.cycles.map((group, index) => (
                    <div
                      key={`${group.venue}-${group.bookingRef ?? index}`}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{group.venueName}</span>
                        <Badge variant={group.done === group.total ? "default" : "outline"}>
                          {group.done}/{group.total}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {group.steps.map((step, stepIndex) => (
                          <div
                            key={`${step.step}-${stepIndex}`}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className={step.late ? "text-red-600 font-medium" : ""}>
                              {stepLabel(step.step)}
                            </span>
                            <span className="text-muted-foreground">
                              {step.done
                                ? step.actualTime ?? "hecho"
                                : step.plannedTime
                                  ? `plan ${step.plannedTime}`
                                  : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ---- calidad del agua ---- */}
            {data.water.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Droplets className="w-5 h-5" />
                    Calidad del agua
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Recinto</th>
                        <th className="py-2 pr-4 font-medium">Transparencia</th>
                        <th className="py-2 pr-4 font-medium">Partículas</th>
                        <th className="py-2 font-medium">Medidas tomadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.water.map((row, index) => (
                        <tr key={`${row.venue}-${index}`} className="border-t align-top">
                          <td className="py-2 pr-4 font-medium whitespace-nowrap">{row.venueName}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {row.transparency === null || row.transparency === undefined
                              ? "—"
                              : `${row.transparency}%`}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            susp. {row.suspendedParticles ?? "—"} · dec.{" "}
                            {row.settledParticles ?? "—"}
                          </td>
                          <td className="py-2 text-muted-foreground">{row.actions || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* ---- traspaso ---- */}
            <Card>
              <CardHeader>
                <CardTitle>Cierre y traspaso</CardTitle>
                <CardDescription>Lo que cada turno dejó escrito.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {data.shifts.map((shift) => (
                  <div key={shift.shift} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{shift.label}</span>
                      <Badge variant={shift.status === "submitted" ? "default" : "outline"}>
                        {shift.status === "submitted" ? "cerrado" : "abierto"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {shift.staffName ?? "sin nombre"} · {shift.tasksDone}/{shift.tasksTotal} tareas
                      {shift.tasksOverdue > 0 && (
                        <span className="text-red-600"> · {shift.tasksOverdue} atrasadas</span>
                      )}
                    </p>
                    <div className="text-sm">
                      <p className="font-medium">Pendientes</p>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {shift.pendingNotes || "—"}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">Traspaso</p>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {shift.handoverNotes || "—"}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
