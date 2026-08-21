import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  ExternalLink,
  Gift,
  Mail,
  MessageCircle,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  Search,
  Star,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Reservation360DetailDialog,
  type Reservation360Event,
  type Reservation360EventKind,
  type Reservation360ServiceKey,
} from "@/components/cms/Reservation360DetailDialog";
import { createReservation360Event } from "@shared/reservation360";
import { UnifiedBookingDialog } from "./UnifiedBookingDialog";

type ServiceKey = "all" | Reservation360ServiceKey;
type ClientTab = "upcoming" | "history" | "payments" | "activity";
type HistoryFilter = "all" | "completed" | "cancelled";

type ClientSummary = {
  key: string;
  profileId?: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  services: Reservation360ServiceKey[];
  reservations: number;
  upcomingReservations?: number;
  pendingBalanceClp?: number | null;
  totalSpentClp: number | null;
  financialRestricted?: boolean;
  lastActivity: string;
  nextReservation?: string | null;
  notes?: string | null;
};

type ClientHistoryItem = {
  id: string;
  entityId?: number;
  kind?: Reservation360EventKind | "external";
  service: Reservation360ServiceKey;
  date: string;
  startTime: string | null;
  endTime?: string | null;
  title: string;
  status: string;
  paymentStatus: string | null;
  amountClp: number | null;
  totalAmountClp?: number | null;
  paidAmountClp?: number | null;
  balanceAmountClp?: number | null;
  financialRestricted?: boolean;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  detail: string | null;
  people?: number | null;
  href?: string;
  canOpenDetail?: boolean;
  hasPaymentRecord?: boolean;
  npsScore?: number | null;
  npsComment?: string | null;
  activity?: Array<{
    id: string;
    label: string;
    detail?: string | null;
    at?: string | null;
  }>;
  activityBucket?: "upcoming" | "past" | "cancelled";
};

