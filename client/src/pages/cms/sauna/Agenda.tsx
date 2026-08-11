import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasCmsPermission } from "@shared/permissions";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, LockKeyhole, Plus, Users } from "lucide-react";
import { toast } from "sonner";

type ViewMode = "day" | "week" | "month";

const initialForm = (date: string) => ({
  serviceName: "Sauna Nativo",
  kind: "shared" as "shared" | "private" | "staff" | "manual",
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  bookingDate: date,
  startTime: "10:00",
  guests: 1,
  paymentStatus: "unknown" as "unknown" | "pending" | "paid",
  paymentMethod: "",
  amountClp: 0,
  notes: "",
  isConfirmed: true,
});

export default function SaunaAgenda() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [anchor, setAnchor] = useState(today);
  const [view, setView] = useState<ViewMode>("day");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(initialForm(today));
  const [rescheduleBooking, setRescheduleBooking] = useState<any>(null);
  const [rescheduleDate, setRescheduleDate] = useState(today);
  const [rescheduleTime, setRescheduleTime] = useState("10:00");
  const { user } = useAuth();
  const canManage = hasCmsPermission(user ?? {}, "sauna.manage_agenda");
  const range = useMemo(() => {
    const date = parseISO(anchor);
    if (view === "week") return { from: format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(endOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd") };
    if (view === "month") return { from: format(startOfMonth(date), "yyyy-MM-dd"), to: format(endOfMonth(date), "yyyy-MM-dd") };
    return { from: anchor, to: anchor };
  }, [anchor, view]);
  const query = trpc.sauna.agenda.list.useQuery(range);
  const utils = trpc.useUtils();
  const create = trpc.sauna.agenda.create.useMutation({
    onSuccess: () => { toast.success("Reserva creada y cupos descontados"); setDialogOpen(false); void utils.sauna.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const setStatus = trpc.sauna.agenda.setStatus.useMutation({
    onSuccess: () => void utils.sauna.invalidate(),
    onError: error => toast.error(error.message),
  });
  const reschedule = trpc.sauna.agenda.reschedule.useMutation({
    onSuccess: () => { toast.success("Reserva reagendada"); setRescheduleBooking(null); void utils.sauna.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const days = useMemo(() => {
    const rows = new Map<string, any[]>();
    for (let date = range.from; date <= range.to; date = format(addDays(parseISO(date), 1), "yyyy-MM-dd")) rows.set(date, []);
    for (const booking of query.data ?? []) {
      const date = String(booking.bookingDate).slice(0, 10);
      if (!rows.has(date)) rows.set(date, []);
      rows.get(date)!.push(booking);
    }
    return [...rows.entries()];
  }, [query.data, range]);

  const move = (direction: -1 | 1) => {
    const date = parseISO(anchor);
    const next = view === "month" ? (direction > 0 ? addMonths(date, 1) : subMonths(date, 1)) : view === "week" ? (direction > 0 ? addWeeks(date, 1) : subWeeks(date, 1)) : (direction > 0 ? addDays(date, 1) : subDays(date, 1));
    setAnchor(format(next, "yyyy-MM-dd"));
  };

  return <DashboardLayout><div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-amber-700">Sauna</p><h1 className="text-3xl font-bold">Agenda y aforo</h1><p className="text-muted-foreground">Cada bloque muestra personas reales y cupos consumidos.</p></div>{canManage && <Button onClick={() => { setForm(initialForm(anchor)); setDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" />Nueva reserva</Button>}</div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
      <Button size="icon" variant="outline" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
      <Input type="date" value={anchor} onChange={event => setAnchor(event.target.value)} className="w-40" />
      <Button size="icon" variant="outline" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
      <Button variant="ghost" onClick={() => setAnchor(today)}>Hoy</Button>
      <div className="ml-auto flex rounded-lg border p-1">{(["day", "week", "month"] as const).map(mode => <Button key={mode} size="sm" variant={view === mode ? "default" : "ghost"} onClick={() => setView(mode)}>{mode === "day" ? "Día" : mode === "week" ? "Semana" : "Mes"}</Button>)}</div>
    </div>

    <div className={`grid gap-4 ${view === "week" ? "xl:grid-cols-2" : view === "month" ? "lg:grid-cols-2 xl:grid-cols-3" : ""}`}>
      {days.map(([date, bookings]) => {
        const active = bookings.filter(item => item.status !== "cancelled");
        return <Card key={date} className={date === today ? "border-amber-500" : ""}><CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between"><div><p className="font-semibold capitalize">{format(parseISO(date), "EEEE d 'de' MMMM", { locale: es })}</p><p className="text-xs text-muted-foreground">{active.reduce((sum, item) => sum + item.guests, 0)} asistentes en {active.length} reservas</p></div><Badge variant="outline">máx. 6 por horario</Badge></div>
          <div className="space-y-3">{bookings.map(booking => <BookingCard key={booking.id} booking={booking} canManage={canManage} onStatus={status => setStatus.mutate({ id: booking.id, status })} onReschedule={() => { setRescheduleBooking(booking); setRescheduleDate(String(booking.bookingDate).slice(0, 10)); setRescheduleTime(booking.startTime); }} />)}{!bookings.length && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Sin reservas</div>}</div>
        </CardContent></Card>;
      })}
    </div>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Nueva reserva de sauna</DialogTitle></DialogHeader>
      <div className="grid gap-4 py-2 sm:grid-cols-2">
        <Field label="Tipo"><Select value={form.kind} onValueChange={(value: any) => setForm({ ...form, kind: value, serviceName: value === "private" ? "Sauna Nativo Privado" : value === "staff" ? "Sauna Nativo STAFF" : "Sauna Nativo" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="shared">Público compartido</SelectItem><SelectItem value="private">Privado</SelectItem><SelectItem value="staff">STAFF / Walk in</SelectItem><SelectItem value="manual">Excepción manual</SelectItem></SelectContent></Select></Field>
        <Field label="Personas"><Input type="number" min={1} max={form.kind === "private" ? 6 : 5} value={form.guests} onChange={event => setForm({ ...form, guests: Number(event.target.value) })} /></Field>
        <Field label="Fecha"><Input type="date" value={form.bookingDate} onChange={event => setForm({ ...form, bookingDate: event.target.value })} /></Field>
        <Field label="Hora"><Input type="time" value={form.startTime} onChange={event => setForm({ ...form, startTime: event.target.value })} /></Field>
        <Field label="Nombre"><Input value={form.clientName} onChange={event => setForm({ ...form, clientName: event.target.value })} /></Field>
        <Field label="Teléfono"><Input value={form.clientPhone} onChange={event => setForm({ ...form, clientPhone: event.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={form.clientEmail} onChange={event => setForm({ ...form, clientEmail: event.target.value })} /></Field>
        <Field label="Pago"><Select value={form.paymentStatus} onValueChange={(value: any) => setForm({ ...form, paymentStatus: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Sin información</SelectItem><SelectItem value="pending">Pendiente</SelectItem><SelectItem value="paid">Pagado</SelectItem></SelectContent></Select></Field>
        <Field label="Monto"><Input type="number" min={0} value={form.amountClp} onChange={event => setForm({ ...form, amountClp: Number(event.target.value) })} /></Field>
        <div className="sm:col-span-2"><Field label="Notas"><Textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field></div>
      </div>
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{form.kind === "private" || form.guests >= 4 ? "Esta reserva bloqueará inmediatamente los 6 cupos, aunque asistan 4 o 5 personas." : `Esta reserva consumirá ${form.guests} cupo${form.guests === 1 ? "" : "s"}; personas de otras reservas pueden compartir el mismo horario.`}</div>
      <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={() => create.mutate({ ...form, isPrivate: form.kind === "private" || form.guests >= 4, clientEmail: form.clientEmail || undefined, clientName: form.clientName || undefined, clientPhone: form.clientPhone || undefined, paymentMethod: form.paymentMethod || undefined, notes: form.notes || undefined })} disabled={create.isPending}>{create.isPending ? "Guardando…" : "Crear reserva"}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={Boolean(rescheduleBooking)} onOpenChange={open => !open && setRescheduleBooking(null)}><DialogContent><DialogHeader><DialogTitle>Reagendar reserva</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Política: mínimo 48 horas de anticipación y máximo 2 cambios.</p><div className="grid gap-4 sm:grid-cols-2"><Field label="Nueva fecha"><Input type="date" value={rescheduleDate} onChange={event => setRescheduleDate(event.target.value)} /></Field><Field label="Nueva hora"><Input type="time" value={rescheduleTime} onChange={event => setRescheduleTime(event.target.value)} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setRescheduleBooking(null)}>Cancelar</Button><Button onClick={() => rescheduleBooking && reschedule.mutate({ id: rescheduleBooking.id, bookingDate: rescheduleDate, startTime: rescheduleTime, overridePolicy: false })} disabled={reschedule.isPending}>Reagendar</Button></DialogFooter></DialogContent></Dialog>
  </div></DashboardLayout>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }

function BookingCard({ booking, canManage, onStatus, onReschedule }: { booking: any; canManage: boolean; onStatus: (status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show") => void; onReschedule: () => void }) {
  return <div className={`rounded-xl border p-3 ${booking.status === "cancelled" ? "opacity-50" : booking.isPrivate ? "border-amber-300 bg-amber-50" : ""}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex items-center gap-2"><strong className="text-lg">{booking.startTime}</strong><span className="text-muted-foreground">– {booking.endTime}</span>{booking.isPrivate ? <Badge><LockKeyhole className="mr-1 h-3 w-3" />Privado · 6 cupos</Badge> : <Badge variant="outline"><Users className="mr-1 h-3 w-3" />{booking.guests} persona{booking.guests === 1 ? "" : "s"}</Badge>}</div><Badge variant={booking.status === "cancelled" ? "destructive" : booking.isConfirmed ? "default" : "secondary"}>{booking.status}</Badge></div>
    <p className="mt-2 font-medium">{booking.clientName || "Cliente Skedu"}</p><p className="text-sm text-muted-foreground">{booking.serviceName}</p>
    <div className="mt-2 flex flex-wrap gap-2 text-xs"><Badge variant="outline">{booking.origin || booking.source}</Badge><Badge variant="outline">Pago: {booking.paymentStatus}</Badge><Badge variant="outline">Reagendamientos: {booking.rescheduleCount}</Badge>{!booking.isConfirmed && <Badge variant="secondary">Sin confirmar</Badge>}</div>
    {booking.source === "skedu" ? <p className="mt-3 text-xs text-muted-foreground">Cambios operacionales: gestionar en Skedu; el CMS los reflejará automáticamente.</p> : canManage && booking.status !== "cancelled" && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onStatus("confirmed")}>Confirmar</Button><Button size="sm" variant="outline" onClick={onReschedule}>Reagendar</Button><Button size="sm" variant="outline" onClick={() => onStatus("completed")}>Completada</Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => onStatus("cancelled")}>Cancelar</Button></div>}
  </div>;
}
