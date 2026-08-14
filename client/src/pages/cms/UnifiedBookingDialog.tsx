import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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

type DirectService = "massages" | "biopools" | "sauna";
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
};

const labels: Record<DirectService, string> = {
  massages: "Masajes",
  biopools: "Biopiscinas",
  sauna: "Sauna",
};
const paymentMethods: Record<DirectService, Array<[string, string]>> = {
  massages: [
    ["getnet_link", "Link Getnet"],
    ["getnet_pos", "Máquina Getnet"],
    ["bank_transfer", "Transferencia"],
    ["cash", "Efectivo"],
    ["gift_card", "Gift Card"],
    ["transbank", "Transbank"],
  ],
  biopools: [
    ["payment_link", "Link de pago"],
    ["bank_transfer", "Transferencia"],
    ["cash", "Efectivo"],
    ["gift_card", "Gift Card"],
    ["transbank_machine", "Máquina Transbank"],
  ],
  sauna: [
    ["payment_link", "Link de pago"],
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
  onChange,
}: {
  service: DirectService;
  items: PaymentDraft[];
  onChange: (items: PaymentDraft[]) => void;
}) {
  const update = (index: number, changes: Partial<PaymentDraft>) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...changes } : item))
    );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Pagos y abonos</Label>
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
                  status: method === "gift_card" ? "paid" : item.status,
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
              disabled={item.method === "gift_card"}
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
                <SelectItem value="pending">Pendiente</SelectItem>
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
}: {
  value: BookingDraft;
  onChange: (value: BookingDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
  allowedServices: DirectService[];
}) {
  const techniques = trpc.masajes.tecnicas.getAll.useQuery(undefined, {
    enabled: value.service === "massages",
  });
  const rooms = trpc.masajes.salas.getAll.useQuery(undefined, {
    enabled: value.service === "massages",
  });
  const massageSlots = trpc.masajes.agenda.getAvailableSlots.useQuery(
    {
      date: value.date,
      duration: value.duration,
      techniqueId: value.serviceId ? Number(value.serviceId) : undefined,
    },
    { enabled: value.service === "massages" && Boolean(value.date) }
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
  const selectedTechnique: any = techniques.data?.find(
    (item: any) => String(item.id) === value.serviceId
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
  const availableTimes: any[] =
    value.service === "massages"
      ? (massageSlots.data ?? [])
      : value.service === "biopools"
        ? ((bioSlots.data as any)?.slots ?? [])
        : ((saunaSlots.data as any)?.slots ?? []);
  const finalAmount = Math.max(0, value.amountClp - value.discountAmountClp);

  useEffect(() => {
    if (value.service === "massages" && selectedTechnique) {
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
    <div className="space-y-4 rounded-2xl border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Reserva</h3>
        {canRemove && (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="mr-1 h-4 w-4" />
            Quitar
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        {value.service === "massages" && (
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
                {String(selectedTechnique?.durations ?? "50,80,110")
                  .split(",")
                  .map(Number)
                  .filter(Boolean)
                  .map(duration => (
                    <SelectItem key={duration} value={String(duration)}>
                      {duration} minutos
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
        {value.service === "massages" && (
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
                {rooms.data
                  ?.filter(
                    (room: any) =>
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
        {value.service === "biopools" ? (
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
        ) : null}
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
        {value.service !== "sauna" && (
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
      {finalAmount > 0 && (
        <PaymentEditor
          service={value.service}
          items={value.payments}
          onChange={payments => onChange({ ...value, payments })}
        />
      )}
      <div>
        <Label>Notas</Label>
        <Textarea
          rows={2}
          value={value.notes}
          onChange={event => onChange({ ...value, notes: event.target.value })}
        />
      </div>
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
  const massageCreate = trpc.masajes.agenda.create.useMutation();
  const bioCreate = trpc.biopools.bookings.create.useMutation();
  const saunaCreate = trpc.sauna.agenda.create.useMutation();
  const clientSearch = trpc.operations360.clients.list.useQuery(
    { search: client.name.trim() || undefined },
    { enabled: open && !clientSelected && client.name.trim().length >= 2 }
  );

  useEffect(() => {
    if (open) {
      setClient({ name: "", email: "", phone: "" });
      setClientSelected(false);
      setItems([booking(first, initialDate)]);
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
  const valid =
    client.name.trim().length >= 2 &&
    client.email.includes("@") &&
    client.phone.trim().length >= 8 &&
    items.every(item => {
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
        (!item.discountCode.trim() || item.discountAmountClp > 0) &&
        (item.service !== "massages" || item.roomId) &&
        (item.service !== "biopools" ||
          (item.adults >= 1 && item.adults + item.children > 0)) &&
        (due === 0 ||
          (item.payments.length > 0 &&
            item.payments.every(paymentComplete) &&
            planned <= due))
      );
    });

  const save = async () => {
    if (!valid)
      return toast.error("Completa los datos obligatorios y revisa los pagos");
    setSaving(true);
    try {
      for (const item of items) {
        const due = Math.max(0, item.amountClp - item.discountAmountClp);
        const payments = due > 0 ? item.payments.map(paymentInput) : [];
        if (item.service === "massages")
          await massageCreate.mutateAsync({
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
        else if (item.service === "biopools")
          await bioCreate.mutateAsync({
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
        else
          await saunaCreate.mutateAsync({
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
      }
      await onCreated();
      toast.success(
        items.length === 1
          ? "Reserva creada"
          : `${items.length} reservas creadas para ${client.name}`
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron crear las reservas"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva reserva</DialogTitle>
          <DialogDescription>
            Registra una o varias reservas para el mismo cliente desde un solo
            lugar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-3 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <h3 className="font-semibold">Cliente</h3>
              <p className="text-xs text-muted-foreground">
                Busca un cliente existente por nombre, teléfono o correo, o
                ingresa uno nuevo.
              </p>
            </div>
            <div className="relative">
              <Label>Nombre *</Label>
              <Input
                value={client.name}
                onChange={event => {
                  setClient({ ...client, name: event.target.value });
                  setClientSelected(false);
                }}
              />
              {!clientSelected && (clientSearch.data?.length ?? 0) > 0 && (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border bg-background p-1 shadow-lg">
                  {clientSearch.data?.slice(0, 8).map((row: any) => (
                    <button
                      key={row.key}
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
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
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.phone || row.email}
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
          {open &&
            items.map(item => (
              <BookingEditor
                key={item.key}
                value={item}
                onChange={next =>
                  setItems(current =>
                    current.map(row => (row.key === item.key ? next : row))
                  )
                }
                onRemove={() =>
                  setItems(current =>
                    current.filter(row => row.key !== item.key)
                  )
                }
                canRemove={items.length > 1}
                allowedServices={available}
              />
            ))}
          <Button
            type="button"
            variant="outline"
            disabled={!available.length}
            onClick={() =>
              setItems(current => [...current, booking(first, initialDate)])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar otro servicio
          </Button>
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-slate-300">Resumen</p>
                <p className="font-semibold">
                  {items.length} {items.length === 1 ? "reserva" : "reservas"}{" "}
                  para el mismo cliente
                </p>
              </div>
              <p className="text-2xl font-semibold">{clp(total)}</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={!valid || saving} onClick={save}>
            {saving
              ? "Guardando…"
              : items.length === 1
                ? "Crear reserva"
                : `Crear ${items.length} reservas`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
