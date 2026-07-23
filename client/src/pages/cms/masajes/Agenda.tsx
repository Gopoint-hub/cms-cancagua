import { useState } from "react";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Edit } from "lucide-react";
import {
  format, addDays, subDays, parseISO, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths,
  eachDayOfInterval, isSameDay, isSameMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import SkeduProgramBookingDialog from "./SkeduProgramBookingDialog";
import SkeduTherapistAssignmentDialog from "./SkeduTherapistAssignmentDialog";
import MassageCancellationDialog, {
  getMassageCancellationLabel,
  type MassageCancellationCategory,
} from "./MassageCancellationDialog";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente", confirmed: "Confirmada", completed: "Completada",
  cancelled: "Cancelada", no_show: "No llegó",
};
const STATUS_VARIANTS: Record<string, any> = {
  pending: "secondary", confirmed: "default", completed: "outline",
  cancelled: "destructive", no_show: "destructive",
};
const DURATIONS = [50, 80, 110];

type ViewMode = "day" | "week" | "month";

type BookingForm = {
  clientName: string; clientEmail: string; clientPhone: string; clientOrigin: string;
  techniqueId: string; therapistId: string; roomId: string;
  duration: number; bookingDate: string; startTime: string; endTime: string;
  paymentStatus: "pending" | "paid"; amountPaid: string;
  discountCode: string; notes: string;
};

const emptyForm = (date: string): BookingForm => ({
  clientName: "", clientEmail: "", clientPhone: "", clientOrigin: "",
  techniqueId: "", therapistId: "", roomId: "",
  duration: 50, bookingDate: date, startTime: "10:00", endTime: "10:50",
  paymentStatus: "pending", amountPaid: "", discountCode: "", notes: "",
});

function calcEndTime(start: string, duration: number): string {
  const [h, m] = start.split(":").map(Number);
  const totalMin = h * 60 + m + duration;
  return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
}

