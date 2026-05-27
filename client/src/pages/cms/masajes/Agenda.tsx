import { useState } from "react";
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
import { format, addDays, subDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente", confirmed: "Confirmada", completed: "Completada",
  cancelled: "Cancelada", no_show: "No llegó",
};
const STATUS_VARIANTS: Record<string, any> = {
  pending: "secondary", confirmed: "default", completed: "outline",
  cancelled: "destructive", no_show: "destructive",
};
const DURATIONS = [50, 80, 110];

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

export default function MasajesAgenda() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BookingForm>(emptyForm(selectedDate));
  const utils = trpc.useUtils();

  const { data: bookings, isLoading } = trpc.masajes.agenda.getByDateRange.useQuery(
    { from: selectedDate, to: selectedDate }
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
    onSuccess: () => { utils.masajes.agenda.getByDateRange.invalidate(); toast.success("Estado actualizado"); },
    onError: e => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(selectedDate));
    setOpen(true);
  };

  const openEdit = (b: any) => {
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

  const setStart = (time: string) => {
    setForm(f => ({ ...f, startTime: time, endTime: calcEndTime(time, f.duration) }));
  };
  const setDuration = (d: number) => {
    setForm(f => ({ ...f, duration: d, endTime: calcEndTime(f.startTime, d) }));
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Agenda</h1>
            <p className="text-muted-foreground text-sm mt-1">Reservas de masajes por día</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Nueva reserva</Button>
        </div>

        {/* Navegación de fecha */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-40" />
          <Button variant="outline" size="icon" onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {format(parseISO(selectedDate), "EEEE d 'de' MMMM", { locale: es })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}>Hoy</Button>
        </div>

        {/* Lista de reservas */}
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : !bookings || bookings.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Sin reservas para este día</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {bookings.map(b => (
              <Card key={b.id} className={b.status === "cancelled" ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-lg">{b.startTime}</span>
                        <span className="text-muted-foreground">–</span>
                        <span className="text-muted-foreground">{b.endTime}</span>
                        <Badge variant={STATUS_VARIANTS[b.status]}>{STATUS_LABELS[b.status]}</Badge>
                        {b.paymentStatus === "paid" && <Badge variant="outline" className="text-green-600 border-green-600">Pagado</Badge>}
                      </div>
                      <p className="font-medium mt-1">{b.clientName}</p>
                      <p className="text-sm text-muted-foreground">
                        {b.techniqueName} · {b.duration} min · {b.roomName}
                        {b.therapistName && ` · ${b.therapistName}`}
                      </p>
                      {b.amountPaid && <p className="text-sm text-green-600 mt-1">$ {Number(b.amountPaid).toLocaleString("es-CL")}</p>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {b.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: b.id, status: "confirmed" })}>Confirmar</Button>
                      )}
                      {(b.status === "confirmed" || b.status === "pending") && (
                        <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: b.id, status: "completed" })}>Completar</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(b)}><Edit className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
              <Select value={form.techniqueId} onValueChange={v => setForm(f => ({ ...f, techniqueId: v }))}>
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
              <Select value={form.therapistId} onValueChange={v => setForm(f => ({ ...f, therapistId: v }))}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin asignar</SelectItem>
                  {therapists?.filter(t => t.active === 1).map(t => (
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
                      <SelectItem key={s.time} value={s.time}>{s.time} ({s.availableRooms.length} sala{s.availableRooms.length !== 1 ? "s" : ""})</SelectItem>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {editingId ? "Guardar cambios" : "Crear reserva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
