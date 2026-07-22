import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Calendar, Clock, User, ShieldAlert, Check, ShoppingCart, Trash2, Plus } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const getDurations = (t: any): number[] => {
  const durations = Array.isArray(t.durations)
    ? t.durations
    : String(t.durations ?? "").split(",");
  return durations.map((duration: string | number) => Number(duration)).filter(Boolean).sort((a: number, b: number) => a - b);
};

const getPriceForDuration = (t: any, dur: number): number | null => {
  if (Array.isArray(t.prices)) {
    const catalogPrice = t.prices.find((item: { duration: number; price: number | null }) => item.duration === dur)?.price;
    return catalogPrice ? Number(catalogPrice) : null;
  }
  const durs = getDurations(t);
  const idx = durs.indexOf(dur);
  const vals = [t.price50min, t.price80min, t.price110min];
  return vals[idx] ? Number(vals[idx]) : null;
};

const today = new Date().toISOString().split("T")[0];

type CartSelection = { techniqueId: number; duration: number; quantity: number };

const readCartSelections = (): CartSelection[] => {
  if (typeof window === "undefined") return [];
  const raw = new URLSearchParams(window.location.search).get("cart");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        techniqueId: Number(item.techniqueId),
        duration: Number(item.duration),
        quantity: Math.min(4, Math.max(1, Number(item.quantity) || 1)),
      }))
      .filter((item) => Number.isFinite(item.techniqueId) && item.techniqueId > 0 && Number.isFinite(item.duration) && item.duration > 0);
  } catch {
    return [];
  }
};

const exceedsSimultaneousLimit = (items: Array<{ bookingDate: string; startTime: string; duration: number }>) => {
  const byDate = new Map<string, Array<{ minute: number; delta: number }>>();
  for (const item of items) {
    const [hour, minute] = item.startTime.split(":").map(Number);
    const start = hour * 60 + minute;
    const events = byDate.get(item.bookingDate) ?? [];
    events.push({ minute: start, delta: 1 }, { minute: start + item.duration, delta: -1 });
    byDate.set(item.bookingDate, events);
  }
  for (const events of Array.from(byDate.values())) {
    let simultaneous = 0;
    events.sort((a, b) => a.minute - b.minute || a.delta - b.delta);
    for (const event of events) {
      simultaneous += event.delta;
      if (simultaneous > 4) return true;
    }
  }
  return false;
};

const countryCodes = [
  { value: "56", label: "+56 Chile" },
  { value: "54", label: "+54 Argentina" },
  { value: "51", label: "+51 Perú" },
  { value: "55", label: "+55 Brasil" },
  { value: "57", label: "+57 Colombia" },
  { value: "52", label: "+52 México" },
  { value: "1", label: "+1 EE.UU." },
  { value: "598", label: "+598 Uruguay" },
  { value: "595", label: "+595 Paraguay" },
  { value: "591", label: "+591 Bolivia" },
  { value: "34", label: "+34 España" },
];

const buildInternationalPhone = (countryCode: string, phone: string): string | undefined => {
  const trimmed = phone.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("+") || trimmed.startsWith("00")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return undefined;
  return `+${countryCode}${digits}`;
};

