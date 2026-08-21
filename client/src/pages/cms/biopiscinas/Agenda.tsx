import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { addDays, format, parseISO, subDays } from "date-fns";
import { es } from "date-fns/locale";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Reservation360DetailDialog,
  type Reservation360Event,
} from "@/components/cms/Reservation360DetailDialog";
import { ReschedulePolicyOverride } from "@/components/cms/ReschedulePolicyOverride";
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
import { hasCmsPermission, hasGiftCardAccess } from "@shared/permissions";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronLeft,
  ChevronRight,
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
  pending_payment: "Pendiente de pago",
  payment_link: "Link de pago",
  bank_transfer: "Transferencia",
  cash: "Efectivo",
  transbank_machine: "Máquina Transbank",
  gift_card: "Gift Card",
};
const occupancyStatuses = new Set(["pending", "confirmed", "completed"]);

function serviceTone(name: string) {
  return name.toLowerCase().includes("navega")
    ? {
        card: "border-amber-200 bg-amber-50/60",
        badge: "border-amber-300 bg-amber-100 text-amber-900",
      }
    : {
        card: "border-cyan-200 bg-cyan-50/60",
        badge: "border-cyan-300 bg-cyan-100 text-cyan-900",
      };
}
type PaymentMethod =
  | "pending_payment"
  | "payment_link"
  | "bank_transfer"
  | "cash"
  | "transbank_machine"
  | "gift_card";
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

