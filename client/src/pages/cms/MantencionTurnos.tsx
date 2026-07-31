import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { hasMaintenanceAccess } from "@shared/permissions";
import {
  OTHER_DUTIES,
  WATER_VENUES,
  checklistFor,
  poolTaskKey,
  shiftTaskKey,
  type ShiftName,
} from "@shared/maintenanceShiftCatalog";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Lock,
  Thermometer,
  Droplets,
  ArrowRightLeft,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

/** Fecha de hoy en formato YYYY-MM-DD, en hora local. */
function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** El turno de apertura va de 08:00 a 16:00; después empieza el de cierre. */
function currentShift(): ShiftName {
  return new Date().getHours() < 14 ? "apertura" : "cierre";
}

function hhmm(): string {
  return new Date().toTimeString().slice(0, 5);
}

function isMondayIso(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

/** Rondas de temperatura: a primera hora del turno y cada 2 horas. */
function temperatureRounds(shift: ShiftName): string[] {
  return shift === "apertura"
    ? ["08:00", "10:00", "12:00", "14:00"]
    : ["14:00", "16:00", "18:00", "20:00", "22:00"];
}

export default function MantencionTurnos() {
  const { user } = useAuth();
  const [reportDate, setReportDate] = useState(todayIso());
  const [shift, setShift] = useState<ShiftName>(currentShift());
  const [staffName, setStaffName] = useState("");
  const [pendingNotes, setPendingNotes] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");

  const monday = isMondayIso(reportDate);
  // El lunes es día de mantención mayor: solo hay cierre.
  const effectiveShift: ShiftName = monday ? "cierre" : shift;

  const reportQuery = trpc.maintenanceShift.get.useQuery(
    { reportDate, shift: effectiveShift, create: true },
    { enabled: Boolean(user) && hasMaintenanceAccess(user?.role) },
  );
  const handoverQuery = trpc.maintenanceShift.handover.useQuery(
    { reportDate, shift: effectiveShift },
    { enabled: Boolean(user) && hasMaintenanceAccess(user?.role) },
  );

  const report = reportQuery.data;
  const reportId = report?.id;
  const isClosed = report?.status === "submitted";

  const onSaved = () => {
    void reportQuery.refetch();
  };
  const onError = (error: { message: string }) => {
    toast.error(error.message);
  };

  const saveTask = trpc.maintenanceShift.saveTask.useMutation({ onSuccess: onSaved, onError });
  const saveTemperature = trpc.maintenanceShift.saveTemperature.useMutation({ onSuccess: onSaved, onError });
  const saveWaterQuality = trpc.maintenanceShift.saveWaterQuality.useMutation({ onSuccess: onSaved, onError });
  const submitShift = trpc.maintenanceShift.submit.useMutation({
    onSuccess: () => {
      toast.success("Turno cerrado y traspasado");
      onSaved();
    },
    onError,
  });

  const blocks = useMemo(
    () => checklistFor(effectiveShift, monday),
    [effectiveShift, monday],
  );

  const taskState = useMemo(() => {
    const map = new Map<string, { done: boolean; doneAt?: string | null; responsible?: string | null }>();
    for (const task of report?.tasks ?? []) {
      map.set(task.taskKey, {
        done: task.done === 1,
        doneAt: task.doneAt,
        responsible: task.responsible,
      });
    }
    return map;
  }, [report]);

  const temperatureState = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of report?.temperatures ?? []) {
      map.set(`${row.venue}|${row.roundTime}`, row.temperature ?? "");
    }
    return map;
  }, [report]);

  const waterState = useMemo(() => {
    const map = new Map<string, { transparency?: number | null; suspended?: string | null; settled?: string | null }>();
    for (const row of report?.waterQuality ?? []) {
      map.set(row.venue, {
        transparency: row.transparency,
        suspended: row.suspendedParticles,
        settled: row.settledParticles,
      });
    }
    return map;
  }, [report]);

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

  const toggleTask = (
    key: string,
    label: string,
    done: boolean,
    scheduledTime?: string,
    isPool?: boolean,
  ) => {
    if (!reportId || isClosed) return;
    saveTask.mutate({
      reportId,
      taskKey: key,
      label,
      scheduledTime,
      isPool,
      done,
      doneAt: done ? hhmm() : undefined,
      responsible: staffName || undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ClipboardList className="w-6 h-6" />
              Ficha diaria de mantención
            </h1>
            <p className="text-muted-foreground">
              Checklist del turno, temperaturas, calidad del agua y traspaso.
            </p>
          </div>
          {isClosed && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Lock className="w-3 h-3" /> Turno cerrado
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Turno</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                type="date"
                value={reportDate}
                onChange={(event) => setReportDate(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Turno</Label>
              <Select
                value={effectiveShift}
                onValueChange={(value) => setShift(value as ShiftName)}
                disabled={monday}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apertura">Apertura 08:00–16:00</SelectItem>
                  <SelectItem value="cierre">Cierre 14:00–22:00</SelectItem>
                </SelectContent>
              </Select>
              {monday && (
                <p className="text-xs text-muted-foreground">
                  Los lunes solo hay cierre: es el día de mantención mayor.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="responsable">Responsable</Label>
              <Input
                id="responsable"
                placeholder="Quién está de turno"
                value={staffName}
                onChange={(event) => setStaffName(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {handoverQuery.data && (
          <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4" />
                Viene del turno anterior ({handoverQuery.data.fromShift},{" "}
                {handoverQuery.data.fromDate.toLocaleDateString("es-CL")})
              </CardTitle>
              <CardDescription>
                Lo que quedó pendiente y las notas que dejaron.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {handoverQuery.data.handoverNotes && <p>{handoverQuery.data.handoverNotes}</p>}
              {handoverQuery.data.pendingNotes && <p>{handoverQuery.data.pendingNotes}</p>}
              {handoverQuery.data.pendingTasks.length > 0 ? (
                <ul className="list-disc pl-5">
                  {handoverQuery.data.pendingTasks.map((task) => (
                    <li key={task.id}>
                      {task.scheduledTime ? `${task.scheduledTime} · ` : ""}
                      {task.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Sin tareas pendientes.</p>
              )}
            </CardContent>
          </Card>
        )}

        {reportQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando el turno…
          </div>
        ) : (
          <Tabs defaultValue="checklist">
            <TabsList>
              <TabsTrigger value="checklist">Checklist</TabsTrigger>
              <TabsTrigger value="temperaturas">Temperaturas</TabsTrigger>
              <TabsTrigger value="agua">Calidad del agua</TabsTrigger>
              <TabsTrigger value="cierre">Cierre</TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="space-y-4">
              {blocks.map((block) => (
                <Card key={block.time}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{block.time}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {block.tasks.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Bloque sin tareas escritas: queda para anotar.
                      </p>
                    )}
                    {block.tasks.map((task) => {
                      const key = shiftTaskKey(effectiveShift, block.time, task.text);
                      const state = taskState.get(key);
                      return (
                        <div key={key} className="flex items-start gap-3">
                          <Checkbox
                            id={key}
                            checked={state?.done ?? false}
                            disabled={isClosed || !reportId}
                            onCheckedChange={(checked) =>
                              toggleTask(key, task.text, checked === true, block.time)
                            }
                          />
                          <div className="space-y-0.5">
                            <Label htmlFor={key} className="font-normal leading-snug">
                              {task.text}
                            </Label>
                            {task.note && (
                              <p className="text-xs text-muted-foreground">{task.note}</p>
                            )}
                            {state?.done && state.doneAt && (
                              <p className="text-xs text-emerald-700">
                                Hecha a las {state.doneAt}
                                {state.responsible ? ` · ${state.responsible}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Otras labores</CardTitle>
                  <CardDescription>
                    Sin horario fijo. No pasan al traspaso del turno siguiente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {OTHER_DUTIES.map((task) => {
                    const key = poolTaskKey(task.text);
                    const state = taskState.get(key);
                    return (
                      <div key={key} className="flex items-start gap-3">
                        <Checkbox
                          id={key}
                          checked={state?.done ?? false}
                          disabled={isClosed || !reportId}
                          onCheckedChange={(checked) =>
                            toggleTask(key, task.text, checked === true, undefined, true)
                          }
                        />
                        <div className="space-y-0.5">
                          <Label htmlFor={key} className="font-normal leading-snug">
                            {task.text}
                          </Label>
                          {task.note && (
                            <p className="text-xs text-muted-foreground">{task.note}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="temperaturas">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Thermometer className="w-4 h-4" /> Rondas de temperatura
                  </CardTitle>
                  <CardDescription>
                    A primera hora del turno y cada 2 horas. Se marca en rojo lo que sale de rango.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">Recinto</th>
                        {temperatureRounds(effectiveShift).map((round) => (
                          <th key={round} className="py-2 pr-4 font-medium">{round}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {WATER_VENUES.map((venue) => (
                        <tr key={venue.key} className="border-t">
                          <td className="py-2 pr-4">
                            {venue.name}
                            <span className="block text-xs text-muted-foreground">
                              {venue.min}–{venue.max} °C
                            </span>
                          </td>
                          {temperatureRounds(effectiveShift).map((round) => {
                            const current = temperatureState.get(`${venue.key}|${round}`) ?? "";
                            const value = Number(current);
                            const outOfRange =
                              current !== "" && (value < venue.min || value > venue.max);
                            return (
                              <td key={round} className="py-2 pr-4">
                                <Input
                                  className={`w-20 ${outOfRange ? "border-red-500 text-red-600" : ""}`}
                                  inputMode="decimal"
                                  defaultValue={current}
                                  disabled={isClosed || !reportId}
                                  onBlur={(event) => {
                                    const next = event.target.value.trim();
                                    if (!reportId || next === current) return;
                                    saveTemperature.mutate({
                                      reportId,
                                      venue: venue.key,
                                      roundTime: round,
                                      temperature: next || undefined,
                                      inRange: next === "" ? true :
                                        Number(next) >= venue.min && Number(next) <= venue.max,
                                      responsible: staffName || undefined,
                                    });
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="agua" className="space-y-4">
              {WATER_VENUES.map((venue) => {
                const state = waterState.get(venue.key);
                return (
                  <Card key={venue.key}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Droplets className="w-4 h-4" /> {venue.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Transparencia (%)</Label>
                        <Input
                          inputMode="numeric"
                          defaultValue={state?.transparency ?? ""}
                          disabled={isClosed || !reportId}
                          onBlur={(event) => {
                            const raw = event.target.value.trim();
                            if (!reportId) return;
                            saveWaterQuality.mutate({
                              reportId,
                              venue: venue.key,
                              transparency: raw === "" ? undefined : Number(raw),
                              recordedAt: hhmm(),
                              responsible: staffName || undefined,
                            });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Partículas en suspensión</Label>
                        <Select
                          value={state?.suspended ?? undefined}
                          disabled={isClosed || !reportId}
                          onValueChange={(value) => {
                            if (!reportId) return;
                            saveWaterQuality.mutate({
                              reportId,
                              venue: venue.key,
                              suspendedParticles: value as "ausente" | "pocas" | "muchas",
                              recordedAt: hhmm(),
                              // Regla de la administración: en suspensión → pasar el colador.
                              actions: value === "ausente" ? undefined : "Pasar el colador",
                              responsible: staffName || undefined,
                            });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Sin registrar" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ausente">Ausente</SelectItem>
                            <SelectItem value="pocas">Pocas</SelectItem>
                            <SelectItem value="muchas">Muchas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Partículas decantadas</Label>
                        <Select
                          value={state?.settled ?? undefined}
                          disabled={isClosed || !reportId}
                          onValueChange={(value) => {
                            if (!reportId) return;
                            saveWaterQuality.mutate({
                              reportId,
                              venue: venue.key,
                              settledParticles: value as "ausente" | "pocas" | "muchas",
                              recordedAt: hhmm(),
                              // Regla de la administración: decantadas → aspirar la piscina.
                              actions: value === "ausente" ? undefined : "Aspirar la piscina",
                              responsible: staffName || undefined,
                            });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Sin registrar" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ausente">Ausente</SelectItem>
                            <SelectItem value="pocas">Pocas</SelectItem>
                            <SelectItem value="muchas">Muchas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="cierre">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cierre de turno</CardTitle>
                  <CardDescription>
                    Al cerrar, el turno queda en solo lectura y lo pendiente pasa al siguiente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="pendientes">Qué quedó pendiente</Label>
                    <Textarea
                      id="pendientes"
                      rows={3}
                      value={pendingNotes}
                      disabled={isClosed}
                      onChange={(event) => setPendingNotes(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="notas">Notas para el turno siguiente</Label>
                    <Textarea
                      id="notas"
                      rows={3}
                      value={handoverNotes}
                      disabled={isClosed}
                      onChange={(event) => setHandoverNotes(event.target.value)}
                    />
                  </div>
                  <Button
                    disabled={isClosed || !reportId || submitShift.isPending}
                    onClick={() => {
                      if (!reportId) return;
                      submitShift.mutate({
                        id: reportId,
                        pendingNotes: pendingNotes || undefined,
                        handoverNotes: handoverNotes || undefined,
                      });
                    }}
                  >
                    {submitShift.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Completar turno y traspasar
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
