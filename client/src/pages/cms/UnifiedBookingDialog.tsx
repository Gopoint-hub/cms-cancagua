import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Link2,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ReservationPaymentLinks,
  type ReservationPaymentLink,
} from "@/components/cms/ReservationPaymentLinks";

type DirectService = "massages" | "biopools" | "sauna";
type CreatedReservation = {
  service: DirectService | "massage_programs";
  reservationId: number;
};
type ClientDraft = { name: string; email: string; phone: string };
type PaymentDraft = {
  method: string;
  status: "paid" | "pending";
  amountClp: string;
  paidAt: string;
  reference: string;
  cardType: "credit" | "debit" | "";
  giftCardCode: string;
};
type BookingDraft = {
  key: string;
  service: DirectService;
  serviceId: string;
  serviceName: string;
  serviceKind: string;
  date: string;
  time: string;
  duration: number;
  roomId: string;
  adults: number;
  children: number;
  guests: number;
  amountClp: number;
  discountCode: string;
  discountAmountClp: number;
  notes: string;
  payments: PaymentDraft[];
  modality: "simple" | "double";
  secondClientName: string;
  externalReference: string;
  programPaymentMethod: string;
  programPaymentReference: string;
};

const labels: Record<DirectService, string> = {
  massages: "Masajes",
  biopools: "Biopiscinas",
  sauna: "Sauna",
};
const paymentMethods: Record<DirectService, Array<[string, string]>> = {
  massages: [
    ["pending_payment", "Pendiente de pago"],
    ["getnet_pos", "Máquina Getnet"],
    ["bank_transfer", "Transferencia"],
    ["cash", "Efectivo"],
    ["gift_card", "Gift Card"],
    ["transbank", "Transbank"],
  ],
  biopools: [
    ["pending_payment", "Pendiente de pago"],
    ["bank_transfer", "Transferencia"],
    ["cash", "Efectivo"],
    ["gift_card", "Gift Card"],
    ["transbank_machine", "Máquina Transbank"],
  ],
  sauna: [
    ["pending_payment", "Pendiente de pago"],
    ["bank_transfer", "Transferencia"],
    ["cash", "Efectivo"],
    ["gift_card", "Gift Card"],
    ["transbank_machine", "Máquina Transbank"],
  ],
};
const cardMethods = new Set([
  "getnet_link",
  "getnet_pos",
  "payment_link",
  "transbank",
  "transbank_machine",
]);

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}
function localDateTime() {
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
function payment(amount = ""): PaymentDraft {
  return {
    method: "",
    status: "paid",
    amountClp: amount,
    paidAt: localDateTime(),
    reference: "",
    cardType: "",
    giftCardCode: "",
  };
}
function pendingPayment(amount: number): PaymentDraft {
  return {
    ...payment(String(Math.max(0, amount))),
    method: "pending_payment",
    status: "pending",
  };
}
function booking(service: DirectService, date = localDate()): BookingDraft {
  return {
    key: crypto.randomUUID(),
    service,
    serviceId: "",
    serviceName: "",
    serviceKind: "",
    date,
    time: "",
    duration: 50,
    roomId: "",
    adults: 1,
    children: 0,
    guests: 1,
    amountClp: 0,
    discountCode: "",
    discountAmountClp: 0,
    notes: "",
    payments: [payment()],
    modality: "simple",
    secondClientName: "",
    externalReference: "",
    programPaymentMethod: "skedu_program",
    programPaymentReference: "",
  };
}
function clp(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}
function endTime(start: string, minutes: number) {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function paymentComplete(item: PaymentDraft) {
  if (
    !item.method ||
    !Number.isInteger(Number(item.amountClp)) ||
    Number(item.amountClp) <= 0
  )
    return false;
  if (item.method === "gift_card")
    return Boolean(item.giftCardCode.trim()) && item.status === "paid";
  if (item.status === "pending") return true;
  if (!item.paidAt || (item.method !== "cash" && !item.reference.trim()))
    return false;
  return !cardMethods.has(item.method) || Boolean(item.cardType);
}
function programPaymentComplete(item: BookingDraft) {
  if (!item.programPaymentMethod) return false;
  return (
    ["pending_payment", "cash", "skedu_program"].includes(
      item.programPaymentMethod
    ) || Boolean(item.programPaymentReference.trim())
  );
}
function paymentInput(item: PaymentDraft) {
  return {
    method: item.method as any,
    status: item.status,
    amountClp: Number(item.amountClp),
    paidAt: item.status === "paid" ? item.paidAt : undefined,
    reference:
      item.method === "gift_card"
        ? undefined
        : item.reference.trim() || undefined,
    cardType: cardMethods.has(item.method)
      ? item.cardType || undefined
      : undefined,
    giftCardCode:
      item.method === "gift_card"
        ? item.giftCardCode.trim().toUpperCase()
        : undefined,
  };
}

function PaymentEditor({
  service,
  items,
  balanceClp,
  onChange,
}: {
  service: DirectService;
  items: PaymentDraft[];
  balanceClp: number;
  onChange: (items: PaymentDraft[]) => void;
}) {
  const update = (index: number, changes: Partial<PaymentDraft>) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...changes } : item))
    );
  const paidRows = items.filter(item => item.status === "paid");
  const paidClp = paidRows.reduce(
    (sum, item) => sum + Number(item.amountClp || 0),
    0
  );
  const pendingClp = Math.max(0, balanceClp - paidClp);
  const leavePending = () => {
    if (pendingClp <= 0) {
      toast.info("Esta reserva no tiene saldo pendiente");
      return;
    }
    // Conserva únicamente pagos efectivamente recibidos (incluidas Gift Cards)
    // y reemplaza borradores/marcadores de cobro por un solo saldo pendiente.
    onChange([...paidRows, pendingPayment(pendingClp)]);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Label>Pagos y abonos</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            disabled={pendingClp <= 0}
            onClick={leavePending}
          >
            <Clock3 className="mr-1 h-4 w-4" />
            Dejar saldo pendiente
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...items, payment()])}
          >
            <Plus className="mr-1 h-4 w-4" />
            Otro pago
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Podrás generar y enviar el link de pago después de crear la reserva.
      </p>
      {items.map((item, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2"
        >
          <div>
            <Label>Medio</Label>
            <Select
              value={item.method}
              onValueChange={method =>
                update(index, {
                  method,
                  status:
                    method === "pending_payment"
                      ? "pending"
                      : method === "gift_card"
                        ? "paid"
                        : item.status,
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
                {paymentMethods[service].map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Monto</Label>
            <Input
              type="number"
              min={1}
              value={item.amountClp}
              onChange={event =>
                update(index, { amountClp: event.target.value })
              }
            />
          </div>
          <div>
            <Label>Estado</Label>
            <Select
              disabled={item.method === "gift_card" || item.method === "pending_payment"}
              value={item.status}
              onValueChange={(status: "paid" | "pending") =>
                update(index, { status })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="pending">Pendiente de pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {item.status === "paid" && (
            <div>
              <Label>Fecha y hora</Label>
              <Input
                type="datetime-local"
                value={item.paidAt}
                onChange={event =>
                  update(index, { paidAt: event.target.value })
                }
              />
            </div>
          )}
          {item.method === "gift_card" ? (
            <div className="sm:col-span-2">
              <Label>Código Gift Card</Label>
              <Input
                value={item.giftCardCode}
                onChange={event =>
                  update(index, {
                    giftCardCode: event.target.value.toUpperCase(),
                  })
                }
              />
            </div>
          ) : item.status === "paid" && item.method !== "cash" ? (
            <div>
              <Label>Referencia</Label>
              <Input
                value={item.reference}
                onChange={event =>
                  update(index, { reference: event.target.value })
                }
              />
            </div>
          ) : null}
          {cardMethods.has(item.method) && item.status === "paid" && (
            <div>
              <Label>Tarjeta</Label>
              <Select
                value={item.cardType}
                onValueChange={(cardType: "credit" | "debit") =>
                  update(index, { cardType })
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
          {items.length > 1 && (
            <Button
              className="sm:col-span-2 sm:justify-self-start"
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Quitar pago
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function BookingEditor({
  value,
  onChange,
  onRemove,
  canRemove,
  allowedServices,
  section = "all",
}: {
  value: BookingDraft;
  onChange: (value: BookingDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
  allowedServices: DirectService[];
  section?: "all" | "catalog" | "variant" | "availability" | "payment";
}) {
  const techniques = trpc.masajes.tecnicas.getAll.useQuery(undefined, {
    enabled: value.service === "massages",
  });
  const programs = trpc.masajes.agenda.getSkeduPrograms.useQuery(undefined, {
    enabled: value.service === "massages",
  });
  const isProgram =
    value.service === "massages" && value.serviceKind === "massage_program";
  const programCode = isProgram ? value.serviceId.replace(/^program:/, "") : "";
  const selectedProgram: any = programs.data?.find(
    (item: any) => item.value === programCode
  );
  const programResources =
    trpc.masajes.agenda.getSkeduProgramResources.useQuery(
      {
        bookingDate: value.date,
        startTime: value.time || "10:00",
        duration: (value.duration === 30 ? 30 : 50) as 30 | 50,
        modality: value.modality,
      },
      { enabled: isProgram && Boolean(value.date && value.time) }
    );
  const rooms = trpc.masajes.salas.getAll.useQuery(undefined, {
    enabled: value.service === "massages",
  });
  const massageSlots = trpc.masajes.agenda.getAvailableSlots.useQuery(
    {
      date: value.date,
      duration: value.duration,
      techniqueId: value.serviceId ? Number(value.serviceId) : undefined,
    },
    {
      enabled:
        value.service === "massages" && !isProgram && Boolean(value.date),
    }
  );
  const bioServices = trpc.biopools.services.list.useQuery(undefined, {
    enabled: value.service === "biopools",
  });
  const bioDetail = trpc.biopools.services.get.useQuery(
    { id: Number(value.serviceId || 0) },
    { enabled: value.service === "biopools" && Boolean(value.serviceId) }
  );
  const bioSlots = trpc.biopools.availability.day.useQuery(
    { serviceId: Number(value.serviceId || 0), date: value.date },
    {
      enabled:
        value.service === "biopools" && Boolean(value.serviceId && value.date),
    }
  );
  const saunaServices = trpc.sauna.services.list.useQuery(undefined, {
    enabled: value.service === "sauna",
  });
  const saunaSlots = trpc.sauna.agenda.availability.useQuery(
    { date: value.date },
    { enabled: value.service === "sauna" && Boolean(value.date) }
  );
  const massageDiscount = trpc.masajes.public.validateDiscount.useMutation();
  const bioDiscount = trpc.biopools.public.validateDiscount.useMutation();

  const activeBio =
    bioServices.data?.filter((item: any) => item.status !== "archived") ?? [];
  const activeSauna =
    saunaServices.data?.filter(
      (item: any) => item.published && item.kind !== "program"
    ) ?? [];
  const programHasTherapists =
    (programResources.data?.therapists.length ?? 0) >=
    (value.modality === "double" ? 2 : 1);
  const programRooms = programHasTherapists
    ? (programResources.data?.rooms ?? [])
    : [];
  const selectedTechnique: any = techniques.data?.find(
    (item: any) => !isProgram && String(item.id) === value.serviceId
  );
  const selectedBio: any = activeBio.find(
    (item: any) => String(item.id) === value.serviceId
  );
  const selectedSauna: any = activeSauna.find(
    (item: any) => String(item.id) === value.serviceId
  );
  const tickets: any[] = (bioDetail.data as any)?.tickets ?? [];
  const adultPrice = Number(
    tickets.find(item => item.code === "adult")?.priceClp ?? 0
  );
  const childPrice = Number(
    tickets.find(item => item.code === "child")?.priceClp ?? 0
  );
  const availableTimes: any[] = isProgram
    ? Array.from({ length: 21 }, (_, index) => {
        const minutes = 10 * 60 + index * 30;
        return {
          time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
          availableRooms: [],
        };
      })
    : value.service === "massages"
      ? (massageSlots.data ?? [])
      : value.service === "biopools"
        ? ((bioSlots.data as any)?.slots ?? [])
        : ((saunaSlots.data as any)?.slots ?? []);
  const finalAmount = Math.max(0, value.amountClp - value.discountAmountClp);
  const catalogItems: any[] =
    value.service === "massages"
      ? [
          ...(techniques.data?.filter((item: any) => item.active) ?? []),
          ...(programs.data ?? []).map((item: any) => ({
            id: `program:${item.value}`,
            name: `Programa ${item.label}`,
            kind: "massage_program",
            durations: item.durations,
            priceClp: item.durations[0] === 30 ? 35_000 : 45_000,
          })),
        ]
      : value.service === "biopools"
        ? activeBio
        : activeSauna;
  const weekDates = useMemo(() => {
    const selected = new Date(`${value.date}T12:00:00`);
    const monday = new Date(selected);
    const day = selected.getDay() || 7;
    monday.setDate(selected.getDate() - day + 1);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return {
        value: new Intl.DateTimeFormat("en-CA").format(date),
        day: new Intl.DateTimeFormat("es-CL", { weekday: "short" }).format(
          date
        ),
        number: date.getDate(),
      };
    });
  }, [value.date]);

  useEffect(() => {
    if (value.service === "massages" && !isProgram && selectedTechnique) {
      const amount =
        Number(
          value.duration === 50
            ? selectedTechnique.price50min
            : value.duration === 80
              ? selectedTechnique.price80min
              : selectedTechnique.price110min
        ) || 0;
      if (amount !== value.amountClp)
        onChange({
          ...value,
          amountClp: amount,
          discountAmountClp: 0,
          payments: value.payments.map((item, index) =>
            index === 0 && !item.method
              ? { ...item, amountClp: String(amount) }
              : item
          ),
        });
    }
  }, [value.service, value.serviceId, value.duration, selectedTechnique]);
  useEffect(() => {
    if (!isProgram || !selectedProgram) return;
    const allowed = selectedProgram.durations as number[];
    const duration = allowed.includes(value.duration)
      ? value.duration
      : allowed[0];
    const amount =
      (duration === 30 ? 35_000 : 45_000) *
      (value.modality === "double" ? 2 : 1);
    if (duration !== value.duration || amount !== value.amountClp)
      onChange({ ...value, duration, amountClp: amount, discountAmountClp: 0 });
  }, [
    isProgram,
    selectedProgram,
    value.duration,
    value.modality,
    value.amountClp,
  ]);
  useEffect(() => {
    if (!isProgram || !value.time || !programResources.data) return;
    const roomIds = programRooms.map((room: any) => String(room.id));
    if (!roomIds.includes(value.roomId))
      onChange({ ...value, roomId: String(programRooms[0]?.id ?? "") });
  }, [
    isProgram,
    value.time,
    value.date,
    value.duration,
    value.modality,
    programResources.data,
  ]);
  useEffect(() => {
    if (value.service === "biopools" && tickets.length) {
      const amount = adultPrice * value.adults + childPrice * value.children;
      if (amount !== value.amountClp)
        onChange({
          ...value,
          amountClp: amount,
          discountAmountClp: 0,
          payments: value.payments.map((item, index) =>
            index === 0 && !item.method
              ? { ...item, amountClp: String(amount) }
              : item
          ),
        });
    }
  }, [
    value.service,
    value.serviceId,
    value.adults,
    value.children,
    adultPrice,
    childPrice,
  ]);
  useEffect(() => {
    if (
      value.service === "sauna" &&
      selectedSauna &&
      Number(selectedSauna.priceClp) !== value.amountClp
    ) {
      const amount = Number(selectedSauna.priceClp);
      onChange({
        ...value,
        amountClp: amount,
        discountAmountClp: 0,
        guests: selectedSauna.partySize ?? value.guests,
        payments: value.payments.map((item, index) =>
          index === 0 && !item.method
            ? { ...item, amountClp: String(amount) }
            : item
        ),
      });
    }
  }, [value.service, value.serviceId, selectedSauna]);

  const setService = (service: DirectService) =>
    onChange({ ...booking(service, value.date), key: value.key });
  const applyDiscount = async () => {
    if (!value.discountCode.trim() || value.service === "sauna") return;
    try {
      const result: any =
        value.service === "massages"
          ? await massageDiscount.mutateAsync({
              code: value.discountCode,
              items: [
                {
                  techniqueId: Number(value.serviceId),
                  duration: value.duration,
                  quantity: 1,
                },
              ],
            })
          : await bioDiscount.mutateAsync({
              code: value.discountCode,
              serviceId: Number(value.serviceId),
              adultQuantity: value.adults,
              childQuantity: value.children,
            });
      const discount = Number(
        result.discountTotal ?? result.discountAmount ?? 0
      );
      const total = Number(
        result.finalTotal ?? Math.max(0, value.amountClp - discount)
      );
      onChange({
        ...value,
        discountCode: String(result.code ?? value.discountCode).toUpperCase(),
        discountAmountClp: discount,
        payments: value.payments.map((item, index) =>
          index === 0 && !item.method
            ? { ...item, amountClp: String(total) }
            : item
        ),
      });
      toast.success(`Código aplicado: ${clp(discount)} de descuento`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Código no válido");
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {section === "catalog"
              ? "Selecciona el servicio a reservar"
              : value.serviceName || labels[value.service]}
          </h3>
          {section !== "catalog" && (
            <p className="text-xs text-muted-foreground">
              {labels[value.service]} ·{" "}
              {value.amountClp ? clp(value.amountClp) : "Precio por calcular"}
            </p>
          )}
        </div>
        {canRemove && (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="mr-1 h-4 w-4" />
            Quitar
          </Button>
        )}
      </div>
      {section === "catalog" && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {allowedServices.map(service => (
              <button
                key={service}
                type="button"
                onClick={() => setService(service)}
                className={`rounded-2xl border p-4 text-left font-semibold transition ${value.service === service ? "border-[#9a7655] bg-[#f3e9df] text-[#684a32]" : "bg-background hover:bg-muted"}`}
              >
                {labels[service]}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {catalogItems.map((item: any) => {
              const selected = String(item.id) === value.serviceId;
              const price =
                value.service === "massages"
                  ? Number(
                      item.price50min ??
                        item.price80min ??
                        item.price110min ??
                        item.priceClp ??
                        0
                    )
                  : Number(item.priceClp ?? 0);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      serviceId: String(item.id),
                      serviceName: item.name ?? "",
                      serviceKind: item.kind ?? "",
                      time: "",
                      discountAmountClp: 0,
                    })
                  }
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition ${selected ? "border-[#9a7655] bg-[#fffaf5] ring-1 ring-[#9a7655]" : "bg-white hover:bg-muted/50"}`}
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {price > 0
                        ? `Desde ${clp(price)}`
                        : "Precio según variante"}
                    </p>
                  </div>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${selected ? "bg-[#9a7655] text-white" : ""}`}
                  >
                    {selected ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </span>
                </button>
              );
            })}
            {!catalogItems.length && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Cargando servicios disponibles…
              </p>
            )}
          </div>
        </div>
      )}
      {section === "availability" && (
        <div className="space-y-4">
          <div className="max-w-xs">
            <Label>Ir a otra fecha</Label>
            <Input
              type="date"
              min={localDate()}
              value={value.date}
              onChange={event =>
                onChange({ ...value, date: event.target.value, time: "" })
              }
            />
          </div>
          <div>
            <Label>Semana</Label>
            <div className="mt-1 grid auto-cols-[minmax(3rem,1fr)] grid-flow-col overflow-x-auto rounded-2xl border bg-white sm:grid-flow-row sm:grid-cols-7">
              {weekDates.map(date => (
                <button
                  key={date.value}
                  type="button"
                  onClick={() =>
                    onChange({ ...value, date: date.value, time: "" })
                  }
                  className={`min-h-14 min-w-12 p-2 text-center capitalize sm:p-3 ${value.date === date.value ? "bg-[#9a7655] text-white" : "hover:bg-muted"}`}
                >
                  <span className="block text-xs">{date.day}</span>
                  <strong>{date.number}</strong>
                  <span
                    className={`mx-auto mt-1 block h-2 w-2 rounded-full ${value.date === date.value && availableTimes.length ? "bg-emerald-400" : "bg-stone-300"}`}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Horarios disponibles</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {availableTimes
                .filter(
                  item =>
                    value.service !== "biopools" ||
                    item.availableSeats >= value.adults + value.children
                )
                .filter(
                  item =>
                    value.service !== "sauna" ||
                    item.availableSeats >= value.guests
                )
                .map(item => {
                  const time = item.time ?? item.startTime;
                  return (
                    <Button
                      key={time}
                      type="button"
                      variant={value.time === time ? "default" : "outline"}
                      onClick={() =>
                        onChange({
                          ...value,
                          time,
                          roomId:
                            value.service === "massages"
                              ? String(item.availableRooms?.[0] ?? "")
                              : value.roomId,
                        })
                      }
                    >
                      {time}
                      {!isProgram && (
                        <span className="ml-1 text-xs opacity-70">
                          ({item.availableSeats ?? item.availableRooms?.length})
                        </span>
                      )}
                    </Button>
                  );
                })}
              {!availableTimes.length && (
                <p className="w-full rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                  No hay horarios disponibles para este día.
                </p>
              )}
            </div>
          </div>
          {isProgram &&
            value.time &&
            !programResources.isFetching &&
            !programRooms.length && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                No hay suficientes terapeutas o una sala compatible en este
                horario. Selecciona otro.
              </p>
            )}
          <p className="text-center text-xs text-muted-foreground">
            Horarios de Cancagua · America/Santiago
          </p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {section === "all" && (
          <div>
            <Label>Área</Label>
            <Select
              value={value.service}
              onValueChange={(service: DirectService) => setService(service)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedServices.map(service => (
                  <SelectItem key={service} value={service}>
                    {labels[service]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {section === "all" && (
          <div>
            <Label>Servicio</Label>
            <Select
              value={value.serviceId}
              onValueChange={serviceId => {
                const source: any[] =
                  value.service === "massages"
                    ? (techniques.data ?? [])
                    : value.service === "biopools"
                      ? activeBio
                      : activeSauna;
                const selected: any = source.find(
                  item => String(item.id) === serviceId
                );
                onChange({
                  ...value,
                  serviceId,
                  serviceName: selected?.name ?? "",
                  serviceKind: selected?.kind ?? "",
                  time: "",
                  discountAmountClp: 0,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                {value.service === "massages"
                  ? techniques.data
                      ?.filter((item: any) => item.active)
                      .map((item: any) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))
                  : value.service === "biopools"
                    ? activeBio.map((item: any) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))
                    : activeSauna.map((item: any) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {(section === "all" || section === "variant") &&
          value.service === "massages" && (
            <div>
              <Label>Duración</Label>
              <Select
                value={String(value.duration)}
                onValueChange={duration =>
                  onChange({
                    ...value,
                    duration: Number(duration),
                    time: "",
                    discountAmountClp: 0,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isProgram
                    ? (selectedProgram?.durations ?? [30, 50])
                    : String(selectedTechnique?.durations ?? "50,80,110")
                        .split(",")
                        .map(Number)
                  )
                    .filter(Boolean)
                    .map((duration: number) => (
                      <SelectItem key={duration} value={String(duration)}>
                        {duration} minutos
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        {(section === "all" || section === "variant") && isProgram && (
          <>
            <div>
              <Label>Modalidad</Label>
              <Select
                value={value.modality}
                onValueChange={(modality: "simple" | "double") =>
                  onChange({
                    ...value,
                    modality,
                    roomId: "",
                    secondClientName:
                      modality === "simple" ? "" : value.secondClientName,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple · 1 persona</SelectItem>
                  <SelectItem value="double">Doble · 2 personas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.modality === "double" && (
              <div>
                <Label>Segundo cliente</Label>
                <Input
                  value={value.secondClientName}
                  onChange={event =>
                    onChange({ ...value, secondClientName: event.target.value })
                  }
                  placeholder="Nombre y apellido"
                />
              </div>
            )}
          </>
        )}
        {section === "all" && (
          <div>
            <Label>Día</Label>
            <Input
              type="date"
              min={localDate()}
              value={value.date}
              onChange={event =>
                onChange({ ...value, date: event.target.value, time: "" })
              }
            />
          </div>
        )}
        {section === "all" && (
          <div>
            <Label>Hora disponible</Label>
            <Select
              value={value.time}
              onValueChange={time => {
                const slot = availableTimes.find(
                  item => (item.time ?? item.startTime) === time
                );
                onChange({
                  ...value,
                  time,
                  roomId:
                    value.service === "massages"
                      ? String(slot?.availableRooms?.[0] ?? "")
                      : value.roomId,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    availableTimes.length ? "Selecciona" : "Sin horarios"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableTimes
                  .filter(
                    item =>
                      value.service !== "biopools" ||
                      item.availableSeats >= value.adults + value.children
                  )
                  .filter(
                    item =>
                      value.service !== "sauna" ||
                      item.availableSeats >= value.guests
                  )
                  .map(item => (
                    <SelectItem
                      key={item.time ?? item.startTime}
                      value={item.time ?? item.startTime}
                    >
                      {item.time ?? item.startTime} ·{" "}
                      {item.availableSeats ?? item.availableRooms?.length}{" "}
                      disponible(s)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {(section === "all" || section === "availability") &&
          value.service === "massages" && (
            <div>
              <Label>Sala</Label>
              <Select
                value={value.roomId}
                onValueChange={roomId => onChange({ ...value, roomId })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Automática" />
                </SelectTrigger>
                <SelectContent>
                  {(isProgram ? programRooms : rooms.data)
                    ?.filter(
                      (room: any) =>
                        isProgram ||
                        !value.time ||
                        availableTimes
                          .find(item => item.time === value.time)
                          ?.availableRooms?.includes(room.id)
                    )
                    .map((room: any) => (
                      <SelectItem key={room.id} value={String(room.id)}>
                        {room.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        {(section === "all" || section === "variant") &&
          (value.service === "biopools" ? (
            <>
              <div>
                <Label>Adultos · {clp(adultPrice)}</Label>
                <Input
                  type="number"
                  min={0}
                  max={40}
                  value={value.adults}
                  onChange={event =>
                    onChange({
                      ...value,
                      adults: Number(event.target.value),
                      discountAmountClp: 0,
                    })
                  }
                />
              </div>
              <div>
                <Label>Niños · {clp(childPrice)}</Label>
                <Input
                  type="number"
                  min={0}
                  max={40}
                  value={value.children}
                  onChange={event =>
                    onChange({
                      ...value,
                      children: Number(event.target.value),
                      discountAmountClp: 0,
                    })
                  }
                />
              </div>
            </>
          ) : value.service === "sauna" ? (
            <div>
              <Label>Personas</Label>
              <Input
                type="number"
                min={1}
                max={6}
                value={value.guests}
                onChange={event =>
                  onChange({ ...value, guests: Number(event.target.value) })
                }
              />
            </div>
          ) : null)}
        {(section === "all" || section === "variant") && (
          <div>
            <Label>Monto</Label>
            <Input
              type="number"
              min={0}
              value={value.amountClp}
              onChange={event =>
                onChange({
                  ...value,
                  amountClp: Number(event.target.value),
                  discountAmountClp: 0,
                })
              }
            />
          </div>
        )}
        {(section === "all" || section === "payment") &&
          value.service !== "sauna" &&
          !isProgram && (
            <div className="lg:col-span-2">
              <Label>Código de descuento</Label>
              <div className="flex gap-2">
                <Input
                  value={value.discountCode}
                  onChange={event =>
                    onChange({
                      ...value,
                      discountCode: event.target.value.toUpperCase(),
                      discountAmountClp: 0,
                    })
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !value.discountCode.trim() ||
                    !value.serviceId ||
                    massageDiscount.isPending ||
                    bioDiscount.isPending
                  }
                  onClick={applyDiscount}
                >
                  Aplicar
                </Button>
              </div>
            </div>
          )}
      </div>
      {(section === "all" ||
        section === "variant" ||
        section === "payment") && (
        <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-muted/60 p-3 text-sm">
          <span>
            Subtotal: <strong>{clp(value.amountClp)}</strong>
          </span>
          {value.discountAmountClp > 0 && (
            <span className="text-emerald-700">
              Descuento: <strong>−{clp(value.discountAmountClp)}</strong>
            </span>
          )}
          <span>
            Total: <strong>{clp(finalAmount)}</strong>
          </span>
        </div>
      )}
      {(section === "all" || section === "payment") && isProgram && (
        <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
              onClick={() =>
                onChange({
                  ...value,
                  programPaymentMethod: "pending_payment",
                  programPaymentReference: "",
                })
              }
            >
              <Clock3 className="mr-1 h-4 w-4" />
              Dejar saldo pendiente
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              Podrás generar y enviar el link Getnet después de crear la
              reserva.
            </p>
          </div>
          <div>
            <Label>Medio de pago</Label>
            <Select
              value={value.programPaymentMethod}
              onValueChange={programPaymentMethod =>
                onChange({ ...value, programPaymentMethod })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skedu_program">
                  Incluido en programa Skedu
                </SelectItem>
                {paymentMethods.massages
                  .filter(([method]) => method !== "gift_card")
                  .map(([method, label]) => (
                    <SelectItem key={method} value={method}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {!['pending_payment', 'cash', 'skedu_program'].includes(
            value.programPaymentMethod
          ) && (
            <div>
              <Label>Referencia de pago</Label>
              <Input
                value={value.programPaymentReference}
                onChange={event =>
                  onChange({
                    ...value,
                    programPaymentReference: event.target.value,
                  })
                }
              />
            </div>
          )}
          {value.programPaymentMethod === "pending_payment" && (
            <p className="self-end rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
              Quedará en rojo hasta registrar el pago real durante el check-in.
            </p>
          )}
          <div className="sm:col-span-2">
            <Label>Referencia Skedu</Label>
            <Input
              value={value.externalReference}
              onChange={event =>
                onChange({ ...value, externalReference: event.target.value })
              }
              placeholder="Código o ID de la reserva (opcional)"
            />
          </div>
        </div>
      )}
      {(section === "all" || section === "payment") &&
        !isProgram &&
        finalAmount > 0 && (
          <PaymentEditor
            service={value.service}
            items={value.payments}
            balanceClp={finalAmount}
            onChange={payments => onChange({ ...value, payments })}
          />
        )}
      {(section === "all" || section === "payment") && (
        <div>
          <Label>Notas</Label>
          <Textarea
            rows={2}
            value={value.notes}
            onChange={event =>
              onChange({ ...value, notes: event.target.value })
            }
          />
        </div>
      )}
    </div>
  );
}

export function UnifiedBookingDialog({
  open,
  onOpenChange,
  initialDate,
  allowedServices,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: string;
  allowedServices: string[];
  onCreated: () => Promise<unknown> | void;
}) {
  const available = (
    ["massages", "biopools", "sauna"] as DirectService[]
  ).filter(service => allowedServices.includes(service));
  const first = available[0] ?? "massages";
  const [client, setClient] = useState<ClientDraft>({
    name: "",
    email: "",
    phone: "",
  });
  const [clientSelected, setClientSelected] = useState(false);
  const [items, setItems] = useState<BookingDraft[]>([
    booking(first, initialDate),
  ]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [createdReservations, setCreatedReservations] = useState<
    CreatedReservation[]
  >([]);
  const [paymentLinks, setPaymentLinks] = useState<ReservationPaymentLink[]>([]);
  const [paymentLinkPhone, setPaymentLinkPhone] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [partialSaveError, setPartialSaveError] = useState("");
  const massageCreate = trpc.masajes.agenda.create.useMutation();
  const programCreate =
    trpc.masajes.agenda.createSkeduProgramBooking.useMutation();
  const bioCreate = trpc.biopools.bookings.create.useMutation();
  const saunaCreate = trpc.sauna.agenda.create.useMutation();
  const createPaymentLinks =
    trpc.reservationPaymentLinks.create.useMutation();
  const clientSearch = trpc.operations360.clients.list.useQuery(
    { search: client.name.trim() || undefined },
    { enabled: open && !clientSelected && client.name.trim().length >= 2 }
  );

  useEffect(() => {
    if (open) {
      setClient({ name: "", email: "", phone: "" });
      setClientSelected(false);
      setItems([booking(first, initialDate)]);
      setStep(0);
      setActiveIndex(0);
      setCreatedReservations([]);
      setPaymentLinks([]);
      setPaymentLinkPhone("");
      setSavedCount(0);
      setPartialSaveError("");
    }
  }, [open, initialDate, first]);
  const total = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + Math.max(0, item.amountClp - item.discountAmountClp),
        0
      ),
    [items]
  );
  const subtotal = items.reduce((sum, item) => sum + item.amountClp, 0);
  const discountTotal = items.reduce(
    (sum, item) => sum + item.discountAmountClp,
    0
  );
  const paidTotal = items.reduce(
    (sum, item) =>
          sum +
      (item.serviceKind === "massage_program"
        ? item.programPaymentMethod === "pending_payment"
          ? 0
          : Math.max(0, item.amountClp - item.discountAmountClp)
        : item.payments
            .filter(payment => payment.status === "paid")
            .reduce(
              (paymentSum, payment) =>
                paymentSum + Number(payment.amountClp || 0),
              0
            )),
    0
  );
  const valid =
    client.name.trim().length >= 2 &&
    client.email.includes("@") &&
    client.phone.trim().length >= 8 &&
    items.every(item => {
      const program =
        item.service === "massages" && item.serviceKind === "massage_program";
      const due = Math.max(0, item.amountClp - item.discountAmountClp);
      const planned = item.payments.reduce(
        (sum, row) => sum + Number(row.amountClp || 0),
        0
      );
      return (
        item.serviceId &&
        item.date &&
        item.time &&
        (item.service === "sauna" || item.amountClp > 0) &&
        (program || !item.discountCode.trim() || item.discountAmountClp > 0) &&
        (item.service !== "massages" || item.roomId) &&
        (!program ||
          (programPaymentComplete(item) &&
            (item.modality === "simple" ||
              item.secondClientName.trim().length >= 2))) &&
        (item.service !== "biopools" ||
          (item.adults >= 1 && item.adults + item.children > 0)) &&
        (program ||
          due === 0 ||
          (item.payments.length > 0 &&
            item.payments.every(paymentComplete) &&
            planned <= due))
      );
    });
  const activeItem = items[activeIndex] ?? items[0];
  const clientValid =
    client.name.trim().length >= 2 &&
    client.email.includes("@") &&
    client.phone.trim().length >= 8;
  const variantValid =
    Boolean(activeItem?.serviceId) &&
    (activeItem?.service === "sauna" || activeItem?.amountClp > 0) &&
    (activeItem?.service !== "biopools" || activeItem.adults >= 1) &&
    (activeItem?.serviceKind !== "massage_program" ||
      activeItem.modality === "simple" ||
      activeItem.secondClientName.trim().length >= 2);
  const availabilityValid = Boolean(
    activeItem?.date &&
      activeItem?.time &&
      (activeItem.service !== "massages" || activeItem.roomId)
  );
  const paymentValid = activeItem
    ? (() => {
        if (activeItem.serviceKind === "massage_program")
          return programPaymentComplete(activeItem);
        const due = Math.max(
          0,
          activeItem.amountClp - activeItem.discountAmountClp
        );
        const planned = activeItem.payments.reduce(
          (sum, row) => sum + Number(row.amountClp || 0),
          0
        );
        return (
          (!activeItem.discountCode.trim() ||
            activeItem.discountAmountClp > 0) &&
          (due === 0 ||
            (activeItem.payments.every(paymentComplete) && planned <= due))
        );
      })()
    : false;

  const next = () => {
    if (step === 0 && !activeItem.serviceId)
      return toast.error("Selecciona un servicio");
    if (step === 1 && !variantValid)
      return toast.error("Completa la variante y cantidad de personas");
    if (step === 2 && !availabilityValid)
      return toast.error("Selecciona un día y horario disponible");
    if (step === 3 && !clientValid)
      return toast.error("Completa los datos del cliente");
    if (step === 4 && !paymentValid)
      return toast.error("Revisa descuentos, Gift Cards y pagos");
    if (step === 2 && activeIndex > 0) {
      setStep(4);
      return;
    }
    setStep(current => current + 1);
  };
  const back = () => {
    if (step === 0 && activeIndex > 0) {
      setItems(current => current.slice(0, -1));
      setActiveIndex(current => current - 1);
      setStep(5);
      return;
    }
    if (step === 4 && activeIndex > 0) {
      setStep(2);
      return;
    }
    setStep(current => Math.max(0, current - 1));
  };
  const addAnother = () => {
    const nextItem = booking(first, initialDate);
    setItems(current => [...current, nextItem]);
    setActiveIndex(items.length);
    setStep(0);
  };

  const save = async () => {
    if (!valid)
      return toast.error("Completa los datos obligatorios y revisa los pagos");
    setSaving(true);
    const created: CreatedReservation[] = [];
    let completed = 0;
    try {
      for (const item of items) {
        const due = Math.max(0, item.amountClp - item.discountAmountClp);
        const paid = item.serviceKind === "massage_program"
          ? item.programPaymentMethod === "pending_payment"
            ? 0
            : due
          : item.payments
              .filter(row => row.status === "paid")
              .reduce((sum, row) => sum + Number(row.amountClp || 0), 0);
        const payments = due > 0 ? item.payments.map(paymentInput) : [];
        if (
          item.service === "massages" &&
          item.serviceKind === "massage_program"
        ) {
          const result = await programCreate.mutateAsync({
            program: item.serviceId.replace(/^program:/, "") as any,
            duration: item.duration === 30 ? 30 : 50,
            modality: item.modality,
            clientName: client.name.trim(),
            secondClientName:
              item.modality === "double"
                ? item.secondClientName.trim()
                : undefined,
            clientEmail: client.email.trim(),
            clientPhone: client.phone.trim(),
            bookingDate: item.date,
            startTime: item.time,
            roomId: Number(item.roomId),
            externalReference: item.externalReference.trim() || undefined,
            paymentMethod: item.programPaymentMethod as any,
            paymentReference: item.programPaymentReference.trim() || undefined,
            notes: item.notes.trim() || undefined,
          });
          if (due > paid)
            created.push({
              service: "massage_programs",
              reservationId: result.id,
            });
        } else if (item.service === "massages") {
          const result = await massageCreate.mutateAsync({
            clientName: client.name.trim(),
            clientEmail: client.email.trim(),
            clientPhone: client.phone.trim(),
            techniqueId: Number(item.serviceId),
            roomId: Number(item.roomId),
            duration: item.duration,
            bookingDate: item.date,
            startTime: item.time,
            endTime: endTime(item.time, item.duration),
            paymentStatus: due === 0 ? "paid" : "pending",
            totalAmountClp: item.amountClp,
            payments: payments.length ? (payments as any) : undefined,
            discountCode: item.discountCode.trim() || undefined,
            notes: item.notes.trim() || undefined,
          });
          if (due > paid)
            created.push({ service: "massages", reservationId: result.id });
        } else if (item.service === "biopools") {
          const result = await bioCreate.mutateAsync({
            serviceId: Number(item.serviceId),
            clientName: client.name.trim(),
            clientEmail: client.email.trim(),
            clientPhone: client.phone.trim(),
            bookingDate: item.date,
            startTime: item.time,
            adultQuantity: item.adults,
            childQuantity: item.children,
            payments: payments as any,
            discountCode: item.discountCode.trim() || undefined,
            discountAmountClp: item.discountAmountClp,
            notes: item.notes.trim() || undefined,
            source: "cms",
          });
          if (due > paid)
            created.push({ service: "biopools", reservationId: result.id });
        } else {
          const result = await saunaCreate.mutateAsync({
            serviceName: item.serviceName || "Sauna Nativo",
            kind: (["shared", "private", "staff", "manual"].includes(
              item.serviceKind
            )
              ? item.serviceKind
              : "manual") as any,
            clientName: client.name.trim(),
            clientEmail: client.email.trim(),
            clientPhone: client.phone.trim(),
            bookingDate: item.date,
            startTime: item.time,
            guests: item.guests,
            isPrivate: item.serviceKind === "private" || item.guests >= 4,
            paymentStatus: "pending",
            amountClp: item.amountClp,
            payments: payments.length ? (payments as any) : undefined,
            notes: item.notes.trim() || undefined,
            isConfirmed: true,
          });
          if (due > paid)
            created.push({ service: "sauna", reservationId: result.id });
        }
        completed += 1;
      }
      try {
        await onCreated();
      } catch {
        toast.warning("Las reservas se guardaron, pero el calendario demoró en actualizarse");
      }
      setCreatedReservations(created);
      setPaymentLinks([]);
      setPaymentLinkPhone(client.phone.trim());
      setSavedCount(completed);
      setPartialSaveError("");
      setStep(7);
      toast.success(
        items.length === 1
          ? "Reserva creada"
          : `${items.length} reservas creadas para ${client.name}`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudieron crear las reservas";
      if (completed > 0) {
        try {
          await onCreated();
        } catch {
          // Las reservas confirmadas por el servidor siguen siendo válidas;
          // Calendario 360 las recogerá en su siguiente actualización.
        }
        setCreatedReservations(created);
        setPaymentLinks([]);
        setPaymentLinkPhone(client.phone.trim());
        setSavedCount(completed);
        setPartialSaveError(message);
        setStep(7);
        toast.warning(
          `${completed} ${completed === 1 ? "reserva fue guardada" : "reservas fueron guardadas"}; una reserva no pudo crearse`
        );
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const generatePaymentLinks = async () => {
    if (!createdReservations.length) return;
    setPaymentLinks([]);
    try {
      const result: any = await createPaymentLinks.mutateAsync({
        reservations: createdReservations,
      });
      setPaymentLinks(result.links);
      setPaymentLinkPhone(result.clientPhone || client.phone.trim());
      toast.success(
        result.links.length === 1
          ? "Link de pago generado"
          : `${result.links.length} links de pago generados`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible generar el link de pago"
      );
    }
  };

  const progress = step === 7 ? 100 : Math.min(100, ((step + 1) / 7) * 100);
  const updateActive = (nextValue: BookingDraft) =>
    setItems(current =>
      current.map((row, index) => (index === activeIndex ? nextValue : row))
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] max-w-3xl overflow-y-auto border-stone-200 bg-[#f8f6f2] p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {step > 0 && step < 7 && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="rounded-full"
                onClick={back}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <DialogTitle>
                {step === 0
                  ? "Selecciona el servicio a reservar"
                  : step === 7
                    ? "Reserva creada con éxito"
                  : step === 6
                    ? "Resumen de la reserva"
                    : "Completa los datos para reservar"}
              </DialogTitle>
              <DialogDescription>
                {step === 7
                  ? createdReservations.length
                    ? "Ya puedes generar y enviar el pago al cliente"
                    : "La reserva quedó registrada correctamente"
                  : items.length > 1
                  ? `${items.length} reservas para el mismo cliente`
                  : "Reserva manual desde Calendario 360"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-5">
          <div className="h-2 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-[#9a7655] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-stone-400">
            <Plus className="h-4 w-4" />
            <Clock3 className="h-4 w-4" />
            <UserRound className="h-4 w-4" />
            <CalendarDays className="h-4 w-4" />
            <Check className="h-4 w-4" />
          </div>
          {open && [0, 1, 2, 4].includes(step) && activeItem && (
            <BookingEditor
              value={activeItem}
              onChange={updateActive}
              onRemove={() => {}}
              canRemove={false}
              allowedServices={available}
              section={
                step === 0
                  ? "catalog"
                  : step === 1
                    ? "variant"
                    : step === 2
                      ? "availability"
                      : "payment"
              }
            />
          )}
          {step === 3 && (
            <div className="grid gap-4 rounded-2xl border bg-white p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <h3 className="text-xl font-semibold">Cliente</h3>
                <p className="text-sm text-muted-foreground">
                  Selecciona un cliente existente o crea uno nuevo.
                </p>
              </div>
              <div className="relative sm:col-span-2">
                <Label>Buscar por nombre, teléfono o correo</Label>
                <Input
                  autoFocus
                  value={client.name}
                  onChange={event => {
                    setClient({ ...client, name: event.target.value });
                    setClientSelected(false);
                  }}
                />
                {!clientSelected && (clientSearch.data?.length ?? 0) > 0 && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border bg-background p-1 shadow-lg">
                    {clientSearch.data?.slice(0, 8).map((row: any) => (
                      <button
                        key={row.key}
                        type="button"
                        className="block w-full rounded-lg px-3 py-3 text-left hover:bg-muted"
                        onClick={() => {
                          setClient({
                            name: row.name ?? "",
                            email: row.email ?? "",
                            phone: row.phone ?? "",
                          });
                          setClientSelected(true);
                        }}
                      >
                        <strong>{row.name}</strong>
                        <span className="block text-xs text-muted-foreground">
                          {row.phone || "Sin teléfono"} ·{" "}
                          {row.email || "Sin correo"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label>WhatsApp *</Label>
                <Input
                  value={client.phone}
                  onChange={event =>
                    setClient({ ...client, phone: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Correo *</Label>
                <Input
                  type="email"
                  value={client.email}
                  onChange={event =>
                    setClient({ ...client, email: event.target.value })
                  }
                />
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-5 rounded-3xl border bg-white p-4 text-center sm:p-6">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#efe5da]">
                <Plus className="h-6 w-6 text-[#76573d]" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold">
                  ¿Deseas reservar algo más?
                </h3>
                <p className="mt-1 text-muted-foreground">
                  Conservaremos los datos de {client.name}.
                </p>
              </div>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button type="button" variant="outline" onClick={addAnother}>
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar otro servicio
                </Button>
                <Button type="button" onClick={() => setStep(6)}>
                  Ir al resumen
                </Button>
              </div>
            </div>
          )}
          {step === 6 && (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-white p-4">
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p className="font-semibold">{client.name}</p>
                <p className="text-sm text-muted-foreground">
                  {client.phone} · {client.email}
                </p>
              </div>
              {items.map((item, index) => (
                <div key={item.key} className="rounded-2xl border bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-lg font-semibold">
                        {item.serviceName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {labels[item.service]} · {item.date} · {item.time}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.service === "biopools"
                          ? `${item.adults} adulto(s) · ${item.children} niño(s)`
                          : item.service === "sauna"
                            ? `${item.guests} persona(s)`
                            : item.serviceKind === "massage_program"
                              ? `${item.duration} minutos · modalidad ${item.modality === "double" ? "doble" : "simple"}${item.secondClientName ? ` · ${item.secondClientName}` : ""}`
                              : `${item.duration} minutos`}
                      </p>
                      {item.discountAmountClp > 0 && (
                        <p className="mt-1 text-sm text-emerald-700">
                          Descuento {item.discountCode}: −
                          {clp(item.discountAmountClp)}
                        </p>
                      )}
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {item.serviceKind === "massage_program" && (
                          <p>
                            {item.programPaymentMethod.replaceAll("_", " ")}
                            {item.programPaymentMethod === "pending_payment"
                              ? " · Pendiente de pago"
                              : " · Pagado"}
                            {item.programPaymentReference
                              ? ` · ${item.programPaymentReference}`
                              : ""}
                          </p>
                        )}
                        {item.payments
                          .filter(payment => payment.method)
                          .map((payment, paymentIndex) => (
                            <p key={paymentIndex}>
                              {payment.method === "gift_card"
                                ? `Gift Card ${payment.giftCardCode}`
                                : payment.method.replaceAll("_", " ")}{" "}
                              · {clp(Number(payment.amountClp || 0))} ·{" "}
                              {payment.status === "paid"
                                ? "Pagado"
                                : "Pendiente"}
                            </p>
                          ))}
                      </div>
                    </div>
                    <strong className="shrink-0 text-lg sm:text-base">
                      {clp(
                        Math.max(0, item.amountClp - item.discountAmountClp)
                      )}
                    </strong>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActiveIndex(index);
                        setStep(0);
                      }}
                    >
                      Editar
                    </Button>
                    {items.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setItems(current =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index
                            )
                          )
                        }
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Quitar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="space-y-2 rounded-2xl bg-slate-900 p-5 text-white">
                <div className="flex justify-between text-sm text-slate-300">
                  <span>Subtotal</span>
                  <span>{clp(subtotal)}</span>
                </div>
                {discountTotal > 0 && (
                  <div className="flex justify-between text-sm text-emerald-300">
                    <span>Descuentos</span>
                    <span>−{clp(discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-slate-300">
                  <span>Pagado</span>
                  <span>{clp(paidTotal)}</span>
                </div>
                <div className="flex flex-col gap-1 border-t border-slate-700 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Total de {items.length}{" "}
                    {items.length === 1 ? "reserva" : "reservas"}
                  </span>
                  <strong className="break-words text-xl sm:text-2xl">{clp(total)}</strong>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Saldo pendiente</span>
                  <strong>{clp(Math.max(0, total - paidTotal))}</strong>
                </div>
              </div>
            </div>
          )}
          {step === 7 && (
            <div className="space-y-5 rounded-3xl border bg-white p-4 sm:p-6">
              <div className="text-center">
                <span
                  className={cn(
                    "mx-auto flex h-14 w-14 items-center justify-center rounded-full",
                    partialSaveError
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                  )}
                >
                  {partialSaveError ? (
                    <AlertTriangle className="h-8 w-8" />
                  ) : (
                    <CheckCircle2 className="h-8 w-8" />
                  )}
                </span>
                <h3 className="mt-3 text-2xl font-semibold">
                  {savedCount === 1
                    ? "Reserva guardada"
                    : `${savedCount} reservas guardadas`}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {partialSaveError
                    ? "No vuelvas a confirmar el grupo: las reservas indicadas ya existen."
                    : "Calendario 360 y los módulos correspondientes ya están actualizados."}
                </p>
              </div>

              {partialSaveError && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                  <p className="font-semibold">El guardado quedó incompleto</p>
                  <p className="mt-1 text-sm">
                    No se completó la siguiente reserva: {partialSaveError}
                  </p>
                  <p className="mt-2 text-xs">
                    Las reservas posteriores no se intentaron. Cierra esta ventana y agrega únicamente las faltantes para evitar duplicados.
                  </p>
                </div>
              )}

              {createdReservations.length ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="font-semibold text-amber-950">
                      {paymentLinks.length
                        ? `Cobro por link · ${clp(paymentLinks.reduce((sum, link) => sum + link.totalClp, 0))}`
                        : "La reserva tiene saldo pendiente"}
                    </p>
                    <p className="text-sm text-amber-800">
                      El link quedará relacionado con la reserva y se marcará
                      pagada automáticamente cuando el proveedor confirme el
                      cobro.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    variant={paymentLinks.length ? "outline" : "default"}
                    disabled={createPaymentLinks.isPending}
                    onClick={generatePaymentLinks}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    {createPaymentLinks.isPending
                      ? "Generando…"
                      : paymentLinks.length
                        ? "Recrear links de pago"
                        : createdReservations.length === 1
                          ? "Generar link de pago"
                          : "Generar links de pago"}
                  </Button>
                  <ReservationPaymentLinks
                    links={paymentLinks}
                    clientName={client.name}
                    clientPhone={paymentLinkPhone}
                  />
                </div>
              ) : (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-800">
                  No quedó saldo pendiente por cobrar.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="mt-2">
          {step < 5 && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={step === 0 ? () => onOpenChange(false) : back}
              >
                {step === 0 ? "Cancelar" : "Atrás"}
              </Button>
              <Button type="button" onClick={next}>
                Siguiente
              </Button>
            </>
          )}
          {step === 6 && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(5)}
              >
                Atrás
              </Button>
              <Button type="button" disabled={!valid || saving} onClick={save}>
                {saving
                  ? "Guardando…"
                  : items.length === 1
                    ? "Confirmar reserva"
                    : `Confirmar ${items.length} reservas`}
              </Button>
            </>
          )}
          {step === 7 && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