function paymentDateTimeInput(value: unknown) {
  if (!value) return chileDateTimeInput();
  const date = new Date(value as string | number | Date);
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

export default function BiopiscinasAgenda() {
  const search = useSearch();
  const { user } = useAuth();
  const canManage = hasCmsPermission(user ?? {}, "biopools.manage_agenda");
  const canRedeemGiftCards = hasGiftCardAccess(user ?? {});
  const initialDate = new URLSearchParams(search).get("date") ?? localDate();
  const [date, setDate] = useState(initialDate);
  const [selectedServiceId, setSelectedServiceId] = useState<number | "all">(
    "all"
  );
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
  const [paymentBooking, setPaymentBooking] = useState<{
    id: number;
    clientName: string;
    totalClp: number;
    amountPaidClp: number;
  } | null>(null);
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation360Event | null>(null);
  const [additionalPayment, setAdditionalPayment] =
    useState<PaymentDraft>(emptyPayment());
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editingPayment, setEditingPayment] =
    useState<PaymentDraft>(emptyPayment());
  const [bookingDiscountCode, setBookingDiscountCode] = useState("");
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
  const { data: availability } = trpc.biopools.availability.day.useQuery(
      { serviceId: selectedService?.id ?? 0, date },
      {
        enabled: Boolean(selectedService),
        refetchInterval: 30_000,
      }
    );
  const { data: allAvailability } = trpc.biopools.availability.all.useQuery(
      { date },
      { enabled: selectedServiceId === "all", refetchInterval: 30_000 }
    );
  const availabilityRows = useMemo(
    () =>
      selectedServiceId === "all"
      ? (allAvailability ?? [])
        : availability
          ? [availability]
          : [],
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
    if (
      paymentDetail.booking.discountCode &&
      Number(paymentDetail.booking.discountAmountClp ?? 0) > 0
    ) {
      rows.push({
        id: "discount",
        method: "Código de descuento",
        date:
          paymentDetail.checkoutOrder?.createdAt ??
          paymentDetail.booking.createdAt,
        detail: paymentDetail.booking.discountCode,
        amountClp: Number(paymentDetail.booking.discountAmountClp ?? 0),
        status: "discount",
      });
    }
    if (
      paymentDetail.checkoutOrder &&
      paymentDetail.checkoutOrder.totalClp > 0
    ) {
      rows.push({
        id: `webpay-${paymentDetail.checkoutOrder.id}`,
        method: "Webpay",
        date:
          paymentDetail.checkoutOrder.paidAt ??
          paymentDetail.checkoutOrder.transactionDate ??
          paymentDetail.checkoutOrder.createdAt,
        detail:
          paymentDetail.checkoutOrder.authorizationCode ??
          paymentDetail.checkoutOrder.buyOrder ??
          "—",
        amountClp: paymentDetail.checkoutOrder.totalClp,
        status:
          paymentDetail.checkoutOrder.status === "paid" ? "paid" : "pending",
      });
    }
    for (const payment of paymentDetail.payments) {
      rows.push({
        id: `payment-${payment.id}`,
        method: paymentMethodLabel[payment.method] ?? payment.method,
        date: payment.paidAt ?? payment.createdAt,
        detail:
          payment.reference ??
          (payment.cardType
            ? payment.cardType === "credit"
              ? "Crédito"
              : "Débito"
            : "—"),
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
  const validateManualDiscount =
    trpc.biopools.public.validateDiscount.useMutation({
    onSuccess: result => {
      setAppliedManualDiscount(result);
      setManualDiscountCode(result.code);
        setPayments(
          result.finalTotal === 0
            ? []
            : [emptyPayment(String(result.finalTotal))]
        );
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
  const updateRegisteredPayment =
    trpc.biopools.bookings.updatePayment.useMutation({
      onSuccess: () => {
        toast.success("Pago actualizado");
        setEditingPaymentId(null);
        void utils.biopools.invalidate();
      },
      onError: error => toast.error(error.message),
    });
  const removeRegisteredPayment =
    trpc.biopools.bookings.removePayment.useMutation({
      onSuccess: () => {
        toast.success("Pago eliminado");
        setEditingPaymentId(null);
        void utils.biopools.invalidate();
      },
      onError: error => toast.error(error.message),
    });
  const setBookingDiscount = trpc.biopools.bookings.setDiscount.useMutation({
    onSuccess: result => {
      toast.success(
        result.discountCode
          ? `Código ${result.discountCode} aplicado`
          : "Código eliminado"
      );
      setBookingDiscountCode(result.discountCode ?? "");
      void utils.biopools.invalidate();
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
  const hideCancelled =
    trpc.biopools.bookings.hideCancelledFromAgenda.useMutation({
    onSuccess: () => {
        toast.success(
          "Reserva eliminada de la agenda; el historial quedó guardado"
        );
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
      void Promise.all([
        utils.biopools.invalidate(),
        utils.operations360.calendar.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });

  const adultPrice =
    detail?.tickets.find(ticket => ticket.code === "adult")?.priceClp ?? 0;
  const childPrice =
    detail?.tickets.find(ticket => ticket.code === "child")?.priceClp ?? 0;
  useEffect(() => {
    if (detail && !detail.tickets.some(ticket => ticket.code === "child")) {
      setForm(current =>
        current.childQuantity === 0 ? current : { ...current, childQuantity: 0 }
      );
    }
  }, [detail]);
  const subtotal =
    form.adultQuantity * adultPrice + form.childQuantity * childPrice;
  const total = appliedManualDiscount?.finalTotal ?? subtotal;
  const plannedPayments = payments.reduce(
    (sum, payment) => sum + (Number(payment.amountClp) || 0),
    0
  );
  useEffect(() => {
    setAppliedManualDiscount(null);
    setPayments(current =>
      current.length ? current : [emptyPayment(String(subtotal))]
    );
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
    () =>
      (bookings ?? [])
        .filter(
          booking =>
            bookingDate(booking.bookingDate) === date &&
            occupancyStatuses.has(booking.status)
        )
        .sort(
          (a, b) =>
            a.startTime.localeCompare(b.startTime) ||
            a.clientName.localeCompare(b.clientName)
        ),
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
    setPayments(current =>
      current.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, ...changes } : payment
      )
    );
  };
  const paymentIsComplete = (payment: PaymentDraft) => {
    if (
      !payment.method ||
      !Number(payment.amountClp) ||
      Number(payment.amountClp) <= 0
    )
      return false;
    if (payment.method === "gift_card")
      return Boolean(payment.giftCardCode.trim());
    if (payment.status === "pending")
      return ["pending_payment", "payment_link"].includes(payment.method);
    if (!payment.paidAt) return false;
    if (payment.method !== "cash" && !payment.reference.trim()) return false;
    if (
      ["payment_link", "transbank_machine"].includes(payment.method) &&
      !payment.cardType
    )
      return false;
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
        paidAt:
          additionalPayment.status === "paid"
            ? additionalPayment.paidAt
            : undefined,
        reference: additionalPayment.reference || undefined,
        cardType: additionalPayment.cardType || undefined,
        giftCardCode:
          additionalPayment.method === "gift_card"
            ? additionalPayment.giftCardCode
            : undefined,
      },
    });
  };
  const startEditingRegisteredPayment = (payment: any) => {
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
  const saveEditingRegisteredPayment = () => {
    if (!editingPaymentId || !paymentIsComplete(editingPayment)) return;
    updateRegisteredPayment.mutate({
      paymentId: editingPaymentId,
      payment: {
        method: editingPayment.method as PaymentMethod,
        status: editingPayment.status,
        amountClp: Number(editingPayment.amountClp),
        paidAt:
          editingPayment.status === "paid" ? editingPayment.paidAt : undefined,
        reference: editingPayment.reference || undefined,
        cardType: editingPayment.cardType || undefined,
      },
    });
  };
  const confirmPendingPayment = (payment: { id: number; method: string }) => {
    const paidAt = window.prompt(
      "Fecha y hora del pago (AAAA-MM-DDTHH:MM):",
      chileDateTimeInput()
    );
    if (!paidAt) return;
    const reference =
      payment.method === "cash"
        ? undefined
        : window.prompt("Código o referencia del pago:")?.trim();
    if (payment.method !== "cash" && !reference) return;
    let cardType: "credit" | "debit" | undefined;
    if (["payment_link", "transbank_machine"].includes(payment.method)) {
      const answer = window
        .prompt("Tipo de tarjeta: escribe crédito o débito")
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
    if (
      window.confirm(
        `¿Eliminar de la agenda la reserva cancelada de ${clientName}? El historial y los pagos se conservarán.`
      )
    )
      hideCancelled.mutate({ id });
  };
  const reactivateBooking = (id: number, clientName: string) => {
    if (
      window.confirm(
        `¿Reactivar la reserva de ${clientName}? Se comprobarán nuevamente los cupos antes de confirmarla.`
      )
    )
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
    if (
      !canRedeemGiftCards &&
      payments.some(payment => payment.method === "gift_card")
    ) {
      toast.error("No tienes permiso para canjear Gift Cards");
      return;
    }
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
        giftCardCode:
          payment.method === "gift_card" ? payment.giftCardCode : undefined,
      })),
      notes: form.notes || undefined,
    });
  };
  const move = (direction: -1 | 1) => {
    const current = parseISO(date);
    const next = direction < 0 ? subDays(current, 1) : addDays(current, 1);
    setDate(format(next, "yyyy-MM-dd"));
  };
  const calendarTitle = format(selected, "EEEE d 'de' MMMM yyyy", {
    locale: es,
  });
  const mobileCalendarTitle = format(selected, "EEE d MMM", { locale: es });
  const cancelledBookings = (bookings ?? []).filter(
    item =>
      bookingDate(item.bookingDate) === date && item.status === "cancelled"
  );
  const cancelledInAgenda = cancelledBookings.filter(
    item => !item.agendaHiddenAt
  );
  const removedFromAgenda = cancelledBookings.filter(item =>
    Boolean(item.agendaHiddenAt)
  );
  const serviceName = (serviceId: number) =>
    activeServices.find(item => item.id === serviceId)?.name ?? "Biopiscinas";
  const toReservation360Event = (
    booking: NonNullable<typeof bookings>[number]
  ): Reservation360Event => ({
    id: `biopool:${booking.id}`,
    entityId: booking.id,
    kind: "biopool",
    service: "biopools",
    date: bookingDate(booking.bookingDate),
    startTime: booking.startTime,
    endTime: booking.endTime,
    title: serviceName(booking.serviceId),
    clientName: booking.clientName,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    people: booking.totalGuests,
    href: `/cms/biopiscinas/agenda?date=${bookingDate(booking.bookingDate)}`,
  });

  return (
    <DashboardLayout>
      <div className="space-y-3 p-3 sm:space-y-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center sm:gap-4">
          <div>
            <p className="hidden text-xs uppercase tracking-[0.25em] text-cyan-700 sm:block">
              Agenda y cupos
            </p>
            <h1 className="text-2xl font-semibold sm:text-3xl">Biopiscinas</h1>
          </div>
          <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 sm:flex sm:w-auto">
            <Select
              value={String(selectedServiceId)}
              onValueChange={value => {
                setSelectedServiceId(value === "all" ? "all" : Number(value));
                setManualServiceId(value === "all" ? null : Number(value));
              }}
            >
              <SelectTrigger className="col-span-3 w-full sm:w-64">
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
            <Button variant="outline" size="icon" onClick={() => move(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={event => setDate(event.target.value)}
              className="w-full min-w-0 sm:w-40"
            />
            <Button variant="outline" size="icon" onClick={() => move(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {canManage && (
              <Button
                className="col-span-3 w-full sm:w-auto"
                disabled={!manualService}
                onClick={() => {
                  const target = availabilityRows.find(
                    item => item.service.id === manualService?.id
                  );
                  if (manualService)
                    openCreate(
                      manualService.id,
                      target?.slots[0]?.startTime ?? "10:00"
                    );
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Reserva manual
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl border bg-background p-2 sm:justify-start sm:gap-3 sm:p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDate(localDate())}
          >
            Hoy
          </Button>
          <p className="min-w-0 flex-1 text-right text-sm font-semibold capitalize sm:hidden">
            {mobileCalendarTitle}
          </p>
          <p className="hidden min-w-52 text-sm font-semibold capitalize sm:block">
            {calendarTitle}
          </p>
          <Badge variant="secondary" className="shrink-0 sm:hidden">
            {activeDayBookings.length} reserva
            {activeDayBookings.length === 1 ? "" : "s"}
          </Badge>
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
          <div className="space-y-2 sm:space-y-3">
            {activeDayBookings.map(booking => (
              <Card
                key={booking.id}
                className={serviceTone(serviceName(booking.serviceId)).card}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-wrap items-stretch justify-between gap-3 sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="text-base font-semibold sm:text-lg">
                          {booking.startTime}–{booking.endTime}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[11px] sm:text-xs ${serviceTone(serviceName(booking.serviceId)).badge}`}
                        >
                          {serviceName(booking.serviceId)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[11px] sm:text-xs"
                        >
                          {statusLabel[booking.status]}
                        </Badge>
                        {!booking.paymentRestricted && (
                          <>
                            <Badge
                              variant={
                                booking.paymentStatus === "paid"
                                  ? "secondary"
                                  : "outline"
                              }
                              className="text-[11px] sm:text-xs"
                            >
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
                                Reembolso pendiente ·{" "}
                                {clp.format(booking.refundAmountClp ?? 0)}
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                      <p className="mt-1 truncate font-medium">
                        {booking.clientName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm">
                        {booking.adultQuantity} adulto(s) ·{" "}
                        {booking.childQuantity} niño(s)
                        {!booking.paymentRestricted && (
                          <>
                            {" "}·{" "}
                            {clp.format(
                              Number(booking.originalAmountClp ?? 0) -
                                Number(booking.discountAmountClp ?? 0)
                            )}
                          </>
                        )}
                      </p>
                      {!booking.paymentRestricted && (
                        <>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Abonado: {clp.format(booking.amountPaidClp ?? 0)} ·
                            Saldo:{" "}
                            {clp.format(
                              Math.max(
                                0,
                                Number(booking.originalAmountClp ?? 0) -
                                  Number(booking.discountAmountClp ?? 0) -
                                  Number(booking.amountPaidClp ?? 0)
                              )
                            )}
                          </p>
                          {booking.refundStatus === "pending" && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Descuento transacción:{" "}
                              {clp.format(booking.refundFeeAmountClp ?? 0)}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="grid w-full grid-cols-3 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap">
                      <Button
                        className="col-span-3 w-full whitespace-nowrap sm:w-auto"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setSelectedReservation(toReservation360Event(booking))
                        }
                      >
                        Gestionar reserva
                      </Button>
                      {canManage && booking.refundStatus === "pending" && (
                        <Button
                          className="col-span-3 w-full sm:w-auto"
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
                          className="w-full gap-1 whitespace-nowrap px-2"
                          size="sm"
                          variant="outline"
                          onClick={() => openReschedule(booking)}
                        >
                          <RotateCw className="h-4 w-4" />
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
                          <SelectTrigger className="w-full sm:w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="confirmed">
                              Confirmada
                            </SelectItem>
                            <SelectItem value="completed">
                              Completada
                            </SelectItem>
                            <SelectItem value="no_show">No asistió</SelectItem>
                            <SelectItem value="cancelled">Cancelada</SelectItem>
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
            <CardHeader className="p-3 pb-2 sm:p-6 sm:pb-3">
              <CardTitle className="text-base sm:text-lg">
                Reservas canceladas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-0 sm:p-6 sm:pt-0">
              {cancelledInAgenda.map(booking => (
                <div
                  key={`cancelled-${booking.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{booking.clientName}</strong>
                      <Badge variant="outline">
                        {serviceName(booking.serviceId)}
                      </Badge>
                      <Badge variant="outline">Cancelada</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {booking.startTime}–{booking.endTime} ·{" "}
                      {booking.totalGuests} persona(s)
                    </p>
                    {booking.cancellationReason && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Motivo: {booking.cancellationReason}
                      </p>
                    )}
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                    <Button
                      className="col-span-2 w-full sm:w-auto"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setSelectedReservation(toReservation360Event(booking))
                      }
                    >
                      Gestionar reserva
                    </Button>
                    {canManage && (
                      <>
                        <Button
                          className="w-full"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            reactivateBooking(booking.id, booking.clientName)
                          }
                          disabled={reactivate.isPending}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" /> Reactivar
                        </Button>
                        <Button
                          className="w-full"
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            removeCancelledFromAgenda(
                              booking.id,
                              booking.clientName
                            )
                          }
                          disabled={hideCancelled.isPending}
                        >
                          <Trash2 className="mr-1 h-4 w-4" /> Eliminar de la
                          agenda
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {removedFromAgenda.length > 0 && (
          <Card className="border-dashed bg-muted/30">
            <CardHeader className="p-3 pb-2 sm:p-6 sm:pb-3">
              <CardTitle className="text-base text-muted-foreground">
                Eliminadas de la agenda
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-0 sm:p-6 sm:pt-0">
              {removedFromAgenda.map(booking => (
                <div
                  key={`removed-${booking.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
                >
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{booking.clientName}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {booking.startTime} · {booking.totalGuests} persona(s) ·{" "}
                      {serviceName(booking.serviceId)}
                    </span>
                  </div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <Button
                      className="flex-1 sm:flex-none"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setSelectedReservation(toReservation360Event(booking))
                      }
                    >
                      Gestionar reserva
                    </Button>
                    {canManage && (
                      <Button
                        className="flex-1 sm:flex-none"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          reactivateBooking(booking.id, booking.clientName)
                        }
                        disabled={reactivate.isPending}
                      >
                        <RotateCcw className="mr-1 h-4 w-4" /> Reactivar
                      </Button>
                    )}
                  </div>
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
                          : (target?.slots[0]?.startTime ?? "")
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona servicio" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeServices.map(item => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
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
                  disabled={
                    !detail?.tickets.some(ticket => ticket.code === "child")
                  }
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
                    disabled={
                      !manualDiscountCode.trim() ||
                      validateManualDiscount.isPending ||
                      !manualService
                    }
                    onClick={() =>
                      manualService &&
                      validateManualDiscount.mutate({
                      serviceId: manualService.id,
                      adultQuantity: form.adultQuantity,
                      childQuantity: form.childQuantity,
                      code: manualDiscountCode,
                      bookingDate: date,
                      })
                    }
                  >
                    {validateManualDiscount.isPending
                      ? "Validando…"
                      : "Aplicar"}
                  </Button>
                </div>
                {appliedManualDiscount && (
                  <p className="text-sm font-medium text-emerald-700">
                    {appliedManualDiscount.code} aplicado · descuento{" "}
                    {clp.format(appliedManualDiscount.discountTotal)}
                  </p>
                )}
              </div>
              <div className="space-y-3 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label>Pagos y abonos</Label>
                  {total > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPayments(current => [...current, emptyPayment()])
                      }
                    >
                    <Plus className="mr-1 h-4 w-4" /> Agregar otro pago
                    </Button>
                  )}
                </div>
                {total === 0 && appliedManualDiscount && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                    El código cubre el 100% de la reserva. No se requiere medio
                    de pago.
                  </div>
                )}
                {total > 0 &&
                  payments.map((payment, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2"
                    >
                    <div className="space-y-2">
                      <Label>Medio de pago</Label>
                        <Select
                          value={payment.method}
                          onValueChange={value =>
                            updatePayment(index, {
                              method: value as PaymentMethod,
                              giftCardCode: "",
                              reference: "",
                              cardType: "",
                              status:
                                ["pending_payment", "payment_link"].includes(value) ? "pending" : "paid",
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona" />
                          </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="pending_payment">
                              Pendiente de pago
                            </SelectItem>
                            <SelectItem value="payment_link">
                              Link de pago
                            </SelectItem>
                            <SelectItem value="bank_transfer">
                              Transferencia
                            </SelectItem>
                          <SelectItem value="cash">Efectivo</SelectItem>
                            <SelectItem value="transbank_machine">
                              Máquina Transbank
                            </SelectItem>
                            {canRedeemGiftCards && (
                              <SelectItem value="gift_card">
                                Canjear Gift Card
                              </SelectItem>
                            )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Monto</Label>
                        <Input
                          type="number"
                          min={1}
                          value={payment.amountClp}
                          onChange={event =>
                            updatePayment(index, {
                              amountClp: event.target.value,
                            })
                          }
                        />
                    </div>
                    {payment.method === "payment_link" && (
                      <div className="space-y-2">
                        <Label>Estado</Label>
                          <Select
                            value={payment.status}
                            onValueChange={value =>
                              updatePayment(index, {
                                status: value as "pending" | "paid",
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">
                                Link enviado / pendiente
                              </SelectItem>
                              <SelectItem value="paid">
                                Pago confirmado
                              </SelectItem>
                            </SelectContent>
                        </Select>
                      </div>
                    )}
                    {payment.status === "paid" && (
                      <div className="space-y-2">
                        <Label>Fecha y hora del pago</Label>
                          <Input
                            type="datetime-local"
                            value={payment.paidAt}
                            onChange={event =>
                              updatePayment(index, {
                                paidAt: event.target.value,
                              })
                            }
                          />
                      </div>
                    )}
                    {payment.method === "gift_card" ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Código de Gift Card</Label>
                          <Input
                            value={payment.giftCardCode}
                            onChange={event =>
                              updatePayment(index, {
                                giftCardCode: event.target.value.toUpperCase(),
                              })
                            }
                          />
                      </div>
                      ) : payment.status === "paid" &&
                        payment.method !== "cash" ? (
                      <div className="space-y-2">
                        <Label>Código o referencia</Label>
                          <Input
                            value={payment.reference}
                            onChange={event =>
                              updatePayment(index, {
                                reference: event.target.value,
                              })
                            }
                          />
                      </div>
                    ) : null}
                      {payment.status === "paid" &&
                        ["payment_link", "transbank_machine"].includes(
                          payment.method
                        ) && (
                      <div className="space-y-2">
                        <Label>Tipo de tarjeta</Label>
                            <Select
                              value={payment.cardType}
                              onValueChange={value =>
                                updatePayment(index, {
                                  cardType: value as "credit" | "debit",
                                })
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
                      </div>
                    )}
                    {payments.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="sm:col-span-2"
                          onClick={() =>
                            setPayments(current =>
                              current.filter(
                                (_, paymentIndex) => paymentIndex !== index
                              )
                            )
                          }
                        >
                          Quitar este pago
                        </Button>
                    )}
                  </div>
                ))}
                <div className="flex justify-between text-sm">
                  <span>
                    Pagos ingresados:{" "}
                    <strong>{clp.format(plannedPayments)}</strong>
                  </span>
                  <span>
                    Saldo sin asignar:{" "}
                    <strong>
                      {clp.format(Math.max(0, total - plannedPayments))}
                    </strong>
                  </span>
                </div>
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
                {appliedManualDiscount && (
                  <p className="text-xs text-emerald-700">
                    Subtotal {clp.format(subtotal)} ·{" "}
                    {appliedManualDiscount.code}: −
                    {clp.format(appliedManualDiscount.discountTotal)}
                  </p>
                )}
                <span>
                  Total: <strong>{clp.format(total)}</strong>
                </span>
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
                  (Boolean(manualDiscountCode.trim()) &&
                    !appliedManualDiscount) ||
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

        <Dialog
          open={Boolean(paymentBooking)}
          onOpenChange={next => !next && setPaymentBooking(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Pagos · {paymentBooking?.clientName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl bg-cyan-50 p-3 text-sm flex flex-wrap justify-between gap-3">
                <span>
                  Subtotal:{" "}
                  <strong>
                    {clp.format(
                      paymentDetail?.booking.originalAmountClp ??
                        paymentBooking?.totalClp ??
                        0
                    )}
                  </strong>
                </span>
                {(paymentDetail?.booking.discountAmountClp ?? 0) > 0 && (
                  <span className="text-emerald-700">
                    Descuento
                    {paymentDetail?.booking.discountCode
                      ? ` · ${paymentDetail.booking.discountCode}`
                      : ""}
                    :{" "}
                    <strong>
                      −
                      {clp.format(
                        paymentDetail?.booking.discountAmountClp ?? 0
                      )}
                    </strong>
                  </span>
                )}
                <span>
                  Total:{" "}
                  <strong>{clp.format(paymentBooking?.totalClp ?? 0)}</strong>
                </span>
                <span>
                  Abonado:{" "}
                  <strong>
                    {clp.format(
                      paymentDetail?.booking.amountPaidClp ??
                        paymentBooking?.amountPaidClp ??
                        0
                    )}
                  </strong>
                </span>
                <span>
                  Saldo:{" "}
                  <strong>
                    {clp.format(
                      Math.max(
                        0,
                        (paymentBooking?.totalClp ?? 0) -
                          (paymentDetail?.booking.amountPaidClp ??
                            paymentBooking?.amountPaidClp ??
                            0)
                      )
                    )}
                  </strong>
                </span>
              </div>
              <div className="space-y-2 rounded-xl border p-3">
                <Label>Código de descuento</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={bookingDiscountCode}
                    onChange={event =>
                      setBookingDiscountCode(event.target.value.toUpperCase())
                    }
                    placeholder="Ingresa otro código"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      !bookingDiscountCode.trim() ||
                      setBookingDiscount.isPending
                    }
                    onClick={() =>
                      paymentBooking &&
                      setBookingDiscount.mutate({
                        bookingId: paymentBooking.id,
                        code: bookingDiscountCode,
                      })
                    }
                  >
                    Aplicar código
                  </Button>
                  {paymentDetail?.booking.discountCode && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-red-600"
                      disabled={setBookingDiscount.isPending}
                      onClick={() =>
                        paymentBooking &&
                        window.confirm(
                          "¿Quitar el código de descuento de esta reserva?"
                        ) &&
                        setBookingDiscount.mutate({
                          bookingId: paymentBooking.id,
                        })
                      }
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Quitar código
                    </Button>
                  )}
                </div>
              </div>
              {editingPaymentId && (
                <div className="space-y-3 rounded-xl border border-cyan-300 bg-cyan-50/30 p-3">
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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Método</Label>
                      <Select
                        value={editingPayment.method}
                        onValueChange={value =>
                          setEditingPayment(current => ({
                            ...current,
                            method: value as PaymentMethod,
                            status:
                              ["pending_payment", "payment_link"].includes(value) ? "pending" : "paid",
                            reference: "",
                            cardType: "",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending_payment">
                            Pendiente de pago
                          </SelectItem>
                          <SelectItem value="payment_link">
                            Link de pago
                          </SelectItem>
                          <SelectItem value="bank_transfer">
                            Transferencia
                          </SelectItem>
                          <SelectItem value="cash">Efectivo</SelectItem>
                          <SelectItem value="transbank_machine">
                            Máquina Transbank
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Monto</Label>
                      <Input
                        type="number"
                        min={1}
                        value={editingPayment.amountClp}
                        onChange={event =>
                          setEditingPayment(current => ({
                            ...current,
                            amountClp: event.target.value,
                          }))
                        }
                      />
                    </div>
                    {editingPayment.method === "payment_link" && (
                      <div>
                        <Label>Estado</Label>
                        <Select
                          value={editingPayment.status}
                          onValueChange={value =>
                            setEditingPayment(current => ({
                              ...current,
                              status: value as "pending" | "paid",
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pendiente</SelectItem>
                            <SelectItem value="paid">Pagado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {editingPayment.status === "paid" && (
                      <div>
                        <Label>Fecha y hora</Label>
                        <Input
                          type="datetime-local"
                          value={editingPayment.paidAt}
                          onChange={event =>
                            setEditingPayment(current => ({
                              ...current,
                              paidAt: event.target.value,
                            }))
                          }
                        />
                      </div>
                    )}
                    {editingPayment.status === "paid" &&
                      editingPayment.method !== "cash" && (
                        <div>
                          <Label>Referencia</Label>
                          <Input
                            value={editingPayment.reference}
                            onChange={event =>
                              setEditingPayment(current => ({
                                ...current,
                                reference: event.target.value,
                              }))
                            }
                          />
                        </div>
                      )}
                    {editingPayment.status === "paid" &&
                      ["payment_link", "transbank_machine"].includes(
                        editingPayment.method
                      ) && (
                        <div>
                          <Label>Tipo de tarjeta</Label>
                          <Select
                            value={editingPayment.cardType}
                            onValueChange={value =>
                              setEditingPayment(current => ({
                                ...current,
                                cardType: value as "credit" | "debit",
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="credit">Crédito</SelectItem>
                              <SelectItem value="debit">Débito</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveEditingRegisteredPayment}
                    disabled={
                      !paymentIsComplete(editingPayment) ||
                      updateRegisteredPayment.isPending
                    }
                  >
                    Guardar pago
                  </Button>
              </div>
              )}
              <div className="overflow-hidden rounded-xl border">
                <div>
                  <div className="hidden grid-cols-[1.3fr_1fr_1.2fr_.8fr] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                    <span>Método</span>
                    <span>Fecha</span>
                    <span>Detalle</span>
                    <span className="text-right">Monto</span>
                  </div>
                  {paymentRows.map(row => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-b px-3 py-3 text-sm last:border-b-0 sm:grid-cols-[1.3fr_1fr_1.2fr_.8fr] sm:items-center sm:gap-3 sm:px-4"
                    >
                      <div>
                        <strong>{row.method}</strong>
                        <p
                          className={`text-xs ${row.status === "discount" ? "text-emerald-700" : "text-muted-foreground"}`}
                        >
                          {row.status === "discount"
                            ? "Aplicado"
                            : row.status === "paid"
                              ? "Pagado"
                              : "Pendiente"}
                        </p>
                      </div>
                      <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1">
                        {paymentDateLabel(row.date)}
                      </span>
                      <span
                        className={
                          `col-span-2 break-words text-xs sm:col-span-1 ${row.status === "discount"
                            ? "font-mono font-semibold text-violet-700"
                            : ""}`
                        }
                      >
                        {row.detail}
                      </span>
                      <div className="col-start-2 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
                        <strong
                          className={
                            row.status === "discount" ? "text-emerald-700" : ""
                          }
                        >
                          {row.status === "discount" ? "−" : ""}
                          {clp.format(row.amountClp)}
                        </strong>
                        {row.status === "pending" &&
                          row.paymentId &&
                          row.paymentMethod && (
                            <Button
                              className="mt-1"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                confirmPendingPayment({
                                  id: row.paymentId!,
                                  method: row.paymentMethod!,
                                })
                              }
                              disabled={completePayment.isPending}
                            >
                              Marcar pagado
                            </Button>
                          )}
                        {row.paymentId ? (
                          <div className="mt-1 flex justify-end gap-1">
                            {!paymentDetail?.payments.find(
                              payment => payment.id === row.paymentId
                            )?.giftCardId && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const payment = paymentDetail?.payments.find(
                                    item => item.id === row.paymentId
                                  );
                                  if (payment)
                                    startEditingRegisteredPayment(payment);
                                }}
                              >
                                Editar
                              </Button>
                        )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              disabled={removeRegisteredPayment.isPending}
                              onClick={() =>
                                window.confirm(
                                  "¿Eliminar este pago? El saldo se recalculará."
                                ) &&
                                removeRegisteredPayment.mutate({
                                  paymentId: row.paymentId!,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : row.id.startsWith("webpay-") ? (
                          <p className="mt-1 text-[11px] font-medium text-blue-700">
                            Protegido por Webpay
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {!paymentRows.length && (
                    <p className="p-4 text-sm text-muted-foreground">
                      Esta reserva todavía no tiene pagos detallados.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-between border-t pt-3 text-sm">
                <span>Monto pendiente</span>
                <strong>
                  {clp.format(
                    Math.max(
                      0,
                      (paymentBooking?.totalClp ?? 0) -
                        (paymentDetail?.booking.amountPaidClp ??
                          paymentBooking?.amountPaidClp ??
                          0)
                    )
                  )}
                </strong>
              </div>
              <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nuevo medio de pago</Label>
                  <Select
                    value={additionalPayment.method}
                    onValueChange={value =>
                      setAdditionalPayment(current => ({
                        ...current,
                        method: value as PaymentMethod,
                        status: ["pending_payment", "payment_link"].includes(value) ? "pending" : "paid",
                        reference: "",
                        giftCardCode: "",
                        cardType: "",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending_payment">Pendiente de pago</SelectItem>
                      <SelectItem value="payment_link">Link de pago</SelectItem>
                      <SelectItem value="bank_transfer">
                        Transferencia
                      </SelectItem>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="transbank_machine">
                        Máquina Transbank
                      </SelectItem>
                      <SelectItem value="gift_card">
                        Canjear Gift Card
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Monto</Label>
                  <Input
                    type="number"
                    min={1}
                    value={additionalPayment.amountClp}
                    onChange={event =>
                      setAdditionalPayment(current => ({
                        ...current,
                        amountClp: event.target.value,
                      }))
                    }
                  />
                </div>
                {additionalPayment.method === "payment_link" && (
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select
                      value={additionalPayment.status}
                      onValueChange={value =>
                        setAdditionalPayment(current => ({
                          ...current,
                          status: value as "pending" | "paid",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">
                          Link enviado / pendiente
                        </SelectItem>
                        <SelectItem value="paid">Pago confirmado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {additionalPayment.status === "paid" && (
                  <div className="space-y-2">
                    <Label>Fecha y hora</Label>
                    <Input
                      type="datetime-local"
                      value={additionalPayment.paidAt}
                      onChange={event =>
                        setAdditionalPayment(current => ({
                          ...current,
                          paidAt: event.target.value,
                        }))
                      }
                    />
                  </div>
                )}
                {additionalPayment.method === "gift_card" ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Código Gift Card</Label>
                    <Input
                      value={additionalPayment.giftCardCode}
                      onChange={event =>
                        setAdditionalPayment(current => ({
                          ...current,
                          giftCardCode: event.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </div>
                ) : additionalPayment.status === "paid" &&
                  additionalPayment.method !== "cash" ? (
                  <div className="space-y-2">
                    <Label>Código o referencia</Label>
                    <Input
                      value={additionalPayment.reference}
                      onChange={event =>
                        setAdditionalPayment(current => ({
                          ...current,
                          reference: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
                {additionalPayment.status === "paid" &&
                  ["payment_link", "transbank_machine"].includes(
                    additionalPayment.method
                  ) && (
                    <div className="space-y-2">
                      <Label>Tipo de tarjeta</Label>
                      <Select
                        value={additionalPayment.cardType}
                        onValueChange={value =>
                          setAdditionalPayment(current => ({
                            ...current,
                            cardType: value as "credit" | "debit",
                          }))
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
                </div>
                  )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPaymentBooking(null)}>
                Cerrar
              </Button>
              <Button
                onClick={submitAdditionalPayment}
                disabled={
                  addPayment.isPending || !paymentIsComplete(additionalPayment)
                }
              >
                Agregar pago
              </Button>
            </DialogFooter>
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
              <ReschedulePolicyOverride
                checked={rescheduleOverride}
                onCheckedChange={setRescheduleOverride}
                policySummary={
                  <>
                    Mínimo{" "}
                    {rescheduleAvailability?.service.rescheduleNoticeHours ??
                      48}{" "}
                    horas de anticipación y máximo{" "}
                    {rescheduleAvailability?.service.maxStaffReschedules ?? 2}{" "}
                    cambios. Esta reserva lleva{" "}
                    {rescheduleBooking?.rescheduleCount ?? 0}.
                  </>
                }
              />
              <p className="text-xs text-muted-foreground">
                Los recordatorios pendientes se reemplazarán solo si todavía
                corresponde enviarlos para la nueva fecha.
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
                  rescheduleReason.trim().length <
                    (rescheduleOverride ? 10 : 3) ||
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

        <Reservation360DetailDialog
          event={selectedReservation}
          open={Boolean(selectedReservation)}
          onOpenChange={next => !next && setSelectedReservation(null)}
          onChanged={() => utils.biopools.invalidate()}
        />
      </div>
    </DashboardLayout>
  );
}
