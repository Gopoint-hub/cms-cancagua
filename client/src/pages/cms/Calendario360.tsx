import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Filter,
  ListChecks,
  Plus,
  RefreshCw,
  Rows3,
  UsersRound,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  RESERVATION_360_SERVICE_META as SERVICE_META,
  Reservation360DetailDialog,
  type Reservation360Event,
  type Reservation360ServiceKey,
} from "@/components/cms/Reservation360DetailDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useMobile";
import { UnifiedBookingDialog } from "./UnifiedBookingDialog";

type ViewMode = "day" | "week" | "month";
type DayMode = "list" | "summary" | "services";
type ServiceKey = Reservation360ServiceKey;
type CalendarEvent = Reservation360Event;

const START_HOUR = 8;
const END_HOUR = 22;
const HOUR_HEIGHT = 64;
const GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

function dateKey(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function timeMinutes(value: string) {
  const [hours = 0, minutes = 0] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function eventPosition(event: CalendarEvent) {
  const start = Math.max(START_HOUR * 60, timeMinutes(event.startTime));
  const end = Math.min(END_HOUR * 60, Math.max(start + 30, timeMinutes(event.endTime)));
  return {
    top: ((start - START_HOUR * 60) / 60) * HOUR_HEIGHT,
    height: Math.max(34, ((end - start) / 60) * HOUR_HEIGHT),
  };
}

function layoutColumnEvents(events: CalendarEvent[]) {
  const ordered = [...events].sort((a, b) => timeMinutes(a.startTime) - timeMinutes(b.startTime));
  const result: Array<{ event: CalendarEvent; lane: number; lanes: number }> = [];
  let cluster: CalendarEvent[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const placements = cluster.map(event => {
      const start = timeMinutes(event.startTime);
      const lane = laneEnds.findIndex(end => end <= start);
      const assigned = lane === -1 ? laneEnds.length : lane;
      laneEnds[assigned] = timeMinutes(event.endTime);
      return { event, lane: assigned };
    });
    const lanes = Math.max(1, laneEnds.length);
    result.push(...placements.map(placement => ({ ...placement, lanes })));
    cluster = [];
    clusterEnd = -1;
  };

  for (const event of ordered) {
    const start = timeMinutes(event.startTime);
    if (cluster.length && start >= clusterEnd) flush();
    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, timeMinutes(event.endTime));
  }
  flush();
  return result;
}

function CalendarEventButton({
  event,
  compact = false,
  className,
  style,
  onClick,
}: {
  event: CalendarEvent;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick: () => void;
}) {
  const meta = SERVICE_META[event.service];
  return (
    <button
      type="button"
      onClick={eventClick => {
        eventClick.stopPropagation();
        onClick();
      }}
      style={style}
      className={cn(
        "w-full overflow-hidden rounded-lg border p-2 text-left transition hover:z-20 hover:-translate-y-0.5 hover:shadow-md",
        event.paymentStatus && event.paymentStatus !== "paid"
          ? "border-red-400 bg-red-50 text-red-950 ring-1 ring-red-300"
          : meta.panel,
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
        <span>{event.startTime.slice(0, 5)}</span>
        {!compact && <span className="text-muted-foreground">– {event.endTime.slice(0, 5)}</span>}
      </div>
      <p className={cn("mt-1 font-semibold leading-tight", compact ? "line-clamp-1 text-[11px]" : "text-sm")}>{event.title}</p>
      <p className={cn("mt-1 text-muted-foreground", compact ? "line-clamp-1 text-[10px]" : "text-xs")}>{event.clientName}</p>
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge variant="outline" className="bg-white/75 text-[10px]">{event.status}</Badge>
          {event.paymentStatus && <Badge variant="outline" className={cn("bg-white/75 text-[10px]", event.paymentStatus !== "paid" && "border-red-500 bg-red-100 font-semibold text-red-800")}>{event.paymentStatus === "paid" ? "Pagado" : "Pendiente de pago"}</Badge>}
          {event.people > 1 && <Badge variant="outline" className="bg-white/75 text-[10px]"><UsersRound className="mr-1 h-3 w-3" />{event.people}</Badge>}
        </div>
      )}
    </button>
  );
}

function TimeGrid({
  days,
  events,
  onDay,
  onEvent,
  serviceColumns = false,
  services = [],
}: {
  days: Date[];
  events: CalendarEvent[];
  onDay?: (day: Date) => void;
  onEvent: (event: CalendarEvent) => void;
  serviceColumns?: boolean;
  services?: ServiceKey[];
}) {
  const columns = serviceColumns ? services : days.map(() => null);
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);
  const minWidth = serviceColumns ? Math.max(780, columns.length * 270) : 1050;

  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <div style={{ minWidth }}>
        <div className="sticky top-0 z-30 grid border-b bg-background" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(0, 1fr))` }}>
          <div className="sticky left-0 z-40 border-r bg-background p-3 text-center text-xs text-muted-foreground">Hora</div>
          {columns.map((service, index) => {
            const day = days[index] ?? days[0];
            const meta = service ? SERVICE_META[service] : null;
            return (
              <button
                type="button"
                key={service ?? dateKey(day)}
                onClick={() => !service && onDay?.(day)}
                className={cn("border-r px-2 py-3 text-center transition last:border-r-0", !service && "hover:bg-muted/50")}
              >
                {service ? (
                  <span className="inline-flex items-center gap-2 text-sm font-semibold"><span className={cn("h-2.5 w-2.5 rounded-full", meta!.dot)} />{meta!.label}</span>
                ) : (
                  <>
                    <span className="block text-xs font-medium uppercase text-muted-foreground">{format(day, "EEE", { locale: es })}</span>
                    <span className={cn("mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-base font-semibold", isSameDay(day, new Date()) && "bg-primary text-primary-foreground")}>{format(day, "d")}</span>
                    <span className="mt-1 block text-[10px] text-primary">Ir a vista diaria</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative grid" style={{ height: GRID_HEIGHT, gridTemplateColumns: `64px repeat(${columns.length}, minmax(0, 1fr))` }}>
          <div className="sticky left-0 z-20 border-r bg-background">
            {hours.map(hour => (
              <span key={hour} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}>{String(hour).padStart(2, "0")}:00</span>
            ))}
          </div>
          {columns.map((service, index) => {
            const day = days[index] ?? days[0];
            const columnEvents = layoutColumnEvents(events.filter(event => event.date === dateKey(day) && (!service || event.service === service)));
            return (
              <div key={service ?? dateKey(day)} className="relative border-r last:border-r-0">
                {hours.map(hour => <div key={hour} className="absolute inset-x-0 border-t border-dashed" style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }} />)}
                {columnEvents.map(({ event, lane, lanes }) => {
                  const position = eventPosition(event);
                  const width = 100 / lanes;
                  return <CalendarEventButton key={event.id} event={event} compact onClick={() => onEvent(event)} className="absolute px-1" style={{ top: position.top + 2, height: position.height - 4, left: `calc(${lane * width}% + 2px)`, width: `calc(${width}% - 4px)` }} />;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Calendario360() {
  const isMobile = useIsMobile();
  const mobileViewInitialized = useRef(false);
  const [view, setView] = useState<ViewMode>("week");
  const [dayMode, setDayMode] = useState<DayMode>("list");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [services, setServices] = useState<ServiceKey[]>([]);
  const [search, setSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const { data: access } = trpc.operations360.access.useQuery();
  // El filtro de arriba solo recorta lo que ya está en pantalla. Esta búsqueda va
  // contra TODAS las reservas, que es lo que se necesita cuando alguien llega
  // con un código o un nombre y no se sabe la fecha.
  const termino = search.trim();
  // La búsqueda recorre TODAS las reservas, así que no puede salir en cada tecla:
  // se espera a que dejen de escribir. Y no se reintenta, porque un error se
  // convertía en cuatro peticiones por pulsación.
  const [terminoBuscado, setTerminoBuscado] = useState(termino);
  useEffect(() => {
    const id = setTimeout(() => setTerminoBuscado(termino), 400);
    return () => clearTimeout(id);
  }, [termino]);
  const busqueda = trpc.operations360.buscar.useQuery(
    { termino: terminoBuscado },
    { enabled: terminoBuscado.length >= 3, staleTime: 15_000, retry: false }
  );

  useEffect(() => {
    if (isMobile && !mobileViewInitialized.current) {
      mobileViewInitialized.current = true;
      setView("day");
      setDayMode("list");
    }
  }, [isMobile]);

  const range = useMemo(() => {
    if (view === "day") return { from: selectedDate, to: selectedDate };
    if (view === "week") return { from: startOfWeek(selectedDate, { weekStartsOn: 1 }), to: endOfWeek(selectedDate, { weekStartsOn: 1 }) };
    return { from: startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 1 }) };
  }, [selectedDate, view]);

  const calendar = trpc.operations360.calendar.useQuery(
    {
      from: dateKey(range.from),
      to: dateKey(range.to),
      services: services.length ? services : undefined,
    },
    {
      refetchInterval: 30_000,
      refetchIntervalInBackground: true,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    }
  );
  const events = (calendar.data ?? []) as CalendarEvent[];
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return events.filter(event => !needle || [event.title, event.clientName].some(value => String(value ?? "").toLocaleLowerCase().includes(needle)));
  }, [events, search]);
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  const dayEvents = filtered.filter(event => event.date === dateKey(selectedDate));
  const allowedServices = (access?.calendarServices ?? []) as ServiceKey[];
  const manualBookingServices = (access?.manualBookingServices ?? []) as ServiceKey[];
  const canCreateReservation = manualBookingServices.length > 0;

  const move = (direction: -1 | 1) => {
    if (view === "day") setSelectedDate(current => direction < 0 ? subDays(current, 1) : addDays(current, 1));
    else if (view === "week") setSelectedDate(current => direction < 0 ? subWeeks(current, 1) : addWeeks(current, 1));
    else setSelectedDate(current => direction < 0 ? subMonths(current, 1) : addMonths(current, 1));
  };
  const title = view === "day" ? format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es }) : view === "week" ? `${format(range.from, "d MMM", { locale: es })} – ${format(range.to, "d MMM yyyy", { locale: es })}` : format(selectedDate, "MMMM yyyy", { locale: es });
  const openDay = (day: Date) => { setSelectedDate(day); setView("day"); setDayMode("list"); };
  const toggleService = (service: ServiceKey) => setServices(current => current.includes(service) ? current.filter(item => item !== service) : [...current, service]);

  return (
    <DashboardLayout>
      <div className="space-y-5 p-2 sm:p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Operación integrada</p><h1 className="mt-1 text-3xl font-semibold">Calendario 360</h1><p className="mt-1 text-sm text-muted-foreground">El zoom completo de todas las reservas y actividades de Cancagua.</p></div>
          <div className="grid w-full grid-cols-3 rounded-lg border bg-background p-1 sm:flex sm:w-auto">{(["day", "week", "month"] as ViewMode[]).map(mode => <Button key={mode} size="sm" variant={view === mode ? "default" : "ghost"} onClick={() => setView(mode)}>{mode === "day" ? "Día" : mode === "week" ? "Semana" : "Mes"}</Button>)}</div>
        </div>

        <Card><CardContent className="space-y-4 p-3 sm:p-4"><div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center"><h2 className="order-first min-w-0 text-center text-lg font-semibold capitalize sm:order-none sm:min-w-56 sm:flex-1">{title}</h2><div className="grid grid-cols-[auto_1fr_auto] gap-2 sm:flex"><Button variant="outline" size="icon" aria-label="Periodo anterior" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button><Button className="w-full sm:w-auto" variant="outline" onClick={() => setSelectedDate(new Date())}>Hoy</Button><Button variant="outline" size="icon" aria-label="Periodo siguiente" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button></div>{view === "day" && <Select value={dayMode} onValueChange={value => value === "week" ? setView("week") : setDayMode(value as DayMode)}><SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="week">Volver a la semana</SelectItem><SelectItem value="list">Lista del día</SelectItem><SelectItem value="summary">Resumen del día</SelectItem><SelectItem value="services">Agendas por servicio</SelectItem></SelectContent></Select>}<Input className="w-full sm:w-60" placeholder="Buscar por código, nombre o correo…" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto border-t px-1 pt-3 pb-1"><Filter className="h-4 w-4 shrink-0 text-muted-foreground" /><Button className="shrink-0" size="sm" variant={!services.length ? "default" : "outline"} onClick={() => setServices([])}>Todos</Button>{allowedServices.map(key => <Button key={key} size="sm" variant={services.includes(key) ? "default" : "outline"} onClick={() => toggleService(key)} className="shrink-0 gap-2"><span className={cn("h-2 w-2 rounded-full", SERVICE_META[key].dot)} />{SERVICE_META[key].label}</Button>)}</div></CardContent></Card>

        {termino.length >= 3 && (
          <Card>
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  Resultados en todas las fechas
                  {busqueda.data ? ` · ${busqueda.data.total}` : ""}
                </h3>
                <Button size="sm" variant="ghost" onClick={() => setSearch("")}>Limpiar</Button>
              </div>
              {(busqueda.isFetching || termino !== terminoBuscado) && <p className="text-sm text-muted-foreground">Buscando…</p>}
              {!busqueda.isFetching && busqueda.data?.aproximada && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  No hay ninguna reserva escrita exactamente así. Estos son los nombres
                  <strong> parecidos</strong> a “{termino}”.
                </p>
              )}
              {!busqueda.isFetching && busqueda.data?.sinPermisos && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Tu cuenta no tiene permiso para ver información de clientes, así que
                  la búsqueda no puede revisar las reservas. Pídeselo a un administrador.
                </p>
              )}
              {!busqueda.isFetching && !busqueda.data?.sinPermisos && busqueda.data?.total === 0 && (
                <p className="text-sm text-muted-foreground">
                  Sin resultados para “{termino}”. Prueba con el correo, que es lo que menos se escribe mal.
                </p>
              )}
              {!busqueda.isFetching && !!busqueda.data?.resultados?.length && (
                <div className="-mx-1 overflow-x-auto px-1">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="pb-2 pr-3">Fecha</th>
                        <th className="pb-2 pr-3">Servicio</th>
                        <th className="pb-2 pr-3">Cliente</th>
                        <th className="pb-2 pr-3">Contacto</th>
                        <th className="pb-2 pr-3">Código</th>
                        <th className="pb-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {busqueda.data.resultados.map((fila: any) => (
                        <tr
                          key={fila.id}
                          className="cursor-pointer border-t hover:bg-accent/50"
                          onClick={() => {
                            const [anio, mes, dia] = String(fila.date).split("-").map(Number);
                            if (anio && mes && dia) {
                              setSelectedDate(new Date(anio, mes - 1, dia));
                              setView("day");
                              setDayMode("list");
                            }
                          }}
                        >
                          <td className="py-2 pr-3 whitespace-nowrap">{fila.date}{fila.startTime ? ` · ${fila.startTime}` : ""}</td>
                          <td className="py-2 pr-3">{fila.title}</td>
                          <td className="py-2 pr-3">{fila.clientName || "—"}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{fila.clientEmail || fila.clientPhone || "—"}</td>
                          <td className="py-2 pr-3 font-mono text-xs">{fila.bookingCode || "—"}</td>
                          <td className="py-2">{fila.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {busqueda.data.total > busqueda.data.resultados.length && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Mostrando {busqueda.data.resultados.length} de {busqueda.data.total}. Afina la búsqueda para ver el resto.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {calendar.isLoading ? <Skeleton className="h-[54rem] w-full" /> : view === "week" ? (
          <TimeGrid days={days} events={filtered} onDay={openDay} onEvent={setSelectedEvent} />
        ) : view === "month" ? (
          <div className="overflow-x-auto rounded-xl border"><div className="grid min-w-[760px] grid-cols-7 gap-px bg-border">{days.map(day => { const dateEvents = filtered.filter(event => event.date === dateKey(day)); return <button type="button" key={dateKey(day)} onClick={() => openDay(day)} className={cn("min-h-32 bg-background p-2 text-left hover:bg-muted/50", !isSameMonth(day, selectedDate) && "bg-muted/40 text-muted-foreground")}><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium capitalize">{format(day, "EEE d", { locale: es })}</span>{isSameDay(day, new Date()) && <span className="h-2 w-2 rounded-full bg-primary" />}</div><div className="space-y-1">{dateEvents.slice(0, 3).map(event => <CalendarEventButton key={event.id} event={event} compact onClick={() => setSelectedEvent(event)} />)}{dateEvents.length > 3 && <p className="text-xs font-medium text-primary">+{dateEvents.length - 3} más</p>}</div></button>; })}</div></div>
        ) : dayMode === "services" ? (
          <TimeGrid days={[selectedDate]} events={dayEvents} services={allowedServices} serviceColumns onEvent={setSelectedEvent} />
        ) : dayMode === "summary" ? (
          <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card><CardContent className="p-5"><CalendarDays className="h-5 w-5 text-primary" /><p className="mt-3 text-3xl font-semibold">{dayEvents.length}</p><p className="text-sm text-muted-foreground">Reservas y actividades</p></CardContent></Card><Card><CardContent className="p-5"><UsersRound className="h-5 w-5 text-primary" /><p className="mt-3 text-3xl font-semibold">{dayEvents.reduce((sum, event) => sum + event.people, 0)}</p><p className="text-sm text-muted-foreground">Personas registradas</p></CardContent></Card><Card><CardContent className="p-5"><CircleDollarSign className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-3xl font-semibold">{dayEvents.filter(event => event.paymentStatus === "paid").length}</p><p className="text-sm text-muted-foreground">Reservas pagadas</p></CardContent></Card><Card><CardContent className="p-5"><Rows3 className="h-5 w-5 text-primary" /><p className="mt-3 text-3xl font-semibold">{new Set(dayEvents.map(event => event.service)).size}</p><p className="text-sm text-muted-foreground">Servicios activos</p></CardContent></Card></div><div className="grid gap-3 lg:grid-cols-4">{allowedServices.map(service => { const serviceEvents = dayEvents.filter(event => event.service === service); return <Card key={service}><CardContent className="p-4"><div className="mb-3 flex items-center justify-between"><p className="flex items-center gap-2 font-semibold"><span className={cn("h-2.5 w-2.5 rounded-full", SERVICE_META[service].dot)} />{SERVICE_META[service].label}</p><Badge variant="secondary">{serviceEvents.length}</Badge></div><div className="space-y-2">{serviceEvents.length ? serviceEvents.map(event => <CalendarEventButton key={event.id} event={event} onClick={() => setSelectedEvent(event)} />) : <p className="py-6 text-center text-sm text-muted-foreground">Sin actividades</p>}</div></CardContent></Card>; })}</div></div>
        ) : dayEvents.length ? (
          <div className="space-y-3">{dayEvents.map(event => <CalendarEventButton key={event.id} event={event} onClick={() => setSelectedEvent(event)} />)}</div>
        ) : <Card><CardContent className="py-16 text-center text-muted-foreground"><Clock3 className="mx-auto mb-3 h-8 w-8" />No hay actividades para este día.</CardContent></Card>}

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><ListChecks className="h-4 w-4" />Haz clic en un día para abrir la vista diaria y en cualquier reserva para revisar su pago y actividad.</span>
          <span className="flex items-center gap-2"><RefreshCw className={cn("h-3.5 w-3.5", calendar.isFetching && "animate-spin")} />Actualización automática cada 30 segundos</span>
        </div>
      </div>
      <Reservation360DetailDialog event={selectedEvent} open={Boolean(selectedEvent)} onOpenChange={open => !open && setSelectedEvent(null)} />
      {canCreateReservation && <Button aria-label="Crear nueva reserva" title="Crear nueva reserva" className="cms-mobile-fab fixed right-4 bottom-4 z-40 h-14 w-14 rounded-full shadow-xl sm:right-6 sm:bottom-6" onClick={() => setBookingOpen(true)}><Plus className="h-6 w-6" /></Button>}
      <UnifiedBookingDialog open={bookingOpen} onOpenChange={setBookingOpen} initialDate={dateKey(selectedDate)} allowedServices={manualBookingServices} onCreated={async () => { await calendar.refetch(); }} />
    </DashboardLayout>
  );
}
