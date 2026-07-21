import { useState } from "react";
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

const getDurations = (t: any): number[] =>
  (t.durations ?? "").split(",").map((d: string) => Number(d.trim())).filter(Boolean).sort((a: number, b: number) => a - b);

const getPriceForDuration = (t: any, dur: number): number | null => {
  const durs = getDurations(t);
  const idx = durs.indexOf(dur);
  const vals = [t.price50min, t.price80min, t.price110min];
  return vals[idx] ? Number(vals[idx]) : null;
};

const today = new Date().toISOString().split("T")[0];

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
  const routeTechniqueId = Number(id);
  const [techniqueId, setTechniqueId] = useState(routeTechniqueId);

  const [duration, setDuration] = useState<number | null>(null);
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
    { date, duration: duration ?? 0, techniqueId },
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
    if (cart.length >= 4) { toast.error("Puedes comprar hasta 4 masajes por vez"); return; }
    const price = getPriceForDuration(selectedTechnique, duration);
    if (!price) { toast.error("Este masaje no tiene precio configurado"); return; }
    setCart((current) => [...current, {
      techniqueId, techniqueName: selectedTechnique.name, duration,
      bookingDate: date, startTime: slot.time, price, notes: notes.trim() || undefined,
    }]);
    setSlot(null);
    setNotes("");
    setDisclaimerAccepted(false);
    toast.success("Masaje agregado al carrito");
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
  const allInfoFilled = cart.length > 0 && name.trim();

  return (
    <div className="min-h-screen bg-stone-50 pb-16">
      <div className="bg-white border-b px-4 py-4 text-center">
        <p className="text-xs text-muted-foreground tracking-widest uppercase">Cancagua Spa</p>
        <h1 className="text-xl font-semibold mt-0.5">Agendar masaje</h1>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-3 mt-2">

        {/* Técnica */}
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

        {/* 1. Duración */}
        <div className="bg-white rounded-2xl border p-5 space-y-3">
          <p className="text-sm font-medium">1. Elige la duración</p>
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
        </div>

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
              <Button className="w-full rounded-xl bg-teal-600 hover:bg-teal-700" onClick={handleAddToCart} disabled={cart.length >= 4}>
                <Plus className="w-4 h-4 mr-2" />{cart.length >= 4 ? "Carrito completo" : "Agregar al carrito"}
              </Button>
            )}
          </div>
        )}

        {cart.length > 0 && (
          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2"><ShoppingCart className="w-4 h-4" />Carrito ({cart.length}/4)</p>
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
            {cart.length < 4 && <p className="text-xs text-muted-foreground">Puedes agregar {4 - cart.length} masaje{4 - cart.length === 1 ? "" : "s"} más, incluso en el mismo horario.</p>}
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">Dos o más masajes en el mismo horario requieren al menos 2 horas de anticipación y disponibilidad de terapeutas y salas.</p>
          </div>
        )}

        {/* 4. Datos cliente */}
        {cart.length > 0 && (
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
