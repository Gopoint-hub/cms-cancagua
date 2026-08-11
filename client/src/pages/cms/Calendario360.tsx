import { useMemo, useState } from "react";
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
  ExternalLink,
  Filter,
  ListChecks,
  Mail,
  Phone,
  Rows3,
  UsersRound,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type ViewMode = "day" | "week" | "month";
type DayMode = "list" | "summary" | "services";
type ServiceKey = "massages" | "biopools" | "regular_classes";
type EventKind = "massage" | "massage_program" | "biopool" | "biopool_skedu" | "regular_class" | "regular_class_schedule";

type CalendarEvent = {
  id: string;
  entityId: number | string;
  kind: EventKind;
  service: ServiceKey;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  clientName: string;
  status: string;
  paymentStatus: string | null;
  people: number;
  href: string;
};

const SERVICE_META: Record<ServiceKey, { label: string; dot: string; panel: string; solid: string }> = {
  massages: {
    label: "Masajes",
    dot: "bg-rose-500",
    panel: "border-rose-200 bg-rose-50/90",
    solid: "bg-rose-500",
  },
  biopools: {
    label: "Biopiscinas",
    dot: "bg-cyan-600",
    panel: "border-cyan-200 bg-cyan-50/90",
    solid: "bg-cyan-600",
  },
  regular_classes: {
    label: "Clases regulares",
    dot: "bg-sky-700",
    panel: "border-sky-200 bg-sky-50/90",
    solid: "bg-sky-700",
  },
};

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

function paymentLabel(value?: string | null) {
  const labels: Record<string, string> = {
    paid: "Pagado",
    pending: "Pendiente",
    refunded: "Reembolsado",
    transbank: "Transbank Webpay",
    webpay: "Transbank Webpay",
    getnet: "Getnet",
    getnet_link: "Link de pago Getnet",
    getnet_pos: "Máquina Getnet",
    bank_transfer: "Transferencia",
    transfer: "Transferencia",
    cash: "Efectivo",
    gift_card: "Gift card",
  };
  return value ? labels[value] ?? value.replaceAll("_", " ") : "Sin registrar";
}

function money(value?: number | null) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })
    .format(value ?? 0);
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
        meta.panel,
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
          {event.paymentStatus && <Badge variant="outline" className="bg-white/75 text-[10px]">{paymentLabel(event.paymentStatus)}</Badge>}
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
          <div className="border-r p-3 text-center text-xs text-muted-foreground">Hora</div>
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
          <div className="relative border-r bg-muted/10">
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