type ClientProfileData = {
  profile: {
    id: number;
    key: string;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    status: string;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  aliases: Array<{
    id: number;
    kind: string;
    value: string;
    normalizedValue: string;
    source: string;
  }>;
  giftCards: Array<{
    id: number;
    code: string;
    amountClp: number;
    balanceClp: number;
    status: string;
    redemptionMode: string;
    serviceKey: string | null;
    serviceName: string | null;
    expiresAt: Date | string | null;
  }>;
  activity: Array<{
    id: number;
    action: string;
    actorUserId: number | null;
    detail: string | null;
    createdAt: Date | string;
  }>;
  canManageProfile: boolean;
  canMergeProfiles: boolean;
  giftCardsRestricted: boolean;
};

const CLIENT_PAGE_SIZE = 30;

const serviceLabels: Record<ServiceKey, string> = {
  all: "Todos los servicios",
  massages: "Masajes",
  biopools: "Biopiscinas",
  // El servidor devuelve "sauna" en clientServices desde que existe el módulo;
  // mantener la etiqueta evita un filtro y badges vacíos.
  sauna: "Sauna",
  regular_classes: "Clases regulares",
};

const serviceTone: Record<Reservation360ServiceKey, string> = {
  massages: "border-rose-200 bg-rose-50 text-rose-800",
  biopools: "border-cyan-200 bg-cyan-50 text-cyan-800",
  sauna: "border-amber-200 bg-amber-50 text-amber-900",
  regular_classes: "border-blue-200 bg-blue-50 text-blue-800",
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const calendarDetailKinds = new Set<Reservation360EventKind>([
  "massage",
  "massage_program",
  "biopool",
  "sauna",
  "regular_class",
  "regular_class_schedule",
  "regular_class_membership",
]);
const GOOGLE_REVIEW_URL = "https://maps.app.goo.gl/mhKem25vtagvCiSm8";
const TRIPADVISOR_REVIEW_URL =
  "https://www.tripadvisor.com/Attraction_Review-g294293-d23248044-Reviews-Cancagua-Frutillar_Los_Lagos_Region.html";

function chileToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}

function oneYearAgo() {
  const value = new Date(`${chileToday()}T12:00:00Z`);
  value.setUTCFullYear(value.getUTCFullYear() - 1);
  return value.toISOString().slice(0, 10);
}

function chileNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function isUpcomingReservation(item: ClientHistoryItem, now = chileNow()) {
  if (item.status === "cancelled") return false;
  if (item.date > now.date) return true;
  if (item.date < now.date) return false;
  return !item.startTime || item.startTime.slice(0, 5) >= now.time;
}

function dateLabel(value?: string | null) {
  if (!value) return "Sin fecha";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function reviewWhatsAppUrl(
  phone: string | null,
  platform: "Google" | "Tripadvisor"
) {
  const destination =
    platform === "Google" ? GOOGLE_REVIEW_URL : TRIPADVISOR_REVIEW_URL;
  const message = `Hola, muchas gracias por evaluar tan bien tu experiencia en Cancagua. ¿Nos ayudarías compartiéndola también en ${platform}? ${destination}`;
  return `https://wa.me/${(phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

function whatsAppUrl(phone: string | null) {
  return `https://wa.me/${(phone ?? "").replace(/\D/g, "")}`;
}

function statusLabel(status?: string | null) {
  const values: Record<string, string> = {
    pending: "Pendiente",
    confirmed: "Confirmada",
    completed: "Completada",
    cancelled: "Cancelada",
    no_show: "No asistió",
    active: "Activa",
    postponed: "Postergada",
    pending_payment: "Pago pendiente",
    partially_paid: "Abonada",
    paid: "Pagada",
    refunded: "Reembolsada",
    unknown: "Sin registrar",
  };
  return (
    values[String(status ?? "")] ??
    String(status ?? "Sin estado").replaceAll("_", " ")
  );
}

function paymentBadge(status?: string | null) {
  if (status === "paid")
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "partially_paid")
    return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "refunded" || status === "partially_refunded")
    return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function auditLabel(action: string) {
  const labels: Record<string, string> = {
    profile_created: "Ficha creada",
    profile_created_automatically: "Ficha creada automáticamente",
    profile_created_from_skedu_history:
      "Ficha creada desde el historial de Skedu",
    profile_updated: "Datos de la ficha actualizados",
    reservation_linked: "Reserva vinculada a la ficha",
    reservation_linked_automatically: "Reserva vinculada automáticamente",
    reservation_linked_with_identity_conflict:
      "Reserva vinculada con datos de contacto por revisar",
    reservation_linked_manually: "Reserva vinculada manualmente",
    automatic_reservation_link_moved: "Reserva trasladada a esta ficha",
    profiles_merged_into_target: "Otra ficha fue fusionada con esta",
    profile_merged_into_another: "Ficha fusionada",
    skedu_history_synced: "Historial de Skedu sincronizado",
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

function auditDetail(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed.reason === "string") return `Motivo: ${parsed.reason}`;
    if (typeof parsed.sourceKey === "string")
      return `Reserva: ${parsed.sourceKey}`;
    if (parsed.before || parsed.after)
      return "Se actualizaron los datos o notas del cliente.";
    return null;
  } catch {
    return value;
  }
}

function reservationEvent(
  item: ClientHistoryItem
): Reservation360Event | null {
  if (
    !item.kind ||
    !item.entityId ||
    !calendarDetailKinds.has(item.kind as Reservation360EventKind)
  )
    return null;
  return createReservation360Event({
    id: item.id,
    entityId: item.entityId,
    kind: item.kind as Reservation360EventKind,
    date: item.date,
    startTime: item.startTime ?? "00:00",
    endTime: item.endTime ?? item.startTime ?? "00:00",
    title: item.title,
    clientName: item.clientName,
    status: item.status,
    paymentStatus: item.paymentStatus,
    people: Math.max(1, Number(item.people ?? 1)),
    href: item.href ?? "#",
  });
}

function ReservationCard({
  item,
  onOpen,
}: {
  item: ClientHistoryItem;
  onOpen: (item: ClientHistoryItem) => void;
}) {
  const canOpen =
    Boolean(reservationEvent(item)) && item.canOpenDetail !== false;
  const paid = item.paidAmountClp ?? item.amountClp ?? 0;
  const total =
    item.totalAmountClp ?? Math.max(paid, paid + (item.balanceAmountClp ?? 0));
  const balance = item.balanceAmountClp ?? Math.max(0, total - paid);
  const content = (
    <>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={serviceTone[item.service]}>
              {serviceLabels[item.service]}
            </Badge>
            <Badge variant="outline">{statusLabel(item.status)}</Badge>
            {item.paymentStatus && (
              <Badge
                variant="outline"
                className={paymentBadge(item.paymentStatus)}
              >
                {statusLabel(item.paymentStatus)}
              </Badge>
            )}
          </div>
          <p className="mt-3 break-words font-semibold">{item.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {dateLabel(item.date)}
            {item.startTime ? ` · ${item.startTime.slice(0, 5)}` : ""}
          </p>
          {item.detail && (
            <p className="mt-2 break-words text-sm text-slate-700">
              {item.detail}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-4 sm:block sm:text-right">
          {!item.financialRestricted && (
            <div>
              <p className="font-semibold">{clp.format(total)}</p>
              {balance > 0 && (
                <p className="text-xs font-medium text-rose-700">
                  Saldo {clp.format(balance)}
                </p>
              )}
            </div>
          )}
          {canOpen && (
            <ChevronRight className="h-5 w-5 text-muted-foreground sm:ml-auto sm:mt-3" />
          )}
        </div>
      </div>
      {item.npsScore != null && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-amber-950">
          <p className="flex items-center gap-1 text-sm font-semibold">
            <Star className="h-4 w-4 fill-amber-500 text-amber-500" /> NPS{" "}
            {item.npsScore}/10
          </p>
          {item.npsComment && (
            <p className="mt-1 text-sm">“{item.npsComment}”</p>
          )}
        </div>
      )}
    </>
  );
  const className = cn(
    "w-full rounded-2xl border bg-white p-4 text-left transition",
    canOpen && "hover:border-primary/40 hover:shadow-sm",
    item.status === "cancelled" && "bg-slate-50/80"
  );
  if (!canOpen) return <article className={className}>{content}</article>;
  return (
    <button type="button" onClick={() => onOpen(item)} className={className}>
      {content}
    </button>
  );
}

function EmptySection({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white px-4 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ClientWorkspace({
  client,
  service,
  canCreate,
  onBack,
  onNewBooking,
  onClientChanged,
  onMerged,
}: {
  client: ClientSummary;
  service: ServiceKey;
  canCreate: boolean;
  onBack: () => void;
  onNewBooking: () => void;
  onClientChanged: () => Promise<unknown> | void;
  onMerged: (targetProfileId: number) => Promise<unknown> | void;
}) {
  const [tab, setTab] = useState<ClientTab>("upcoming");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation360Event | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [mergeReason, setMergeReason] = useState("");
  const [syncFrom, setSyncFrom] = useState(oneYearAgo());
  const [syncTo, setSyncTo] = useState(chileToday());
  const profileId = client.profileId ?? null;
  const profileQuery = trpc.operations360.clients.profile.useQuery(
    { profileId: profileId ?? 1 },
    { enabled: Boolean(profileId) }
  );
  const profileData = profileQuery.data as ClientProfileData | undefined;
  const updateProfile = trpc.operations360.clients.updateProfile.useMutation();
  const mergeProfiles = trpc.operations360.clients.mergeProfiles.useMutation();
  const syncSkeduHistory =
    trpc.operations360.clients.syncSkeduHistory.useMutation();
  const mergeCandidates = trpc.operations360.clients.listPage.useQuery(
    { search: mergeSearch.trim() || undefined, cursor: 0, limit: 10 },
    { enabled: mergeOpen && mergeSearch.trim().length >= 2 }
  );
  const historyQuery = trpc.operations360.clients.history.useQuery({
    clientKey: profileId ? undefined : client.key,
    profileId: profileId ?? undefined,
    service: service === "all" ? undefined : service,
  });
  const rows = (historyQuery.data ?? []) as ClientHistoryItem[];
  const filteredRows =
    service === "all" ? rows : rows.filter(item => item.service === service);
  const now = chileNow();
  const upcoming = filteredRows
    .filter(item => isUpcomingReservation(item, now))
    .sort((left, right) =>
      `${left.date} ${left.startTime ?? ""}`.localeCompare(
        `${right.date} ${right.startTime ?? ""}`
      )
    );
  const past = filteredRows.filter(item => !isUpcomingReservation(item, now));
  const historyRows = past.filter(
    item =>
      historyFilter === "all" ||
      (historyFilter === "cancelled"
        ? item.status === "cancelled"
        : item.status !== "cancelled")
  );
  const financialRestricted =
    client.financialRestricted === true ||
    filteredRows.some(item => item.financialRestricted === true);
  const financialRows = filteredRows.filter(
    item => item.financialRestricted !== true
  );
  const paymentRows = financialRows.filter(
    item =>
      item.hasPaymentRecord ??
      (item.kind !== "regular_class" &&
        (Boolean(item.paymentStatus) ||
          Number(item.paidAmountClp ?? item.amountClp ?? 0) > 0 ||
          Number(item.balanceAmountClp ?? 0) > 0))
  );
  const paidTotal = paymentRows.reduce(
    (sum, item) =>
      sum +
      (item.paymentStatus === "refunded"
        ? 0
        : Number(item.paidAmountClp ?? item.amountClp ?? 0)),
    0
  );
  const pendingTotal = financialRows.reduce((sum, item) => {
    if (item.status === "cancelled") return sum;
    const paid = Number(item.paidAmountClp ?? item.amountClp ?? 0);
    const total = Number(item.totalAmountClp ?? paid);
    return sum + Number(item.balanceAmountClp ?? Math.max(0, total - paid));
  }, 0);
  const activity = filteredRows
    .flatMap(item =>
      (Array.isArray(item.activity) ? item.activity : []).map(entry => ({
        ...entry,
        reservationTitle: item.title,
      }))
    )
    .sort((left, right) =>
      String(right.at ?? "").localeCompare(String(left.at ?? ""))
    );
  const canonical = profileData?.profile;
  const visibleName = canonical?.name ?? client.name;
  const visibleEmail = canonical?.email ?? client.email;
  const visiblePhone = canonical?.phone ?? client.phone;
  const auditActivity = (profileData?.activity ?? []).map(item => ({
    id: `audit-${item.id}`,
    label: auditLabel(item.action),
    detail: auditDetail(item.detail),
    at: item.createdAt,
  }));

  useEffect(() => {
    setTab("upcoming");
    setHistoryFilter("all");
    setSelectedReservation(null);
    setEditOpen(false);
    setMergeOpen(false);
    setSyncOpen(false);
  }, [client.key]);

  const openReservation = (item: ClientHistoryItem) => {
    const event = reservationEvent(item);
    if (event) setSelectedReservation(event);
  };

  const refresh = async () => {
    await Promise.all([
      historyQuery.refetch(),
      profileQuery.refetch(),
      onClientChanged(),
    ]);
  };

  const openProfileEdit = () => {
    setEditName(visibleName);
    setEditEmail(visibleEmail ?? "");
    setEditPhone(visiblePhone ?? "");
    setEditNotes(canonical?.notes ?? client.notes ?? "");
    setEditOpen(true);
  };

  const saveProfile = async () => {
    if (!profileId || editName.trim().length < 2) return;
    try {
      await updateProfile.mutateAsync({
        profileId,
        name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        notes: editNotes.trim() || null,
      });
      setEditOpen(false);
      await refresh();
      toast.success("Ficha del cliente actualizada");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible guardar la ficha"
      );
    }
  };

  const mergeClient = async () => {
    if (!profileId || !mergeTargetId || mergeReason.trim().length < 5) return;
    try {
      await mergeProfiles.mutateAsync({
        sourceProfileId: profileId,
        targetProfileId: mergeTargetId,
        reason: mergeReason.trim(),
      });
      setMergeOpen(false);
      toast.success("Fichas fusionadas; las reservas quedaron reunidas");
      await onMerged(mergeTargetId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible fusionar las fichas"
      );
    }
  };

  const syncHistory = async () => {
    try {
      const result = await syncSkeduHistory.mutateAsync({
        from: syncFrom,
        to: syncTo,
      });
      setSyncOpen(false);
      await refresh();
      toast.success(
        `Historial actualizado: ${result.inserted} nuevas y ${result.updated} actualizadas`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible actualizar el historial de Skedu"
      );
    }
  };

  return (
    <section className="min-w-0 space-y-4">
      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 mb-2 lg:hidden"
                onClick={onBack}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver a clientes
              </Button>
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <UserRound className="h-5 w-5 text-slate-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Ficha de cliente
                  </p>
                  <h2 className="mt-1 break-words text-2xl font-semibold">
                    {visibleName}
                  </h2>
                  <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                    {visiblePhone && (
                      <span className="flex min-w-0 items-center gap-2">
                        <Phone className="h-4 w-4 shrink-0" />
                        <span className="break-all">{visiblePhone}</span>
                      </span>
                    )}
                    {visibleEmail && (
                      <span className="flex min-w-0 items-center gap-2">
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="break-all">{visibleEmail}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              {visiblePhone && (
                <Button variant="outline" asChild>
                  <a
                    href={whatsAppUrl(visiblePhone)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    WhatsApp
                  </a>
                </Button>
              )}
              {visibleEmail && (
                <Button variant="outline" asChild>
                  <a href={`mailto:${visibleEmail}`}>
                    <Mail className="mr-2 h-4 w-4" />
                    Correo
                  </a>
                </Button>
              )}
              {profileData?.canManageProfile && (
                <Button variant="outline" onClick={openProfileEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar ficha
                </Button>
              )}
              {profileData?.canMergeProfiles && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setMergeSearch("");
                    setMergeTargetId(null);
                    setMergeReason("");
                    setMergeOpen(true);
                  }}
                >
                  <UsersRound className="mr-2 h-4 w-4" />
                  Fusionar
                </Button>
              )}
              {profileData?.canMergeProfiles && (
                <Button variant="outline" onClick={() => setSyncOpen(true)}>
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Actualizar Skedu
                </Button>
              )}
              {canCreate && (
                <Button className="col-span-2" onClick={onNewBooking}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva reserva
                </Button>
              )}
            </div>
          </div>

          {(canonical?.notes || (profileData?.aliases.length ?? 0) > 0) && (
            <div className="mt-4 grid gap-3 rounded-2xl border bg-slate-50/70 p-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Notas del cliente
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {canonical?.notes || "Sin notas registradas."}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Datos relacionados
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {profileData?.aliases.slice(0, 6).map(alias => (
                    <Badge
                      key={alias.id}
                      variant="outline"
                      className="max-w-full bg-white"
                    >
                      <span className="truncate">
                        {alias.kind === "email"
                          ? "Correo"
                          : alias.kind === "phone"
                            ? "Teléfono"
                            : "Skedu"}
                        : {alias.value}
                      </span>
                    </Badge>
                  ))}
                  {(profileData?.aliases.length ?? 0) > 6 && (
                    <Badge variant="outline">
                      +{profileData!.aliases.length - 6}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Próximas</p>
              <p className="mt-1 text-xl font-semibold">{upcoming.length}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Movimientos</p>
              <p className="mt-1 text-xl font-semibold">
                {filteredRows.length}
              </p>
            </div>
            {financialRestricted ? (
              <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-muted-foreground">
                  Información financiera
                </p>
                <p className="mt-1 text-sm font-medium">
                  Restringida para uno o más servicios
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-800">Total pagado</p>
                  <p className="mt-1 break-words text-xl font-semibold text-emerald-900">
                    {clp.format(paidTotal)}
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-xl p-3",
                    pendingTotal > 0 ? "bg-rose-50" : "bg-slate-50"
                  )}
                >
                  <p
                    className={cn(
                      "text-xs",
                      pendingTotal > 0
                        ? "text-rose-800"
                        : "text-muted-foreground"
                    )}
                  >
                    Saldo pendiente
                  </p>
                  <p
                    className={cn(
                      "mt-1 break-words text-xl font-semibold",
                      pendingTotal > 0 && "text-rose-900"
                    )}
                  >
                    {clp.format(pendingTotal)}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={value => setTab(value as ClientTab)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
          <TabsTrigger className="min-h-11" value="upcoming">
            Próximas
          </TabsTrigger>
          <TabsTrigger className="min-h-11" value="history">
            Historial
          </TabsTrigger>
          <TabsTrigger className="min-h-11" value="payments">
            Pagos
          </TabsTrigger>
          <TabsTrigger className="min-h-11" value="activity">
            Actividad
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4 space-y-3">
          {historyQuery.isLoading ? (
            <Skeleton className="h-48" />
          ) : historyQuery.error ? (
            <EmptySection>
              No fue posible cargar las reservas de este cliente.
            </EmptySection>
          ) : upcoming.length ? (
            upcoming.map(item => (
              <ReservationCard
                key={item.id}
                item={item}
                onOpen={openReservation}
              />
            ))
          ) : (
            <EmptySection>
              No hay próximas reservas para este filtro.
            </EmptySection>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["all", "completed", "cancelled"] as HistoryFilter[]).map(
              value => (
                <Button
                  key={value}
                  className="shrink-0"
                  size="sm"
                  variant={historyFilter === value ? "default" : "outline"}
                  aria-pressed={historyFilter === value}
                  onClick={() => setHistoryFilter(value)}
                >
                  {value === "all"
                    ? "Todas"
                    : value === "completed"
                      ? "No canceladas"
                      : "Canceladas"}
                </Button>
              )
            )}
          </div>
          {historyQuery.isLoading ? (
            <Skeleton className="h-48" />
          ) : historyQuery.error ? (
            <EmptySection>
              No fue posible cargar el historial de este cliente.
            </EmptySection>
          ) : historyRows.length ? (
            historyRows.map(item => (
              <ReservationCard
                key={item.id}
                item={item}
                onOpen={openReservation}
              />
            ))
          ) : (
            <EmptySection>
              No hay reservas antiguas para este filtro.
            </EmptySection>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4 space-y-3">
          {historyQuery.isLoading ? (
            <Skeleton className="h-48" />
          ) : historyQuery.error ? (
            <EmptySection>
              No fue posible cargar los pagos de este cliente.
            </EmptySection>
          ) : (
            <>
              {financialRestricted ? (
                <div className="rounded-2xl border border-dashed bg-slate-50 px-4 py-5 text-sm text-muted-foreground">
                  La información financiera está restringida para uno o más
                  servicios de esta ficha.
                </div>
              ) : (
                <Card>
                  <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Pagado registrado
                    </p>
                    <p className="mt-1 break-words text-xl font-semibold text-emerald-700">
                      {clp.format(paidTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Saldo pendiente
                    </p>
                    <p className="mt-1 break-words text-xl font-semibold text-rose-700">
                      {clp.format(pendingTotal)}
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs text-muted-foreground">
                      Reservas con pago
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {paymentRows.length}
                    </p>
                  </div>
                  </CardContent>
                </Card>
              )}
              {(profileData?.giftCards.length ?? 0) > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <p className="flex items-center gap-2 font-semibold">
                      <Gift className="h-4 w-4 text-violet-600" />
                      Gift Cards asociadas
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {profileData!.giftCards.map(card => (
                        <div
                          key={card.id}
                          className="rounded-xl border bg-violet-50/50 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-sm font-semibold">
                              {card.code}
                            </span>
                            <Badge
                              variant="outline"
                              className={
                                card.balanceClp > 0 && card.status === "active"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "bg-white"
                              }
                            >
                              {statusLabel(card.status)}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm">
                            Saldo disponible{" "}
                            <strong>{clp.format(card.balanceClp)}</strong> de{" "}
                            {clp.format(card.amountClp)}
                          </p>
                          {(card.serviceName || card.serviceKey) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Válida para {card.serviceName || card.serviceKey}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {profileData?.giftCardsRestricted && (
                <p className="px-1 text-xs text-muted-foreground">
                  Las Gift Cards asociadas requieren permiso de Gift Cards.
                </p>
              )}
              {!financialRestricted && (
                <p className="px-1 text-xs text-muted-foreground">
                  Abre una reserva para ver el desglose, editar pagos manuales,
                  usar Gift Cards o generar links de pago.
                </p>
              )}
              {paymentRows.length ? (
                paymentRows.map(item => (
                  <ReservationCard
                    key={item.id}
                    item={item}
                    onOpen={openReservation}
                  />
                ))
              ) : (
                <EmptySection>
                  Este cliente aún no tiene pagos registrados.
                </EmptySection>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-3">
          {historyQuery.isLoading || profileQuery.isLoading ? (
            <Skeleton className="h-48" />
          ) : historyQuery.error || profileQuery.error ? (
            <EmptySection>
              No fue posible cargar la actividad de este cliente.
            </EmptySection>
          ) : activity.length || auditActivity.length ? (
            <>
              {auditActivity.map(item => (
                <div key={item.id} className="rounded-2xl border bg-white p-4">
                  <p className="font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Ficha del cliente ·{" "}
                    {new Date(item.at).toLocaleString("es-CL")}
                  </p>
                  {item.detail && (
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {item.detail}
                    </p>
                  )}
                </div>
              ))}
              {activity.map(item => (
                <div
                  key={`${item.id}-${item.at ?? ""}`}
                  className="rounded-2xl border bg-white p-4"
                >
                  <p className="font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.reservationTitle}
                    {item.at
                      ? ` · ${new Date(item.at).toLocaleString("es-CL")}`
                      : ""}
                  </p>
                  {item.detail && (
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {item.detail}
                    </p>
                  )}
                </div>
              ))}
            </>
          ) : (
            <div className="space-y-3">
              {filteredRows
                .filter(item => item.detail || item.npsScore != null)
                .map(item => (
                  <div
                    key={item.id}
                    className="rounded-2xl border bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <NotebookPen className="h-4 w-4 text-muted-foreground" />
                      <p className="font-semibold">{item.title}</p>
                      <Badge variant="outline">{dateLabel(item.date)}</Badge>
                    </div>
                    {item.detail && (
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {item.detail}
                      </p>
                    )}
                    {item.npsScore != null && (
                      <p className="mt-2 text-sm font-medium text-amber-800">
                        NPS {item.npsScore}/10
                        {item.npsComment ? ` · ${item.npsComment}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              {!filteredRows.some(
                item => item.detail || item.npsScore != null
              ) && (
                <EmptySection>
                  Aún no hay notas o actividad adicional registrada.
                </EmptySection>
              )}
            </div>
          )}
          {visiblePhone &&
            filteredRows.some(item => Number(item.npsScore ?? 0) >= 9) && (
              <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row">
                <Button variant="outline" asChild>
                  <a
                    href={reviewWhatsAppUrl(visiblePhone, "Google")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Star className="mr-2 h-4 w-4" />
                    Pedir reseña Google
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a
                    href={reviewWhatsAppUrl(visiblePhone, "Tripadvisor")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Pedir reseña Tripadvisor
                  </a>
                </Button>
              </div>
            )}
        </TabsContent>
      </Tabs>

      <Reservation360DetailDialog
        event={selectedReservation}
        open={Boolean(selectedReservation)}
        onOpenChange={open => !open && setSelectedReservation(null)}
        onChanged={refresh}
      />

      <Dialog
        open={editOpen}
        onOpenChange={open => !updateProfile.isPending && setEditOpen(open)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar ficha del cliente</DialogTitle>
            <DialogDescription>
              Estos datos se usarán como información principal sin borrar
              correos o teléfonos anteriores del historial.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label htmlFor="client360-name">Nombre</Label>
              <Input
                id="client360-name"
                value={editName}
                onChange={event => setEditName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="client360-phone">WhatsApp / teléfono</Label>
              <Input
                id="client360-phone"
                inputMode="tel"
                value={editPhone}
                onChange={event => setEditPhone(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="client360-email">Correo</Label>
              <Input
                id="client360-email"
                type="email"
                value={editEmail}
                onChange={event => setEditEmail(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="client360-notes">Notas internas</Label>
              <Textarea
                id="client360-notes"
                rows={5}
                placeholder="Preferencias, observaciones o información útil para recepción…"
                value={editNotes}
                onChange={event => setEditNotes(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={updateProfile.isPending}
              onClick={() => setEditOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={updateProfile.isPending || editName.trim().length < 2}
              onClick={saveProfile}
            >
              {updateProfile.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={mergeOpen}
        onOpenChange={open => !mergeProfiles.isPending && setMergeOpen(open)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fusionar ficha duplicada</DialogTitle>
            <DialogDescription>
              La ficha de <strong>{visibleName}</strong> se integrará en la
              persona que selecciones. Sus reservas, pagos e identificadores
              quedarán reunidos y la acción quedará auditada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="client360-merge-search">
                Buscar ficha de destino
              </Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="client360-merge-search"
                  className="pl-9"
                  placeholder="Nombre, correo o teléfono"
                  value={mergeSearch}
                  onChange={event => {
                    setMergeSearch(event.target.value);
                    setMergeTargetId(null);
                  }}
                />
              </div>
            </div>
            {mergeSearch.trim().length >= 2 && (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border p-2">
                {mergeCandidates.isLoading ? (
                  <Skeleton className="h-20" />
                ) : (mergeCandidates.data?.items ?? []).filter(
                    candidate => candidate.profileId !== profileId
                  ).length ? (
                  (mergeCandidates.data?.items ?? [])
                    .filter(candidate => candidate.profileId !== profileId)
                    .map(candidate => (
                      <button
                        key={candidate.profileId ?? candidate.key}
                        type="button"
                        onClick={() =>
                          setMergeTargetId(candidate.profileId ?? null)
                        }
                        className={cn(
                          "w-full rounded-lg border p-3 text-left",
                          mergeTargetId === candidate.profileId
                            ? "border-primary bg-primary/5"
                            : "bg-white"
                        )}
                      >
                        <p className="font-semibold">{candidate.name}</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {candidate.phone || candidate.email || "Sin contacto"}
                        </p>
                      </button>
                    ))
                ) : (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    No encontramos otra ficha.
                  </p>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="client360-merge-reason">
                Motivo de la fusión
              </Label>
              <Textarea
                id="client360-merge-reason"
                rows={3}
                placeholder="Ej.: misma persona registrada con otro teléfono"
                value={mergeReason}
                onChange={event => setMergeReason(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={mergeProfiles.isPending}
              onClick={() => setMergeOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={
                mergeProfiles.isPending ||
                !mergeTargetId ||
                mergeReason.trim().length < 5
              }
              onClick={mergeClient}
            >
              {mergeProfiles.isPending ? "Fusionando…" : "Fusionar fichas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={syncOpen}
        onOpenChange={open => !syncSkeduHistory.isPending && setSyncOpen(open)}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Actualizar historial de Skedu</DialogTitle>
            <DialogDescription>
              Importa reservas antiguas de todos los clientes sin duplicar las
              que ya existen en el CMS. Los precios de Skedu se mostrarán como
              referencia, no como pagos confirmados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="client360-sync-from">Desde</Label>
              <Input
                id="client360-sync-from"
                type="date"
                value={syncFrom}
                max={syncTo}
                onChange={event => setSyncFrom(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="client360-sync-to">Hasta</Label>
              <Input
                id="client360-sync-to"
                type="date"
                value={syncTo}
                min={syncFrom}
                max={chileToday()}
                onChange={event => setSyncTo(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={syncSkeduHistory.isPending}
              onClick={() => setSyncOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={
                syncSkeduHistory.isPending ||
                !syncFrom ||
                !syncTo ||
                syncFrom > syncTo
              }
              onClick={syncHistory}
            >
              {syncSkeduHistory.isPending
                ? "Actualizando…"
                : "Actualizar historial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default function Clientes360() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [service, setService] = useState<ServiceKey>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ClientSummary | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: access } = trpc.operations360.access.useQuery();
  const linkReservations =
    trpc.operations360.clients.linkReservations.useMutation();
  const listQuery = trpc.operations360.clients.listPage.useQuery({
    search: debouncedSearch || undefined,
    service: service === "all" ? undefined : service,
    cursor: page * CLIENT_PAGE_SIZE,
    limit: CLIENT_PAGE_SIZE,
  });
  const data = (listQuery.data?.items ?? []) as ClientSummary[];
  const manualBookingServices = (access?.manualBookingServices ??
    []) as Reservation360ServiceKey[];

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250
    );
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(0);
    setSelected(null);
  }, [debouncedSearch, service]);

  useEffect(() => {
    if (!selected) return;
    const match = data.find(client =>
      selected.profileId && client.profileId
        ? selected.profileId === client.profileId
        : selected.key === client.key
    );
    if (match && match !== selected) setSelected(match);
  }, [data, selected]);

  const filteredData = data;
  const totals = {
    clients: Number(listQuery.data?.summary.clients ?? 0),
    upcoming: Number(listQuery.data?.summary.upcomingReservations ?? 0),
    pending: Number(listQuery.data?.summary.pendingBalanceClp ?? 0),
    financialRestricted:
      listQuery.data?.summary.financialRestricted === true,
  };

  const refreshClientData = async () => {
    await Promise.all([
      utils.operations360.clients.list.invalidate(),
      utils.operations360.clients.listPage.invalidate(),
      utils.operations360.clients.history.invalidate(),
      utils.operations360.clients.profile.invalidate(),
    ]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 p-2 pb-20 sm:p-4 sm:pb-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
              Operación por persona
            </p>
            <h1 className="mt-1 text-3xl font-semibold">Clientes 360</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Reservas, pagos e historial de cada cliente en un solo lugar.
            </p>
          </div>
          {selected && manualBookingServices.length > 0 && (
            <Button
              className="hidden lg:inline-flex"
              onClick={() => setBookingOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nueva reserva para {selected.name.split(" ")[0]}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card>
            <CardContent className="p-3 sm:flex sm:items-center sm:gap-3 sm:p-4">
              <UsersRound className="h-5 w-5 text-slate-500 sm:h-7 sm:w-7" />
              <div className="mt-2 sm:mt-0">
                <p className="text-[11px] text-muted-foreground sm:text-xs">
                  Clientes
                </p>
                <p className="break-words text-lg font-semibold sm:text-2xl">
                  {totals.clients}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:flex sm:items-center sm:gap-3 sm:p-4">
              <CalendarClock className="h-5 w-5 text-cyan-600 sm:h-7 sm:w-7" />
              <div className="mt-2 sm:mt-0">
                <p className="text-[11px] text-muted-foreground sm:text-xs">
                  Próximas
                </p>
                <p className="break-words text-lg font-semibold sm:text-2xl">
                  {totals.upcoming}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:flex sm:items-center sm:gap-3 sm:p-4">
              <WalletCards className="h-5 w-5 text-rose-600 sm:h-7 sm:w-7" />
              <div className="mt-2 min-w-0 sm:mt-0">
                <p className="text-[11px] text-muted-foreground sm:text-xs">
                  Por cobrar
                </p>
                <p className="break-words text-sm font-semibold sm:text-xl">
                  {totals.financialRestricted
                    ? "Restringido"
                    : clp.format(totals.pending)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_240px] sm:p-4">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Buscar clientes por nombre, correo o teléfono"
                className="h-11 pl-9"
                placeholder="Buscar por nombre, correo o teléfono…"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </div>
            <Select
              value={service}
              onValueChange={value => setService(value as ServiceKey)}
            >
              <SelectTrigger
                aria-label="Filtrar clientes por servicio"
                className="h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los servicios</SelectItem>
                {(
                  (access?.clientServices ?? []) as Reservation360ServiceKey[]
                ).map(item => (
                  <SelectItem key={item} value={item}>
                    {serviceLabels[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
          <Card
            className={cn(
              "min-w-0 overflow-hidden",
              selected && "hidden lg:block"
            )}
          >
            <CardContent className="p-0">
              <div className="border-b px-4 py-3">
                <p className="font-semibold">Personas</p>
                <p className="text-xs text-muted-foreground">
                  {listQuery.data?.total ?? 0} resultado(s)
                </p>
              </div>
              <div className="max-h-[68vh] overflow-y-auto p-2">
                {listQuery.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={index} className="h-24" />
                    ))}
                  </div>
                ) : listQuery.error ? (
                  <div className="px-4 py-12 text-center text-sm text-rose-700">
                    No fue posible cargar las fichas de clientes.
                  </div>
                ) : filteredData.length ? (
                  filteredData.map(client => {
                    const active =
                      selected &&
                      (selected.profileId && client.profileId
                        ? selected.profileId === client.profileId
                        : selected.key === client.key);
                    return (
                      <button
                        key={client.profileId ?? client.key}
                        type="button"
                        onClick={() => setSelected(client)}
                        className={cn(
                          "mb-2 w-full rounded-xl border p-3 text-left transition last:mb-0 hover:bg-muted/50",
                          active && "border-primary bg-primary/5"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words font-semibold">
                              {client.name}
                            </p>
                            <p className="mt-1 break-all text-xs text-muted-foreground">
                              {client.phone ||
                                client.email ||
                                "Sin contacto registrado"}
                            </p>
                          </div>
                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-1">
                          {client.services.map(item => (
                            <span
                              key={item}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px]",
                                serviceTone[item]
                              )}
                            >
                              {serviceLabels[item]}
                            </span>
                          ))}
                          {Number(client.pendingBalanceClp ?? 0) > 0 && (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-800">
                              Debe{" "}
                              {clp.format(Number(client.pendingBalanceClp))}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No encontramos clientes para estos filtros.
                  </div>
                )}
              </div>
              {(listQuery.data?.total ?? 0) > CLIENT_PAGE_SIZE && (
                <div className="flex items-center justify-between gap-2 border-t p-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0 || listQuery.isFetching}
                    onClick={() => {
                      setSelected(null);
                      setPage(current => Math.max(0, current - 1));
                    }}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Página {page + 1} de{" "}
                    {Math.ceil((listQuery.data?.total ?? 0) / CLIENT_PAGE_SIZE)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      listQuery.data?.nextCursor == null || listQuery.isFetching
                    }
                    onClick={() => {
                      setSelected(null);
                      setPage(current => current + 1);
                    }}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {selected ? (
            <ClientWorkspace
              client={selected}
              service={service}
              canCreate={manualBookingServices.length > 0}
              onBack={() => setSelected(null)}
              onNewBooking={() => setBookingOpen(true)}
              onClientChanged={refreshClientData}
              onMerged={async targetProfileId => {
                await refreshClientData();
                const result = await listQuery.refetch();
                const target = (
                  result.data?.items as ClientSummary[] | undefined
                )?.find(item => item.profileId === targetProfileId);
                setSelected(target ?? null);
              }}
            />
          ) : (
            <Card className="hidden min-h-[30rem] items-center justify-center lg:flex">
              <CardContent className="max-w-md py-16 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <UserRound className="h-7 w-7 text-slate-500" />
                </span>
                <h2 className="mt-4 text-xl font-semibold">
                  Selecciona una persona
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Abre su ficha para revisar reservas antiguas, pagos, actividad
                  o crear una nueva reserva.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {selected && manualBookingServices.length > 0 && (
        <UnifiedBookingDialog
          open={bookingOpen}
          onOpenChange={setBookingOpen}
          initialDate={chileToday()}
          allowedServices={manualBookingServices}
          initialClient={{
            name: selected.name,
            email: selected.email ?? "",
            phone: selected.phone ?? "",
          }}
          lockClient
          onReservationsCreated={async result => {
            if (!selected.profileId)
              throw new Error("La ficha del cliente aún no está disponible");
            await linkReservations.mutateAsync({
              profileId: selected.profileId,
              reservations: result.reservations,
            });
          }}
          onCreated={async () => {
            await refreshClientData();
          }}
        />
      )}

      {selected && manualBookingServices.length > 0 && (
        <Button
          aria-label="Nueva reserva"
          title="Nueva reserva"
          className="cms-mobile-fab fixed right-4 bottom-4 z-40 h-14 w-14 rounded-full shadow-xl lg:hidden"
          onClick={() => setBookingOpen(true)}
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}
    </DashboardLayout>
  );
}
