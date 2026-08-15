import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { ReschedulePolicyOverride } from "@/components/cms/ReschedulePolicyOverride";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useAuth } from "@/_core/hooks/useAuth";
import { hasCmsPermission } from "@shared/permissions";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  LockKeyhole,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  CARD_PAYMENT_METHODS,
  PENDING_PAYMENT_METHODS,
  RESERVATION_PAYMENT_LABELS,
  type ReservationPaymentMethod,
} from "@shared/reservationPayments";

type ViewMode = "day" | "week" | "month";
type SaunaPaymentMethod =
  | "payment_link"
  | "bank_transfer"
  | "cash"
  | "transbank_machine"
  | "gift_card";
type PaymentDraft = {
  method: SaunaPaymentMethod | "";
  status: "pending" | "paid";
  amountClp: string;
  paidAt: string;
  reference: string;
  cardType: "credit" | "debit" | "";
  giftCardCode: string;
};
const SAUNA_PAYMENT_METHODS: SaunaPaymentMethod[] = [
  "payment_link",
  "bank_transfer",
  "cash",
  "transbank_machine",
  "gift_card",
];
function chileDateTimeInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}
function emptyPayment(amountClp = ""): PaymentDraft {
  return {
    method: "",
    status: "paid",
    amountClp,
    paidAt: chileDateTimeInput(),
    reference: "",
    cardType: "",
    giftCardCode: "",
  };
}
function paymentDateTimeInput(value: unknown) {
  if (!value) return chileDateTimeInput();
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return chileDateTimeInput();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const item = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${item.year}-${item.month}-${item.day}T${item.hour}:${item.minute}`;
}
function paymentIsComplete(payment: PaymentDraft) {
  if (!payment.method || !Number(payment.amountClp)) return false;
  if (payment.method === "gift_card")
    return Boolean(payment.giftCardCode.trim());
  if (payment.status === "pending")
    return PENDING_PAYMENT_METHODS.includes(payment.method);
  if (
    !payment.paidAt ||
    (payment.method !== "cash" && !payment.reference.trim())
  )
    return false;
  return (
    !CARD_PAYMENT_METHODS.includes(payment.method) || Boolean(payment.cardType)
  );
}
function PaymentFields({
  payment,
  onChange,
}: {
  payment: PaymentDraft;
  onChange: (changes: Partial<PaymentDraft>) => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
      <Field label="Medio">
        <Select
          value={payment.method}
          onValueChange={value =>
            onChange({
              method: value as SaunaPaymentMethod,
              status: PENDING_PAYMENT_METHODS.includes(
                value as ReservationPaymentMethod
              )
                ? "pending"
                : "paid",
              reference: "",
              cardType: "",
              giftCardCode: "",
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecciona" />
          </SelectTrigger>
          <SelectContent>
            {SAUNA_PAYMENT_METHODS.map(method => (
              <SelectItem key={method} value={method}>
                {RESERVATION_PAYMENT_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Monto">
        <Input
          type="number"
          min={1}
          value={payment.amountClp}
          onChange={event => onChange({ amountClp: event.target.value })}
        />
      </Field>
      {PENDING_PAYMENT_METHODS.includes(
        payment.method as ReservationPaymentMethod
      ) && (
        <Field label="Estado">
          <Select
            value={payment.status}
            onValueChange={value =>
              onChange({ status: value as "pending" | "paid" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Link enviado / pendiente</SelectItem>
              <SelectItem value="paid">Confirmado</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
      {payment.status === "paid" && (
        <Field label="Fecha y hora">
          <Input
            type="datetime-local"
            value={payment.paidAt}
            onChange={event => onChange({ paidAt: event.target.value })}
          />
        </Field>
      )}
      {payment.method === "gift_card" ? (
        <div className="sm:col-span-2">
          <Field label="Código Gift Card">
            <Input
              value={payment.giftCardCode}
              onChange={event =>
                onChange({ giftCardCode: event.target.value.toUpperCase() })
              }
            />
          </Field>
        </div>
      ) : payment.status === "paid" && payment.method !== "cash" ? (
        <Field label="Código o referencia">
          <Input
            value={payment.reference}
            onChange={event => onChange({ reference: event.target.value })}
          />
        </Field>
      ) : null}
      {payment.status === "paid" &&
        CARD_PAYMENT_METHODS.includes(
          payment.method as ReservationPaymentMethod
        ) && (
          <Field label="Tarjeta">
            <Select
              value={payment.cardType}
              onValueChange={value =>
                onChange({ cardType: value as "credit" | "debit" })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Crédito</SelectItem>
                <SelectItem value="debit">Débito</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
    </div>
  );
}

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
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleOverride, setRescheduleOverride] = useState(false);
  const [payments, setPayments] = useState<PaymentDraft[]>([emptyPayment()]);
  const [paymentBooking, setPaymentBooking] = useState<any>(null);
  const [newPayment, setNewPayment] = useState<PaymentDraft>(emptyPayment());
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editingPayment, setEditingPayment] =
    useState<PaymentDraft>(emptyPayment());
  const { user } = useAuth();
  const canManage = hasCmsPermission(user ?? {}, "sauna.manage_agenda");
  const range = useMemo(() => {
    const date = parseISO(anchor);
    if (view === "week")
      return {
        from: format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        to: format(endOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    if (view === "month")
      return {
        from: format(startOfMonth(date), "yyyy-MM-dd"),
        to: format(endOfMonth(date), "yyyy-MM-dd"),
      };
    return { from: anchor, to: anchor };
  }, [anchor, view]);
  const query = trpc.sauna.agenda.list.useQuery(range);
  const utils = trpc.useUtils();
  const create = trpc.sauna.agenda.create.useMutation({
    onSuccess: () => {
      toast.success("Reserva creada y cupos descontados");
      setDialogOpen(false);
      void utils.sauna.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const paymentQuery = trpc.sauna.agenda.getPayments.useQuery(
    { bookingId: paymentBooking?.id ?? 0 },
    { enabled: Boolean(paymentBooking) }
  );
  const addPayment = trpc.sauna.agenda.addPayment.useMutation({
    onSuccess: () => {
      toast.success("Pago agregado");
      setNewPayment(emptyPayment());
      void paymentQuery.refetch();
      void utils.sauna.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const completePayment = trpc.sauna.agenda.completePayment.useMutation({
    onSuccess: () => {
      toast.success("Pago confirmado");
      void paymentQuery.refetch();
      void utils.sauna.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updatePayment = trpc.sauna.agenda.updatePayment.useMutation({
    onSuccess: () => {
      toast.success("Pago actualizado");
      setEditingPaymentId(null);
      void paymentQuery.refetch();
      void utils.sauna.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const removePayment = trpc.sauna.agenda.removePayment.useMutation({
    onSuccess: () => {
      toast.success("Pago eliminado");
      setEditingPaymentId(null);
      void paymentQuery.refetch();
      void utils.sauna.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const confirmPendingPayment = (payment: { id: number; method: string }) => {
    const paidAt = window.prompt(
      "Fecha y hora (AAAA-MM-DDTHH:MM):",
      chileDateTimeInput()
    );
    if (!paidAt) return;
    const reference = window.prompt("Código o referencia:")?.trim();
    if (!reference) return;
    let cardType: "credit" | "debit" | undefined;
    if (
      CARD_PAYMENT_METHODS.includes(payment.method as ReservationPaymentMethod)
    ) {
      const answer = window
        .prompt("Tipo de tarjeta: crédito o débito")
        ?.trim()
        .toLowerCase();
      if (answer === "crédito" || answer === "credito") cardType = "credit";
      else if (answer === "débito" || answer === "debito") cardType = "debit";
      else return toast.error("Debes indicar crédito o débito");
    }
    completePayment.mutate({
      paymentId: payment.id,
      paidAt,
      reference,
      cardType,
    });
  };
  const startEditingPayment = (payment: any) => {
    setEditingPaymentId(payment.id);
    setEditingPayment({
      method: payment.method,
      status: payment.status === "pending" ? "pending" : "paid",
      amountClp: String(payment.amountClp),
      paidAt: paymentDateTimeInput(payment.paidAt),
      reference: payment.reference ?? "",
      cardType: payment.cardType ?? "",
      giftCardCode: "",
    });
  };
  const saveEditingPayment = () => {
    if (!editingPaymentId || !paymentIsComplete(editingPayment)) return;
    updatePayment.mutate({
      paymentId: editingPaymentId,
      payment: {
        method: editingPayment.method as SaunaPaymentMethod,
        status: editingPayment.status,
        amountClp: Number(editingPayment.amountClp),
        paidAt:
          editingPayment.status === "paid" ? editingPayment.paidAt : undefined,
        reference: editingPayment.reference || undefined,
        cardType: editingPayment.cardType || undefined,
      },
    });
  };
  const setStatus = trpc.sauna.agenda.setStatus.useMutation({
    onSuccess: () => void utils.sauna.invalidate(),
    onError: error => toast.error(error.message),
  });
  const reschedule = trpc.sauna.agenda.reschedule.useMutation({
    onSuccess: () => {
      toast.success("Reserva reagendada");
      setRescheduleBooking(null);
      setRescheduleReason("");
      setRescheduleOverride(false);
      void Promise.all([
        utils.sauna.invalidate(),
        utils.operations360.calendar.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const days = useMemo(() => {
    const rows = new Map<string, any[]>();
    for (
      let date = range.from;
      date <= range.to;
      date = format(addDays(parseISO(date), 1), "yyyy-MM-dd")
    )
      rows.set(date, []);
    for (const booking of query.data ?? []) {
      const date = String(booking.bookingDate).slice(0, 10);
      if (!rows.has(date)) rows.set(date, []);
      rows.get(date)!.push(booking);
    }
    return [...rows.entries()];
  }, [query.data, range]);

  const move = (direction: -1 | 1) => {
    const date = parseISO(anchor);
    const next =
      view === "month"
        ? direction > 0
          ? addMonths(date, 1)
          : subMonths(date, 1)
        : view === "week"
          ? direction > 0
            ? addWeeks(date, 1)
            : subWeeks(date, 1)
          : direction > 0
            ? addDays(date, 1)
            : subDays(date, 1);
    setAnchor(format(next, "yyyy-MM-dd"));
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-amber-700">Sauna</p>
            <h1 className="text-3xl font-bold">Agenda y aforo</h1>
            <p className="text-muted-foreground">
              Cada bloque muestra personas reales y cupos consumidos.
            </p>
          </div>
          {canManage && (
            <Button className="w-full sm:w-auto"
              onClick={() => {
                setForm(initialForm(anchor));
                setPayments([emptyPayment()]);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nueva reserva
            </Button>
          )}
        </div>

    <div className="grid gap-3 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap sm:items-center">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 sm:flex">
          <Button size="icon" variant="outline" aria-label="Periodo anterior" onClick={() => move(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            value={anchor}
            onChange={event => setAnchor(event.target.value)}
            className="w-full sm:w-40"
          />
          <Button size="icon" variant="outline" aria-label="Periodo siguiente" onClick={() => move(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          </div>
          <Button className="w-full sm:w-auto" variant="ghost" onClick={() => setAnchor(today)}>
            Hoy
          </Button>
          <div className="grid grid-cols-3 rounded-lg border p-1 sm:ml-auto sm:flex">
            {(["day", "week", "month"] as const).map(mode => (
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
    </div>

        <div
          className={`grid gap-4 ${view === "week" ? "xl:grid-cols-2" : view === "month" ? "lg:grid-cols-2 xl:grid-cols-3" : ""}`}
        >
      {days.map(([date, bookings]) => {
        const active = bookings.filter(item => item.status !== "cancelled");
            return (
              <Card
                key={date}
                className={date === today ? "border-amber-500" : ""}
              >
                <CardContent className="p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold capitalize">
                        {format(parseISO(date), "EEEE d 'de' MMMM", {
                          locale: es,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {active.reduce((sum, item) => sum + item.guests, 0)}{" "}
                        asistentes en {active.length} reservas
                      </p>
                    </div>
                    <Badge variant="outline">máx. 6 por horario</Badge>
                  </div>
                  <div className="space-y-3">
                    {bookings.map(booking => (
                      <BookingCard
                        key={booking.id}
                        booking={booking}
                        canManage={canManage}
                        onStatus={status =>
                          setStatus.mutate({ id: booking.id, status })
                        }
                        onPayments={() => {
                          setPaymentBooking(booking);
                          setNewPayment(
                            emptyPayment(
                              String(
                                Math.max(
                                  0,
                                  booking.amountClp - booking.amountPaidClp
                                )
                              )
                            )
                          );
                        }}
                        onReschedule={() => {
                          setRescheduleBooking(booking);
                          setRescheduleDate(
                            String(booking.bookingDate).slice(0, 10)
                          );
                          setRescheduleTime(booking.startTime);
                          setRescheduleReason("");
                          setRescheduleOverride(false);
                        }}
                      />
                    ))}
                    {!bookings.length && (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Sin reservas
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
      })}
    </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Nueva reserva de sauna</DialogTitle>
            </DialogHeader>
      <div className="grid gap-4 py-2 sm:grid-cols-2">
              <Field label="Tipo">
                <Select
                  value={form.kind}
                  onValueChange={(value: any) =>
                    setForm({
                      ...form,
                      kind: value,
                      serviceName:
                        value === "private"
                          ? "Sauna Nativo Privado"
                          : value === "staff"
                            ? "Sauna Nativo STAFF"
                            : "Sauna Nativo",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">Público compartido</SelectItem>
                    <SelectItem value="private">Privado</SelectItem>
                    <SelectItem value="staff">STAFF / Walk in</SelectItem>
                    <SelectItem value="manual">Excepción manual</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Personas">
                <Input
                  type="number"
                  min={1}
                  max={form.kind === "private" ? 6 : 5}
                  value={form.guests}
                  onChange={event =>
                    setForm({ ...form, guests: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Fecha">
                <Input
                  type="date"
                  value={form.bookingDate}
                  onChange={event =>
                    setForm({ ...form, bookingDate: event.target.value })
                  }
                />
              </Field>
              <Field label="Hora">
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={event =>
                    setForm({ ...form, startTime: event.target.value })
                  }
                />
              </Field>
              <Field label="Nombre">
                <Input
                  value={form.clientName}
                  onChange={event =>
                    setForm({ ...form, clientName: event.target.value })
                  }
                />
              </Field>
              <Field label="Teléfono">
                <Input
                  value={form.clientPhone}
                  onChange={event =>
                    setForm({ ...form, clientPhone: event.target.value })
                  }
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.clientEmail}
                  onChange={event =>
                    setForm({ ...form, clientEmail: event.target.value })
                  }
                />
              </Field>
              <Field label="Valor total">
                <Input
                  type="number"
                  min={0}
                  value={form.amountClp}
                  onChange={event => {
                    const amountClp = Number(event.target.value);
                    setForm({ ...form, amountClp });
                    if (payments.length === 1 && !payments[0].method)
                      setPayments([emptyPayment(String(amountClp))]);
                  }}
                />
              </Field>
              <div className="sm:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Pagos y abonos</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPayments(current => [...current, emptyPayment()])
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Otro pago
                  </Button>
                </div>
                {payments.map((payment, index) => (
                  <div key={index}>
                    <PaymentFields
                      payment={payment}
                      onChange={changes =>
                        setPayments(current =>
                          current.map((item, paymentIndex) =>
                            paymentIndex === index
                              ? { ...item, ...changes }
                              : item
                          )
                        )
                      }
                    />
                    {payments.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setPayments(current =>
                            current.filter(
                              (_, paymentIndex) => paymentIndex !== index
                            )
                          )
                        }
                      >
                        Quitar pago
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="sm:col-span-2">
                <Field label="Notas">
                  <Textarea
                    value={form.notes}
                    onChange={event =>
                      setForm({ ...form, notes: event.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {form.kind === "private" || form.guests >= 4
                ? "Esta reserva bloqueará inmediatamente los 6 cupos, aunque asistan 4 o 5 personas."
                : `Esta reserva consumirá ${form.guests} cupo${form.guests === 1 ? "" : "s"}; personas de otras reservas pueden compartir el mismo horario.`}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() =>
                  create.mutate({
                    ...form,
                    isPrivate: form.kind === "private" || form.guests >= 4,
                    clientEmail: form.clientEmail || undefined,
                    clientName: form.clientName || undefined,
                    clientPhone: form.clientPhone || undefined,
                    paymentMethod: undefined,
                    payments:
                      form.amountClp > 0
                        ? payments.map(payment => ({
                            method: payment.method as SaunaPaymentMethod,
                            status: payment.status,
                            amountClp: Number(payment.amountClp),
                            paidAt:
                              payment.status === "paid"
                                ? payment.paidAt
                                : undefined,
                            reference: payment.reference || undefined,
                            cardType: payment.cardType || undefined,
                            giftCardCode:
                              payment.method === "gift_card"
                                ? payment.giftCardCode
                                : undefined,
                          }))
                        : undefined,
                    notes: form.notes || undefined,
                  })
                }
                disabled={
                  create.isPending ||
                  (form.amountClp > 0 &&
                    (payments.some(payment => !paymentIsComplete(payment)) ||
                      payments.reduce(
                        (sum, payment) => sum + Number(payment.amountClp || 0),
                        0
                      ) > form.amountClp))
                }
              >
                {create.isPending ? "Guardando…" : "Crear reserva"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(paymentBooking)}
          onOpenChange={open => {
            if (!open) {
              setPaymentBooking(null);
              setEditingPaymentId(null);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Pagos · {paymentBooking?.clientName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg bg-amber-50 p-3 text-sm">
                Total:{" "}
                <strong>
                  ${" "}
                  {Number(paymentBooking?.amountClp ?? 0).toLocaleString(
                    "es-CL"
                  )}
                </strong>{" "}
                · Abonado:{" "}
                <strong>
                  ${" "}
                  {Number(paymentBooking?.amountPaidClp ?? 0).toLocaleString(
                    "es-CL"
                  )}
                </strong>{" "}
                · Saldo:{" "}
                <strong>
                  ${" "}
                  {Math.max(
                    0,
                    Number(paymentBooking?.amountClp ?? 0) -
                      Number(paymentBooking?.amountPaidClp ?? 0)
                  ).toLocaleString("es-CL")}
                </strong>
              </div>
              {editingPaymentId && (
                <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/30 p-3">
                  <div className="flex justify-between">
                    <strong>Editar pago</strong>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingPaymentId(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                  <PaymentFields
                    payment={editingPayment}
                    onChange={changes =>
                      setEditingPayment(current => ({ ...current, ...changes }))
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveEditingPayment}
                    disabled={
                      !paymentIsComplete(editingPayment) ||
                      updatePayment.isPending
                    }
                  >
                    Guardar pago
                  </Button>
                </div>
              )}
              {(paymentQuery.data ?? []).map(payment => (
                <div
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <div>
                    <strong>
                      {RESERVATION_PAYMENT_LABELS[
                        payment.method as ReservationPaymentMethod
                      ] ?? payment.method}{" "}
                      · $ {payment.amountClp.toLocaleString("es-CL")}
                    </strong>
                    <p className="text-xs text-muted-foreground">
                      {payment.status === "paid" ? "Pagado" : "Pendiente"}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                      {payment.cardType
                        ? ` · ${payment.cardType === "credit" ? "Crédito" : "Débito"}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {payment.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => confirmPendingPayment(payment)}
                      >
                        Marcar pagado
                      </Button>
                    )}
                    {!payment.giftCardId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => startEditingPayment(payment)}
                      >
                        <Edit className="mr-1 h-4 w-4" />
                        Editar
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      disabled={removePayment.isPending}
                      onClick={() =>
                        window.confirm(
                          "¿Eliminar este pago? El saldo se recalculará."
                        ) && removePayment.mutate({ paymentId: payment.id })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {!paymentQuery.data?.length &&
                paymentBooking?.source === "web" && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    <strong>Pago confirmado por Webpay.</strong> Este cobro está
                    protegido y no se puede editar ni eliminar.
                  </div>
                )}
              <Label>Agregar pago o abono</Label>
              <PaymentFields
                payment={newPayment}
                onChange={changes =>
                  setNewPayment(current => ({ ...current, ...changes }))
                }
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPaymentBooking(null)}>
                Cerrar
              </Button>
              <Button
                disabled={
                  !paymentIsComplete(newPayment) || addPayment.isPending
                }
                onClick={() =>
                  paymentBooking &&
                  addPayment.mutate({
                    bookingId: paymentBooking.id,
                    payment: {
                      method: newPayment.method as SaunaPaymentMethod,
                      status: newPayment.status,
                      amountClp: Number(newPayment.amountClp),
                      paidAt:
                        newPayment.status === "paid"
                          ? newPayment.paidAt
                          : undefined,
                      reference: newPayment.reference || undefined,
                      cardType: newPayment.cardType || undefined,
                      giftCardCode:
                        newPayment.method === "gift_card"
                          ? newPayment.giftCardCode
                          : undefined,
                    },
                  })
                }
              >
                Agregar pago
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={Boolean(rescheduleBooking)}
          onOpenChange={open => {
            if (!open) {
              setRescheduleBooking(null);
              setRescheduleReason("");
              setRescheduleOverride(false);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reagendar reserva</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nueva fecha">
                <Input
                  type="date"
                  value={rescheduleDate}
                  onChange={event => setRescheduleDate(event.target.value)}
                />
              </Field>
              <Field label="Nueva hora">
                <Input
                  type="time"
                  value={rescheduleTime}
                  onChange={event => setRescheduleTime(event.target.value)}
                />
              </Field>
            </div>
            <Field label="Motivo del reagendamiento">
              <Textarea
                value={rescheduleReason}
                onChange={event => setRescheduleReason(event.target.value)}
                placeholder="Explica la solicitud del cliente"
              />
            </Field>
            <ReschedulePolicyOverride
              checked={rescheduleOverride}
              onCheckedChange={setRescheduleOverride}
              policySummary="Mínimo 48 horas de anticipación y máximo 2 cambios para las reservas administradas por el CMS."
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRescheduleBooking(null)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() =>
                  rescheduleBooking &&
                  reschedule.mutate({
                    id: rescheduleBooking.id,
                    bookingDate: rescheduleDate,
                    startTime: rescheduleTime,
                    reason: rescheduleReason.trim(),
                    overridePolicy: rescheduleOverride,
                  })
                }
                disabled={
                  reschedule.isPending ||
                  !rescheduleDate ||
                  !rescheduleTime ||
                  rescheduleReason.trim().length <
                    (rescheduleOverride ? 10 : 3)
                }
              >
                {rescheduleOverride
                  ? "Reagendar como excepción"
                  : "Reagendar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function BookingCard({
  booking,
  canManage,
  onStatus,
  onReschedule,
  onPayments,
}: {
  booking: any;
  canManage: boolean;
  onStatus: (
    status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show"
  ) => void;
  onReschedule: () => void;
  onPayments: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${booking.status === "cancelled" ? "opacity-50" : booking.isPrivate ? "border-amber-300 bg-amber-50" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <strong className="text-lg">{booking.startTime}</strong>
          <span className="text-muted-foreground">– {booking.endTime}</span>
          {booking.isPrivate ? (
            <Badge>
              <LockKeyhole className="mr-1 h-3 w-3" />
              Privado · 6 cupos
            </Badge>
          ) : (
            <Badge variant="outline">
              <Users className="mr-1 h-3 w-3" />
              {booking.guests} persona{booking.guests === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <Badge
          variant={
            booking.status === "cancelled"
              ? "destructive"
              : booking.isConfirmed
                ? "default"
                : "secondary"
          }
        >
          {booking.status}
        </Badge>
      </div>
      <p className="mt-2 font-medium">
        {booking.clientName || "Cliente Skedu"}
      </p>
      <p className="text-sm text-muted-foreground">{booking.serviceName}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{booking.origin || booking.source}</Badge>
        <Badge variant="outline">Pago: {booking.paymentStatus}</Badge>
        <Badge variant="outline">
          Abonado $ {Number(booking.amountPaidClp ?? 0).toLocaleString("es-CL")}
        </Badge>
        <Badge variant="outline">
          Reagendamientos: {booking.rescheduleCount}
        </Badge>
        {!booking.isConfirmed && (
          <Badge variant="secondary">Sin confirmar</Badge>
        )}
      </div>
      {booking.source === "skedu" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Cambios operacionales: gestionar en Skedu; el CMS los reflejará
          automáticamente.
        </p>
      ) : (
        canManage &&
        booking.status !== "cancelled" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onPayments}>
              Pagos
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatus("confirmed")}
            >
              Confirmar
            </Button>
            <Button size="sm" variant="outline" onClick={onReschedule}>
              Reagendar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatus("completed")}
            >
              Completada
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600"
              onClick={() => onStatus("cancelled")}
            >
              Cancelar
            </Button>
          </div>
        )
      )}
    </div>
  );
}
