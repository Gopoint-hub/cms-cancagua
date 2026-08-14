import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import {
  addDays,
  format,
  parseISO,
  subDays,
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
  AlertTriangle,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
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
const paymentMethodLabel: Record<string, string> = {
  payment_link: "Link de pago",
  bank_transfer: "Transferencia",
  cash: "Efectivo",
  transbank_machine: "Máquina Transbank",
  gift_card: "Gift Card",
};
const occupancyStatuses = new Set(["pending", "confirmed", "completed"]);

function serviceTone(name: string) {
  return name.toLowerCase().includes("navega")
    ? { card: "border-amber-200 bg-amber-50/60", badge: "border-amber-300 bg-amber-100 text-amber-900" }
    : { card: "border-cyan-200 bg-cyan-50/60", badge: "border-cyan-300 bg-cyan-100 text-cyan-900" };
}
type PaymentMethod = "payment_link" | "bank_transfer" | "cash" | "transbank_machine" | "gift_card";
type PaymentDraft = {
  method: PaymentMethod | "";
  status: "pending" | "paid";
  amountClp: string;
  paidAt: string;
  reference: string;
  cardType: "credit" | "debit" | "";
  giftCardCode: string;
};

function chileDateTimeInput() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function emptyPayment(amountClp = ""): PaymentDraft {
  return { method: "", status: "paid", amountClp, paidAt: chileDateTimeInput(), reference: "", cardType: "", giftCardCode: "" };
}

function bookingDate(value: unknown) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function paymentDateLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function BiopiscinasAgenda() {
  const search = useSearch();
  const { user } = useAuth();
  const canManage = hasCmsPermission(user ?? {}, "biopools.manage_agenda");
  const initialDate = new URLSearchParams(search).get("date") ?? localDate();
  const [date, setDate] = useState(initialDate);
  const [selectedServiceId, setSelectedServiceId] = useState<number | "all">("all");
  const [manualServiceId, setManualServiceId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [rescheduleBooking, setRescheduleBooking] = useState<{
    id: number;
    serviceId: number;
    totalGuests: number;
    clientName: string;
    bookingDate: string;
    startTime: string;
    rescheduleCount: number;
  } | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(localDate());
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleOverride, setRescheduleOverride] = useState(false);
  const [payments, setPayments] = useState<PaymentDraft[]>([emptyPayment()]);
  const [paymentBooking, setPaymentBooking] = useState<{ id: number; clientName: string; totalClp: number; amountPaidClp: number } | null>(null);
  const [additionalPayment, setAdditionalPayment] = useState<PaymentDraft>(emptyPayment());
  const [form, setForm] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    adultQuantity: 1,
    childQuantity: 0,
    notes: "",
  });
  const [manualDiscountCode, setManualDiscountCode] = useState("");
  const [appliedManualDiscount, setAppliedManualDiscount] = useState<{
    code: string;
    discountTotal: number;
    finalTotal: number;
  } | null>(null);
  const utils = trpc.useUtils();
  const { data: services } = trpc.biopools.services.list.useQuery();
  const activeServices = useMemo(
    () => services?.filter(item => item.status !== "archived") ?? [],
    [services]
  );
  const selectedService =
    selectedServiceId === "all"
      ? undefined
      : activeServices.find(item => item.id === selectedServiceId);
  const manualService =
    activeServices.find(item => item.id === manualServiceId) ??
    selectedService ??
    activeServices[0];
  const { data: detail } = trpc.biopools.services.get.useQuery(
    { id: manualService?.id ?? 0 },
    { enabled: Boolean(manualService) }
  );
  const selected = parseISO(date);
  const { data: availability } =
    trpc.biopools.availability.day.useQuery(
      { serviceId: selectedService?.id ?? 0, date },
      {
        enabled: Boolean(selectedService),
        refetchInterval: 30_000,
      }
    );
  const { data: allAvailability } =
    trpc.biopools.availability.all.useQuery(
      { date },
      { enabled: selectedServiceId === "all", refetchInterval: 30_000 }
    );
  const availabilityRows = useMemo(
    () => selectedServiceId === "all"
      ? (allAvailability ?? [])
      : (availability ? [availability] : []),
    [allAvailability, availability, selectedServiceId]
  );
  const manualAvailability = availabilityRows.find(
    item => item.service.id === manualService?.id
  );
  const { data: rescheduleAvailability } =
    trpc.biopools.availability.day.useQuery(
      { serviceId: rescheduleBooking?.serviceId ?? 0, date: rescheduleDate },
      { enabled: Boolean(rescheduleBooking) }
    );
  const { data: bookings, isLoading } = trpc.biopools.bookings.list.useQuery(
    {
      serviceId: selectedServiceId === "all" ? undefined : selectedServiceId,
      from: date,
      to: date,
    },
    { enabled: activeServices.length > 0, refetchInterval: 30_000 }
  );
  const { data: paymentDetail } = trpc.biopools.bookings.get.useQuery(
    { id: paymentBooking?.id ?? 0 },
    { enabled: Boolean(paymentBooking) }
  );
  const paymentRows = useMemo(() => {
    if (!paymentDetail) return [];
    const rows: Array<{
      id: string;
      method: string;
      date: unknown;
      detail: string;
      amountClp: number;
      status: string;
      paymentId?: number;
      paymentMethod?: string;
    }> = [];
    if (paymentDetail.booking.discountCode && paymentDetail.booking.discountAmountClp > 0) {
      rows.push({
        id: "discount",
        method: "Código de descuento",
        date: paymentDetail.checkoutOrder?.createdAt ?? paymentDetail.booking.createdAt,
        detail: paymentDetail.booking.discountCode,
        amountClp: paymentDetail.booking.discountAmountClp,
        status: "discount",
      });
    }
    if (paymentDetail.checkoutOrder && paymentDetail.checkoutOrder.totalClp > 0) {
      rows.push({
        id: `webpay-${paymentDetail.checkoutOrder.id}`,
        method: "Webpay",
        date: paymentDetail.checkoutOrder.paidAt ?? paymentDetail.checkoutOrder.transactionDate ?? paymentDetail.checkoutOrder.createdAt,
        detail: paymentDetail.checkoutOrder.authorizationCode ?? paymentDetail.checkoutOrder.buyOrder ?? "—",
        amountClp: paymentDetail.checkoutOrder.totalClp,
        status: paymentDetail.checkoutOrder.status === "paid" ? "paid" : "pending",
      });
    }
    for (const payment of paymentDetail.payments) {
      rows.push({
        id: `payment-${payment.id}`,
        method: paymentMethodLabel[payment.method] ?? payment.method,
        date: payment.paidAt ?? payment.createdAt,
        detail: payment.reference ?? (payment.cardType ? payment.cardType === "credit" ? "Crédito" : "Débito" : "—"),
        amountClp: payment.amountClp,
        status: payment.status,
        paymentId: payment.id,
        paymentMethod: payment.method,
      });
    }
    return rows;
  }, [paymentDetail]);
  const create = trpc.biopools.bookings.create.useMutation({
    onSuccess: () => {
      toast.success("Reserva creada y comunicaciones programadas");
      setOpen(false);
      setManualDiscountCode("");
      setAppliedManualDiscount(null);
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const validateManualDiscount = trpc.biopools.public.validateDiscount.useMutation({
    onSuccess: result => {
      setAppliedManualDiscount(result);
      setManualDiscountCode(result.code);
      setPayments(result.finalTotal === 0 ? [] : [emptyPayment(String(result.finalTotal))]);
      toast.success(`Código ${result.code} aplicado`);
    },
    onError: error => {
      setAppliedManualDiscount(null);
      toast.error(error.message);
    },
  });
  const addPayment = trpc.biopools.bookings.addPayment.useMutation({
    onSuccess: () => {
      toast.success("Pago agregado a la reserva");
      setAdditionalPayment(emptyPayment());
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const completePayment = trpc.biopools.bookings.completePayment.useMutation({
    onSuccess: () => {
      toast.success("Pago confirmado");
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
  const hideCancelled = trpc.biopools.bookings.hideCancelledFromAgenda.useMutation({
    onSuccess: () => {
      toast.success("Reserva eliminada de la agenda; el historial quedó guardado");
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const reactivate = trpc.biopools.bookings.reactivate.useMutation({
    onSuccess: () => {
      toast.success("Reserva reactivada y cupos restaurados");
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
      toast.success("Reserva reagendada correctamente");
      setRescheduleBooking(null);
      setRescheduleOverride(false);
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const adultPrice =
    detail?.tickets.find(ticket => ticket.code === "adult")?.priceClp ?? 0;
  const childPrice =
    detail?.tickets.find(ticket => ticket.code === "child")?.priceClp ?? 0;
  useEffect(() => {
    if (detail && !detail.tickets.some(ticket => ticket.code === "child")) {
      setForm(current => current.childQuantity === 0
        ? current
        : { ...current, childQuantity: 0 });
    }
  }, [detail]);
  const subtotal =
    form.adultQuantity * adultPrice + form.childQuantity * childPrice;
  const total = appliedManualDiscount?.finalTotal ?? subtotal;
  const plannedPayments = payments.reduce((sum, payment) => sum + (Number(payment.amountClp) || 0), 0);
  useEffect(() => {
    setAppliedManualDiscount(null);
    setPayments(current => current.length ? current : [emptyPayment(String(subtotal))]);
  }, [manualService?.id, form.adultQuantity, form.childQuantity, subtotal]);
  const selectedSlot = manualAvailability?.slots.find(
    slot => slot.startTime === startTime
  );
  useEffect(() => {
    if (
      manualAvailability?.slots.length &&
      !manualAvailability.slots.some(slot => slot.startTime === startTime)
    )
      setStartTime(manualAvailability.slots[0].startTime);
  }, [manualAvailability, startTime]);

  const activeDayBookings = useMemo(
    () => (bookings ?? [])
      .filter(booking => bookingDate(booking.bookingDate) === date && occupancyStatuses.has(booking.status))
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.clientName.localeCompare(b.clientName)),
    [bookings, date]
  );
  const openCreate = (serviceId: number, slot: string) => {
    setManualServiceId(serviceId);
    setStartTime(slot);
    setPayments([emptyPayment(String(subtotal))]);
    setManualDiscountCode("");
    setAppliedManualDiscount(null);
    setOpen(true);
  };
  const updatePayment = (index: number, changes: Partial<PaymentDraft>) => {
    setPayments(current => current.map((payment, paymentIndex) => paymentIndex === index ? { ...payment, ...changes } : payment));
  };
  const paymentIsComplete = (payment: PaymentDraft) => {
    if (!payment.method || !Number(payment.amountClp) || Number(payment.amountClp) <= 0) return false;
    if (payment.method === "gift_card") return Boolean(payment.giftCardCode.trim());
    if (payment.status === "pending") return payment.method === "payment_link";
    if (!payment.paidAt) return false;
    if (payment.method !== "cash" && !payment.reference.trim()) return false;
    if (["payment_link", "transbank_machine"].includes(payment.method) && !payment.cardType) return false;
    return true;
  };
  const submitAdditionalPayment = () => {
    if (!paymentBooking || !paymentIsComplete(additionalPayment)) return;
    addPayment.mutate({
      bookingId: paymentBooking.id,
      payment: {
        method: additionalPayment.method as PaymentMethod,
        status: additionalPayment.status,
        amountClp: Number(additionalPayment.amountClp),
        paidAt: additionalPayment.status === "paid" ? additionalPayment.paidAt : undefined,
        reference: additionalPayment.reference || undefined,
        cardType: additionalPayment.cardType || undefined,
        giftCardCode: additionalPayment.method === "gift_card" ? additionalPayment.giftCardCode : undefined,
      },
    });
  };
  const confirmPendingPayment = (payment: { id: number; method: string }) => {
    const paidAt = window.prompt("Fecha y hora del pago (AAAA-MM-DDTHH:MM):", chileDateTimeInput());
    if (!paidAt) return;
    const reference = payment.method === "cash" ? undefined : window.prompt("Código o referencia del pago:")?.trim();
    if (payment.method !== "cash" && !reference) return;
    let cardType: "credit" | "debit" | undefined;
    if (["payment_link", "transbank_machine"].includes(payment.method)) {
      const answer = window.prompt("Tipo de tarjeta: escribe crédito o débito")?.trim().toLowerCase();
      if (answer === "crédito" || answer === "credito") cardType = "credit";
      else if (answer === "débito" || answer === "debito") cardType = "debit";
      else return toast.error("Debes indicar crédito o débito");
    }
    completePayment.mutate({ paymentId: payment.id, paidAt, reference, cardType });
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
  const removeCancelledFromAgenda = (id: number, clientName: string) => {
    if (window.confirm(`¿Eliminar de la agenda la reserva cancelada de ${clientName}? El historial y los pagos se conservarán.`))
      hideCancelled.mutate({ id });
  };
  const reactivateBooking = (id: number, clientName: string) => {
    if (window.confirm(`¿Reactivar la reserva de ${clientName}? Se comprobarán nuevamente los cupos antes de confirmarla.`))
      reactivate.mutate({ id });
  };
  const openReschedule = (booking: {
    id: number;
    serviceId: number;
    totalGuests: number;
    clientName: string;
    bookingDate: unknown;
    startTime: string;
    rescheduleCount: number;
  }) => {
    setRescheduleBooking({
      id: booking.id,
      serviceId: booking.serviceId,
      totalGuests: booking.totalGuests,
      clientName: booking.clientName,
      bookingDate: String(booking.bookingDate).slice(0, 10),
      startTime: booking.startTime,
      rescheduleCount: booking.rescheduleCount,
    });
    setRescheduleDate(String(booking.bookingDate).slice(0, 10));
    setRescheduleTime(booking.startTime);
    setRescheduleReason("");
    setRescheduleOverride(false);
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
    if (!manualService) return;
    create.mutate({
      ...form,
      serviceId: manualService.id,
      bookingDate: date,
      startTime,
      source: "cms",
      discountCode: appliedManualDiscount?.code,
      discountAmountClp: appliedManualDiscount?.discountTotal ?? 0,
      payments: payments.map(payment => ({
        method: payment.method as PaymentMethod,
        status: payment.status,
        amountClp: Number(payment.amountClp),
        paidAt: payment.status === "paid" ? payment.paidAt : undefined,
        reference: payment.reference || undefined,
        cardType: payment.cardType || undefined,
        giftCardCode: payment.method === "gift_card" ? payment.giftCardCode : undefined,
      })),
      notes: form.notes || undefined,
    });
  };
  const move = (direction: -1 | 1) => {
    const current = parseISO(date);
    const next = direction < 0 ? subDays(current, 1) : addDays(current, 1);
    setDate(format(next, "yyyy-MM-dd"));
  };
  const calendarTitle = format(selected, "EEEE d 'de' MMMM yyyy", { locale: es });
  const cancelledBookings = (bookings ?? []).filter(
    item => bookingDate(item.bookingDate) === date && item.status === "cancelled"
  );
  const cancelledInAgenda = cancelledBookings.filter(item => !item.agendaHiddenAt);
  const removedFromAgenda = cancelledBookings.filter(item => Boolean(item.agendaHiddenAt));
  const serviceName = (serviceId: number) =>
    activeServices.find(item => item.id === serviceId)?.name ?? "Biopiscinas";

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
              value={String(selectedServiceId)}
              onValueChange={value => {
                setSelectedServiceId(value === "all" ? "all" : Number(value));
                setManualServiceId(value === "all" ? null : Number(value));
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecciona modalidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los servicios</SelectItem>
                {activeServices.map(item => (
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
                disabled={!manualService}
                onClick={() => {
                  const target = availabilityRows.find(
                    item => item.service.id === manualService?.id
                  );
                  if (manualService)
                    openCreate(manualService.id, target?.slots[0]?.startTime ?? "10:00");
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Reserva manual
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3">
          <Button variant="outline" size="sm" onClick={() => setDate(localDate())}>Hoy</Button>
          <p className="min-w-52 text-sm font-semibold capitalize">{calendarTitle}</p>
        </div>
        {isLoading ? (
          <p>Cargando reservas…</p>
        ) : !activeDayBookings.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Sin reservas para este día.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeDayBookings.map(booking => (
              <Card key={booking.id} className={serviceTone(serviceName(booking.serviceId)).card}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-lg">{booking.startTime}–{booking.endTime}</span>
                        <Badge variant="outline" className={serviceTone(serviceName(booking.serviceId)).badge}>
                          {serviceName(booking.serviceId)}
                        </Badge>
                        <Badge variant="outline">{statusLabel[booking.status]}</Badge>
                        <Badge variant={booking.paymentStatus === "paid" ? "secondary" : "outline"}>
                          {booking.paymentStatus === "paid"
                            ? "Pagada"
                            : booking.paymentStatus === "partially_paid"
                              ? "Pago parcial"
                              : booking.paymentStatus === "refunded"
                                ? "Reembolsada"
                                : "Pago pendiente"}
                        </Badge>
                        {booking.refundStatus === "pending" && (
                          <Badge variant="destructive">
                            Reembolso pendiente · {clp.format(booking.refundAmountClp)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 font-medium">{booking.clientName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {booking.adultQuantity} adulto(s) · {booking.childQuantity} niño(s) · {clp.format(booking.originalAmountClp - booking.discountAmountClp)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Abonado: {clp.format(booking.amountPaidClp)} · Saldo: {clp.format(Math.max(0, booking.originalAmountClp - booking.discountAmountClp - booking.amountPaidClp))}
                      </p>
                      {booking.refundStatus === "pending" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Descuento transacción: {clp.format(booking.refundFeeAmountClp)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                            {canManage && booking.status !== "cancelled" && (
                              <Button size="sm" variant="outline" onClick={() => {
                                const totalClp = booking.originalAmountClp - booking.discountAmountClp;
                                setPaymentBooking({ id: booking.id, clientName: booking.clientName, totalClp, amountPaidClp: booking.amountPaidClp });
                                setAdditionalPayment(emptyPayment(String(Math.max(0, totalClp - booking.amountPaidClp))));
                              }}>
                                <Plus className="mr-1 h-4 w-4" /> Pagos
                              </Button>
                            )}
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {cancelledInAgenda.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader><CardTitle className="text-lg">Reservas canceladas</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {cancelledInAgenda.map(booking => (
                <div key={`cancelled-${booking.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{booking.clientName}</strong>
                      <Badge variant="outline">{serviceName(booking.serviceId)}</Badge>
                      <Badge variant="outline">Cancelada</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{booking.startTime}–{booking.endTime} · {booking.totalGuests} persona(s)</p>
                    {booking.cancellationReason && <p className="mt-1 text-xs text-muted-foreground">Motivo: {booking.cancellationReason}</p>}
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => reactivateBooking(booking.id, booking.clientName)} disabled={reactivate.isPending}>
                        <RotateCcw className="mr-1 h-4 w-4" /> Reactivar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => removeCancelledFromAgenda(booking.id, booking.clientName)} disabled={hideCancelled.isPending}>
                        <Trash2 className="mr-1 h-4 w-4" /> Eliminar de la agenda
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {removedFromAgenda.length > 0 && (
          <Card className="border-dashed bg-muted/30">
            <CardHeader><CardTitle className="text-base text-muted-foreground">Eliminadas de la agenda</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {removedFromAgenda.map(booking => (
                <div key={`removed-${booking.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                  <div className="text-sm">
                    <span className="font-semibold">{booking.clientName}</span>
                    <span className="text-muted-foreground"> · {booking.startTime} · {booking.totalGuests} persona(s) · {serviceName(booking.serviceId)}</span>
                  </div>
                  {canManage && (
                    <Button size="sm" variant="outline" onClick={() => reactivateBooking(booking.id, booking.clientName)} disabled={reactivate.isPending}>
                      <RotateCcw className="mr-1 h-4 w-4" /> Reactivar
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Nueva reserva · {manualService?.name} · {date} a las {startTime}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              {selectedServiceId === "all" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Servicio</Label>
                  <Select
                    value={manualService ? String(manualService.id) : undefined}
                    onValueChange={value => {
                      const serviceId = Number(value);
                      const target = availabilityRows.find(
                        item => item.service.id === serviceId
                      );
                      setManualServiceId(serviceId);
                      setStartTime(current =>
                        target?.slots.some(slot => slot.startTime === current)
                          ? current
                          : target?.slots[0]?.startTime ?? ""
                      );
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecciona servicio" /></SelectTrigger>
                    <SelectContent>
                      {activeServices.map(item => (
                        <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                  disabled={!detail?.tickets.some(ticket => ticket.code === "child")}
                  value={form.childQuantity}
                  onChange={e =>
                    setForm({ ...form, childQuantity: Number(e.target.value) })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Todo niño debe asistir con un adulto.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Código de descuento</Label>
                <div className="flex gap-2">
                  <Input
                    value={manualDiscountCode}
                    onChange={event => {
                      setManualDiscountCode(event.target.value.toUpperCase());
                      setAppliedManualDiscount(null);
                    }}
                    placeholder="Ingresa el código"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!manualDiscountCode.trim() || validateManualDiscount.isPending || !manualService}
                    onClick={() => manualService && validateManualDiscount.mutate({
                      serviceId: manualService.id,
                      adultQuantity: form.adultQuantity,
                      childQuantity: form.childQuantity,
                      code: manualDiscountCode,
                    })}
                  >
                    {validateManualDiscount.isPending ? "Validando…" : "Aplicar"}
                  </Button>
                </div>
                {appliedManualDiscount && (
                  <p className="text-sm font-medium text-emerald-700">
                    {appliedManualDiscount.code} aplicado · descuento {clp.format(appliedManualDiscount.discountTotal)}
                  </p>
                )}
              </div>
              <div className="space-y-3 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>Pagos y abonos</Label>
                  {total > 0 && <Button type="button" size="sm" variant="outline" onClick={() => setPayments(current => [...current, emptyPayment()])}>
                    <Plus className="mr-1 h-4 w-4" /> Agregar otro pago
                  </Button>}
                </div>
                {total === 0 && appliedManualDiscount && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                    El código cubre el 100% de la reserva. No se requiere medio de pago.
                  </div>
                )}
                {total > 0 && payments.map((payment, index) => (
                  <div key={index} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Medio de pago</Label>
                      <Select value={payment.method} onValueChange={value => updatePayment(index, { method: value as PaymentMethod, giftCardCode: "", reference: "", cardType: "", status: value === "payment_link" ? "pending" : "paid" })}>
                        <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="payment_link">Link de pago</SelectItem>
                          <SelectItem value="bank_transfer">Transferencia</SelectItem>
                          <SelectItem value="cash">Efectivo</SelectItem>
                          <SelectItem value="transbank_machine">Máquina Transbank</SelectItem>
                          <SelectItem value="gift_card">Canjear Gift Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Monto</Label>
                      <Input type="number" min={1} value={payment.amountClp} onChange={event => updatePayment(index, { amountClp: event.target.value })} />
                    </div>
                    {payment.method === "payment_link" && (
                      <div className="space-y-2">
                        <Label>Estado</Label>
                        <Select value={payment.status} onValueChange={value => updatePayment(index, { status: value as "pending" | "paid" })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="pending">Link enviado / pendiente</SelectItem><SelectItem value="paid">Pago confirmado</SelectItem></SelectContent>
                        </Select>
                      </div>
                    )}
                    {payment.status === "paid" && (
                      <div className="space-y-2">
                        <Label>Fecha y hora del pago</Label>
                        <Input type="datetime-local" value={payment.paidAt} onChange={event => updatePayment(index, { paidAt: event.target.value })} />
                      </div>
                    )}
                    {payment.method === "gift_card" ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Código de Gift Card</Label>
                        <Input value={payment.giftCardCode} onChange={event => updatePayment(index, { giftCardCode: event.target.value.toUpperCase() })} />
                      </div>
                    ) : payment.status === "paid" && payment.method !== "cash" ? (
                      <div className="space-y-2">
                        <Label>Código o referencia</Label>
                        <Input value={payment.reference} onChange={event => updatePayment(index, { reference: event.target.value })} />
                      </div>
                    ) : null}
                    {payment.status === "paid" && ["payment_link", "transbank_machine"].includes(payment.method) && (
                      <div className="space-y-2">
                        <Label>Tipo de tarjeta</Label>
                        <Select value={payment.cardType} onValueChange={value => updatePayment(index, { cardType: value as "credit" | "debit" })}>
                          <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                          <SelectContent><SelectItem value="credit">Crédito</SelectItem><SelectItem value="debit">Débito</SelectItem></SelectContent>
                        </Select>
                      </div>
                    )}
                    {payments.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" className="sm:col-span-2" onClick={() => setPayments(current => current.filter((_, paymentIndex) => paymentIndex !== index))}>Quitar este pago</Button>
                    )}
                  </div>
                ))}
                <div className="flex justify-between text-sm"><span>Pagos ingresados: <strong>{clp.format(plannedPayments)}</strong></span><span>Saldo sin asignar: <strong>{clp.format(Math.max(0, total - plannedPayments))}</strong></span></div>
              </div>
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
              <div className="text-right">
                {appliedManualDiscount && <p className="text-xs text-emerald-700">Subtotal {clp.format(subtotal)} · {appliedManualDiscount.code}: −{clp.format(appliedManualDiscount.discountTotal)}</p>}
                <span>Total: <strong>{clp.format(total)}</strong></span>
              </div>
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
                  (Boolean(manualDiscountCode.trim()) && !appliedManualDiscount) ||
                  (total > 0 && payments.length === 0) ||
                  payments.some(payment => !paymentIsComplete(payment)) ||
                  plannedPayments > total ||
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

        <Dialog open={Boolean(paymentBooking)} onOpenChange={next => !next && setPaymentBooking(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Pagos · {paymentBooking?.clientName}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl bg-cyan-50 p-3 text-sm flex flex-wrap justify-between gap-3">
                <span>Subtotal: <strong>{clp.format(paymentDetail?.booking.originalAmountClp ?? paymentBooking?.totalClp ?? 0)}</strong></span>
                {(paymentDetail?.booking.discountAmountClp ?? 0) > 0 && (
                  <span className="text-emerald-700">
                    Descuento{paymentDetail?.booking.discountCode ? ` · ${paymentDetail.booking.discountCode}` : ""}: <strong>−{clp.format(paymentDetail?.booking.discountAmountClp ?? 0)}</strong>
                  </span>
                )}
                <span>Total: <strong>{clp.format(paymentBooking?.totalClp ?? 0)}</strong></span>
                <span>Abonado: <strong>{clp.format(paymentDetail?.booking.amountPaidClp ?? paymentBooking?.amountPaidClp ?? 0)}</strong></span>
                <span>Saldo: <strong>{clp.format(Math.max(0, (paymentBooking?.totalClp ?? 0) - (paymentDetail?.booking.amountPaidClp ?? paymentBooking?.amountPaidClp ?? 0)))}</strong></span>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <div className="min-w-[680px]">
                  <div className="grid grid-cols-[1.3fr_1fr_1.2fr_.8fr] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Método</span><span>Fecha</span><span>Detalle</span><span className="text-right">Monto</span>
                  </div>
                  {paymentRows.map(row => (
                    <div key={row.id} className="grid grid-cols-[1.3fr_1fr_1.2fr_.8fr] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0">
                      <div>
                        <strong>{row.method}</strong>
                        <p className={`text-xs ${row.status === "discount" ? "text-emerald-700" : "text-muted-foreground"}`}>
                          {row.status === "discount" ? "Aplicado" : row.status === "paid" ? "Pagado" : "Pendiente"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{paymentDateLabel(row.date)}</span>
                      <span className={row.status === "discount" ? "font-mono text-xs font-semibold text-violet-700" : "text-xs"}>{row.detail}</span>
                      <div className="text-right">
                        <strong className={row.status === "discount" ? "text-emerald-700" : ""}>
                          {row.status === "discount" ? "−" : ""}{clp.format(row.amountClp)}
                        </strong>
                        {row.status === "pending" && row.paymentId && row.paymentMethod && (
                          <Button className="mt-1" size="sm" variant="outline" onClick={() => confirmPendingPayment({ id: row.paymentId!, method: row.paymentMethod! })} disabled={completePayment.isPending}>Marcar pagado</Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!paymentRows.length && <p className="p-4 text-sm text-muted-foreground">Esta reserva todavía no tiene pagos detallados.</p>}
                </div>
              </div>
              <div className="flex justify-between border-t pt-3 text-sm">
                <span>Monto pendiente</span>
                <strong>{clp.format(Math.max(0, (paymentBooking?.totalClp ?? 0) - (paymentDetail?.booking.amountPaidClp ?? paymentBooking?.amountPaidClp ?? 0)))}</strong>
              </div>
              <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nuevo medio de pago</Label>
                  <Select value={additionalPayment.method} onValueChange={value => setAdditionalPayment(current => ({ ...current, method: value as PaymentMethod, status: value === "payment_link" ? "pending" : "paid", reference: "", giftCardCode: "", cardType: "" }))}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="payment_link">Link de pago</SelectItem><SelectItem value="bank_transfer">Transferencia</SelectItem><SelectItem value="cash">Efectivo</SelectItem><SelectItem value="transbank_machine">Máquina Transbank</SelectItem><SelectItem value="gift_card">Canjear Gift Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Monto</Label><Input type="number" min={1} value={additionalPayment.amountClp} onChange={event => setAdditionalPayment(current => ({ ...current, amountClp: event.target.value }))} /></div>
                {additionalPayment.method === "payment_link" && <div className="space-y-2"><Label>Estado</Label><Select value={additionalPayment.status} onValueChange={value => setAdditionalPayment(current => ({ ...current, status: value as "pending" | "paid" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Link enviado / pendiente</SelectItem><SelectItem value="paid">Pago confirmado</SelectItem></SelectContent></Select></div>}
                {additionalPayment.status === "paid" && <div className="space-y-2"><Label>Fecha y hora</Label><Input type="datetime-local" value={additionalPayment.paidAt} onChange={event => setAdditionalPayment(current => ({ ...current, paidAt: event.target.value }))} /></div>}
                {additionalPayment.method === "gift_card" ? <div className="space-y-2 sm:col-span-2"><Label>Código Gift Card</Label><Input value={additionalPayment.giftCardCode} onChange={event => setAdditionalPayment(current => ({ ...current, giftCardCode: event.target.value.toUpperCase() }))} /></div> : additionalPayment.status === "paid" && additionalPayment.method !== "cash" ? <div className="space-y-2"><Label>Código o referencia</Label><Input value={additionalPayment.reference} onChange={event => setAdditionalPayment(current => ({ ...current, reference: event.target.value }))} /></div> : null}
                {additionalPayment.status === "paid" && ["payment_link", "transbank_machine"].includes(additionalPayment.method) && <div className="space-y-2"><Label>Tipo de tarjeta</Label><Select value={additionalPayment.cardType} onValueChange={value => setAdditionalPayment(current => ({ ...current, cardType: value as "credit" | "debit" }))}><SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger><SelectContent><SelectItem value="credit">Crédito</SelectItem><SelectItem value="debit">Débito</SelectItem></SelectContent></Select></div>}
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setPaymentBooking(null)}>Cerrar</Button><Button onClick={submitAdditionalPayment} disabled={addPayment.isPending || !paymentIsComplete(additionalPayment)}>Agregar pago</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(rescheduleBooking)}
          onOpenChange={next => {
            if (!next) {
              setRescheduleBooking(null);
              setRescheduleOverride(false);
            }
          }}
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
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Recuerda la política de reagendamiento</p>
                    <p className="mt-1 text-xs">
                      Debe solicitarse con al menos{" "}
                      {rescheduleAvailability?.service.rescheduleNoticeHours ?? 48} horas
                      de anticipación y admite un máximo de{" "}
                      {rescheduleAvailability?.service.maxStaffReschedules ?? 2} cambios.
                      Esta reserva lleva {rescheduleBooking?.rescheduleCount ?? 0}.
                    </p>
                  </div>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={rescheduleOverride}
                  onChange={event => setRescheduleOverride(event.target.checked)}
                />
                <span>
                  <span className="font-medium">Aplicar excepción autorizada</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Úsala solo con autorización de Operaciones. El motivo, la persona
                    responsable y el incumplimiento de la política quedarán registrados.
                  </span>
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Los recordatorios pendientes se reemplazarán solo si todavía corresponde
                enviarlos para la nueva fecha.
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
                  rescheduleReason.trim().length < (rescheduleOverride ? 10 : 3) ||
                  reschedule.isPending
                }
                onClick={() =>
                  rescheduleBooking &&
                  reschedule.mutate({
                    id: rescheduleBooking.id,
                    bookingDate: rescheduleDate,
                    startTime: rescheduleTime,
                    reason: rescheduleReason,
                    overridePolicy: rescheduleOverride,
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