export default function ReservarMasaje() {
  const { id } = useParams<{ id: string }>();
  const initialSelections = useMemo(readCartSelections, []);
  const hasPresetCart = initialSelections.length > 0;
  const firstSelection = initialSelections[0];
  const routeTechniqueId = Number(id ?? firstSelection?.techniqueId);
  const [pendingSelections, setPendingSelections] = useState<CartSelection[]>(initialSelections);
  const [techniqueId, setTechniqueId] = useState(firstSelection?.techniqueId ?? routeTechniqueId);

  const [duration, setDuration] = useState<number | null>(firstSelection?.duration ?? null);
  const [quantity, setQuantity] = useState(firstSelection?.quantity ?? 1);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<{ time: string } | null>(null);
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("56");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [subscribeNewsletter, setSubscribeNewsletter] = useState(false);
  const [cart, setCart] = useState<Array<{
    techniqueId: number; techniqueName: string; duration: number; bookingDate: string;
    startTime: string; price: number; notes?: string;
  }>>([]);

  const { data: catalog, isLoading } = trpc.masajes.public.getCatalog.useQuery();
  const technique = catalog?.find((item) => item.id === techniqueId);

  const { data: fallbackTechnique } = trpc.masajes.public.getTechnique.useQuery(
    { id: routeTechniqueId },
    { enabled: !catalog && !isNaN(routeTechniqueId) }
  );
  const selectedTechnique = technique ?? fallbackTechnique;

  const { data: disclaimer } = trpc.masajes.config.getDisclaimer.useQuery();

  const { data: slots, isLoading: loadingSlots } = trpc.masajes.public.getSlots.useQuery(
    { date, duration: duration ?? 0, techniqueId, quantity },
    { enabled: !!date && !!duration && !isNaN(techniqueId) }
  );

  const initPaymentMut = trpc.masajes.public.initCartPayment.useMutation({
    onSuccess: (data) => {
      window.location.href = data.processUrl;
    },
    onError: (e) => toast.error(e.message ?? "Error al iniciar el pago. Intenta de nuevo."),
  });

  const handleAddToCart = () => {
    if (!duration || !date || !slot || !selectedTechnique) {
      toast.error("Elige duración, fecha y horario");
      return;
    }
    const price = getPriceForDuration(selectedTechnique, duration);
    if (!price) { toast.error("Este masaje no tiene precio configurado"); return; }
    const newItems = Array.from({ length: quantity }, () => ({
      techniqueId, techniqueName: selectedTechnique.name, duration,
      bookingDate: date, startTime: slot.time, price, notes: notes.trim() || undefined,
    }));
    if (exceedsSimultaneousLimit([...cart, ...newItems])) {
      toast.error("Puedes agendar un máximo de 4 masajes simultáneos. Elige otro horario para este grupo.");
      return;
    }
    setCart((current) => [...current, ...newItems]);
    if (hasPresetCart) {
      const nextPending = pendingSelections.slice(1);
      setPendingSelections(nextPending);
      const next = nextPending[0];
      if (next) {
        setTechniqueId(next.techniqueId);
        setDuration(next.duration);
        setQuantity(next.quantity);
      }
    }
    setDate("");
    setSlot(null);
    setNotes("");
    setDisclaimerAccepted(false);
    toast.success(`${quantity} masaje${quantity === 1 ? "" : "s"} agendado${quantity === 1 ? "" : "s"}`);
  };

  const handleSubmit = () => {
    if (cart.length === 0 || !name.trim()) {
      toast.error("Agrega al menos un masaje y completa tus datos");
      return;
    }
    if (!disclaimerAccepted) { toast.error("Debes aceptar la exención de responsabilidad"); return; }
    if (!termsAccepted) { toast.error("Debes aceptar los Términos y Condiciones"); return; }

    initPaymentMut.mutate({
      items: cart.map(({ techniqueId, duration, bookingDate, startTime, notes }) => ({
        techniqueId, duration, bookingDate, startTime, notes,
      })),
      clientName: name.trim(),
      clientPhone: buildInternationalPhone(countryCode, phone),
      clientEmail: email.trim() || undefined,
      subscribeNewsletter: subscribeNewsletter || undefined,
    });
  };

  if (isLoading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="w-full max-w-md p-6 space-y-4">
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    </div>
  );

  if (!selectedTechnique) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <p className="text-lg font-medium text-muted-foreground">Este servicio no está disponible.</p>
    </div>
  );

  const durs = getDurations(selectedTechnique);
  const allSelectionsScheduled = !hasPresetCart || pendingSelections.length === 0;
  const allInfoFilled = cart.length > 0 && allSelectionsScheduled && name.trim();

  return (
    <div className="min-h-screen bg-stone-50 pb-16">
      <div className="bg-white border-b px-4 py-4 text-center">
        <p className="text-xs text-muted-foreground tracking-widest uppercase">Cancagua Spa</p>
        <h1 className="text-xl font-semibold mt-0.5">Agendar masaje</h1>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-3 mt-2">

        {hasPresetCart ? (
          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-teal-700">
                {pendingSelections.length > 0 ? `Faltan ${pendingSelections.length} selecciones por agendar` : "Carrito completamente agendado"}
              </p>
              <span className="text-xs text-muted-foreground">{cart.length} agendado{cart.length === 1 ? "" : "s"}</span>
            </div>
            {pendingSelections.length > 0 && (
              <div className="rounded-xl bg-teal-50 p-4">
                <p className="font-semibold text-stone-900">{selectedTechnique.name}</p>
                <p className="mt-1 text-sm text-stone-600">{duration} min · {quantity} masaje{quantity === 1 ? "" : "s"} en el mismo horario</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border p-5 space-y-1.5">
              <p className="text-sm font-medium">Elige el masaje</p>
              <Select value={String(techniqueId)} onValueChange={(value) => {
                setTechniqueId(Number(value)); setDuration(null); setDate(""); setSlot(null);
              }}>
                <SelectTrigger className="mt-2 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(catalog ?? []).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedTechnique.description && <p className="text-sm text-muted-foreground pt-2">{selectedTechnique.description}</p>}
            </div>

            <div className="bg-white rounded-2xl border p-5 space-y-3">
              <p className="text-sm font-medium">1. Elige la duración y cantidad</p>
              <div className="flex gap-2 flex-wrap">
                {durs.map((d) => {
                  const price = getPriceForDuration(selectedTechnique, d);
                  return (
                    <button key={d} onClick={() => { setDuration(d); setDate(""); setSlot(null); setDisclaimerAccepted(false); }}
                      className={`flex flex-col items-center px-5 py-3 rounded-xl border-2 transition-colors ${duration === d ? "border-teal-600 bg-teal-50 text-teal-700" : "border-stone-200 hover:border-stone-300 text-foreground"}`}>
                      <span className="font-semibold text-sm">{d} min</span>
                      {price && <span className="text-xs mt-0.5 opacity-80">${price.toLocaleString("es-CL")}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm text-muted-foreground">Cantidad simultánea</span>
                <div className="flex items-center rounded-xl border">
                  <Button type="button" size="icon" variant="ghost" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</Button>
                  <span className="w-8 text-center font-semibold">{quantity}</span>
                  <Button type="button" size="icon" variant="ghost" disabled={quantity >= 4} onClick={() => setQuantity((value) => Math.min(4, value + 1))}>+</Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 2. Fecha */}
        {duration && (
          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <p className="text-sm font-medium flex items-center gap-1.5"><Calendar className="w-4 h-4" />2. Elige la fecha</p>
            <input type="date" min={today} value={date}
              onChange={e => { setDate(e.target.value); setSlot(null); setDisclaimerAccepted(false); }}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        )}

        {/* 3. Horarios */}
        {date && duration && (
          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <p className="text-sm font-medium flex items-center gap-1.5"><Clock className="w-4 h-4" />3. Elige el horario</p>
            {loadingSlots ? (
              <div className="flex gap-2 flex-wrap">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-9 w-16 rounded-xl" />)}</div>
            ) : !slots || slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay disponibilidad para esta fecha. Prueba con otro día.</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {slots.map(s => (
                  <button key={s.time} onClick={() => { setSlot(s); setDisclaimerAccepted(false); }}
                    className={`px-3.5 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${slot?.time === s.time ? "border-teal-600 bg-teal-50 text-teal-700" : "border-stone-200 hover:border-stone-300"}`}>
                    {s.time}
                  </button>
                ))}
              </div>
            )}
            {slot && (
              <Button className="w-full rounded-xl bg-teal-600 hover:bg-teal-700" onClick={handleAddToCart}>
                <Plus className="w-4 h-4 mr-2" />Agendar {quantity} masaje{quantity === 1 ? "" : "s"} a las {slot.time}
              </Button>
            )}
          </div>
        )}

        {cart.length > 0 && (
          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2"><ShoppingCart className="w-4 h-4" />Masajes agendados ({cart.length})</p>
            {cart.map((item, index) => (
              <div key={`${item.techniqueId}-${item.bookingDate}-${item.startTime}-${index}`} className="flex items-start justify-between gap-3 border-t pt-3 first:border-0 first:pt-0">
                <div className="text-sm">
                  <p className="font-medium">{item.techniqueName} · {item.duration} min</p>
                  <p className="text-muted-foreground capitalize">{format(new Date(item.bookingDate + "T12:00:00"), "d MMM", { locale: es })} · {item.startTime} hrs</p>
                  <p className="font-medium text-teal-700">${item.price.toLocaleString("es-CL")}</p>
                </div>
                <Button size="icon" variant="ghost" className="text-red-600" onClick={() => setCart((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">Puedes combinar distintos días y horarios. El máximo es de 4 masajes que se superpongan en un mismo horario.</p>
          </div>
        )}

        {/* 4. Datos cliente */}
        {cart.length > 0 && allSelectionsScheduled && (
          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <p className="text-sm font-medium flex items-center gap-1.5"><User className="w-4 h-4" />4. Tus datos</p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Nombre completo *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="María González" className="mt-1 rounded-xl" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Teléfono</Label>
                  <div className="mt-1 grid grid-cols-[136px_1fr] gap-2">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {countryCodes.map((country) => (
                          <SelectItem key={country.value} value={country.value}>{country.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="9 1234 5678"
                      inputMode="tel"
                      autoComplete="tel"
                      className="rounded-xl"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className="mt-1 rounded-xl" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Comentarios (opcional)</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Preferencias, lesiones a considerar..." className="mt-1 rounded-xl resize-none" />
              </div>
            </div>
          </div>
        )}

        {/* 5. Exención de responsabilidad */}
        {allInfoFilled && !disclaimerAccepted && (
          <div className="bg-white rounded-2xl border border-amber-200 p-5 space-y-4">
            <p className="text-sm font-medium flex items-center gap-1.5 text-amber-700">
              <ShieldAlert className="w-4 h-4" />Exención de responsabilidad
            </p>
            <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
              {disclaimer ?? "Cargando..."}
            </p>
            <Button className="w-full h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setDisclaimerAccepted(true)}>
              <Check className="w-4 h-4 mr-2" />Acepto
            </Button>
          </div>
        )}

        {/* 6. Checkboxes + resumen + pago */}
        {allInfoFilled && disclaimerAccepted && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border p-5 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <div onClick={() => setTermsAccepted(!termsAccepted)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${termsAccepted ? "bg-teal-600 border-teal-600" : "border-red-400 bg-red-50"}`}>
                  {termsAccepted && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm text-stone-700">
                  <span onClick={() => setTermsAccepted(!termsAccepted)}>He leído y acepto los </span>
                  <a
                    href="/terminos-condiciones-masajes.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 underline"
                    onClick={e => e.stopPropagation()}
                  >Términos y Condiciones</a>
                  <span className="text-red-500 ml-0.5" onClick={() => setTermsAccepted(!termsAccepted)}>*</span>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <div onClick={() => setSubscribeNewsletter(!subscribeNewsletter)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${subscribeNewsletter ? "bg-teal-600 border-teal-600" : "border-stone-300"}`}>
                  {subscribeNewsletter && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm text-stone-700" onClick={() => setSubscribeNewsletter(!subscribeNewsletter)}>
                  Deseo recibir novedades y descuentos de Cancagua Spa
                </span>
              </label>
            </div>

            {/* Resumen */}
            <div className="bg-teal-50 rounded-2xl p-4 text-sm space-y-1.5 border border-teal-100">
              <div className="flex justify-between border-b border-teal-200 pb-2">
                <span className="text-teal-700">Servicios</span>
                <span className="font-medium text-teal-900">{cart.length} masaje{cart.length === 1 ? "" : "s"}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-teal-700 font-medium">Total</span>
                <span className="font-bold text-teal-900">${cart.reduce((sum, item) => sum + item.price, 0).toLocaleString("es-CL")}</span>
              </div>
            </div>

            <Button
              className="w-full h-12 text-base rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
              onClick={handleSubmit}
              disabled={initPaymentMut.isPending || !termsAccepted}
            >
              {initPaymentMut.isPending ? "Preparando pago..." : "Ir a pagar →"}
            </Button>
            {!termsAccepted && (
              <p className="text-xs text-center text-red-500">Debes aceptar los Términos y Condiciones para continuar.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
