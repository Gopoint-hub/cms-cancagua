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
  BadgePercent,
  CalendarDays,
  CalendarClock,
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Filter,
  Gift,
  ListChecks,
  Link2,
  Mail,
  Phone,
  Pencil,
  Plus,
  RefreshCw,
  Rows3,
  UsersRound,
  Trash2,
  X,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { ReschedulePolicyOverride } from "@/components/cms/ReschedulePolicyOverride";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useIsMobile } from "@/hooks/useMobile";
import { toast } from "sonner";
import { UnifiedBookingDialog } from "./UnifiedBookingDialog";
import {
  ReservationPaymentLinks,
  type ReservationPaymentLink,
} from "@/components/cms/ReservationPaymentLinks";

type ViewMode = "day" | "week" | "month";
type DayMode = "list" | "summary" | "services";
type ServiceKey = "massages" | "biopools" | "sauna" | "regular_classes";
type EventKind = "massage" | "massage_program" | "biopool" | "sauna" | "regular_class" | "regular_class_schedule";

type CalendarEvent = {
  id: string;
  entityId: number;
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
  sauna: {
    label: "Sauna",
    dot: "bg-amber-600",
    panel: "border-amber-200 bg-amber-50/90",
    solid: "bg-amber-600",
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
    pending_payment: "Pendiente de pago",
    partially_paid: "Pago parcial",
    partially_refunded: "Reembolso parcial",
    refunded: "Reembolsado",
    unknown: "Sin registrar",
    applied: "Aplicado",
    removed: "Retirado",
    transbank: "Transbank Webpay",
    webpay_plus: "Webpay",
    webpay: "Transbank Webpay",
    getnet: "Getnet",
    getnet_link: "Link de pago Getnet",
    getnet_pos: "Máquina Getnet",
    payment_link: "Link de pago",
    transbank_machine: "Máquina Transbank",
    discount_code: "Código de descuento",
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

type PaymentDraft = {
  method: string;
  status: "pending" | "paid";
  amountClp: string;
  paidAt: string;
  reference: string;
  cardType: "credit" | "debit" | "";
  giftCardCode: string;
};

type PaymentAction = "link" | "manual" | "discount" | "giftcard";

function chileDateTimeInput(value?: unknown) {
  const date = value ? new Date(String(value)) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(safe);
  const item = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${item.year}-${item.month}-${item.day}T${item.hour}:${item.minute}`;
}

function emptyPayment(amountClp = ""): PaymentDraft {
  return { method: "", status: "paid", amountClp, paidAt: chileDateTimeInput(), reference: "", cardType: "", giftCardCode: "" };
}

const PAYMENT_METHODS: Record<"massages" | "biopools" | "sauna", string[]> = {
  massages: ["pending_payment", "getnet_pos", "bank_transfer", "cash", "gift_card", "transbank"],
  biopools: ["pending_payment", "bank_transfer", "cash", "gift_card", "transbank_machine"],
  sauna: ["pending_payment", "bank_transfer", "cash", "gift_card", "transbank_machine"],
};
const CARD_METHODS = new Set(["getnet_link", "getnet_pos", "payment_link", "transbank", "transbank_machine"]);

function paymentPayload(draft: PaymentDraft) {
  return {
    method: draft.method,
    status: draft.status,
    amountClp: Number(draft.amountClp),
    paidAt: draft.status === "paid" ? draft.paidAt : undefined,
    reference: draft.method === "gift_card" ? undefined : draft.reference.trim() || undefined,
    cardType: CARD_METHODS.has(draft.method) ? draft.cardType || undefined : undefined,
    giftCardCode: draft.method === "gift_card" ? draft.giftCardCode.trim().toUpperCase() : undefined,
  };
}

function validPayment(draft: PaymentDraft) {
  if (!draft.method || !Number.isInteger(Number(draft.amountClp)) || Number(draft.amountClp) <= 0) return false;
  if (draft.method === "gift_card") return Boolean(draft.giftCardCode.trim()) && draft.status === "paid";
  if (draft.status === "pending") return true;
  if (!draft.paidAt || (draft.method !== "cash" && !draft.reference.trim())) return false;
  return !CARD_METHODS.has(draft.method) || Boolean(draft.cardType);
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

function PaymentManager({ event, detail, onChanged }: { event: CalendarEvent; detail: any; onChanged: () => Promise<unknown> | void }) {
  const service = event.service as "massages" | "biopools" | "sauna";
  const [draft, setDraft] = useState<PaymentDraft>(() => emptyPayment(String(detail.payment?.balanceAmountClp || "")));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [discountCode, setDiscountCode] = useState(detail.payment?.discountCode ?? "");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardAmount, setGiftCardAmount] = useState(String(detail.payment?.balanceAmountClp || ""));
  const [paymentLinks, setPaymentLinks] = useState<ReservationPaymentLink[]>([]);
  const [paymentLinkPhone, setPaymentLinkPhone] = useState(detail.client?.phone ?? "");
  const [openPaymentAction, setOpenPaymentAction] = useState<PaymentAction | "">("");
  const [busy, setBusy] = useState(false);
  const activePaymentLink =
    trpc.reservationPaymentLinks.activeForReservation.useQuery(
      { service, reservationId: event.entityId },
      {
        refetchInterval: 10_000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
      }
    );

  useEffect(() => {
    setDraft(emptyPayment(String(detail.payment?.balanceAmountClp || "")));
    setEditingId(null);
    setDiscountCode(detail.payment?.discountCode ?? "");
    setGiftCardCode("");
    setGiftCardAmount(String(detail.payment?.balanceAmountClp || ""));
    setPaymentLinks([]);
    setPaymentLinkPhone(detail.client?.phone ?? "");
    setOpenPaymentAction("");
  }, [event.id, detail.payment?.balanceAmountClp, detail.payment?.discountCode]);

  const massageAdd = trpc.masajes.agenda.addPayment.useMutation();
  const massageUpdate = trpc.masajes.agenda.updatePayment.useMutation();
  const massageRemove = trpc.masajes.agenda.removePayment.useMutation();
  const massageDiscount = trpc.masajes.agenda.setDiscount.useMutation();
  const biopoolAdd = trpc.biopools.bookings.addPayment.useMutation();
  const biopoolUpdate = trpc.biopools.bookings.updatePayment.useMutation();
  const biopoolRemove = trpc.biopools.bookings.removePayment.useMutation();
  const biopoolDiscount = trpc.biopools.bookings.setDiscount.useMutation();
  const saunaAdd = trpc.sauna.agenda.addPayment.useMutation();
  const saunaUpdate = trpc.sauna.agenda.updatePayment.useMutation();
  const saunaRemove = trpc.sauna.agenda.removePayment.useMutation();
  const materializeLegacy = trpc.operations360.materializeLegacyPayment.useMutation();
  const replaceGiftCard = trpc.operations360.replaceGiftCardPayment.useMutation();
  const createPaymentLinks = trpc.reservationPaymentLinks.create.useMutation();
  const cancelPaymentLinkMutation =
    trpc.reservationPaymentLinks.cancel.useMutation();
  const paymentLinkLocked =
    activePaymentLink.data?.status === "active" ||
    activePaymentLink.data?.status === "processing" ||
    activePaymentLink.data?.status === "reconciliation_required";

  useEffect(() => {
    if (activePaymentLink.data?.token) setOpenPaymentAction("link");
  }, [activePaymentLink.data?.token]);

  useEffect(() => {
    const active = activePaymentLink.data;
    if (!active) {
      if (activePaymentLink.isFetched) setPaymentLinks([]);
      return;
    }
    setPaymentLinks([
      {
        token: active.token,
        url: active.url,
        provider: active.provider,
        totalClp: active.totalClp,
        reservationCount: active.reservationCount,
      },
    ]);
  }, [activePaymentLink.data?.token, activePaymentLink.isFetched]);

  const refresh = async (message: string) => {
    await onChanged();
    setDraft(emptyPayment());
    setEditingId(null);
    setOpenPaymentAction("");
    toast.success(message);
  };
  const execute = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try { await action(); await refresh(message); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar el cambio"); }
    finally { setBusy(false); }
  };
  const addPayment = (payment: any) => service === "massages"
    ? massageAdd.mutateAsync({ bookingId: event.entityId, totalAmountClp: detail.payment.totalAmountClp, payment })
    : service === "biopools"
      ? biopoolAdd.mutateAsync({ bookingId: event.entityId, payment })
      : saunaAdd.mutateAsync({ bookingId: event.entityId, payment });
  const savePayment = () => {
    if (!validPayment(draft)) return toast.error("Completa los datos obligatorios del pago");
    const payment = paymentPayload(draft) as any;
    if (editingId) {
      if (draft.method === "gift_card") {
        return execute(() => replaceGiftCard.mutateAsync({
          service,
          paymentId: editingId,
          code: draft.giftCardCode.trim().toUpperCase(),
          amountClp: Number(draft.amountClp),
        }), "Gift Card actualizada");
      }
      return execute(() => service === "massages" ? massageUpdate.mutateAsync({ paymentId: editingId, payment }) : service === "biopools" ? biopoolUpdate.mutateAsync({ paymentId: editingId, payment }) : saunaUpdate.mutateAsync({ paymentId: editingId, payment }), "Pago actualizado");
    }
    return execute(() => addPayment(payment), "Pago agregado");
  };
  const paymentIdFor = async (line: any) => {
    const paymentId = Number(String(line.id).replace("payment:", ""));
    if (paymentId) return paymentId;
    const result = await materializeLegacy.mutateAsync({ service, entityId: event.entityId });
    return result.paymentId;
  };
  const removePayment = (line: any) => {
    if (!window.confirm("¿Eliminar este pago? Si corresponde a una Gift Card, su saldo será repuesto.")) return;
    execute(async () => {
      const paymentId = await paymentIdFor(line);
      return service === "massages" ? massageRemove.mutateAsync({ paymentId }) : service === "biopools" ? biopoolRemove.mutateAsync({ paymentId }) : saunaRemove.mutateAsync({ paymentId });
    }, "Pago eliminado");
  };
  const saveDiscount = (remove = false) => execute(
    () => service === "massages"
      ? massageDiscount.mutateAsync({ bookingId: event.entityId, code: remove ? undefined : discountCode.trim().toUpperCase() || undefined })
      : biopoolDiscount.mutateAsync({ bookingId: event.entityId, code: remove ? undefined : discountCode.trim().toUpperCase() || undefined }),
    remove ? "Código de descuento eliminado" : "Código de descuento actualizado",
  );
  const startEdit = async (line: any) => {
    setBusy(true);
    try {
      const id = await paymentIdFor(line);
      setEditingId(id);
      setOpenPaymentAction("manual");
      setDraft({ method: line.method, status: line.status === "pending" ? "pending" : "paid", amountClp: String(line.amountClp), paidAt: chileDateTimeInput(line.at), reference: line.reference ?? "", cardType: line.cardType === "credit" || line.cardType === "debit" ? line.cardType : "", giftCardCode: line.method === "gift_card" ? line.reference ?? "" : "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible preparar el pago para editar");
    } finally {
      setBusy(false);
    }
  };

  const applyGiftCard = () => {
    const amountClp = Number(giftCardAmount);
    if (!giftCardCode.trim() || !Number.isInteger(amountClp) || amountClp <= 0)
      return toast.error("Ingresa el código y el monto a utilizar");
    if (amountClp > detail.payment.balanceAmountClp)
      return toast.error("El monto de la Gift Card supera el saldo pendiente");
    execute(() => addPayment({
      method: "gift_card",
      status: "paid",
      amountClp,
      paidAt: chileDateTimeInput(),
      giftCardCode: giftCardCode.trim().toUpperCase(),
    }), "Gift Card aplicada y saldo actualizado");
  };

  const generatePaymentLink = async () => {
    setPaymentLinks([]);
    setBusy(true);
    try {
      const result: any = await createPaymentLinks.mutateAsync({
        reservations: [{ service, reservationId: event.entityId }],
      });
      setPaymentLinks(result.links);
      setPaymentLinkPhone(result.clientPhone || detail.client?.phone || "");
      await Promise.all([activePaymentLink.refetch(), onChanged()]);
      toast.success("Link de pago generado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible generar el link de pago"
      );
    } finally {
      setBusy(false);
    }
  };

  const cancelPaymentLink = async () => {
    const token = paymentLinks[0]?.token;
    if (!token) return;
    const reservationCount = paymentLinks[0]?.reservationCount ?? 1;
    const scope = reservationCount > 1
      ? `Este cobro corresponde a ${reservationCount} reservas y el cliente ya no podrá utilizarlo.`
      : "El cliente ya no podrá utilizarlo.";
    if (!window.confirm(`¿Cancelar este link de pago? ${scope}`)) return;
    setBusy(true);
    try {
      await cancelPaymentLinkMutation.mutateAsync({ token });
      setPaymentLinks([]);
      await Promise.all([activePaymentLink.refetch(), onChanged()]);
      toast.success("Link de pago cancelado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible cancelar el link de pago"
      );
    } finally {
      setBusy(false);
    }
  };

  const hasOutstandingBalance = detail.payment.balanceAmountClp > 0;
  const otherPaymentActionsLocked =
    paymentLinkLocked || !activePaymentLink.isFetched;
  const paymentFieldId = `payment-${service}-${event.entityId}`;

  return <div className="space-y-4">
    <div className="overflow-hidden rounded-xl border">
      {detail.payment.lines.map((line: any) => {
        const processorProtected = ["webpay", "webpay_plus", "getnet"].includes(line.method);
        const linkedPlaceholder =
          ["payment_link", "getnet_link"].includes(line.method) &&
          String(line.reference ?? "").startsWith("PAYLINK:");
        const lockedPayment = processorProtected || linkedPlaceholder;
        const giftCard = line.method === "gift_card";
        const removableDiscount = line.type === "discount" && line.status === "applied" && Boolean(detail.payment.discountCode) && (service === "massages" || service === "biopools");
        return <div key={line.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-b p-3 last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto] sm:items-center sm:p-4">
          <div><p className="font-semibold">{paymentLabel(line.method)}</p><p className={cn("text-xs", line.type === "discount" ? "text-emerald-700" : "text-muted-foreground")}>{paymentLabel(line.status)}</p></div>
          <div className="col-span-2 text-xs text-muted-foreground sm:col-span-1"><p className={cn("break-words", line.type === "discount" && "font-mono font-semibold text-violet-700")}>{line.reference || "Sin referencia"}</p>{line.cardType && <p>{line.cardType === "credit" ? "Crédito" : "Débito"}</p>}{line.at && <p>{new Date(line.at).toLocaleString("es-CL")}</p>}</div>
          <p className={cn("col-start-2 row-start-1 font-semibold text-right sm:col-start-auto sm:row-start-auto", line.type === "discount" && "text-emerald-700")}>{line.type === "discount" ? "−" : ""}{money(line.amountClp)}</p>
          <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">{line.type === "payment" && !lockedPayment && <Button type="button" size="icon" variant="ghost" title={giftCard ? "Editar Gift Card" : "Editar pago"} disabled={busy || paymentLinkLocked || !activePaymentLink.isFetched} onClick={() => startEdit(line)}><Pencil className="h-4 w-4" /></Button>}{line.type === "payment" && !lockedPayment && <Button type="button" size="icon" variant="ghost" title="Eliminar pago" disabled={busy || paymentLinkLocked || !activePaymentLink.isFetched} onClick={() => removePayment(line)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}{removableDiscount && <Button type="button" size="icon" variant="ghost" title="Eliminar código de descuento" disabled={busy || paymentLinkLocked || !activePaymentLink.isFetched} onClick={() => saveDiscount(true)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}{processorProtected && line.type === "payment" && <span className="self-center text-xs text-muted-foreground">Protegido</span>}{linkedPlaceholder && line.type === "payment" && <span className="self-center text-xs text-muted-foreground">Vinculado al link</span>}</div>
        </div>;
      })}
      {!detail.payment.lines.length && <p className="p-4 text-sm text-muted-foreground">Esta reserva todavía no tiene pagos detallados.</p>}
    </div>

    {(hasOutstandingBalance || Boolean(activePaymentLink.data) || Boolean(editingId)) && (
      <section className="space-y-3 rounded-xl border bg-muted/20 p-3 sm:p-4">
        <div>
          <p className="font-semibold">
            {hasOutstandingBalance
              ? `Elige cómo cubrir el saldo · ${money(detail.payment.balanceAmountClp)}`
              : editingId
                ? "Editar pago registrado"
                : "Cobro electrónico en revisión"}
          </p>
          {hasOutstandingBalance && (
            <p className="mt-1 text-xs text-muted-foreground">
              Abre una opción para ver su detalle. Las opciones desaparecerán cuando la reserva esté pagada al 100%.
            </p>
          )}
        </div>

        {!activePaymentLink.isFetched && hasOutstandingBalance && (
          <p className="rounded-lg bg-sky-50 p-2 text-xs text-sky-900">
            Comprobando si esta reserva ya tiene un link de pago…
          </p>
        )}

        {paymentLinkLocked && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            {activePaymentLink.data?.status === "processing"
              ? "El pago ya fue iniciado. Espera la confirmación antes de elegir otro medio."
              : activePaymentLink.data?.status === "reconciliation_required"
                ? "El pago electrónico está en revisión. No registres otro cobro hasta conciliarlo."
                : "Hay un link vigente. Cancélalo antes de elegir otra forma de pago."}
          </p>
        )}

        <Accordion
          type="single"
          collapsible
          value={openPaymentAction}
          onValueChange={value => setOpenPaymentAction(value as PaymentAction | "")}
          className="space-y-2"
        >
          {(hasOutstandingBalance || Boolean(activePaymentLink.data)) && (
            <AccordionItem value="link" className="overflow-hidden rounded-xl border border-emerald-200 bg-white px-3 sm:px-4">
              <AccordionTrigger className="min-h-14 py-3 hover:no-underline">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Link2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">Link de pago</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {paymentLinks.length ? "Link vigente para copiar o enviar" : "Cobrar por internet con actualización automática"}
                    </span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-3">
                <div className="space-y-3 rounded-lg bg-emerald-50/60 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Genera un link relacionado con esta reserva. Al pagarse, el estado se actualizará automáticamente.
                    </p>
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      variant={paymentLinks.length ? "outline" : "default"}
                      disabled={busy || createPaymentLinks.isPending || paymentLinkLocked || !activePaymentLink.isFetched}
                      onClick={generatePaymentLink}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      {createPaymentLinks.isPending ? "Generando…" : paymentLinks.length ? "Link vigente" : "Generar link de pago"}
                    </Button>
                  </div>
                  <ReservationPaymentLinks links={paymentLinks} clientPhone={paymentLinkPhone} clientName={detail.client?.name} />
                  {paymentLinks.length > 0 && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {activePaymentLink.data?.status === "processing"
                          ? "El cliente ya inició el pago. Esperando confirmación de la pasarela."
                          : activePaymentLink.data?.status === "reconciliation_required"
                            ? "El proveedor informó un pago y quedó pendiente de revisión interna. No realices un nuevo cobro."
                            : "Este link seguirá disponible al volver a abrir la reserva."}
                      </p>
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        size="sm"
                        variant="destructive"
                        disabled={busy || cancelPaymentLinkMutation.isPending || activePaymentLink.data?.status !== "active"}
                        onClick={cancelPaymentLink}
                      >
                        Cancelar link
                      </Button>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {(hasOutstandingBalance || Boolean(editingId)) && (
            <AccordionItem
              value="manual"
              disabled={otherPaymentActionsLocked}
              className="overflow-hidden rounded-xl border bg-white px-3 sm:px-4"
            >
              <AccordionTrigger className="min-h-14 py-3 hover:no-underline">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                    <CircleDollarSign className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{editingId ? "Editar pago" : "Agregar pago"}</span>
                    <span className="block text-xs font-normal text-muted-foreground">Efectivo, transferencia o máquina</span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-3">
                <fieldset disabled={paymentLinkLocked} className="space-y-3 rounded-lg border border-dashed bg-background/80 p-3 disabled:opacity-60">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{editingId ? "Editar pago" : "Agregar pago"}</p>
                    {editingId && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => {
                        setEditingId(null);
                        setDraft(emptyPayment(String(detail.payment.balanceAmountClp || "")));
                        setOpenPaymentAction("");
                      }}>
                        <X className="mr-1 h-4 w-4" />Cancelar
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor={`${paymentFieldId}-method`}>Medio de pago</Label>
                      <Select value={draft.method} disabled={editingId !== null && draft.method === "gift_card"} onValueChange={method => setDraft(current => ({ ...current, method, reference: "", giftCardCode: "", cardType: "", status: method === "pending_payment" ? "pending" : method === "gift_card" ? "paid" : current.status }))}>
                        <SelectTrigger id={`${paymentFieldId}-method`}><SelectValue placeholder="Selecciona" /></SelectTrigger>
                        <SelectContent>{PAYMENT_METHODS[service]
                          .filter(method => method !== "gift_card" || (editingId !== null && draft.method === "gift_card"))
                          .map(method => <SelectItem key={method} value={method}>{paymentLabel(method)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`${paymentFieldId}-status`}>Estado</Label>
                      <Select value={draft.status} disabled={draft.method === "gift_card" || draft.method === "pending_payment"} onValueChange={(status: "pending" | "paid") => setDraft(current => ({ ...current, status }))}>
                        <SelectTrigger id={`${paymentFieldId}-status`}><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="paid">Pagado</SelectItem><SelectItem value="pending">Pendiente de pago</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div><Label htmlFor={`${paymentFieldId}-amount`}>Monto</Label><Input id={`${paymentFieldId}-amount`} type="number" min={1} value={draft.amountClp} onChange={e => setDraft(current => ({ ...current, amountClp: e.target.value }))} /></div>
                    {draft.status === "paid" && <div><Label htmlFor={`${paymentFieldId}-paid-at`}>Fecha y hora</Label><Input id={`${paymentFieldId}-paid-at`} type="datetime-local" value={draft.paidAt} onChange={e => setDraft(current => ({ ...current, paidAt: e.target.value }))} /></div>}
                    {draft.method === "gift_card" ? (
                      <div className="sm:col-span-2"><Label htmlFor={`${paymentFieldId}-edit-giftcard`}>Código de Gift Card</Label><Input id={`${paymentFieldId}-edit-giftcard`} value={draft.giftCardCode} onChange={e => setDraft(current => ({ ...current, giftCardCode: e.target.value.toUpperCase() }))} /></div>
                    ) : draft.method !== "cash" && draft.status === "paid" ? (
                      <div><Label htmlFor={`${paymentFieldId}-reference`}>Referencia</Label><Input id={`${paymentFieldId}-reference`} value={draft.reference} onChange={e => setDraft(current => ({ ...current, reference: e.target.value }))} /></div>
                    ) : null}
                    {CARD_METHODS.has(draft.method) && draft.status === "paid" && (
                      <div><Label htmlFor={`${paymentFieldId}-card-type`}>Tipo de tarjeta</Label><Select value={draft.cardType} onValueChange={(cardType: "credit" | "debit") => setDraft(current => ({ ...current, cardType }))}><SelectTrigger id={`${paymentFieldId}-card-type`}><SelectValue placeholder="Selecciona" /></SelectTrigger><SelectContent><SelectItem value="credit">Crédito</SelectItem><SelectItem value="debit">Débito</SelectItem></SelectContent></Select></div>
                    )}
                  </div>
                  <Button className="w-full sm:w-auto" type="button" disabled={busy || paymentLinkLocked || !validPayment(draft)} onClick={savePayment}>
                    <Plus className="mr-2 h-4 w-4" />{editingId ? "Guardar cambios" : "Agregar pago"}
                  </Button>
                </fieldset>
              </AccordionContent>
            </AccordionItem>
          )}

          {hasOutstandingBalance && (service === "massages" || service === "biopools") && (
            <AccordionItem
              value="discount"
              disabled={otherPaymentActionsLocked}
              className="overflow-hidden rounded-xl border bg-white px-3 sm:px-4"
            >
              <AccordionTrigger className="min-h-14 py-3 hover:no-underline">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><BadgePercent className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block font-semibold">Código de descuento</span><span className="block text-xs font-normal text-muted-foreground">Aplicar, cambiar o eliminar un código</span></span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-3">
                <div className="space-y-2 rounded-lg border bg-background/80 p-3">
                  <Label htmlFor={`${paymentFieldId}-discount`}>Código de descuento</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input id={`${paymentFieldId}-discount`} value={discountCode} onChange={e => setDiscountCode(e.target.value.toUpperCase())} placeholder="Código" disabled={paymentLinkLocked} />
                    <Button className="w-full sm:w-auto" type="button" variant="outline" disabled={busy || paymentLinkLocked || !discountCode.trim()} onClick={() => saveDiscount(false)}>Aplicar o cambiar</Button>
                    {detail.payment.discountCode && <Button className="w-full sm:w-auto" type="button" variant="destructive" disabled={busy || paymentLinkLocked} onClick={() => saveDiscount(true)}>Eliminar</Button>}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {hasOutstandingBalance && (
            <AccordionItem
              value="giftcard"
              disabled={otherPaymentActionsLocked}
              className="overflow-hidden rounded-xl border border-violet-200 bg-white px-3 sm:px-4"
            >
              <AccordionTrigger className="min-h-14 py-3 hover:no-underline">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Gift className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block font-semibold">Gift Card</span><span className="block text-xs font-normal text-muted-foreground">Usar el saldo disponible de un código</span></span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-3">
                <div className="space-y-3 rounded-lg bg-violet-50/70 p-3">
                  <div><p className="font-semibold">Aplicar Gift Card</p><p className="text-xs text-muted-foreground">Se descontará el monto utilizado y se conservará automáticamente cualquier saldo a favor.</p></div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                    <div><Label htmlFor={`${paymentFieldId}-giftcard-code`}>Código de Gift Card</Label><Input id={`${paymentFieldId}-giftcard-code`} value={giftCardCode} onChange={e => setGiftCardCode(e.target.value.toUpperCase())} placeholder="Código" disabled={paymentLinkLocked} /></div>
                    <div><Label htmlFor={`${paymentFieldId}-giftcard-amount`}>Monto a utilizar</Label><Input id={`${paymentFieldId}-giftcard-amount`} type="number" min={1} max={detail.payment.balanceAmountClp} value={giftCardAmount} onChange={e => setGiftCardAmount(e.target.value)} disabled={paymentLinkLocked} /></div>
                    <Button className="w-full self-end sm:w-auto" type="button" disabled={busy || paymentLinkLocked || !giftCardCode.trim() || !giftCardAmount} onClick={applyGiftCard}>Aplicar</Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </section>
    )}
  </div>;
}

function ProgramPaymentManager({
  event,
  detail,
  onChanged,
}: {
  event: CalendarEvent;
  detail: any;
  onChanged: () => Promise<unknown> | void;
}) {
  const [method, setMethod] = useState<
    "cash" | "bank_transfer" | "getnet_pos" | "transbank"
  >("cash");
  const [reference, setReference] = useState("");
  const [paymentLinks, setPaymentLinks] = useState<ReservationPaymentLink[]>([]);
  const [paymentLinkPhone, setPaymentLinkPhone] = useState(detail.client?.phone ?? "");
  const settle = trpc.masajes.agenda.settleSkeduProgramPayment.useMutation();
  const createPaymentLinks = trpc.reservationPaymentLinks.create.useMutation();
  const cancelPaymentLinkMutation = trpc.reservationPaymentLinks.cancel.useMutation();
  const activePaymentLink =
    trpc.reservationPaymentLinks.activeForReservation.useQuery(
      { service: "massage_programs", reservationId: event.entityId },
      {
        refetchInterval: 10_000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
      }
    );
  const paymentLinkLocked =
    activePaymentLink.data?.status === "active" ||
    activePaymentLink.data?.status === "processing" ||
    activePaymentLink.data?.status === "reconciliation_required";

  useEffect(() => {
    setPaymentLinks([]);
    setPaymentLinkPhone(detail.client?.phone ?? "");
  }, [event.id, detail.payment?.balanceAmountClp]);

  useEffect(() => {
    const active = activePaymentLink.data;
    if (!active) {
      if (activePaymentLink.isFetched) setPaymentLinks([]);
      return;
    }
    setPaymentLinks([
      {
        token: active.token,
        url: active.url,
        provider: active.provider,
        totalClp: active.totalClp,
        reservationCount: active.reservationCount,
      },
    ]);
  }, [activePaymentLink.data?.token, activePaymentLink.isFetched]);

  const generatePaymentLink = async () => {
    setPaymentLinks([]);
    try {
      const result: any = await createPaymentLinks.mutateAsync({
        reservations: [
          { service: "massage_programs", reservationId: event.entityId },
        ],
      });
      setPaymentLinks(result.links);
      setPaymentLinkPhone(result.clientPhone || detail.client?.phone || "");
      await Promise.all([activePaymentLink.refetch(), onChanged()]);
      toast.success("Link de pago generado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible generar el link de pago"
      );
    }
  };
  const cancelPaymentLink = async () => {
    const token = paymentLinks[0]?.token;
    if (!token) return;
    const reservationCount = paymentLinks[0]?.reservationCount ?? 1;
    const scope = reservationCount > 1
      ? `Este cobro corresponde a ${reservationCount} reservas y el cliente ya no podrá utilizarlo.`
      : "El cliente ya no podrá utilizarlo.";
    if (!window.confirm(`¿Cancelar este link de pago? ${scope}`)) return;
    try {
      await cancelPaymentLinkMutation.mutateAsync({ token });
      setPaymentLinks([]);
      await Promise.all([activePaymentLink.refetch(), onChanged()]);
      toast.success("Link de pago cancelado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible cancelar el link de pago"
      );
    }
  };
  const save = async () => {
    if (method !== "cash" && !reference.trim()) {
      return toast.error("Indica la referencia del pago");
    }
    try {
      await settle.mutateAsync({
        id: event.entityId,
        method,
        reference: reference.trim() || undefined,
      });
      await onChanged();
      toast.success("Pago del programa registrado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo registrar el pago"
      );
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-4">
      <div className="space-y-3 rounded-xl border border-emerald-200 bg-white p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Enviar cobro por Getnet</p>
            <p className="text-xs text-muted-foreground">
              El pago quedará asociado a este programa y se actualizará automáticamente.
            </p>
          </div>
          <Button
            type="button"
            variant={paymentLinks.length ? "outline" : "default"}
            disabled={createPaymentLinks.isPending || paymentLinkLocked}
            onClick={generatePaymentLink}
          >
            <Link2 className="mr-2 h-4 w-4" />
            {createPaymentLinks.isPending
              ? "Generando…"
              : paymentLinks.length
                ? "Link vigente"
                : "Generar link de pago"}
          </Button>
        </div>
        <ReservationPaymentLinks
          links={paymentLinks}
          clientPhone={paymentLinkPhone}
          clientName={detail.client?.name}
        />
        {paymentLinks.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {activePaymentLink.data?.status === "processing"
                ? "El cliente ya inició el pago. Esperando confirmación de Getnet."
                : activePaymentLink.data?.status === "reconciliation_required"
                  ? "Getnet informó un pago y quedó pendiente de revisión interna. No realices un nuevo cobro."
                : "Este link seguirá disponible al volver a abrir el programa."}
            </p>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={
                cancelPaymentLinkMutation.isPending ||
                activePaymentLink.data?.status !== "active"
              }
              onClick={cancelPaymentLink}
            >
              Cancelar link
            </Button>
          </div>
        )}
        {paymentLinkLocked && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            {activePaymentLink.data?.status === "processing"
              ? "El pago ya fue iniciado. Espera la confirmación de Getnet."
              : activePaymentLink.data?.status === "reconciliation_required"
                ? "El pago electrónico está en revisión. No registres otro cobro hasta conciliarlo."
              : "Cancela el link vigente antes de registrar otro pago."}
          </p>
        )}
      </div>
      <div>
        <p className="font-semibold">
          Cobrar saldo del check-in · {money(detail.payment.balanceAmountClp)}
        </p>
        <p className="text-xs text-muted-foreground">
          Al elegir efectivo, el monto entra automáticamente a Caja efectivo.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Medio utilizado</Label>
          <Select value={method} onValueChange={(value: typeof method) => setMethod(value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Efectivo</SelectItem>
              <SelectItem value="bank_transfer">Transferencia</SelectItem>
              <SelectItem value="getnet_pos">Máquina Getnet</SelectItem>
              <SelectItem value="transbank">Transbank</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {method !== "cash" && (
          <div>
            <Label>Referencia</Label>
            <Input value={reference} onChange={event => setReference(event.target.value)} />
          </div>
        )}
      </div>
      <Button type="button" variant="destructive" disabled={settle.isPending || paymentLinkLocked} onClick={save}>
        <CircleDollarSign className="mr-2 h-4 w-4" />
        Confirmar pago completo
      </Button>
    </div>
  );
}

function ReservationActions({
  event,
  detail,
  onChanged,
  onCancelled,
}: {
  event: CalendarEvent;
  detail: any;
  onChanged: () => Promise<unknown> | void;
  onCancelled: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [adults, setAdults] = useState(String(detail.editable?.adultQuantity ?? 1));
  const [children, setChildren] = useState(String(detail.editable?.childQuantity ?? 0));
  const [techniqueId, setTechniqueId] = useState(String(detail.editable?.techniqueId ?? ""));
  const [duration, setDuration] = useState(String(detail.editable?.duration ?? 50));
  const [bookingDate, setBookingDate] = useState(detail.schedule.date);
  const [startTime, setStartTime] = useState(detail.schedule.startTime.slice(0, 5));
  const [reason, setReason] = useState("");
  const [overridePolicy, setOverridePolicy] = useState(false);
  const [busy, setBusy] = useState(false);

  const techniques = trpc.masajes.tecnicas.getAll.useQuery(undefined, {
    enabled: editOpen && event.kind === "massage",
  });
  const updateGuests = trpc.biopools.bookings.updateGuests.useMutation();
  const updateMassage = trpc.masajes.agenda.updateService.useMutation();
  const rescheduleBiopool = trpc.biopools.bookings.reschedule.useMutation();
  const rescheduleMassage = trpc.masajes.agenda.reschedule.useMutation();
  const rescheduleSauna = trpc.sauna.agenda.reschedule.useMutation();
  const cancelBiopool = trpc.biopools.bookings.updateStatus.useMutation();
  const cancelMassage = trpc.masajes.agenda.updateStatus.useMutation();

  const execute = async (action: () => Promise<any>, success: string, close: () => void) => {
    setBusy(true);
    try {
      const result = await action();
      const excess = Number(result?.overpaymentAmountClp ?? 0);
      toast.success(excess > 0 ? `${success}. Quedó un excedente de ${money(excess)} por regularizar.` : success);
      close();
      await onChanged();
    } catch (error: any) {
      toast.error(error?.message || "No fue posible actualizar la reserva");
    } finally {
      setBusy(false);
    }
  };

  const selectedTechnique: any = techniques.data?.find((item: any) => item.id === Number(techniqueId));
  const massagePrice = duration === "50"
    ? selectedTechnique?.price50min
    : duration === "80"
      ? selectedTechnique?.price80min
      : selectedTechnique?.price110min;
  const biopoolPrice =
    Number(adults || 0) * Number(detail.editable?.adultPriceClp ?? 0) +
    Number(children || 0) * Number(detail.editable?.childPriceClp ?? 0);

  const submitReschedule = () => {
    if (event.kind === "biopool") {
      return rescheduleBiopool.mutateAsync({
        id: event.entityId,
        bookingDate,
        startTime,
        reason: reason.trim(),
        overridePolicy,
      });
    }
    if (event.kind === "sauna") {
      return rescheduleSauna.mutateAsync({
        id: event.entityId,
        bookingDate,
        startTime,
        reason: reason.trim(),
        overridePolicy,
      });
    }
    return rescheduleMassage.mutateAsync({
      id: event.entityId,
      bookingDate,
      startTime,
      reason: reason.trim(),
    });
  };

  const submitCancellation = () => {
    if (event.kind === "biopool") {
      return cancelBiopool.mutateAsync({
        id: event.entityId,
        status: "cancelled",
        reason: reason.trim(),
      });
    }
    return cancelMassage.mutateAsync({
      id: event.entityId,
      status: "cancelled",
      cancellationCategory: "client_cancelled",
      cancellationReason: reason.trim(),
    });
  };

  return <>
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      {(event.kind === "biopool" || event.kind === "massage") && <Button type="button" variant="outline" onClick={() => {
        setAdults(String(detail.editable?.adultQuantity ?? 1));
        setChildren(String(detail.editable?.childQuantity ?? 0));
        setTechniqueId(String(detail.editable?.techniqueId ?? ""));
        setDuration(String(detail.editable?.duration ?? 50));
        setEditOpen(true);
      }}>
        <Pencil className="mr-2 h-4 w-4" />Editar reserva
      </Button>}
      <Button type="button" variant="outline" onClick={() => {
        setBookingDate(detail.schedule.date);
        setStartTime(detail.schedule.startTime.slice(0, 5));
        setReason("");
        setOverridePolicy(false);
        setRescheduleOpen(true);
      }}>
        <CalendarClock className="mr-2 h-4 w-4" />Reagendar
      </Button>
      {event.kind !== "sauna" && <Button type="button" variant="destructive" onClick={() => { setReason(""); setCancelOpen(true); }}>
        <Ban className="mr-2 h-4 w-4" />Cancelar reserva
      </Button>}
    </div>

    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event.kind === "biopool" ? "Editar cantidad de personas" : "Editar masaje"}</DialogTitle>
          <DialogDescription>El valor y el saldo se recalcularán sin modificar los pagos ya registrados.</DialogDescription>
        </DialogHeader>
        {event.kind === "biopool" ? <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Adultos</Label><Input type="number" min={0} max={40} value={adults} onChange={e => setAdults(e.target.value)} /></div>
            <div><Label>Niños</Label><Input type="number" min={0} max={40} value={children} onChange={e => setChildren(e.target.value)} /></div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-sm"><span>Nuevo precio base</span><strong>{money(biopoolPrice)}</strong></div>
          <Button disabled={busy || Number(adults) + Number(children) < 1} onClick={() => execute(
            () => updateGuests.mutateAsync({ id: event.entityId, adultQuantity: Number(adults), childQuantity: Number(children) }),
            "Cantidad de personas y monto actualizados",
            () => setEditOpen(false),
          )}>Guardar cambios</Button>
        </div> : <div className="space-y-4">
          <div><Label>Tipo de masaje</Label><Select value={techniqueId} onValueChange={setTechniqueId}><SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger><SelectContent>{techniques.data?.filter((item: any) => item.active === 1).map((item: any) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Duración</Label><Select value={duration} onValueChange={setDuration}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{String(selectedTechnique?.durations ?? "50,80,110").split(",").map((minutes: string) => <SelectItem key={minutes.trim()} value={minutes.trim()}>{minutes.trim()} minutos</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-sm"><span>Nuevo precio base</span><strong>{massagePrice ? money(Number(massagePrice)) : "Sin valor"}</strong></div>
          <Button disabled={busy || !techniqueId || !massagePrice} onClick={() => execute(
            () => updateMassage.mutateAsync({ id: event.entityId, techniqueId: Number(techniqueId), duration: Number(duration) as 50 | 80 | 110 }),
            "Masaje, duración y monto actualizados",
            () => setEditOpen(false),
          )}>Guardar cambios</Button>
        </div>}
      </DialogContent>
    </Dialog>

    <Dialog open={rescheduleOpen} onOpenChange={open => {
      setRescheduleOpen(open);
      if (!open) setOverridePolicy(false);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Reagendar reserva</DialogTitle><DialogDescription>Se comprobará nuevamente la disponibilidad antes de guardar.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label>Nueva fecha</Label><Input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} /></div><div><Label>Nueva hora</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div></div>
        <div><Label>Motivo</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo del reagendamiento" /></div>
        {(event.kind === "biopool" || event.kind === "sauna") && <ReschedulePolicyOverride
          checked={overridePolicy}
          onCheckedChange={setOverridePolicy}
          policySummary={event.kind === "biopool"
            ? "Biopiscinas exige el plazo mínimo y el máximo de cambios configurados para la reserva."
            : "Sauna exige el plazo mínimo y el máximo de cambios configurados para la reserva."}
        />}
        <Button disabled={busy || !bookingDate || !startTime || reason.trim().length < (overridePolicy ? 10 : 3)} onClick={() => execute(
          submitReschedule,
          "Reserva reagendada",
          () => setRescheduleOpen(false),
        )}>{overridePolicy ? "Reagendar como excepción" : "Confirmar reagendamiento"}</Button>
      </DialogContent>
    </Dialog>

    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Cancelar reserva</DialogTitle><DialogDescription>La reserva desaparecerá del Calendario 360. Los pagos electrónicos conservarán sus reglas de reembolso.</DialogDescription></DialogHeader>
        <div><Label>Motivo de cancelación</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Indica por qué se cancela" /></div>
        <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => execute(
          submitCancellation,
          "Reserva cancelada",
          () => { setCancelOpen(false); onCancelled(); },
        )}>Sí, cancelar reserva</Button>
      </DialogContent>
    </Dialog>
  </>;
}

function ReservationDetail({ event, open, onOpenChange }: { event: CalendarEvent | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("general");
  const query = trpc.operations360.detail.useQuery(
    { kind: event?.kind ?? "biopool", entityId: event?.entityId ?? 1, date: event?.date ?? dateKey(new Date()) },
    {
      enabled: open && Boolean(event),
      refetchInterval:
        open && event?.paymentStatus !== "paid" ? 10_000 : false,
    }
  );
  const detail: any = query.data;
  useEffect(() => {
    if (open) setTab("general");
  }, [open, event?.id]);
  const meta = event ? SERVICE_META[event.service] : null;
  const paymentTone = !detail?.payment
    ? "border-slate-200 bg-background"
    : detail.payment.balanceAmountClp <= 0
      ? "border-emerald-300 bg-emerald-50/80"
      : detail.payment.amountClp > 0
        ? "border-amber-300 bg-amber-50/80"
        : "border-rose-300 bg-rose-50/80";
  const refreshReservationViews = async () => {
    await Promise.all([
      query.refetch(),
      utils.operations360.calendar.invalidate(),
      event?.service === "biopools"
        ? utils.biopools.invalidate()
        : event?.service === "sauna"
          ? utils.sauna.invalidate()
          : event?.service === "massages"
            ? utils.masajes.agenda.getByDateRange.invalidate()
            : Promise.resolve(),
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] min-w-0 overflow-y-auto sm:max-w-3xl">
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
            {detail.payment?.balanceAmountClp > 0 && (
              <div className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold">Pendiente de pago · {money(detail.payment.balanceAmountClp)}</p><p className="text-sm text-red-800">Al hacer check-in, confirma el cobro y selecciona el medio realmente utilizado.</p></div>
                {detail.canManagePayments && ["massages", "biopools", "sauna"].includes(event?.service ?? "") && <Button variant="destructive" onClick={() => setTab("payments")}>Registrar pago del check-in</Button>}
              </div>
            )}
            <div className="grid min-w-0 gap-3 sm:grid-cols-3">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Fecha y hora</p><p className="mt-1 font-semibold capitalize">{format(new Date(`${detail.schedule.date}T12:00:00`), "EEE d MMM", { locale: es })}</p><p className="text-sm">{detail.schedule.startTime.slice(0, 5)} – {detail.schedule.endTime.slice(0, 5)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Cliente / responsable</p><p className="mt-1 font-semibold">{detail.client.name}</p><p className="text-xs text-muted-foreground">{detail.detail}</p></CardContent></Card>
              <Card className={cn(detail.payment && paymentTone)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Estado de pago</p><p className="mt-1 font-semibold">{detail.payment ? detail.payment.balanceAmountClp <= 0 ? "Pagada" : detail.payment.amountClp > 0 ? "Abonada" : "No pagada" : "No corresponde"}</p><p className="text-sm text-muted-foreground">{detail.payment ? money(detail.payment.amountClp) : "Clase programada"}</p></CardContent></Card>
            </div>
            <Tabs value={tab} onValueChange={setTab}>
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
                {detail.payment ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 sm:p-4 lg:grid-cols-5">
                      <div><p className="text-xs text-muted-foreground">Precio original</p><p className="font-semibold">{money(detail.payment.originalAmountClp)}</p></div>
                      <div className="min-w-0"><p className="text-xs text-muted-foreground">Descuento</p><p className={cn("font-semibold", detail.payment.discountAmountClp > 0 && "text-emerald-700")}>{detail.payment.discountAmountClp > 0 ? `−${money(detail.payment.discountAmountClp)}` : money(0)}</p>{detail.payment.discountCode && <p className="mt-1 break-all font-mono text-[11px] font-semibold text-violet-700">{detail.payment.discountAmountClp > 0 ? detail.payment.discountCode : `Retirado: ${detail.payment.discountCode}`}</p>}</div>
                      <div><p className="text-xs text-muted-foreground">Total final</p><p className="font-semibold">{money(detail.payment.totalAmountClp)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Pagado</p><p className="font-semibold text-emerald-700">{money(detail.payment.amountClp)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Saldo</p><p className="font-semibold">{money(detail.payment.balanceAmountClp)}</p></div>
                    </div>

                    {detail.payment.overpaymentAmountClp > 0 && <div className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"><span>Excedente pagado por regularizar</span><strong className="text-amber-800">{money(detail.payment.overpaymentAmountClp)}</strong></div>}

                    {detail.canManagePayments && event && ["massages", "biopools", "sauna"].includes(event.service) && (event.kind !== "massage_program" || detail.payment.balanceAmountClp > 0) ? event.kind === "massage_program" ? <ProgramPaymentManager event={event} detail={detail} onChanged={refreshReservationViews} /> : <PaymentManager event={event} detail={detail} onChanged={refreshReservationViews} /> : <div className="overflow-hidden rounded-xl border">
                      {detail.payment.lines.map((line: any) => (
                        <div key={line.id} className="grid min-w-0 gap-2 border-b p-4 last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center">
                          <div>
                            <p className="font-semibold">{paymentLabel(line.method)}</p>
                            <p className={cn("text-xs", line.type === "discount" ? "text-emerald-700" : "text-muted-foreground")}>{paymentLabel(line.status)}</p>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <p className={cn("break-all", line.type === "discount" && "font-mono font-semibold text-violet-700")}>{line.reference || "Sin referencia"}</p>
                            {line.cardType && <p>{line.cardType === "credit" ? "Crédito" : line.cardType === "debit" ? "Débito" : line.cardType}</p>}
                            {line.at && <p>{new Date(line.at).toLocaleString("es-CL")}</p>}
                          </div>
                          <p className={cn("font-semibold sm:text-right", line.type === "discount" && "text-emerald-700")}>{line.type === "discount" ? "−" : ""}{money(line.amountClp)}</p>
                        </div>
                      ))}
                      {!detail.payment.lines.length && <p className="p-4 text-sm text-muted-foreground">Esta reserva todavía no tiene pagos detallados.</p>}
                    </div>}

                    {detail.payment.refundAmountClp > 0 && <div className="flex justify-between rounded-xl bg-amber-50 p-4 text-sm"><span>Reembolso registrado</span><strong>{money(detail.payment.refundAmountClp)}</strong></div>}
                  </div>
                ) : <p className="py-6 text-center text-sm text-muted-foreground">Esta actividad no registra un pago individual.</p>}
              </TabsContent>
              <TabsContent value="activity" className="rounded-xl border p-4">
                {detail.activity.length ? <div className="space-y-4">{detail.activity.map((item: any) => <div key={item.id} className="relative border-l-2 border-primary/30 pl-4"><span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary" /><p className="font-medium">{item.label}</p>{item.detail && <p className="text-sm text-muted-foreground">{item.detail}</p>}<p className="mt-1 text-xs text-muted-foreground">{item.at ? new Date(item.at).toLocaleString("es-CL") : "Sin fecha"}</p></div>)}</div> : <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay actividad adicional registrada.</p>}
              </TabsContent>
            </Tabs>
            {detail.canManageReservation && event && (event.kind === "biopool" || event.kind === "massage" || event.kind === "sauna") && detail.status !== "cancelled" && <ReservationActions
              event={event}
              detail={detail}
              onChanged={refreshReservationViews}
              onCancelled={() => onOpenChange(false)}
            />}
            <div className="flex min-w-0 justify-end"><Button className="h-auto max-w-full whitespace-normal py-2 text-center" asChild><a href={detail.href}>Abrir agenda del módulo <ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
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
  const busqueda = trpc.operations360.buscar.useQuery(
    { termino },
    { enabled: termino.length >= 3, staleTime: 15_000 }
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
              {busqueda.isFetching && <p className="text-sm text-muted-foreground">Buscando…</p>}
              {!busqueda.isFetching && busqueda.data?.total === 0 && (
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
      <ReservationDetail event={selectedEvent} open={Boolean(selectedEvent)} onOpenChange={open => !open && setSelectedEvent(null)} />
      {canCreateReservation && <Button aria-label="Crear nueva reserva" title="Crear nueva reserva" className="cms-mobile-fab fixed right-4 bottom-4 z-40 h-14 w-14 rounded-full shadow-xl sm:right-6 sm:bottom-6" onClick={() => setBookingOpen(true)}><Plus className="h-6 w-6" /></Button>}
      <UnifiedBookingDialog open={bookingOpen} onOpenChange={setBookingOpen} initialDate={dateKey(selectedDate)} allowedServices={manualBookingServices} onCreated={async () => { await calendar.refetch(); }} />
    </DashboardLayout>
  );
}
