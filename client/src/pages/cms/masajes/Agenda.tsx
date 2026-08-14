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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Edit, Trash2, X } from "lucide-react";
import {
  format,
  addDays,
  subDays,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import SkeduProgramBookingDialog from "./SkeduProgramBookingDialog";
import SkeduTherapistAssignmentDialog from "./SkeduTherapistAssignmentDialog";
import MassageCancellationDialog, {
  getMassageCancellationLabel,
  type MassageCancellationCategory,
} from "./MassageCancellationDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasCmsPermission, hasMassagePaymentAccess } from "@shared/permissions";
import {
  MANUAL_MASSAGE_PAYMENT_METHODS,
  MASSAGE_PAYMENT_METHOD_LABELS,
  type ManualMassagePaymentMethod,
} from "@shared/massagePayments";
import {
  getMassageBookingStatusLabel,
  getMassagePaymentStatusLabel,
} from "@shared/massageBookingLabels";
import {
  CARD_PAYMENT_METHODS,
  PENDING_PAYMENT_METHODS,
  type ReservationPaymentMethod,
} from "@shared/reservationPayments";

const STATUS_VARIANTS: Record<string, any> = {
  pending: "secondary",
  confirmed: "default",
  completed: "outline",
  cancelled: "destructive",
  no_show: "destructive",
};
const DURATIONS = [50, 80, 110];

type ViewMode = "day" | "week" | "month";

type BookingForm = {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientOrigin: string;
  techniqueId: string;
  therapistId: string;
  roomId: string;
  duration: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  paymentStatus: "pending" | "paid";
  amountPaid: string;
  manualPaymentMethod: ManualMassagePaymentMethod;
  discountCode: string;
  notes: string;
};
type PaymentDraft = {
  method: ManualMassagePaymentMethod | "";
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
  if (
    !payment.method ||
    !Number(payment.amountClp) ||
    Number(payment.amountClp) <= 0
  )
    return false;
  if (payment.method === "gift_card")
    return Boolean(payment.giftCardCode.trim());
  if (payment.status === "pending")
    return PENDING_PAYMENT_METHODS.includes(
      payment.method as ReservationPaymentMethod
    );
  if (
    !payment.paidAt ||
    (payment.method !== "cash" && !payment.reference.trim())
  )
    return false;
  return (
    !CARD_PAYMENT_METHODS.includes(
      payment.method as ReservationPaymentMethod
    ) || Boolean(payment.cardType)
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
      <div>
        <Label>Medio de pago</Label>
        <Select
          value={payment.method}
          onValueChange={value =>
            onChange({
              method: value as ManualMassagePaymentMethod,
              status: PENDING_PAYMENT_METHODS.includes(
                value as ReservationPaymentMethod
              )
                ? "pending"
                : "paid",
              reference: "",
              giftCardCode: "",
              cardType: "",
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecciona" />
          </SelectTrigger>
          <SelectContent>
            {MANUAL_MASSAGE_PAYMENT_METHODS.map(method => (
              <SelectItem key={method} value={method}>
                {MASSAGE_PAYMENT_METHOD_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Monto del abono</Label>
        <Input
          type="number"
          min={1}
          value={payment.amountClp}
          onChange={event => onChange({ amountClp: event.target.value })}
        />
      </div>
      {PENDING_PAYMENT_METHODS.includes(
        payment.method as ReservationPaymentMethod
      ) && (
        <div>
          <Label>Estado</Label>
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
              <SelectItem value="paid">Pago confirmado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {payment.status === "paid" && (
        <div>
          <Label>Fecha y hora</Label>
          <Input
            type="datetime-local"
            value={payment.paidAt}
            onChange={event => onChange({ paidAt: event.target.value })}
          />
        </div>
      )}
      {payment.method === "gift_card" ? (
        <div className="sm:col-span-2">
          <Label>Código Gift Card</Label>
          <Input
            value={payment.giftCardCode}
            onChange={event =>
              onChange({ giftCardCode: event.target.value.toUpperCase() })
            }
          />
        </div>
      ) : payment.status === "paid" && payment.method !== "cash" ? (
        <div>
          <Label>Código o referencia</Label>
          <Input
            value={payment.reference}
            onChange={event => onChange({ reference: event.target.value })}
          />
        </div>
      ) : null}
      {payment.status === "paid" &&
        CARD_PAYMENT_METHODS.includes(
          payment.method as ReservationPaymentMethod
        ) && (
          <div>
            <Label>Tipo de tarjeta</Label>
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
          </div>
        )}
    </div>
  );
}

const emptyForm = (date: string): BookingForm => ({
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  clientOrigin: "",
  techniqueId: "",
  therapistId: "",
  roomId: "",
  duration: 50,
  bookingDate: date,
  startTime: "10:00",
  endTime: "10:50",
  paymentStatus: "pending",
  amountPaid: "",
  manualPaymentMethod: "getnet_link",
  discountCode: "",
  notes: "",
});

function calcEndTime(start: string, duration: number): string {
  const [h, m] = start.split(":").map(Number);
  const totalMin = h * 60 + m + duration;
  return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
}

// ─── Tarjeta individual de reserva ────────────────────────────────────────────
function BookingCard({
  b,
  onEdit,
  onStatus,
  onCancel,
  canManageAgenda,
  canAssignTherapists,
  canViewSales,
}: {
  b: any;
  onEdit: (b: any) => void;
  onStatus: (id: number, status: string, bookingKind: string) => void;
  onCancel: (b: any) => void;
  canManageAgenda: boolean;
  canAssignTherapists: boolean;
  canViewSales: boolean;
}) {
  return (
    <Card
      className={b.status === "cancelled" ? "border-red-200 bg-red-50/20" : ""}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-lg">{b.startTime}</span>
              <span className="text-muted-foreground">–</span>
              <span className="text-muted-foreground">{b.endTime}</span>
              <Badge variant={STATUS_VARIANTS[b.status]}>
                {getMassageBookingStatusLabel(b.status)}
              </Badge>
              {b.bookingKind === "skedu_program" && (
                <Badge
                  variant="outline"
                  className="border-violet-400 text-violet-700 bg-violet-50"
                >
                  Skedu · {b.modality === "double" ? "Doble" : "Simple"}
                </Badge>
              )}
              {b.paymentStatus && (
                <Badge
                  variant="outline"
                  className={
                    b.paymentStatus === "paid"
                    ? "text-green-600 border-green-600"
                      : "text-amber-700 border-amber-500 bg-amber-50"
                  }
                >
                  {getMassagePaymentStatusLabel(b.paymentStatus)}
                </Badge>
              )}
            </div>
            <p className="font-medium mt-1">{b.clientName}</p>
            <p className="text-sm text-muted-foreground">
              {b.techniqueName} · {b.duration} min · {b.roomName}
              {b.therapistName && ` · ${b.therapistName}`}
              {b.secondTherapistName && ` + ${b.secondTherapistName}`}
            </p>
            {b.externalReference && (
              <p className="text-xs text-muted-foreground mt-1">
                Ref. Skedu: {b.externalReference}
              </p>
            )}
            {canViewSales && b.amountPaid && (
              <p className="text-sm text-green-600 mt-1">
                $ {Number(b.amountPaid).toLocaleString("es-CL")}
              </p>
            )}
            {b.status === "cancelled" && b.cancellationReason && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <p className="font-semibold">
                  {getMassageCancellationLabel(b.cancellationCategory)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">
                  {b.cancellationReason}
                </p>
              </div>
            )}
          </div>
          {(canManageAgenda || canAssignTherapists) && (
            <div className="flex gap-2 flex-wrap shrink-0">
            {canManageAgenda && b.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStatus(b.id, "confirmed", b.bookingKind)}
                >
                  Confirmar
                </Button>
            )}
            {b.bookingKind === "skedu_program" ? (
              <>
                {canAssignTherapists && b.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(b)}
                      title="Editar terapeutas asignados"
                    >
                    <Edit className="mr-1.5 h-4 w-4" />
                    Terapeutas
                  </Button>
                )}
                {canManageAgenda && b.status === "confirmed" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => onCancel(b)}
                    >
                    Cancelar
                  </Button>
                )}
              </>
            ) : (
              <>
                {canManageAgenda && b.status !== "cancelled" && (
                  <Button size="sm" variant="ghost" onClick={() => onEdit(b)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
                  {canManageAgenda &&
                    (b.status === "pending" || b.status === "confirmed") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => onCancel(b)}
                      >
                    Cancelar
                  </Button>
                )}
              </>
            )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Vista Día ─────────────────────────────────────────────────────────────────
function DayView({
  bookings,
  isLoading,
  onEdit,
  onStatus,
  onCancel,
  canManageAgenda,
  canAssignTherapists,
  canViewSales,
}: {
  bookings: any[] | undefined;
  isLoading: boolean;
  onEdit: (b: any) => void;
  onStatus: (id: number, status: string, bookingKind: string) => void;
  onCancel: (b: any) => void;
  canManageAgenda: boolean;
  canAssignTherapists: boolean;
  canViewSales: boolean;
}) {
  if (isLoading)
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  if (!bookings || bookings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Sin reservas para este día
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {bookings.map(b => (
        <BookingCard
          key={`${b.bookingKind}-${b.id}`}
          b={b}
          onEdit={onEdit}
          onStatus={onStatus}
          onCancel={onCancel}
          canManageAgenda={canManageAgenda}
          canAssignTherapists={canAssignTherapists}
          canViewSales={canViewSales}
        />
      ))}
    </div>
  );
}

// ─── Vista Semana ──────────────────────────────────────────────────────────────
function WeekView({
  bookings,
  isLoading,
  weekStart,
  onDayClick,
  onEdit,
  onStatus,
  onCancel,
  canManageAgenda,
  canAssignTherapists,
  canViewSales,
}: {
  bookings: any[] | undefined;
  isLoading: boolean;
  weekStart: Date;
  onDayClick: (date: string) => void;
  onEdit: (b: any) => void;
  onStatus: (id: number, status: string, bookingKind: string) => void;
  onCancel: (b: any) => void;
  canManageAgenda: boolean;
  canAssignTherapists: boolean;
  canViewSales: boolean;
}) {
  const days = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(weekStart, { locale: es }),
  });

  if (isLoading)
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );

  return (
    <div className="space-y-4">
      {days.map(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayBookings = (bookings ?? []).filter(
          b => b.bookingDate === dateStr
        );
        const isToday = isSameDay(day, new Date());
        return (
          <div key={dateStr}>
            <div
              className={`flex items-center gap-2 mb-2 cursor-pointer group`}
              onClick={() => onDayClick(dateStr)}
            >
              <span
                className={`text-sm font-semibold capitalize ${isToday ? "text-teal-600" : "text-foreground"}`}
              >
                {format(day, "EEEE d 'de' MMMM", { locale: es })}
              </span>
              {dayBookings.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {dayBookings.length} reserva
                  {dayBookings.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            {dayBookings.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-2 pb-2">
                Sin reservas
              </p>
            ) : (
              <div className="space-y-2 pl-1">
                {dayBookings.map(b => (
                  <BookingCard
                    key={`${b.bookingKind}-${b.id}`}
                    b={b}
                    onEdit={onEdit}
                    onStatus={onStatus}
                    onCancel={onCancel}
                    canManageAgenda={canManageAgenda}
                    canAssignTherapists={canAssignTherapists}
                    canViewSales={canViewSales}
                  />
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
function MonthView({
  bookings,
  isLoading,
  monthDate,
  onDayClick,
  canViewSales,
}: {
  bookings: any[] | undefined;
  isLoading: boolean;
  monthDate: Date;
  onDayClick: (date: string) => void;
  canViewSales: boolean;
}) {
  if (isLoading)
    return (
      <div className="grid grid-cols-7 gap-1">
        {Array(35)
          .fill(0)
          .map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
      </div>
    );

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
          <div
            key={d}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const count = (bookings ?? []).filter(
            b => b.bookingDate === dateStr
          ).length;
          const isCurrentMonth = isSameMonth(day, monthDate);
          const isToday = isSameDay(day, new Date());
          const revenue = (bookings ?? [])
            .filter(
              b =>
                b.bookingDate === dateStr &&
                b.paymentStatus === "paid" &&
                b.status !== "cancelled"
            )
            .reduce(
              (sum: number, b: any) => sum + Number(b.amountPaid ?? 0),
              0
            );

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={`relative min-h-[64px] rounded-lg border p-1.5 text-left transition-colors hover:bg-accent ${
                isCurrentMonth
                  ? "bg-background"
                  : "bg-muted/30 text-muted-foreground"
              } ${isToday ? "border-teal-500 border-2" : "border-border"}`}
            >
              <span
                className={`text-xs font-medium ${isToday ? "text-teal-600" : ""}`}
              >
                {format(day, "d")}
              </span>
              {count > 0 && (
                <div className="mt-1 space-y-0.5">
                  <div
                    className={`text-xs font-semibold ${count > 0 ? "text-teal-700" : ""}`}
                  >
                    {count} reserva{count !== 1 ? "s" : ""}
                  </div>
                  {canViewSales && revenue > 0 && (
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
  const { user } = useAuth();
  const canManageAgenda = hasCmsPermission(
    user ?? {},
    "massages.manage_agenda"
  );
  const canAssignTherapists = hasCmsPermission(
    user ?? {},
    "massages.assign_therapists"
  );
  const canViewSales = hasCmsPermission(user ?? {}, "massages.view_sales");
  const canManagePayments = hasMassagePaymentAccess(user ?? {});
  const search = useSearch();
  const initialDate = (() => {
    const p = new URLSearchParams(search);
    const d = p.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d)
      ? d
      : format(new Date(), "yyyy-MM-dd");
  })();

  const [view, setView] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [open, setOpen] = useState(false);
  const [skeduOpen, setSkeduOpen] = useState(false);
  const [editingSkeduBooking, setEditingSkeduBooking] = useState<any | null>(
    null
  );
  const [cancellationTarget, setCancellationTarget] = useState<any | null>(
    null
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BookingForm>(emptyForm(selectedDate));
  const [payments, setPayments] = useState<PaymentDraft[]>([emptyPayment()]);
  const [newPayment, setNewPayment] = useState<PaymentDraft>(emptyPayment());
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editingPayment, setEditingPayment] =
    useState<PaymentDraft>(emptyPayment());
  const utils = trpc.useUtils();

  // Calcular rango según vista
  const parsedDate = parseISO(selectedDate);
  const weekStart = startOfWeek(parsedDate, { locale: es });
  const from =
    view === "day"
      ? selectedDate
      : view === "week"
        ? format(weekStart, "yyyy-MM-dd")
    : format(startOfMonth(parsedDate), "yyyy-MM-dd");
  const to =
    view === "day"
      ? selectedDate
      : view === "week"
        ? format(endOfWeek(parsedDate, { locale: es }), "yyyy-MM-dd")
    : format(endOfMonth(parsedDate), "yyyy-MM-dd");

  const { data: bookings, isLoading } =
    trpc.masajes.agenda.getByDateRange.useQuery(
    { from, to },
      { refetchInterval: 60_000 }
  );
  const { data: techniques } = trpc.masajes.tecnicas.getAll.useQuery(
    undefined,
    { enabled: canManageAgenda }
  );
  const { data: therapists } = trpc.masajes.terapeutas.getAll.useQuery(
    undefined,
    { enabled: canManageAgenda }
  );
  const { data: rooms } = trpc.masajes.salas.getAll.useQuery(undefined, {
    enabled: canManageAgenda,
  });
  const { data: slots } = trpc.masajes.agenda.getAvailableSlots.useQuery(
    { date: selectedDate, duration: form.duration },
    { enabled: open && canManageAgenda }
  );
  const paymentQuery = trpc.masajes.agenda.getPayments.useQuery(
    { bookingId: editingId ?? 0 },
    { enabled: Boolean(editingId && open && canManagePayments) }
  );

  const createMut = trpc.masajes.agenda.create.useMutation({
    onSuccess: () => {
      utils.masajes.agenda.getByDateRange.invalidate();
      toast.success("Reserva creada");
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.masajes.agenda.update.useMutation({
    onSuccess: () => {
      utils.masajes.agenda.getByDateRange.invalidate();
      toast.success("Reserva actualizada");
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const addPaymentMut = trpc.masajes.agenda.addPayment.useMutation({
    onSuccess: () => {
      toast.success("Pago agregado");
      setNewPayment(emptyPayment());
      void paymentQuery.refetch();
      void utils.masajes.agenda.getByDateRange.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const completePaymentMut = trpc.masajes.agenda.completePayment.useMutation({
    onSuccess: () => {
      toast.success("Pago confirmado");
      void paymentQuery.refetch();
      void utils.masajes.agenda.getByDateRange.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updatePaymentMut = trpc.masajes.agenda.updatePayment.useMutation({
    onSuccess: () => {
      toast.success("Pago actualizado");
      setEditingPaymentId(null);
      void paymentQuery.refetch();
      void utils.masajes.agenda.getByDateRange.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const removePaymentMut = trpc.masajes.agenda.removePayment.useMutation({
    onSuccess: () => {
      toast.success("Pago eliminado");
      setEditingPaymentId(null);
      void paymentQuery.refetch();
      void utils.masajes.agenda.getByDateRange.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const setDiscountMut = trpc.masajes.agenda.setDiscount.useMutation({
    onSuccess: result => {
      toast.success(
        result.discountCode
          ? `Código ${result.discountCode} aplicado`
          : "Código de descuento eliminado"
      );
      void paymentQuery.refetch();
      void utils.masajes.agenda.getByDateRange.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const statusMut = trpc.masajes.agenda.updateStatus.useMutation({
    onSuccess: () => {
      utils.masajes.agenda.getByDateRange.invalidate();
      toast.success(
        cancellationTarget
          ? "Masaje cancelado y motivo registrado"
          : "Estado actualizado"
      );
      setCancellationTarget(null);
    },
    onError: e => toast.error(e.message),
  });
  const programStatusMut =
    trpc.masajes.agenda.updateSkeduProgramStatus.useMutation({
    onSuccess: () => {
      utils.masajes.agenda.getByDateRange.invalidate();
        toast.success(
          cancellationTarget
            ? "Programa cancelado y motivo registrado"
            : "Estado del programa actualizado"
        );
      setCancellationTarget(null);
    },
    onError: e => toast.error(e.message),
  });
  const notifyMut = trpc.masajes.agenda.notifyFreelanceTherapist.useMutation({
    onSuccess: ({ assignmentMode, therapistName }) => {
      utils.masajes.agenda.getByDateRange.invalidate();
      utils.masajes.agenda.getPendingManualAssignment.invalidate();
      if (assignmentMode === "inhouse_assigned") {
        toast.success(
          `Masaje asignado a ${therapistName ?? "terapeuta inhouse"}; se envió el aviso informativo`
        );
      } else if (assignmentMode === "freelance_requested") {
        toast.success(
          `Solicitud enviada a ${therapistName ?? "terapeuta freelance"}; tiene 60 minutos para confirmar`
        );
      } else {
        toast.warning(
          "No se encontró un terapeuta disponible; la reserva quedó para revisión manual"
        );
      }
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const handleStatus = (id: number, status: string, bookingKind: string) => {
    if (bookingKind === "skedu_program") {
      programStatusMut.mutate({
        id,
        status: status as "confirmed" | "completed" | "cancelled" | "no_show",
      });
    } else {
      statusMut.mutate({ id, status: status as any });
    }
  };

  const handleCancellation = (
    category: MassageCancellationCategory,
    reason: string
  ) => {
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
    setPayments([emptyPayment()]);
    setOpen(true);
  };

  const openEdit = (b: any) => {
    if (b.bookingKind === "skedu_program") {
      if (canAssignTherapists) setEditingSkeduBooking(b);
      return;
    }
    if (!canManageAgenda) return;
    setEditingId(b.id);
    setEditingPaymentId(null);
    setNewPayment(
      emptyPayment(
        String(
          Math.max(
            0,
            Number(b.originalAmount ?? b.amountPaid ?? 0) -
              Number(b.amountPaid ?? 0)
          )
        )
      )
    );
    setForm({
      clientName: b.clientName,
      clientEmail: b.clientEmail ?? "",
      clientPhone: b.clientPhone ?? "",
      clientOrigin: "",
      techniqueId: String(b.techniqueId),
      therapistId: b.therapistId ? String(b.therapistId) : "",
      roomId: String(b.roomId),
      duration: b.duration,
      bookingDate: b.bookingDate,
      startTime: b.startTime,
      endTime: b.endTime,
      paymentStatus: b.paymentStatus === "paid" ? "paid" : "pending",
      amountPaid: b.originalAmount ?? b.amountPaid ?? "",
      manualPaymentMethod: b.manualPaymentMethod ?? "getnet_link",
      discountCode: b.discountCode ?? "",
      notes: b.notes ?? "",
    });
    setOpen(true);
  };

  const handleSave = () => {
    const totalAmountClp = Number(form.amountPaid || 0);
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
      ...(canManagePayments && !editingId
        ? {
        totalAmountClp,
            payments: payments.map(payment => ({
              method: payment.method as ManualMassagePaymentMethod,
              status: payment.status,
              amountClp: Number(payment.amountClp),
              paidAt: payment.status === "paid" ? payment.paidAt : undefined,
              reference: payment.reference || undefined,
              cardType: payment.cardType || undefined,
              giftCardCode:
                payment.method === "gift_card"
                  ? payment.giftCardCode
                  : undefined,
            })),
          }
        : {}),
      discountCode: form.discountCode || undefined,
      notes: form.notes || undefined,
    };
    if (editingId) updateMut.mutate({ id: editingId, ...data });
    else createMut.mutate(data);
  };

  const updatePayment = (index: number, changes: Partial<PaymentDraft>) =>
    setPayments(current =>
      current.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, ...changes } : payment
      )
    );
  const submitNewPayment = () => {
    if (!editingId || !paymentIsComplete(newPayment)) return;
    const totalAmountClp = Number(form.amountPaid || 0);
    addPaymentMut.mutate({
      bookingId: editingId,
      totalAmountClp,
      payment: {
        method: newPayment.method as ManualMassagePaymentMethod,
        status: newPayment.status,
        amountClp: Number(newPayment.amountClp),
        paidAt: newPayment.status === "paid" ? newPayment.paidAt : undefined,
        reference: newPayment.reference || undefined,
        cardType: newPayment.cardType || undefined,
        giftCardCode:
          newPayment.method === "gift_card"
            ? newPayment.giftCardCode
            : undefined,
      },
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
  const saveEditedPayment = () => {
    if (!editingPaymentId || !paymentIsComplete(editingPayment)) return;
    updatePaymentMut.mutate({
      paymentId: editingPaymentId,
      payment: {
        method: editingPayment.method as ManualMassagePaymentMethod,
        status: editingPayment.status,
        amountClp: Number(editingPayment.amountClp),
        paidAt:
          editingPayment.status === "paid" ? editingPayment.paidAt : undefined,
        reference: editingPayment.reference || undefined,
        cardType: editingPayment.cardType || undefined,
      },
    });
  };
  const removeRegisteredPayment = (paymentId: number) => {
    if (
      window.confirm(
        "¿Eliminar este pago? El monto y el saldo de la reserva se recalcularán."
      )
    ) {
      removePaymentMut.mutate({ paymentId });
    }
  };
  const confirmPendingPayment = (payment: { id: number; method: string }) => {
    const paidAt = window.prompt(
      "Fecha y hora (AAAA-MM-DDTHH:MM):",
      chileDateTimeInput()
    );
    if (!paidAt) return;
    const reference = window.prompt("Código o referencia del pago:")?.trim();
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
    completePaymentMut.mutate({
      paymentId: payment.id,
      paidAt,
      reference,
      cardType,
    });
  };

  const setTechnique = (techniqueId: string) => {
    const technique = techniques?.find(t => String(t.id) === techniqueId);
    let price = "";
    if (technique) {
      if (form.duration === 50 && technique.price50min)
        price = String(technique.price50min);
      else if (form.duration === 80 && technique.price80min)
        price = String(technique.price80min);
      else if (form.duration === 110 && technique.price110min)
        price = String(technique.price110min);
    }
    setForm(f => ({ ...f, techniqueId, amountPaid: price || f.amountPaid }));
    if (!editingId && price) setPayments([emptyPayment(price)]);
  };

  const setStart = (time: string) => {
    setForm(f => ({
      ...f,
      startTime: time,
      endTime: calcEndTime(time, f.duration),
    }));
  };
  const setDuration = (d: number) => {
    const technique = techniques?.find(t => String(t.id) === form.techniqueId);
    let price = "";
    if (technique) {
      if (d === 50 && technique.price50min)
        price = String(technique.price50min);
      else if (d === 80 && technique.price80min)
        price = String(technique.price80min);
      else if (d === 110 && technique.price110min)
        price = String(technique.price110min);
    }
    setForm(f => ({
      ...f,
      duration: d,
      endTime: calcEndTime(f.startTime, d),
      amountPaid: price || f.amountPaid,
    }));
    if (!editingId && price) setPayments([emptyPayment(price)]);
  };

  // Navegación según vista
  const navPrev = () => {
    if (view === "day")
      setSelectedDate(format(subDays(parsedDate, 1), "yyyy-MM-dd"));
    else if (view === "week")
      setSelectedDate(format(subWeeks(parsedDate, 1), "yyyy-MM-dd"));
    else setSelectedDate(format(subMonths(parsedDate, 1), "yyyy-MM-dd"));
  };
  const navNext = () => {
    if (view === "day")
      setSelectedDate(format(addDays(parsedDate, 1), "yyyy-MM-dd"));
    else if (view === "week")
      setSelectedDate(format(addWeeks(parsedDate, 1), "yyyy-MM-dd"));
    else setSelectedDate(format(addMonths(parsedDate, 1), "yyyy-MM-dd"));
  };

  const editingBooking = (bookings ?? []).find(item => item.id === editingId) as any;
  const navLabel =
    view === "day"
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
            <p className="text-muted-foreground text-sm mt-1">
              Reservas de masajes
            </p>
          </div>
          {!canManageAgenda && !canAssignTherapists ? (
            <Badge variant="outline">Solo lectura</Badge>
          ) : canManageAgenda ? (
            <div className="flex w-full gap-2 flex-wrap sm:w-auto">
              <Button
                className="flex-1 sm:flex-none"
                variant="outline"
                onClick={() => setSkeduOpen(true)}
              >
                Agregar programa Skedu
              </Button>
              <Button className="flex-1 sm:flex-none" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Nueva reserva
              </Button>
            </div>
          ) : (
            <Badge variant="outline" className="border-teal-500 text-teal-700">
              Puede asignar terapeutas
            </Badge>
          )}
        </div>

        {/* Controles de navegación y vista */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Toggle HOY / SEMANA / MES */}
          <div className="flex w-full rounded-lg border overflow-hidden sm:w-auto">
            {(["day", "week", "month"] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`min-h-10 flex-1 px-3 py-1.5 text-sm font-medium transition-colors sm:min-h-0 sm:flex-none ${
                  view === v
                    ? "bg-stone-800 text-white"
                    : "bg-background hover:bg-accent text-foreground"
                }`}
              >
                {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>

          {/* Botón Hoy */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
            setSelectedDate(format(new Date(), "yyyy-MM-dd"));
            setView("day");
            }}
          >
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
            canManageAgenda={canManageAgenda}
            canAssignTherapists={canAssignTherapists}
            canViewSales={canViewSales}
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
            canManageAgenda={canManageAgenda}
            canAssignTherapists={canAssignTherapists}
            canViewSales={canViewSales}
          />
        )}
        {view === "month" && (
          <MonthView
            bookings={bookings}
            isLoading={isLoading}
            monthDate={parsedDate}
            onDayClick={handleDayClick}
            canViewSales={canViewSales}
          />
        )}
      </div>

      {/* Modal reserva */}
      {canManageAgenda && (
        <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar reserva" : "Nueva reserva"}
              </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>Nombre del cliente *</Label>
                <Input
                  value={form.clientName}
                  onChange={e =>
                    setForm(f => ({ ...f, clientName: e.target.value }))
                  }
                />
            </div>
            <div>
              <Label>Email</Label>
                <Input
                  value={form.clientEmail}
                  onChange={e =>
                    setForm(f => ({ ...f, clientEmail: e.target.value }))
                  }
                />
            </div>
            <div>
              <Label>Teléfono</Label>
                <Input
                  value={form.clientPhone}
                  onChange={e =>
                    setForm(f => ({ ...f, clientPhone: e.target.value }))
                  }
                />
            </div>
            <div>
              <Label>Origen / Ciudad</Label>
                <Input
                  value={form.clientOrigin}
                  onChange={e =>
                    setForm(f => ({ ...f, clientOrigin: e.target.value }))
                  }
                  placeholder="Santiago, Frutillar..."
                />
            </div>
            <div>
              <Label>Técnica *</Label>
              <Select value={form.techniqueId} onValueChange={setTechnique}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                <SelectContent>
                    {techniques?.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duración *</Label>
                <Select
                  value={String(form.duration)}
                  onValueChange={v => setDuration(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                <SelectContent>
                    {DURATIONS.map(d => (
                      <SelectItem key={d} value={String(d)}>
                        {d} min
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Terapeuta</Label>
                <Select
                  value={form.therapistId || "none"}
                  onValueChange={v =>
                    setForm(f => ({ ...f, therapistId: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                    {(therapists ?? []).filter(t => t.type === "inhouse")
                      .length > 0 && (
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Inhouse
                      </div>
                  )}
                    {(therapists ?? [])
                      .filter(t => t.type === "inhouse")
                      .map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                  ))}
                    {(therapists ?? []).filter(t => t.type === "freelance")
                      .length > 0 && (
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Freelance
                      </div>
                  )}
                    {(therapists ?? [])
                      .filter(t => t.type === "freelance")
                      .map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sala *</Label>
                <Select
                  value={form.roomId}
                  onValueChange={v => setForm(f => ({ ...f, roomId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                <SelectContent>
                    {rooms?.map(r => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
                <Input
                  type="date"
                  value={form.bookingDate}
                  onChange={e =>
                    setForm(f => ({ ...f, bookingDate: e.target.value }))
                  }
                />
            </div>
            <div>
              <Label>Hora inicio</Label>
              {slots && slots.length > 0 ? (
                <Select value={form.startTime} onValueChange={setStart}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  <SelectContent>
                    {slots.map(s => (
                      <SelectItem key={s.time} value={s.time}>
                          {s.time} ({s.availableRooms.length} sala
                          {s.availableRooms.length !== 1 ? "s" : ""})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                  <Input
                    value={form.startTime}
                    onChange={e => setStart(e.target.value)}
                    placeholder="10:00"
                  />
              )}
            </div>
              {canManagePayments && (
                <div>
                  <Label>Valor total del masaje</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.amountPaid}
                    onChange={e =>
                      setForm(f => ({ ...f, amountPaid: e.target.value }))
                    }
                    placeholder="0"
                  />
                </div>
              )}
              {canManagePayments && !editingId && (
                <div className="col-span-2 space-y-3">
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
                        onChange={changes => updatePayment(index, changes)}
                      />
                      {payments.length > 1 && (
                        <Button
                          type="button"
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
                  <p className="text-sm text-muted-foreground">
                    Abonos asignados: ${" "}
                    {payments
                      .reduce(
                        (sum, payment) =>
                          sum + (Number(payment.amountClp) || 0),
                        0
                      )
                      .toLocaleString("es-CL")}{" "}
                    · Saldo: ${" "}
                    {Math.max(
                      0,
                      Number(form.amountPaid || 0) -
                        payments.reduce(
                          (sum, payment) =>
                            sum + (Number(payment.amountClp) || 0),
                          0
                        )
                    ).toLocaleString("es-CL")}
                  </p>
                </div>
              )}
              {canManagePayments && editingId && (
                <div className="col-span-2 space-y-3">
              <Label>Pagos registrados</Label>
                  {(paymentQuery.data ?? []).map(payment =>
                    editingPaymentId === payment.id ? (
                      <div
                        key={payment.id}
                        className="space-y-2 rounded-xl border border-teal-300 bg-teal-50/30 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <strong className="text-sm">Editar pago</strong>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingPaymentId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <PaymentFields
                          payment={editingPayment}
                          onChange={changes =>
                            setEditingPayment(current => ({
                              ...current,
                              ...changes,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={saveEditedPayment}
                          disabled={
                            !paymentIsComplete(editingPayment) ||
                            updatePaymentMut.isPending
                          }
                        >
                          Guardar pago
                        </Button>
                      </div>
                    ) : (
                      <div
                        key={payment.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                      >
                        <div>
                          <strong>
                            {MASSAGE_PAYMENT_METHOD_LABELS[
                              payment.method as keyof typeof MASSAGE_PAYMENT_METHOD_LABELS
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
                              type="button"
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
                              <Edit className="mr-1 h-3.5 w-3.5" />
                              Editar
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() => removeRegisteredPayment(payment.id)}
                            disabled={removePaymentMut.isPending}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    )
                  )}
                  {!paymentQuery.data?.length && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                      {editingBooking?.getnetRequestId ? (
                        <>
                          <strong>Pago confirmado por Getnet.</strong> Este
                          cobro está protegido y no se puede editar ni eliminar.
                        </>
                      ) : (
                        <>
                          Sin desglose histórico. El monto abonado anterior se
                          conserva.
                        </>
                      )}
                    </div>
                  )}
                  <Label>Agregar pago o abono</Label>
                  <PaymentFields
                    payment={newPayment}
                    onChange={changes =>
                      setNewPayment(current => ({ ...current, ...changes }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={submitNewPayment}
                    disabled={
                      !paymentIsComplete(newPayment) || addPaymentMut.isPending
                    }
                  >
                    Agregar pago
                  </Button>
                </div>
              )}
              {canManagePayments && editingId ? (
                <div className="col-span-2 space-y-2 rounded-xl border p-3">
                  <Label>Código de descuento</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={form.discountCode}
                      onChange={e =>
                        setForm(f => ({
                          ...f,
                          discountCode: e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="Ingresa otro código"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setDiscountMut.mutate({
                          bookingId: editingId,
                          code: form.discountCode || undefined,
                        })
                      }
                      disabled={
                        !form.discountCode.trim() || setDiscountMut.isPending
                      }
                    >
                      Aplicar código
                    </Button>
                    {editingBooking?.discountCode && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => {
                          if (
                            window.confirm(
                              "¿Quitar el código de descuento de esta reserva?"
                            )
                          )
                            setDiscountMut.mutate({ bookingId: editingId });
                        }}
                        disabled={setDiscountMut.isPending}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Quitar código
                      </Button>
                    )}
                  </div>
                  {editingBooking?.discountCode && (
                    <p className="text-xs text-emerald-700">
                      Aplicado actualmente:{" "}
                      <strong>
                        {editingBooking?.discountCode}
                      </strong>{" "}
                      · −${" "}
                      {Number(
                        editingBooking?.discountAmount ?? 0
                      ).toLocaleString("es-CL")}
                    </p>
                  )}
                </div>
              ) : (
            <div>
              <Label>Código descuento</Label>
                  <Input
                    value={form.discountCode}
                    onChange={e =>
                      setForm(f => ({ ...f, discountCode: e.target.value }))
                    }
                  />
            </div>
              )}
            <div className="col-span-2">
              <Label>Notas</Label>
                <Textarea
                  value={form.notes}
                  onChange={e =>
                    setForm(f => ({ ...f, notes: e.target.value }))
                  }
                  rows={2}
                />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {editingId && (
              <Button
                variant="outline"
                className="border-amber-400 text-amber-700 hover:bg-amber-50 gap-2"
                onClick={() => notifyMut.mutate({ bookingId: editingId })}
                disabled={notifyMut.isPending}
                title="Revisar la prioridad automática y notificar al terapeuta asignado"
              >
                📲 Notificar terapeuta
              </Button>
            )}
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  createMut.isPending ||
                  updateMut.isPending ||
                  (!editingId &&
                    canManagePayments &&
                    (payments.some(payment => !paymentIsComplete(payment)) ||
                      payments.reduce(
                        (sum, payment) =>
                          sum + (Number(payment.amountClp) || 0),
                        0
                      ) > Number(form.amountPaid || 0)))
                }
              >
              {editingId ? "Guardar cambios" : "Crear reserva"}
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>
      )}
      {canManageAgenda && (
        <SkeduProgramBookingDialog
          open={skeduOpen}
          onOpenChange={setSkeduOpen}
          initialDate={selectedDate}
          onCreated={() => utils.masajes.agenda.getByDateRange.invalidate()}
        />
      )}
      {canAssignTherapists && (
        <SkeduTherapistAssignmentDialog
          open={!!editingSkeduBooking}
          onOpenChange={next => {
            if (!next) setEditingSkeduBooking(null);
          }}
          booking={editingSkeduBooking}
          onUpdated={() => utils.masajes.agenda.getByDateRange.invalidate()}
        />
      )}
      {canManageAgenda && (
        <MassageCancellationDialog
          open={!!cancellationTarget}
          onOpenChange={next => {
            if (!next) setCancellationTarget(null);
          }}
          bookingLabel={
            cancellationTarget
            ? `${cancellationTarget.clientName} · ${cancellationTarget.techniqueName}`
              : undefined
          }
          isPending={statusMut.isPending || programStatusMut.isPending}
          onConfirm={handleCancellation}
        />
      )}
    </DashboardLayout>
  );
}
