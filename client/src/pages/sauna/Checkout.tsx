import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Clock,
  Flame,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CustomerAcquisitionFields } from "@/components/CustomerAcquisitionFields";
import { EMPTY_CUSTOMER_ACQUISITION, validateCustomerAcquisitionForm } from "@shared/customerAcquisition";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

export default function SaunaCheckout() {
  const catalog = trpc.sauna.public.catalog.useQuery();
  const [purchaseKey, setPurchaseKey] = useState("");
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState("");
  const [privateGuests, setPrivateGuests] = useState(6);
  const [accepted, setAccepted] = useState(false);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [appliedGiftCard, setAppliedGiftCard] = useState<{
    code: string;
    mode: "amount" | "service";
    balanceAfter: number;
  } | null>(null);
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "+56",
  });
  const [acquisition, setAcquisition] = useState({ ...EMPTY_CUSTOMER_ACQUISITION });
  const services = catalog.data?.services ?? [];
  const policies = catalog.data?.policies;
  const service =
    services.find(item => item.purchaseKey === purchaseKey) ?? services[0];
  useEffect(() => {
    if (!purchaseKey && services[0]) setPurchaseKey(services[0].purchaseKey);
  }, [purchaseKey, services]);
  const availability = trpc.sauna.public.availability.useQuery(
    { serviceId: service?.id ?? 0, date },
    { enabled: Boolean(service && date), refetchInterval: 30_000 }
  );
  const slots = useMemo(
    () => availability.data?.slots ?? [],
    [availability.data]
  );
  useEffect(() => {
    if (!slots.some(slot => slot.startTime === startTime))
      setStartTime(slots[0]?.startTime ?? "");
  }, [slots, startTime]);
  const payment = trpc.sauna.public.startPayment.useMutation({
    onSuccess: result => {
      if (!result.paymentRequired) {
        window.location.assign(result.resultUrl);
        return;
      }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = result.paymentUrl;
      const token = document.createElement("input");
      token.type = "hidden";
      token.name = "token_ws";
      token.value = result.token;
      form.appendChild(token);
      document.body.appendChild(form);
      form.submit();
    },
    onError: error => toast.error(error.message),
  });
  const validateGiftCard = trpc.giftCards.validateForService.useMutation({
    onSuccess: result => {
      setAppliedGiftCard(result);
      setGiftCardCode(result.code);
      toast.success(`Gift Card ${result.code} aplicada`);
    },
    onError: error => {
      setAppliedGiftCard(null);
      toast.error(error.message);
    },
  });
  useEffect(() => setAppliedGiftCard(null), [service?.id]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!service || !startTime)
      return toast.error("Selecciona un servicio y horario disponible");
    if (!accepted)
      return toast.error("Debes aceptar las condiciones del servicio");
    const validAcquisition = validateCustomerAcquisitionForm(acquisition);
    if (!validAcquisition)
      return toast.error("Completa cómo nos encontraste y de dónde vienes");
    payment.mutate({
      serviceId: service.id,
      clientName: customer.name,
      clientEmail: customer.email,
      clientPhone: customer.phone,
      acquisition: validAcquisition,
      bookingDate: date,
      startTime,
      privateGuestCount:
        service.kind === "private"
          ? service.fixedPartySize
            ? service.partySize
            : privateGuests
          : undefined,
      acceptedSharedUse: true,
      acceptedTerms: true,
      giftCardCode: appliedGiftCard?.code,
    });
  };
  if (catalog.isLoading)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f1e9]">
        Cargando Sauna…
      </main>
    );
  if (!service)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f1e9] text-red-700">
        La venta online de Sauna todavía no está disponible.
      </main>
    );

  return (
    <main className="min-h-screen bg-[#f5f1e9] text-stone-800">
      <header className="border-b bg-white/90 px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <a
            href="https://cancagua.cl"
            className="flex items-center gap-2 text-sm"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver a Cancagua
          </a>
          <span className="font-serif text-xl tracking-widest">CANCAGUA</span>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[.32em] text-amber-800">
            Reserva online
          </p>
          <h1 className="mt-2 font-serif text-4xl">Sauna Nativo</h1>
          <p className="mx-auto mt-3 max-w-2xl text-stone-600">
            Aforo máximo de 6 personas. Las entradas para 1, 2 o 3 personas
            pueden compartir horario; las de 4 o 5 bloquean el sauna completo.
          </p>
        </div>
        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-4 p-6">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <Flame className="text-amber-700" />
                  Elige tu servicio
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {services.map(item => (
                    <button
                      type="button"
                      key={item.purchaseKey}
                      onClick={() => setPurchaseKey(item.purchaseKey)}
                      className={`rounded-2xl border p-4 text-left ${service.purchaseKey === item.purchaseKey ? "border-amber-700 bg-amber-50 ring-1 ring-amber-700" : "bg-white"}`}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        {item.kind === "private" ? (
                          <LockKeyhole className="h-4 w-4" />
                        ) : (
                          <Users className="h-4 w-4" />
                        )}
                        {item.name}
                      </div>
                      <p className="mt-2 text-sm text-stone-500">
                        {item.kind === "private"
                          ? `${item.partySize} persona${item.partySize === 1 ? "" : "s"} · bloquea los 6 cupos`
                          : `${item.partySize} cupo${item.partySize === 1 ? "" : "s"} · servicio compartido`}
                      </p>
                      <p className="mt-2 font-bold">
                        {clp.format(item.priceClp)}
                      </p>
                    </button>
                  ))}
                </div>
                {service.kind === "private" && !service.fixedPartySize && (
                  <div className="max-w-xs">
                    <Label>Personas que asistirán</Label>
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      value={privateGuests}
                      onChange={event =>
                        setPrivateGuests(Number(event.target.value))
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-5 p-6">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <CalendarDays className="text-amber-700" />
                  Fecha y hora
                </h2>
                <div className="max-w-xs">
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    min={today()}
                    value={date}
                    onChange={event => setDate(event.target.value)}
                  />
                </div>
                {availability.isLoading ? (
                  <p className="text-sm text-stone-500">
                    Consultando los seis cupos…
                  </p>
                ) : slots.length ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {slots.map(slot => (
                      <button
                        type="button"
                        key={slot.startTime}
                        onClick={() => setStartTime(slot.startTime)}
                        className={`rounded-xl border p-3 text-left ${startTime === slot.startTime ? "border-amber-800 bg-amber-800 text-white" : "bg-white"}`}
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          <Clock className="h-4 w-4" />
                          {slot.startTime}
                        </span>
                        <span className="mt-1 block text-xs">
                          {service.kind === "private"
                            ? "sauna completo"
                            : `${slot.availableSeats} cupos libres`}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                    No hay capacidad suficiente para este servicio en la fecha
                    seleccionada.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-4 p-6">
                <h2 className="text-xl font-semibold">
                  Datos de quien reserva
                </h2>
                <div>
                  <Label>Nombre completo</Label>
                  <Input
                    required
                    minLength={2}
                    value={customer.name}
                    onChange={event =>
                      setCustomer({ ...customer, name: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Correo</Label>
                    <Input
                      type="email"
                      required
                      value={customer.email}
                      onChange={event =>
                        setCustomer({ ...customer, email: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>WhatsApp</Label>
                    <Input
                      required
                      minLength={8}
                      value={customer.phone}
                      onChange={event =>
                        setCustomer({ ...customer, phone: event.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="border-t pt-4">
                  <CustomerAcquisitionFields idPrefix="sauna" value={acquisition} onChange={setAcquisition} />
                </div>
              </CardContent>
            </Card>
          </div>
          <aside>
            <Card className="sticky top-5 overflow-hidden border-0 shadow-xl">
              <div className="bg-[#6f4b21] p-6 text-white">
                <p className="text-xs uppercase tracking-[.25em] text-white/70">
                  Tu reserva
                </p>
                <h2 className="mt-2 font-serif text-2xl">{service.name}</h2>
              </div>
              <CardContent className="space-y-5 p-6">
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{clp.format(service.priceClp)}</span>
                </div>
                <div className="space-y-2 border-t pt-4">
                  <Label htmlFor="sauna-gift-card">Pagar con Gift Card</Label>
                  <div className="flex gap-2">
                    <Input
                      id="sauna-gift-card"
                      value={giftCardCode}
                      onChange={event => {
                        setGiftCardCode(event.target.value.toUpperCase());
                        setAppliedGiftCard(null);
                      }}
                      placeholder="Código de Gift Card"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !giftCardCode.trim() || validateGiftCard.isPending
                      }
                      onClick={() =>
                        validateGiftCard.mutate({
                          code: giftCardCode,
                          serviceKey: "sauna",
                          totalClp: service.priceClp,
                        })
                      }
                    >
                      {validateGiftCard.isPending ? "Validando…" : "Aplicar"}
                    </Button>
                  </div>
                  {appliedGiftCard && (
                    <p className="text-xs text-emerald-700">
                      Gift Card aplicada
                      {appliedGiftCard.mode === "amount"
                        ? ` · saldo restante ${clp.format(appliedGiftCard.balanceAfter)}`
                        : " · servicio cubierto"}
                    </p>
                  )}
                </div>
                <ul className="space-y-2 text-sm text-stone-600">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-700" />1 hora de
                    Sauna Nativo
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-700" />
                    Aforo máximo de 6 personas
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    {appliedGiftCard
                      ? "Reserva cubierta con Gift Card"
                      : "Pago seguro con Transbank Webpay Plus"}
                  </li>
                </ul>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox
                    checked={accepted}
                    onCheckedChange={value => setAccepted(value === true)}
                  />
                  <span>
                    Acepto las políticas: reserva con al menos{" "}
                    {policies?.bookingLeadHours ?? 2} horas de anticipación,
                    cancelación con {policies?.cancellationHours ?? 72} horas,
                    reagendamiento con {policies?.rescheduleHours ?? 48} horas y
                    máximo {policies?.maxReschedules ?? 2} cambios.{" "}
                    {service.kind === "private"
                      ? "Esta compra bloquea inmediatamente los 6 cupos del sauna."
                      : "Entiendo que el servicio es público y puedo compartir con personas de otras reservas."}
                  </span>
                </label>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-amber-800 hover:bg-amber-900"
                  disabled={payment.isPending || !startTime}
                >
                  {payment.isPending
                    ? appliedGiftCard
                      ? "Confirmando reserva…"
                      : "Conectando con Webpay…"
                    : appliedGiftCard
                      ? "Confirmar con Gift Card"
                      : `Pagar ${clp.format(service.priceClp)}`}
                </Button>
                <p className="text-center text-xs text-stone-500">
                  {appliedGiftCard
                    ? "La Gift Card se descontará al confirmar la reserva."
                    : "Los cupos quedan reservados durante 30 minutos mientras completas el pago."}
                </p>
              </CardContent>
            </Card>
          </aside>
        </form>
      </section>
    </main>
  );
}