// ─── Tarjeta individual de reserva ────────────────────────────────────────────
function BookingCard({ b, onEdit, onStatus, onCancel }: {
  b: any;
  onEdit: (b: any) => void;
  onStatus: (id: number, status: string, bookingKind: string) => void;
  onCancel: (b: any) => void;
}) {
  return (
    <Card className={b.status === "cancelled" ? "border-red-200 bg-red-50/20" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-lg">{b.startTime}</span>
              <span className="text-muted-foreground">–</span>
              <span className="text-muted-foreground">{b.endTime}</span>
              <Badge variant={STATUS_VARIANTS[b.status]}>{STATUS_LABELS[b.status]}</Badge>
              {b.bookingKind === "skedu_program" && (
                <Badge variant="outline" className="border-violet-400 text-violet-700 bg-violet-50">
                  Skedu · {b.modality === "double" ? "Doble" : "Simple"}
                </Badge>
              )}
              {b.paymentStatus === "paid" && (
                <Badge variant="outline" className="text-green-600 border-green-600">Pagado</Badge>
              )}
            </div>
            <p className="font-medium mt-1">{b.clientName}</p>
            <p className="text-sm text-muted-foreground">
              {b.techniqueName} · {b.duration} min · {b.roomName}
              {b.therapistName && ` · ${b.therapistName}`}
              {b.secondTherapistName && ` + ${b.secondTherapistName}`}
            </p>
            {b.externalReference && <p className="text-xs text-muted-foreground mt-1">Ref. Skedu: {b.externalReference}</p>}
            {b.amountPaid && (
              <p className="text-sm text-green-600 mt-1">$ {Number(b.amountPaid).toLocaleString("es-CL")}</p>
            )}
            {b.status === "cancelled" && b.cancellationReason && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <p className="font-semibold">{getMassageCancellationLabel(b.cancellationCategory)}</p>
                <p className="mt-0.5 whitespace-pre-wrap">{b.cancellationReason}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            {b.status === "pending" && (
              <Button size="sm" variant="outline" onClick={() => onStatus(b.id, "confirmed", b.bookingKind)}>Confirmar</Button>
            )}
            {b.bookingKind === "skedu_program" ? (
              <>
                {b.status !== "cancelled" && (
                  <Button size="sm" variant="outline" onClick={() => onEdit(b)} title="Editar terapeutas asignados">
                    <Edit className="mr-1.5 h-4 w-4" />
                    Terapeutas
                  </Button>
                )}
                {b.status === "confirmed" && (
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onCancel(b)}>
                    Cancelar
                  </Button>
                )}
              </>
            ) : (
              <>
                {b.status !== "cancelled" && (
                  <Button size="sm" variant="ghost" onClick={() => onEdit(b)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
                {(b.status === "pending" || b.status === "confirmed") && (
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onCancel(b)}>
                    Cancelar
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Vista Día ─────────────────────────────────────────────────────────────────
function DayView({ bookings, isLoading, onEdit, onStatus, onCancel }: {
  bookings: any[] | undefined;
  isLoading: boolean;
  onEdit: (b: any) => void;
  onStatus: (id: number, status: string, bookingKind: string) => void;
  onCancel: (b: any) => void;
}) {
  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  if (!bookings || bookings.length === 0) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">Sin reservas para este día</CardContent></Card>;
  }
  return (
    <div className="space-y-3">
      {bookings.map(b => (
        <BookingCard key={`${b.bookingKind}-${b.id}`} b={b} onEdit={onEdit} onStatus={onStatus} onCancel={onCancel} />
      ))}
    </div>
  );
}

// ─── Vista Semana ──────────────────────────────────────────────────────────────
function WeekView({ bookings, isLoading, weekStart, onDayClick, onEdit, onStatus, onCancel }: {
  bookings: any[] | undefined;
  isLoading: boolean;
  weekStart: Date;
  onDayClick: (date: string) => void;
  onEdit: (b: any) => void;
  onStatus: (id: number, status: string, bookingKind: string) => void;
  onCancel: (b: any) => void;
}) {
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { locale: es }) });

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      {days.map(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayBookings = (bookings ?? []).filter(b => b.bookingDate === dateStr);
        const isToday = isSameDay(day, new Date());
        return (
          <div key={dateStr}>
            <div
              className={`flex items-center gap-2 mb-2 cursor-pointer group`}
              onClick={() => onDayClick(dateStr)}
            >
              <span className={`text-sm font-semibold capitalize ${isToday ? "text-teal-600" : "text-foreground"}`}>
                {format(day, "EEEE d 'de' MMMM", { locale: es })}
              </span>
              {dayBookings.length > 0 && (
                <Badge variant="secondary" className="text-xs">{dayBookings.length} reserva{dayBookings.length !== 1 ? "s" : ""}</Badge>
              )}
            </div>
            {dayBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-2 pb-2">Sin reservas</p>
            ) : (
              <div className="space-y-2 pl-1">
                {dayBookings.map(b => (
                  <BookingCard key={`${b.bookingKind}-${b.id}`} b={b} onEdit={onEdit} onStatus={onStatus} onCancel={onCancel} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Vista Mes ─────────────────────────────────────────────────────────────────
function MonthView({ bookings, isLoading, monthDate, onDayClick }: {
  bookings: any[] | undefined;
  isLoading: boolean;
  monthDate: Date;
  onDayClick: (date: string) => void;
}) {
  if (isLoading) return <div className="grid grid-cols-7 gap-1">{Array(35).fill(0).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;

  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const calStart = startOfWeek(monthStart, { locale: es });
  const calEnd = endOfWeek(monthEnd, { locale: es });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const dayNames = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const count = (bookings ?? []).filter(b => b.bookingDate === dateStr).length;
          const isCurrentMonth = isSameMonth(day, monthDate);
          const isToday = isSameDay(day, new Date());
          const revenue = (bookings ?? [])
            .filter(b => b.bookingDate === dateStr && b.paymentStatus === "paid" && b.status !== "cancelled")
            .reduce((sum: number, b: any) => sum + Number(b.amountPaid ?? 0), 0);

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={`relative min-h-[64px] rounded-lg border p-1.5 text-left transition-colors hover:bg-accent ${
                isCurrentMonth ? "bg-background" : "bg-muted/30 text-muted-foreground"
              } ${isToday ? "border-teal-500 border-2" : "border-border"}`}
            >
              <span className={`text-xs font-medium ${isToday ? "text-teal-600" : ""}`}>
                {format(day, "d")}
              </span>
              {count > 0 && (
                <div className="mt-1 space-y-0.5">
                  <div className={`text-xs font-semibold ${count > 0 ? "text-teal-700" : ""}`}>
                    {count} reserva{count !== 1 ? "s" : ""}
                  </div>
                  {revenue > 0 && (
                    <div className="text-[10px] text-green-600">
                      ${revenue.toLocaleString("es-CL")}
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MasajesAgenda() {
  const search = useSearch();
  const initialDate = (() => {
    const p = new URLSearchParams(search);
    const d = p.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : format(new Date(), "yyyy-MM-dd");
  })();

  const [view, setView] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [open, setOpen] = useState(false);
  const [skeduOpen, setSkeduOpen] = useState(false);
  const [editingSkeduBooking, setEditingSkeduBooking] = useState<any | null>(null);
  const [cancellationTarget, setCancellationTarget] = useState<any | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BookingForm>(emptyForm(selectedDate));
  const utils = trpc.useUtils();

  // Calcular rango según vista
  const parsedDate = parseISO(selectedDate);
  const weekStart = startOfWeek(parsedDate, { locale: es });
  const from = view === "day" ? selectedDate
    : view === "week" ? format(weekStart, "yyyy-MM-dd")
    : format(startOfMonth(parsedDate), "yyyy-MM-dd");
  const to = view === "day" ? selectedDate
    : view === "week" ? format(endOfWeek(parsedDate, { locale: es }), "yyyy-MM-dd")
    : format(endOfMonth(parsedDate), "yyyy-MM-dd");

  const { data: bookings, isLoading } = trpc.masajes.agenda.getByDateRange.useQuery(
    { from, to },
    { refetchInterval: 60_000 },
  );
  const { data: techniques } = trpc.masajes.tecnicas.getAll.useQuery();
  const { data: therapists } = trpc.masajes.terapeutas.getAll.useQuery();
  const { data: rooms } = trpc.masajes.salas.getAll.useQuery();
  const { data: slots } = trpc.masajes.agenda.getAvailableSlots.useQuery(
    { date: selectedDate, duration: form.duration },
    { enabled: open }
  );

  const createMut = trpc.masajes.agenda.create.useMutation({
    onSuccess: () => { utils.masajes.agenda.getByDateRange.invalidate(); toast.success("Reserva creada"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.masajes.agenda.update.useMutation({
    onSuccess: () => { utils.masajes.agenda.getByDateRange.invalidate(); toast.success("Reserva actualizada"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const statusMut = trpc.masajes.agenda.updateStatus.useMutation({
    onSuccess: () => {
      utils.masajes.agenda.getByDateRange.invalidate();
      toast.success(cancellationTarget ? "Masaje cancelado y motivo registrado" : "Estado actualizado");
      setCancellationTarget(null);
    },
    onError: e => toast.error(e.message),
  });
  const programStatusMut = trpc.masajes.agenda.updateSkeduProgramStatus.useMutation({
    onSuccess: () => {
      utils.masajes.agenda.getByDateRange.invalidate();
      toast.success(cancellationTarget ? "Programa cancelado y motivo registrado" : "Estado del programa actualizado");
      setCancellationTarget(null);
    },
    onError: e => toast.error(e.message),
  });
  const notifyMut = trpc.masajes.agenda.notifyFreelanceTherapist.useMutation({
    onSuccess: () => {
      utils.masajes.agenda.getByDateRange.invalidate();
      utils.masajes.agenda.getPendingManualAssignment.invalidate();
      toast.success("WhatsApp enviado al terapeuta — reserva en espera de confirmación");
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const handleStatus = (id: number, status: string, bookingKind: string) => {
    if (bookingKind === "skedu_program") {
      programStatusMut.mutate({ id, status: status as "confirmed" | "completed" | "cancelled" | "no_show" });
    } else {
      statusMut.mutate({ id, status: status as any });
    }
  };

  const handleCancellation = (category: MassageCancellationCategory, reason: string) => {
    if (!cancellationTarget) return;
    const input = {
      id: cancellationTarget.id,
      status: "cancelled" as const,
      cancellationCategory: category,
      cancellationReason: reason,
    };
    if (cancellationTarget.bookingKind === "skedu_program") {
      programStatusMut.mutate(input);
    } else {
      statusMut.mutate(input);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(selectedDate));
    setOpen(true);
  };

  const openEdit = (b: any) => {
    if (b.bookingKind === "skedu_program") {
      setEditingSkeduBooking(b);
      return;
    }
    setEditingId(b.id);
    setForm({
      clientName: b.clientName, clientEmail: b.clientEmail ?? "", clientPhone: b.clientPhone ?? "",
      clientOrigin: "", techniqueId: String(b.techniqueId), therapistId: b.therapistId ? String(b.therapistId) : "",
      roomId: String(b.roomId), duration: b.duration, bookingDate: b.bookingDate,
      startTime: b.startTime, endTime: b.endTime,
      paymentStatus: b.paymentStatus as any, amountPaid: b.amountPaid ?? "",
      discountCode: "", notes: b.notes ?? "",
    });
    setOpen(true);
  };

  const handleSave = () => {
    const data = {
      clientName: form.clientName,
      clientEmail: form.clientEmail || undefined,
      clientPhone: form.clientPhone || undefined,
      clientOrigin: form.clientOrigin || undefined,
      techniqueId: Number(form.techniqueId),
      therapistId: form.therapistId ? Number(form.therapistId) : undefined,
      roomId: Number(form.roomId),
      duration: form.duration,
      bookingDate: form.bookingDate,
      startTime: form.startTime,
      endTime: form.endTime,
      paymentStatus: form.paymentStatus,
      amountPaid: form.amountPaid || undefined,
      discountCode: form.discountCode || undefined,
      notes: form.notes || undefined,
    };
    if (editingId) updateMut.mutate({ id: editingId, ...data });
    else createMut.mutate(data);
  };

  const setTechnique = (techniqueId: string) => {
    const technique = techniques?.find(t => String(t.id) === techniqueId);
    let price = "";
    if (technique) {
      if (form.duration === 50 && technique.price50min) price = String(technique.price50min);
      else if (form.duration === 80 && technique.price80min) price = String(technique.price80min);
      else if (form.duration === 110 && technique.price110min) price = String(technique.price110min);
    }
    setForm(f => ({ ...f, techniqueId, amountPaid: price || f.amountPaid }));
  };

  const setStart = (time: string) => {
    setForm(f => ({ ...f, startTime: time, endTime: calcEndTime(time, f.duration) }));
  };
  const setDuration = (d: number) => {
    const technique = techniques?.find(t => String(t.id) === form.techniqueId);
    let price = "";
    if (technique) {
      if (d === 50 && technique.price50min) price = String(technique.price50min);
      else if (d === 80 && technique.price80min) price = String(technique.price80min);
      else if (d === 110 && technique.price110min) price = String(technique.price110min);
    }
    setForm(f => ({ ...f, duration: d, endTime: calcEndTime(f.startTime, d), amountPaid: price || f.amountPaid }));
  };

  // Navegación según vista
  const navPrev = () => {
    if (view === "day") setSelectedDate(format(subDays(parsedDate, 1), "yyyy-MM-dd"));
    else if (view === "week") setSelectedDate(format(subWeeks(parsedDate, 1), "yyyy-MM-dd"));
    else setSelectedDate(format(subMonths(parsedDate, 1), "yyyy-MM-dd"));
  };
  const navNext = () => {
    if (view === "day") setSelectedDate(format(addDays(parsedDate, 1), "yyyy-MM-dd"));
    else if (view === "week") setSelectedDate(format(addWeeks(parsedDate, 1), "yyyy-MM-dd"));
    else setSelectedDate(format(addMonths(parsedDate, 1), "yyyy-MM-dd"));
  };

  const navLabel = view === "day"
    ? format(parsedDate, "EEEE d 'de' MMMM yyyy", { locale: es })
    : view === "week"
    ? `${format(weekStart, "d MMM", { locale: es })} – ${format(endOfWeek(parsedDate, { locale: es }), "d MMM yyyy", { locale: es })}`
    : format(parsedDate, "MMMM yyyy", { locale: es });

  const handleDayClick = (date: string) => {
    setSelectedDate(date);
    setView("day");
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Agenda</h1>
            <p className="text-muted-foreground text-sm mt-1">Reservas de masajes</p>
          </div>
          <div className="flex w-full gap-2 flex-wrap sm:w-auto">
            <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => setSkeduOpen(true)}>Agregar programa Skedu</Button>
            <Button className="flex-1 sm:flex-none" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Nueva reserva</Button>
          </div>
        </div>

        {/* Controles de navegación y vista */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Toggle HOY / SEMANA / MES */}
          <div className="flex w-full rounded-lg border overflow-hidden sm:w-auto">
            {(["day", "week", "month"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`min-h-10 flex-1 px-3 py-1.5 text-sm font-medium transition-colors sm:min-h-0 sm:flex-none ${
                  view === v ? "bg-stone-800 text-white" : "bg-background hover:bg-accent text-foreground"
                }`}
              >
                {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>

          {/* Botón Hoy */}
          <Button variant="outline" size="sm" onClick={() => {
            setSelectedDate(format(new Date(), "yyyy-MM-dd"));
            setView("day");
          }}>
            Hoy
          </Button>

          {/* Navegación anterior/siguiente */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button variant="outline" size="icon" onClick={navPrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="min-w-0 flex-1 text-center text-sm capitalize text-muted-foreground sm:min-w-[200px]">
              {navLabel}
            </span>
            <Button variant="outline" size="icon" onClick={navNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Input de fecha directa (solo vista día) */}
          {view === "day" && (
            <Input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full sm:w-40"
            />
          )}
        </div>

        {/* Contenido según vista */}
        {view === "day" && (
          <DayView
            bookings={bookings}
            isLoading={isLoading}
            onEdit={openEdit}
            onStatus={handleStatus}
            onCancel={setCancellationTarget}
          />
        )}
        {view === "week" && (
          <WeekView
            bookings={bookings}
            isLoading={isLoading}
            weekStart={weekStart}
            onDayClick={handleDayClick}
            onEdit={openEdit}
            onStatus={handleStatus}
            onCancel={setCancellationTarget}
          />
        )}
        {view === "month" && (
          <MonthView
            bookings={bookings}
            isLoading={isLoading}
            monthDate={parsedDate}
            onDayClick={handleDayClick}
          />
        )}
      </div>

      {/* Modal reserva */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar reserva" : "Nueva reserva"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>Nombre del cliente *</Label>
              <Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} />
            </div>
            <div>
              <Label>Origen / Ciudad</Label>
              <Input value={form.clientOrigin} onChange={e => setForm(f => ({ ...f, clientOrigin: e.target.value }))} placeholder="Santiago, Frutillar..." />
            </div>
            <div>
              <Label>Técnica *</Label>
              <Select value={form.techniqueId} onValueChange={setTechnique}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {techniques?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duración *</Label>
              <Select value={String(form.duration)} onValueChange={v => setDuration(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map(d => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Terapeuta</Label>
              <Select value={form.therapistId || "none"} onValueChange={v => setForm(f => ({ ...f, therapistId: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {(therapists ?? []).filter(t => t.type === "inhouse").length > 0 && (
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inhouse</div>
                  )}
                  {(therapists ?? []).filter(t => t.type === "inhouse").map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                  {(therapists ?? []).filter(t => t.type === "freelance").length > 0 && (
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Freelance</div>
                  )}
                  {(therapists ?? []).filter(t => t.type === "freelance").map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sala *</Label>
              <Select value={form.roomId} onValueChange={v => setForm(f => ({ ...f, roomId: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {rooms?.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={form.bookingDate} onChange={e => setForm(f => ({ ...f, bookingDate: e.target.value }))} />
            </div>
            <div>
              <Label>Hora inicio</Label>
              {slots && slots.length > 0 ? (
                <Select value={form.startTime} onValueChange={setStart}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {slots.map(s => (
                      <SelectItem key={s.time} value={s.time}>
                        {s.time} ({s.availableRooms.length} sala{s.availableRooms.length !== 1 ? "s" : ""})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.startTime} onChange={e => setStart(e.target.value)} placeholder="10:00" />
              )}
            </div>
            <div>
              <Label>Estado de pago</Label>
              <Select value={form.paymentStatus} onValueChange={v => setForm(f => ({ ...f, paymentStatus: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="paid">Pagado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monto pagado</Label>
              <Input value={form.amountPaid} onChange={e => setForm(f => ({ ...f, amountPaid: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <Label>Código descuento</Label>
              <Input value={form.discountCode} onChange={e => setForm(f => ({ ...f, discountCode: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {editingId && (
              <Button
                variant="outline"
                className="border-amber-400 text-amber-700 hover:bg-amber-50 gap-2"
                onClick={() => notifyMut.mutate({ bookingId: editingId })}
                disabled={notifyMut.isPending}
                title="Enviar WhatsApp de confirmación al terapeuta asignado y poner reserva en espera"
              >
                📲 Notificar terapeuta
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {editingId ? "Guardar cambios" : "Crear reserva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SkeduProgramBookingDialog
        open={skeduOpen}
        onOpenChange={setSkeduOpen}
        initialDate={selectedDate}
        onCreated={() => utils.masajes.agenda.getByDateRange.invalidate()}
      />
      <SkeduTherapistAssignmentDialog
        open={!!editingSkeduBooking}
        onOpenChange={(next) => { if (!next) setEditingSkeduBooking(null); }}
        booking={editingSkeduBooking}
        onUpdated={() => utils.masajes.agenda.getByDateRange.invalidate()}
      />
      <MassageCancellationDialog
        open={!!cancellationTarget}
        onOpenChange={(next) => { if (!next) setCancellationTarget(null); }}
        bookingLabel={cancellationTarget
          ? `${cancellationTarget.clientName} · ${cancellationTarget.techniqueName}`
          : undefined}
        isPending={statusMut.isPending || programStatusMut.isPending}
        onConfirm={handleCancellation}
      />
    </DashboardLayout>
  );
}