function ReservationDetail({ event, open, onOpenChange }: { event: CalendarEvent | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const detailInput = event?.kind === "biopool_skedu"
    ? { kind: "biopool_skedu" as const, entityId: String(event.entityId), date: event.date }
    : {
        kind: (event?.kind ?? "biopool") as Exclude<EventKind, "biopool_skedu">,
        entityId: Number(event?.entityId ?? 1),
        date: event?.date ?? dateKey(new Date()),
      };
  const query = trpc.operations360.detail.useQuery(
    detailInput,
    { enabled: open && Boolean(event) }
  );
  const detail = query.data;
  const meta = event ? SERVICE_META[event.service] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            {meta && <Badge className={cn("border-0 text-white", meta.solid)}>{meta.label}</Badge>}
            {detail && <Badge variant="outline">{detail.status}</Badge>}
          </div>
          <DialogTitle className="text-xl">{event?.title ?? "Detalle de reserva"}</DialogTitle>
          <DialogDescription>Información centralizada de la reserva, pago y actividad.</DialogDescription>
        </DialogHeader>
        {query.isLoading ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-44" /></div> : query.error ? (
          <p className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">No se pudo cargar el detalle: {query.error.message}</p>
        ) : detail ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Fecha y hora</p><p className="mt-1 font-semibold capitalize">{format(new Date(`${detail.schedule.date}T12:00:00`), "EEE d MMM", { locale: es })}</p><p className="text-sm">{detail.schedule.startTime.slice(0, 5)} – {detail.schedule.endTime.slice(0, 5)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Cliente / responsable</p><p className="mt-1 font-semibold">{detail.client.name}</p><p className="text-xs text-muted-foreground">{detail.detail}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Estado de pago</p><p className="mt-1 font-semibold">{detail.payment ? paymentLabel(detail.payment.status) : "No corresponde"}</p><p className="text-sm text-muted-foreground">{detail.payment ? money(detail.payment.amountClp) : "Clase programada"}</p></CardContent></Card>
            </div>
            <Tabs defaultValue="general">
              <TabsList className="grid h-auto w-full grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="payments">Pagos</TabsTrigger>
                <TabsTrigger value="activity">Actividad</TabsTrigger>
              </TabsList>
              <TabsContent value="general" className="rounded-xl border p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><p className="text-xs font-medium uppercase text-muted-foreground">Cliente</p><p className="mt-1 font-semibold">{detail.client.name}</p>{detail.client.email && <p className="mt-2 flex items-center gap-2 text-sm"><Mail className="h-4 w-4" />{detail.client.email}</p>}{detail.client.phone && <p className="mt-2 flex items-center gap-2 text-sm"><Phone className="h-4 w-4" />{detail.client.phone}</p>}</div>
                  <div><p className="text-xs font-medium uppercase text-muted-foreground">Detalle operativo</p><p className="mt-1 text-sm">{detail.detail || "Sin detalle adicional"}</p>{detail.notes && <><p className="mt-4 text-xs font-medium uppercase text-muted-foreground">Notas</p><p className="mt-1 whitespace-pre-wrap text-sm">{detail.notes}</p></>}</div>
                </div>
              </TabsContent>
              <TabsContent value="payments" className="rounded-xl border p-4">
                {detail.payment ? <div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Método</p><p className="font-semibold">{paymentLabel(detail.payment.method)}</p></div><div><p className="text-xs text-muted-foreground">Monto</p><p className="font-semibold text-emerald-700">{money(detail.payment.amountClp)}</p></div><div><p className="text-xs text-muted-foreground">Estado</p><p className="font-semibold">{paymentLabel(detail.payment.status)}</p></div><div><p className="text-xs text-muted-foreground">Referencia</p><p className="break-all text-sm">{detail.payment.reference || "Sin referencia"}</p></div>{detail.payment.refundAmountClp ? <div><p className="text-xs text-muted-foreground">Reembolso</p><p className="font-semibold">{money(detail.payment.refundAmountClp)}</p></div> : null}</div> : <p className="py-6 text-center text-sm text-muted-foreground">Esta actividad no registra un pago individual.</p>}
              </TabsContent>
              <TabsContent value="activity" className="rounded-xl border p-4">
                {detail.activity.length ? <div className="space-y-4">{detail.activity.map(item => <div key={item.id} className="relative border-l-2 border-primary/30 pl-4"><span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary" /><p className="font-medium">{item.label}</p>{item.detail && <p className="text-sm text-muted-foreground">{item.detail}</p>}<p className="mt-1 text-xs text-muted-foreground">{item.at ? new Date(item.at).toLocaleString("es-CL") : "Sin fecha"}</p></div>)}</div> : <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay actividad adicional registrada.</p>}
              </TabsContent>
            </Tabs>
            {detail.href && <div className="flex justify-end"><Button asChild><a href={detail.href}>Abrir agenda del módulo <ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function Calendario360() {
  const [view, setView] = useState<ViewMode>("week");
  const [dayMode, setDayMode] = useState<DayMode>("list");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [services, setServices] = useState<ServiceKey[]>([]);
  const [search, setSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const { data: access } = trpc.operations360.access.useQuery();

  const range = useMemo(() => {
    if (view === "day") return { from: selectedDate, to: selectedDate };
    if (view === "week") return { from: startOfWeek(selectedDate, { weekStartsOn: 1 }), to: endOfWeek(selectedDate, { weekStartsOn: 1 }) };
    return { from: startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 1 }) };
  }, [selectedDate, view]);

  const calendar = trpc.operations360.calendar.useQuery({ from: dateKey(range.from), to: dateKey(range.to), services: services.length ? services : undefined });
  const events = (calendar.data ?? []) as CalendarEvent[];
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return events.filter(event => !needle || [event.title, event.clientName].some(value => String(value ?? "").toLocaleLowerCase().includes(needle)));
  }, [events, search]);
  const days = eachDayOfInterval({ start: range.from, end: range.to });
  const dayEvents = filtered.filter(event => event.date === dateKey(selectedDate));
  const allowedServices = (access?.calendarServices ?? []) as ServiceKey[];

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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Operación integrada</p><h1 className="mt-1 text-3xl font-semibold">Calendario 360</h1><p className="mt-1 text-sm text-muted-foreground">El zoom completo de todas las reservas y actividades de Cancagua.</p></div>
          <div className="flex rounded-lg border bg-background p-1">{(["day", "week", "month"] as ViewMode[]).map(mode => <Button key={mode} size="sm" variant={view === mode ? "default" : "ghost"} onClick={() => setView(mode)}>{mode === "day" ? "Día" : mode === "week" ? "Semana" : "Mes"}</Button>)}</div>
        </div>

        <Card><CardContent className="space-y-4 p-4"><div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="icon" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" onClick={() => setSelectedDate(new Date())}>Hoy</Button><Button variant="outline" size="icon" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button><h2 className="min-w-56 flex-1 text-center text-lg font-semibold capitalize">{title}</h2>{view === "day" && <Select value={dayMode} onValueChange={value => value === "week" ? setView("week") : setDayMode(value as DayMode)}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="week">Volver a la semana</SelectItem><SelectItem value="list">Lista del día</SelectItem><SelectItem value="summary">Resumen del día</SelectItem><SelectItem value="services">Agendas por servicio</SelectItem></SelectContent></Select>}<Input className="w-full sm:w-60" placeholder="Buscar cliente o servicio…" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="flex flex-wrap items-center gap-2 border-t pt-3"><Filter className="h-4 w-4 text-muted-foreground" /><Button size="sm" variant={!services.length ? "default" : "outline"} onClick={() => setServices([])}>Todos</Button>{allowedServices.map(key => <Button key={key} size="sm" variant={services.includes(key) ? "default" : "outline"} onClick={() => toggleService(key)} className="gap-2"><span className={cn("h-2 w-2 rounded-full", SERVICE_META[key].dot)} />{SERVICE_META[key].label}</Button>)}</div></CardContent></Card>

        {calendar.isLoading ? <Skeleton className="h-[54rem] w-full" /> : view === "week" ? (
          <TimeGrid days={days} events={filtered} onDay={openDay} onEvent={setSelectedEvent} />
        ) : view === "month" ? (
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border">{days.map(day => { const dateEvents = filtered.filter(event => event.date === dateKey(day)); return <button type="button" key={dateKey(day)} onClick={() => openDay(day)} className={cn("min-h-32 bg-background p-2 text-left hover:bg-muted/50", !isSameMonth(day, selectedDate) && "bg-muted/40 text-muted-foreground")}><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium capitalize">{format(day, "EEE d", { locale: es })}</span>{isSameDay(day, new Date()) && <span className="h-2 w-2 rounded-full bg-primary" />}</div><div className="space-y-1">{dateEvents.slice(0, 3).map(event => <CalendarEventButton key={event.id} event={event} compact onClick={() => setSelectedEvent(event)} />)}{dateEvents.length > 3 && <p className="text-xs font-medium text-primary">+{dateEvents.length - 3} más</p>}</div></button>; })}</div>
        ) : dayMode === "services" ? (
          <TimeGrid days={[selectedDate]} events={dayEvents} services={allowedServices} serviceColumns onEvent={setSelectedEvent} />
        ) : dayMode === "summary" ? (
          <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card><CardContent className="p-5"><CalendarDays className="h-5 w-5 text-primary" /><p className="mt-3 text-3xl font-semibold">{dayEvents.length}</p><p className="text-sm text-muted-foreground">Reservas y actividades</p></CardContent></Card><Card><CardContent className="p-5"><UsersRound className="h-5 w-5 text-primary" /><p className="mt-3 text-3xl font-semibold">{dayEvents.reduce((sum, event) => sum + event.people, 0)}</p><p className="text-sm text-muted-foreground">Personas registradas</p></CardContent></Card><Card><CardContent className="p-5"><CircleDollarSign className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-3xl font-semibold">{dayEvents.filter(event => event.paymentStatus === "paid").length}</p><p className="text-sm text-muted-foreground">Reservas pagadas</p></CardContent></Card><Card><CardContent className="p-5"><Rows3 className="h-5 w-5 text-primary" /><p className="mt-3 text-3xl font-semibold">{new Set(dayEvents.map(event => event.service)).size}</p><p className="text-sm text-muted-foreground">Servicios activos</p></CardContent></Card></div><div className="grid gap-3 lg:grid-cols-3">{allowedServices.map(service => { const serviceEvents = dayEvents.filter(event => event.service === service); return <Card key={service}><CardContent className="p-4"><div className="mb-3 flex items-center justify-between"><p className="flex items-center gap-2 font-semibold"><span className={cn("h-2.5 w-2.5 rounded-full", SERVICE_META[service].dot)} />{SERVICE_META[service].label}</p><Badge variant="secondary">{serviceEvents.length}</Badge></div><div className="space-y-2">{serviceEvents.length ? serviceEvents.map(event => <CalendarEventButton key={event.id} event={event} onClick={() => setSelectedEvent(event)} />) : <p className="py-6 text-center text-sm text-muted-foreground">Sin actividades</p>}</div></CardContent></Card>; })}</div></div>
        ) : dayEvents.length ? (
          <div className="space-y-3">{dayEvents.map(event => <CalendarEventButton key={event.id} event={event} onClick={() => setSelectedEvent(event)} />)}</div>
        ) : <Card><CardContent className="py-16 text-center text-muted-foreground"><Clock3 className="mx-auto mb-3 h-8 w-8" />No hay actividades para este día.</CardContent></Card>}

        <div className="flex items-center gap-2 text-xs text-muted-foreground"><ListChecks className="h-4 w-4" />Haz clic en un día para abrir la vista diaria y en cualquier reserva para revisar su pago y actividad.</div>
      </div>
      <ReservationDetail event={selectedEvent} open={Boolean(selectedEvent)} onOpenChange={open => !open && setSelectedEvent(null)} />
    </DashboardLayout>
  );
}
