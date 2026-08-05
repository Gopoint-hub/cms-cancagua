import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { hasCmsPermission } from "@shared/permissions";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  RotateCw,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

function localDate(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}
const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};
type ViewMode = "day" | "week" | "month";

function bookingDate(value: unknown) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

export default function BiopiscinasAgenda() {
  const search = useSearch();
  const { user } = useAuth();
  const canManage = hasCmsPermission(user ?? {}, "biopools.manage_agenda");
  const initialDate = new URLSearchParams(search).get("date") ?? localDate();
  const [date, setDate] = useState(initialDate);
  const [view, setView] = useState<ViewMode>("day");
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [rescheduleBooking, setRescheduleBooking] = useState<{
    id: number;
    totalGuests: number;
    clientName: string;
  } | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(localDate());
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [form, setForm] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    adultQuantity: 1,
    childQuantity: 0,
    paymentStatus: "pending" as "pending" | "paid",
    paymentMethod: "",
    paymentReference: "",
    notes: "",
  });
  const utils = trpc.useUtils();
  const { data: services } = trpc.biopools.services.list.useQuery();
  const service =
    services?.find(item => item.id === selectedServiceId) ??
    services?.find(item => item.status !== "archived") ??
    services?.[0];
  useEffect(() => {
    if (!selectedServiceId && service) setSelectedServiceId(service.id);
  }, [selectedServiceId, service]);
  const { data: detail } = trpc.biopools.services.get.useQuery(
    { id: service?.id ?? 0 },
    { enabled: Boolean(service) }
  );
  const selected = parseISO(date);
  const range = useMemo(() => {
    if (view === "day") return { from: date, to: date };
    if (view === "week") {
      return {
        from: format(startOfWeek(selected, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        to: format(endOfWeek(selected, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    }
    return {
      from: format(startOfWeek(startOfMonth(selected), { weekStartsOn: 1 }), "yyyy-MM-dd"),
      to: format(endOfWeek(endOfMonth(selected), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }, [date, selected, view]);
  const query = { serviceId: service?.id ?? 0, date };
  const { data: availability, isLoading } =
    trpc.biopools.availability.day.useQuery(query, {
      enabled: Boolean(service),
      refetchInterval: 30_000,
    });
  const { data: rescheduleAvailability } =
    trpc.biopools.availability.day.useQuery(
      { serviceId: service?.id ?? 0, date: rescheduleDate },
      { enabled: Boolean(service && rescheduleBooking) }
    );
  const { data: bookings } = trpc.biopools.bookings.list.useQuery(
    { serviceId: service?.id ?? 0, from: range.from, to: range.to },
    { enabled: Boolean(service), refetchInterval: 30_000 }
  );
  const create = trpc.biopools.bookings.create.useMutation({
    onSuccess: () => {
      toast.success("Reserva creada y comunicaciones programadas");
      setOpen(false);
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateStatus = trpc.biopools.bookings.updateStatus.useMutation({
    onSuccess: result => {
      if (result.automaticRefund) {
        toast.success(
          `Reembolso Webpay procesado: ${clp.format(result.refund?.netClp ?? 0)}`
        );
      } else if (result.refund?.eligible) {
        toast.success(
          `${result.refundError ?? "Reembolso pendiente"}: ${clp.format(result.refund.netClp)} (descuento ${clp.format(result.refund.feeClp)})`
        );
      } else {
        toast.success("Estado de la reserva actualizado");
      }
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const markRefund = trpc.biopools.bookings.markRefundProcessed.useMutation({
    onSuccess: () => {
      toast.success("Reembolso registrado como procesado");
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const reschedule = trpc.biopools.bookings.reschedule.useMutation({
    onSuccess: () => {
      toast.success("Reserva reagendada y recordatorios actualizados");
      setRescheduleBooking(null);
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const adultPrice =
    detail?.tickets.find(ticket => ticket.code === "adult")?.priceClp ?? 0;
  const childPrice =
    detail?.tickets.find(ticket => ticket.code === "child")?.priceClp ?? 0;
  const total =
    form.adultQuantity * adultPrice + form.childQuantity * childPrice;
  const selectedSlot = availability?.slots.find(
    slot => slot.startTime === startTime
  );
  useEffect(() => {
    if (
      availability?.slots.length &&
      !availability.slots.some(slot => slot.startTime === startTime)
    )
      setStartTime(availability.slots[0].startTime);
  }, [availability, startTime]);

  const groups = useMemo(
    () =>
      (availability?.slots ?? []).map(slot => ({
        slot,
        bookings: (bookings ?? []).filter(
          booking => bookingDate(booking.bookingDate) === date && booking.startTime === slot.startTime
        ),
      })),
    [availability, bookings]
  );
  const openCreate = (slot: string) => {
    setStartTime(slot);
    setOpen(true);
  };
  const changeStatus = (
    id: number,
    status: typeof statusLabel extends Record<infer K, string> ? K : string
  ) => {
    if (status !== "cancelled")
      return updateStatus.mutate({ id, status: status as any });
    const reason = window.prompt(
      "Motivo de la cancelación:",
      "Solicitud del cliente"
    );
    if (reason === null) return;
    updateStatus.mutate({ id, status: "cancelled", reason });
  };
  const processRefund = (id: number) => {
    const reference = window.prompt(
      "Ingresa la referencia o comprobante del reembolso procesado:"
    );
    if (reference?.trim())
      markRefund.mutate({ id, reference: reference.trim() });
  };
  const openReschedule = (booking: {
    id: number;
    totalGuests: number;
    clientName: string;
    bookingDate: unknown;
    startTime: string;
  }) => {
    setRescheduleBooking({
      id: booking.id,
      totalGuests: booking.totalGuests,
      clientName: booking.clientName,
    });
    setRescheduleDate(String(booking.bookingDate).slice(0, 10));
    setRescheduleTime(booking.startTime);
    setRescheduleReason("");
  };
  useEffect(() => {
    if (!rescheduleBooking || !rescheduleAvailability?.slots.length) return;
    const current = rescheduleAvailability.slots.find(
      slot =>
        slot.startTime === rescheduleTime &&
        slot.availableSeats >= rescheduleBooking.totalGuests
    );
    if (!current)
      setRescheduleTime(
        rescheduleAvailability.slots.find(
          slot => slot.availableSeats >= rescheduleBooking.totalGuests
        )?.startTime ?? ""
      );
  }, [rescheduleAvailability, rescheduleBooking, rescheduleTime]);
  const save = () => {
    if (!service) return;
    create.mutate({
      ...form,
      serviceId: service.id,
      bookingDate: date,
      startTime,
      source: "cms",
      discountAmountClp: 0,
      paymentMethod:
        form.paymentStatus === "paid"
          ? form.paymentMethod || "manual"
          : undefined,
      paymentReference: form.paymentReference || undefined,
      notes: form.notes || undefined,
    });
  };
  const move = (direction: -1 | 1) => {
    const current = parseISO(date);
    const next = view === "day"
      ? (direction < 0 ? subDays(current, 1) : addDays(current, 1))
      : view === "week"
        ? (direction < 0 ? subWeeks(current, 1) : addWeeks(current, 1))
        : (direction < 0 ? subMonths(current, 1) : addMonths(current, 1));
    setDate(format(next, "yyyy-MM-dd"));
  };
  const calendarDays = eachDayOfInterval({ start: parseISO(range.from), end: parseISO(range.to) });
  const calendarTitle = view === "day"
    ? format(selected, "EEEE d 'de' MMMM yyyy", { locale: es })
    : view === "week"
      ? `${format(parseISO(range.from), "d MMM", { locale: es })} – ${format(parseISO(range.to), "d MMM yyyy", { locale: es })}`
      : format(selected, "MMMM yyyy", { locale: es });
  const bookingsForDate = (value: string) => (bookings ?? []).filter(item => bookingDate(item.bookingDate) === value);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-700">
              Agenda y cupos
            </p>
            <h1 className="text-3xl font-semibold">Biopiscinas</h1>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={service ? String(service.id) : undefined}
              onValueChange={value => setSelectedServiceId(Number(value))}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecciona modalidad" />
              </SelectTrigger>
              <SelectContent>
                {services
                  ?.filter(item => item.status !== "archived")
                  .map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => move(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={event => setDate(event.target.value)}
              className="w-40"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => move(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {canManage && (
              <Button
                onClick={() =>
                  openCreate(availability?.slots[0]?.startTime ?? "10:00")
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Reserva manual
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3">
          <div className="flex rounded-lg border p-1">
            {(["day", "week", "month"] as ViewMode[]).map(mode => (
              <Button
                key={mode}
                size="sm"
                variant={view === mode ? "default" : "ghost"}
                onClick={() => setView(mode)}
              >
                {mode === "day" ? "Día" : mode === "week" ? "Semana" : "Mes"}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setDate(localDate())}>Hoy</Button>
            <p className="min-w-52 text-center text-sm font-semibold capitalize">{calendarTitle}</p>
          </div>
        </div>
        {isLoading ? (
          <p>Cargando disponibilidad…</p>
        ) : view !== "day" ? (
          <div className={view === "week" ? "grid gap-3 md:grid-cols-7" : "grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border"}>
            {calendarDays.map(day => {
              const key = format(day, "yyyy-MM-dd");
              const dayBookings = bookingsForDate(key);
              return (
                <button
                  type="button"
                  key={key}
                  className={view === "week"
                    ? "min-h-[24rem] rounded-xl border bg-background p-3 text-left hover:bg-muted/30"
                    : `min-h-32 bg-background p-2 text-left hover:bg-muted/30 ${!isSameMonth(day, selected) ? "bg-muted/40 text-muted-foreground" : ""}`}
                  onClick={() => { setDate(key); setView("day"); }}
                >
                  <p className="mb-3 text-xs font-semibold capitalize">
                    {format(day, view === "week" ? "EEE d" : "d", { locale: es })}
                  </p>
                  <div className="space-y-1.5">
                    {dayBookings.slice(0, view === "week" ? 10 : 3).map(booking => (
                      <div key={booking.id} className="rounded-lg border border-cyan-200 bg-cyan-50 p-2">
                        <p className="text-xs font-semibold">{booking.startTime} · {booking.clientName}</p>
                        {view === "week" && <p className="mt-1 text-[11px] text-muted-foreground">{booking.totalGuests} persona(s) · {statusLabel[booking.status]}</p>}
                      </div>
                    ))}
                    {dayBookings.length > (view === "week" ? 10 : 3) && (
                      <p className="text-xs font-medium text-cyan-700">+{dayBookings.length - (view === "week" ? 10 : 3)} más</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : !groups.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No existen ingresos habilitados para este día.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {groups.map(({ slot, bookings: slotBookings }) => (
              <Card
                key={slot.startTime}
                className={slot.availableSeats === 0 ? "border-red-200" : ""}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Clock className="h-5 w-5 text-cyan-700" />
                      {slot.startTime}–{slot.endTime}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          slot.availableSeats > 10
                            ? "secondary"
                            : slot.availableSeats > 0
                              ? "outline"
                              : "destructive"
                        }
                      >
                        <UsersRound className="h-3.5 w-3.5 mr-1" />
                        {slot.availableSeats} de{" "}
                        {availability?.service.capacity} disponibles
                      </Badge>
                      {canManage && slot.availableSeats > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCreate(slot.startTime)}
                        >
                          Agregar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {slotBookings.length ? (
                    <div className="space-y-2">
                      {slotBookings.map(booking => (
                        <div
                          key={booking.id}
                          className="rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <strong>{booking.clientName}</strong>
                              <Badge variant="outline">
                                {statusLabel[booking.status]}
                              </Badge>
                              <Badge
                                variant={
                                  booking.paymentStatus === "paid"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {booking.paymentStatus === "paid"
                                  ? "Pagada"
                                  : booking.paymentStatus === "refunded"
                                    ? "Reembolsada"
                                    : "Pago pendiente"}
                              </Badge>
                              {booking.refundStatus === "pending" && (
                                <Badge variant="destructive">
                                  Reembolso pendiente ·{" "}
                                  {clp.format(booking.refundAmountClp)}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {booking.adultQuantity} adulto(s) ·{" "}
                              {booking.childQuantity} niño(s) ·{" "}
                              {clp.format(
                                booking.originalAmountClp -
                                  booking.discountAmountClp
                              )}
                            </p>
                            {booking.refundStatus === "pending" && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Descuento transacción:{" "}
                                {clp.format(booking.refundFeeAmountClp)}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {canManage &&
                              booking.refundStatus === "pending" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => processRefund(booking.id)}
                                  disabled={markRefund.isPending}
                                >
                                  Marcar reembolso procesado
                                </Button>
                              )}
                            {canManage && booking.status !== "cancelled" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openReschedule(booking)}
                              >
                                <RotateCw className="h-4 w-4 mr-1" />
                                Reagendar
                              </Button>
                            )}
                            {canManage && booking.status !== "cancelled" && (
                              <Select
                                value={booking.status}
                                onValueChange={status =>
                                  changeStatus(booking.id, status)
                                }
                              >
                                <SelectTrigger className="w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="confirmed">
                                    Confirmada
                                  </SelectItem>
                                  <SelectItem value="completed">
                                    Completada
                                  </SelectItem>
                                  <SelectItem value="no_show">
                                    No asistió
                                  </SelectItem>
                                  <SelectItem value="cancelled">
                                    Cancelada
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sin reservas que comiencen a esta hora. La disponibilidad
                      ya considera las estadías iniciadas en horas anteriores.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Nueva reserva · {date} a las {startTime}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nombre del cliente</Label>
                <Input
                  value={form.clientName}
                  onChange={e =>
                    setForm({ ...form, clientName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Correo</Label>
                <Input
                  type="email"
                  value={form.clientEmail}
                  onChange={e =>
                    setForm({ ...form, clientEmail: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono / WhatsApp</Label>
                <Input
                  value={form.clientPhone}
                  onChange={e =>
                    setForm({ ...form, clientPhone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Adultos · {clp.format(adultPrice)} c/u</Label>
                <Input
                  type="number"
                  min={0}
                  max={40}
                  value={form.adultQuantity}
                  onChange={e =>
                    setForm({ ...form, adultQuantity: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Niños · {clp.format(childPrice)} c/u</Label>
                <Input
                  type="number"
                  min={0}
                  max={40}
                  value={form.childQuantity}
                  onChange={e =>
                    setForm({ ...form, childQuantity: Number(e.target.value) })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Todo niño debe asistir con un adulto.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Estado del pago</Label>
                <Select
                  value={form.paymentStatus}
                  onValueChange={(value: "pending" | "paid") =>
                    setForm({ ...form, paymentStatus: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="paid">Pagado manualmente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.paymentStatus === "paid" && (
                <div className="space-y-2">
                  <Label>Medio de pago</Label>
                  <Input
                    placeholder="Transferencia, efectivo, Transbank…"
                    value={form.paymentMethod}
                    onChange={e =>
                      setForm({ ...form, paymentMethod: e.target.value })
                    }
                  />
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label>Notas internas</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="rounded-xl bg-cyan-50 p-4 flex justify-between">
              <span>
                Disponibilidad:{" "}
                <strong>{selectedSlot?.availableSeats ?? 0} cupos</strong>
              </span>
              <span>
                Total: <strong>{clp.format(total)}</strong>
              </span>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={save}
                disabled={
                  create.isPending ||
                  !form.clientName ||
                  !form.clientEmail ||
                  !form.clientPhone ||
                  form.adultQuantity + form.childQuantity < 1 ||
                  (form.childQuantity > 0 && form.adultQuantity < 1) ||
                  (selectedSlot?.availableSeats ?? 0) <
                    form.adultQuantity + form.childQuantity
                }
              >
                {create.isPending ? "Guardando…" : "Crear reserva"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(rescheduleBooking)}
          onOpenChange={next => !next && setRescheduleBooking(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Reagendar · {rescheduleBooking?.clientName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nueva fecha</Label>
                <Input
                  type="date"
                  value={rescheduleDate}
                  onChange={event => setRescheduleDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Nuevo horario</Label>
                <Select
                  value={rescheduleTime}
                  onValueChange={setRescheduleTime}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un horario" />
                  </SelectTrigger>
                  <SelectContent>
                    {(rescheduleAvailability?.slots ?? [])
                      .filter(
                        slot =>
                          slot.availableSeats >=
                          (rescheduleBooking?.totalGuests ?? 0)
                      )
                      .map(slot => (
                        <SelectItem key={slot.startTime} value={slot.startTime}>
                          {slot.startTime}–{slot.endTime} ·{" "}
                          {slot.availableSeats} cupos
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Textarea
                  value={rescheduleReason}
                  onChange={event => setRescheduleReason(event.target.value)}
                  placeholder="Motivo informado por el cliente"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Se respetan el máximo de 2 reagendamientos y las 48 horas de
                anticipación. Los recordatorios pendientes se reemplazarán por
                los de la nueva fecha.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRescheduleBooking(null)}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  !rescheduleTime ||
                  rescheduleReason.trim().length < 3 ||
                  reschedule.isPending
                }
                onClick={() =>
                  rescheduleBooking &&
                  reschedule.mutate({
                    id: rescheduleBooking.id,
                    bookingDate: rescheduleDate,
                    startTime: rescheduleTime,
                    reason: rescheduleReason,
                    overridePolicy: false,
                  })
                }
              >
                {reschedule.isPending
                  ? "Reagendando…"
                  : "Confirmar reagendamiento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
