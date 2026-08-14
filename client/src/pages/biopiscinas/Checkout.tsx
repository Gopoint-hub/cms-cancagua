import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, Clock, Minus, Plus, ShieldCheck, Waves } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

function Counter({ value, onChange, min = 0, max = 40 }: { value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return <div className="flex items-center gap-3 rounded-full border bg-white p-1">
    <Button type="button" size="icon" variant="ghost" className="rounded-full" disabled={value <= min} onClick={() => onChange(value - 1)}><Minus className="h-4 w-4" /></Button>
    <span className="w-8 text-center font-semibold">{value}</span>
    <Button type="button" size="icon" variant="ghost" className="rounded-full" disabled={value >= max} onClick={() => onChange(value + 1)}><Plus className="h-4 w-4" /></Button>
  </div>;
}

export default function BiopoolCheckout() {
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [appliedGiftCard, setAppliedGiftCard] = useState<{ code: string; mode: "amount" | "service"; balanceAfter: number } | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    discountTotal: number;
    finalTotal: number;
  } | null>(null);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "+56" });
  const catalog = trpc.biopools.public.catalog.useQuery();
  const service = catalog.data?.service;
  const totalGuests = adults + children;
  const availability = trpc.biopools.public.availability.useQuery(
    { serviceId: service?.id ?? 0, date, guestCount: totalGuests },
    { enabled: Boolean(service && date), refetchInterval: 30_000 }
  );
  const adultTicket = catalog.data?.tickets.find(ticket => ticket.code === "adult");
  const childTicket = catalog.data?.tickets.find(ticket => ticket.code === "child");
  const subtotal = adults * (adultTicket?.priceClp ?? 0) + children * (childTicket?.priceClp ?? 0);
  const total = appliedDiscount?.finalTotal ?? subtotal;
  const slots = useMemo(() => availability.data?.slots ?? [], [availability.data]);
  useEffect(() => {
    // Mantener la selección durante los refrescos de cupos. Un estado vacío
    // transitorio no debe reemplazar el horario elegido por el primer slot.
    if (!availability.isSuccess || availability.isFetching) return;
    if (!slots.some(slot => slot.startTime === startTime)) setStartTime(slots[0]?.startTime ?? "");
  }, [availability.isFetching, availability.isSuccess, slots, startTime]);
  const startPayment = trpc.biopools.public.startPayment.useMutation({
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
  const validateDiscount = trpc.biopools.public.validateDiscount.useMutation({
    onSuccess: result => {
      setAppliedDiscount(result);
      setAppliedGiftCard(null);
      setDiscountCode(result.code);
      toast.success(`Código ${result.code} aplicado`);
    },
    onError: error => {
      setAppliedDiscount(null);
      toast.error(error.message);
    },
  });
  const validateGiftCard = trpc.giftCards.validateForService.useMutation({
    onSuccess: result => { setAppliedGiftCard(result); setGiftCardCode(result.code); toast.success(`Gift Card ${result.code} aplicada`); },
    onError: error => { setAppliedGiftCard(null); toast.error(error.message); },
  });
  useEffect(() => {
    setAppliedDiscount(null);
    setAppliedGiftCard(null);
  }, [service?.id, adults, children]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (availability.isFetching) return toast.error("Estamos confirmando la disponibilidad del horario elegido");
    if (!service || !startTime) return toast.error("Selecciona una fecha y un horario disponible");
    if (!accepted) return toast.error("Debes aceptar las condiciones del servicio");
    const params = new URLSearchParams(window.location.search);
    startPayment.mutate({
      serviceId: service.id,
      clientName: customer.name,
      clientEmail: customer.email,
      clientPhone: customer.phone,
      bookingDate: date,
      startTime,
      adultQuantity: adults,
      childQuantity: children,
      discountCode: appliedDiscount?.code,
      giftCardCode: appliedGiftCard?.code,
      acceptedTerms: true,
      utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
    });
  };

  if (catalog.isLoading) return <main className="min-h-screen grid place-items-center bg-[#f5f1e9]"><p>Cargando Biopiscinas…</p></main>;
  if (catalog.error || !service) return <main className="min-h-screen grid place-items-center bg-[#f5f1e9]"><p className="text-red-700">Biopiscinas no está disponible en este momento.</p></main>;

  return <main className="min-h-screen bg-[#f5f1e9] text-stone-800">
    <header className="border-b border-stone-200 bg-white/90 px-5 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <a href="https://cancagua.cl/servicios/biopiscinas" className="flex items-center gap-2 text-sm text-stone-600"><ChevronLeft className="h-4 w-4" /> Volver a Cancagua</a>
        <span className="font-serif text-xl tracking-widest">CANCAGUA</span>
      </div>
    </header>
    <section className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 text-center"><p className="text-xs uppercase tracking-[.32em] text-[#536481]">Reserva online</p><h1 className="mt-2 font-serif text-4xl">{service.name}</h1><p className="mx-auto mt-3 max-w-2xl text-stone-600">Elige cuántas personas asistirán, tu horario de ingreso y paga de forma segura con Webpay Plus.</p></div>
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card><CardContent className="space-y-5 p-6"><h2 className="flex items-center gap-2 text-xl font-semibold"><Waves className="text-cyan-700" /> Entradas</h2>
            <div className="flex items-center justify-between rounded-2xl bg-stone-50 p-4"><div><p className="font-medium">{adultTicket?.name}</p><p className="text-sm text-stone-500">Desde 13 años · {clp.format(adultTicket?.priceClp ?? 0)}</p></div><Counter value={adults} min={1} onChange={setAdults} /></div>
            <div className="flex items-center justify-between rounded-2xl bg-stone-50 p-4"><div><p className="font-medium">{childTicket?.name}</p><p className="text-sm text-stone-500">5 a 12 años · debe asistir con un adulto · {clp.format(childTicket?.priceClp ?? 0)}</p></div><Counter value={children} max={Math.max(0, 40 - adults)} onChange={setChildren} /></div>
          </CardContent></Card>
          <Card><CardContent className="space-y-5 p-6"><h2 className="flex items-center gap-2 text-xl font-semibold"><CalendarDays className="text-[#536481]" /> Fecha y hora de ingreso</h2>
            <div className="max-w-xs"><Label htmlFor="date">Fecha</Label><Input id="date" type="date" min={today()} value={date} onChange={event => setDate(event.target.value)} /></div>
            {availability.isLoading ? <p className="text-sm text-stone-500">Consultando disponibilidad…</p> : slots.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{slots.map(slot => <button type="button" key={slot.startTime} onClick={() => setStartTime(slot.startTime)} className={`rounded-xl border p-3 text-left transition ${startTime === slot.startTime ? "border-[#536481] bg-[#536481] text-white" : "bg-white hover:border-[#536481]"}`}><span className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4" />{slot.startTime}</span><span className={`mt-1 block text-xs ${startTime === slot.startTime ? "text-white/80" : "text-stone-500"}`}>hasta {slot.endTime}</span></button>)}</div> : <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No hay horarios disponibles para esta cantidad de personas en la fecha seleccionada.</p>}
          </CardContent></Card>
          <Card><CardContent className="space-y-4 p-6"><h2 className="text-xl font-semibold">Datos de quien reserva</h2>
            <div><Label htmlFor="name">Nombre completo</Label><Input id="name" required minLength={2} value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="email">Correo</Label><Input id="email" type="email" required value={customer.email} onChange={event => setCustomer({ ...customer, email: event.target.value })} /></div><div><Label htmlFor="phone">WhatsApp</Label><Input id="phone" type="tel" required minLength={8} value={customer.phone} onChange={event => setCustomer({ ...customer, phone: event.target.value })} /></div></div>
          </CardContent></Card>
        </div>
        <aside><Card className="sticky top-5 overflow-hidden border-0 shadow-xl"><div className="bg-[#314d57] p-6 text-white"><p className="text-xs uppercase tracking-[.25em] text-white/70">Tu reserva</p><h2 className="mt-2 font-serif text-2xl">Biopiscinas</h2></div><CardContent className="space-y-5 p-6">
          <div className="space-y-3 text-sm"><div className="flex justify-between"><span>{adults} × Adulto</span><span>{clp.format(adults * (adultTicket?.priceClp ?? 0))}</span></div>{children > 0 && <div className="flex justify-between"><span>{children} × Niño</span><span>{clp.format(children * (childTicket?.priceClp ?? 0))}</span></div>}
            {date && startTime && <div className="flex justify-between rounded-lg bg-stone-100 px-3 py-2"><span>Fecha y hora elegidas</span><strong>{date} · {startTime}</strong></div>}
            <div className="border-t pt-3 space-y-2">
              <Label htmlFor="biopool-discount">Aplicar código de descuento</Label>
              <div className="flex gap-2">
                <Input id="biopool-discount" value={discountCode} onChange={event => { setDiscountCode(event.target.value.toUpperCase()); setAppliedDiscount(null); setAppliedGiftCard(null); }} placeholder="Ingresa tu código" />
                <Button type="button" variant="outline" disabled={!discountCode.trim() || validateDiscount.isPending} onClick={() => service && validateDiscount.mutate({ serviceId: service.id, adultQuantity: adults, childQuantity: children, code: discountCode })}>
                  {validateDiscount.isPending ? "Validando…" : "Aplicar"}
                </Button>
              </div>
            </div>
            <div className="border-t pt-3 space-y-2"><Label htmlFor="biopool-gift-card">Pagar con Gift Card</Label><div className="flex gap-2"><Input id="biopool-gift-card" value={giftCardCode} onChange={event => { setGiftCardCode(event.target.value.toUpperCase()); setAppliedGiftCard(null); }} placeholder="Código de Gift Card" /><Button type="button" variant="outline" disabled={!giftCardCode.trim() || total <= 0 || validateGiftCard.isPending} onClick={() => validateGiftCard.mutate({ code: giftCardCode, serviceKey: "biopools", totalClp: total })}>{validateGiftCard.isPending ? "Validando…" : "Aplicar"}</Button></div>{appliedGiftCard && <p className="text-xs text-emerald-700">Gift Card aplicada{appliedGiftCard.mode === "amount" ? ` · saldo restante ${clp.format(appliedGiftCard.balanceAfter)}` : " · servicio cubierto"}</p>}</div>
            <div className="border-t pt-3 flex justify-between"><span>Subtotal</span><span className={appliedDiscount ? "line-through text-stone-500" : ""}>{clp.format(subtotal)}</span></div>
            {appliedDiscount && <div className="flex justify-between text-emerald-700"><span>Descuento {appliedDiscount.code}</span><span>−{clp.format(appliedDiscount.discountTotal)}</span></div>}
            <div className="text-base font-semibold flex justify-between"><span>Total</span><span>{clp.format(total)}</span></div>
          </div>
          <ul className="space-y-2 text-sm text-stone-600"><li className="flex gap-2"><Check className="h-4 w-4 text-emerald-700" /> Estadía de 4 horas (3,5 h al ingresar a las 18:00)</li><li className="flex gap-2"><Check className="h-4 w-4 text-emerald-700" /> Bata o toalla, gorra y locker</li><li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-emerald-700" /> {appliedGiftCard ? "Reserva cubierta con Gift Card" : total === 0 ? "Reserva liberada con código de descuento" : "Pago seguro con Transbank Webpay Plus"}</li></ul>
          <label className="flex cursor-pointer items-start gap-3 text-sm"><Checkbox checked={accepted} onCheckedChange={value => setAccepted(value === true)} /><span>Acepto las <a className="underline" href={service.rulesUrl || "#"} target="_blank" rel="noreferrer">condiciones y reglamento</a>. Entiendo que los niños deben asistir con un adulto.</span></label>
          <Button type="submit" size="lg" className="w-full bg-[#536481] hover:bg-[#43526a]" disabled={availability.isFetching || startPayment.isPending || !startTime}>{availability.isFetching ? "Confirmando horario…" : startPayment.isPending ? (total === 0 || appliedGiftCard ? "Confirmando reserva…" : "Conectando con Webpay…") : appliedGiftCard ? "Confirmar con Gift Card" : (total === 0 ? "Confirmar reserva por $0" : `Pagar ${clp.format(total)}`)}</Button>
          <p className="text-center text-xs text-stone-500">{appliedGiftCard ? "La Gift Card se descontará al confirmar la reserva." : total === 0 ? "No se abrirá Transbank ni se realizará ningún cobro." : "Tus cupos se reservarán por 30 minutos mientras completas el pago."}</p>
        </CardContent></Card></aside>
      </form>
    </section>
  </main>;
}
