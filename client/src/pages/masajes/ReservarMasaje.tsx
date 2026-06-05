import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CheckCircle, Calendar, Clock, User, ShieldAlert, Check } from "lucide-react";
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

export default function ReservarMasaje() {
  const { id } = useParams<{ id: string }>();
  const techniqueId = Number(id);

  const [duration, setDuration] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<{ time: string } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [subscribeNewsletter, setSubscribeNewsletter] = useState(false);
  const [done, setDone] = useState(false);
  const [bookedInfo, setBookedInfo] = useState<any>(null);

  const { data: technique, isLoading } = trpc.masajes.public.getTechnique.useQuery(
    { id: techniqueId },
    { enabled: !isNaN(techniqueId) }
  );

  const { data: disclaimer } = trpc.masajes.config.getDisclaimer.useQuery();

  const { data: slots, isLoading: loadingSlots } = trpc.masajes.public.getSlots.useQuery(
    { date, duration: duration ?? 0, techniqueId },
    { enabled: !!date && !!duration && !isNaN(techniqueId) }
  );

  const bookMut = trpc.masajes.public.book.useMutation({
    onSuccess: () => {
      setBookedInfo({ name, date, time: slot?.time, duration, technique: technique?.name });
      setDone(true);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!duration || !date || !slot || !name.trim()) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    if (!disclaimerAccepted) { toast.error("Debes aceptar la exención de responsabilidad"); return; }
    if (!termsAccepted) { toast.error("Debes aceptar los Términos y Condiciones"); return; }
    bookMut.mutate({
      techniqueId,
      duration,
      bookingDate: date,
      startTime: slot.time,
      clientName: name.trim(),
      clientPhone: phone.trim() || undefined,
      clientEmail: email.trim() || undefined,
      notes: notes.trim() || undefined,
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

  if (!technique) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <p className="text-lg font-medium text-muted-foreground">Este servicio no está disponible.</p>
    </div>
  );

  const durs = getDurations(technique);

  if (done && bookedInfo) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border p-8 w-full max-w-md text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-teal-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">¡Reserva recibida!</h2>
          <p className="text-muted-foreground text-sm mt-1">Te contactaremos para confirmar tu hora y el pago.</p>
        </div>
        <div className="bg-stone-50 rounded-xl p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Servicio</span><span className="font-medium">{bookedInfo.technique}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Duración</span><span className="font-medium">{bookedInfo.duration} min</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Fecha</span><span className="font-medium capitalize">{format(new Date(bookedInfo.date + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es })}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Hora</span><span className="font-medium">{bookedInfo.time} hrs</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Nombre</span><span className="font-medium">{bookedInfo.name}</span></div>
        </div>
        <p className="text-xs text-muted-foreground">Cancagua Spa · Frutillar, Chile</p>
      </div>
    </div>
  );

  const allInfoFilled = slot && name.trim();

  return (
    <div className="min-h-screen bg-stone-50 pb-16">
      <div className="bg-white border-b px-4 py-4 text-center">
        <p className="text-xs text-muted-foreground tracking-widest uppercase">Cancagua Spa</p>
        <h1 className="text-xl font-semibold mt-0.5">Agendar masaje</h1>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-3 mt-2">

        {/* Técnica */}
        <div className="bg-white rounded-2xl border p-5 space-y-1.5">
          <h2 className="text-lg font-semibold">{technique.name}</h2>
          {technique.description && <p className="text-sm text-muted-foreground">{technique.description}</p>}
        </div>

        {/* 1. Duración */}
        <div className="bg-white rounded-2xl border p-5 space-y-3">
          <p className="text-sm font-medium">1. Elige la duración</p>
          <div className="flex gap-2 flex-wrap">
            {durs.map((d) => {
              const price = getPriceForDuration(technique, d);
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
              <p className="text-sm text-muted-foreground">No hay disponibilidad para esta fecha. Prueba otra fecha.</p>
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
          </div>
        )}

        {/* 4. Datos cliente */}
        {slot && (
          <div className="bg-white rounded-2xl border p-5 space-y-3">
            <p className="text-sm font-medium flex items-center gap-1.5"><User className="w-4 h-4" />4. Tus datos</p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Nombre completo *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="María González" className="mt-1 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Teléfono</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+56 9 ..." className="mt-1 rounded-xl" />
                </div>
                <div>
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

        {/* 6. Checkboxes + resumen + confirmar */}
        {allInfoFilled && disclaimerAccepted && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border p-5 space-y-3">
              {/* T&C — visualmente obligatorio */}
              <label className="flex items-start gap-3 cursor-pointer">
                <div onClick={() => setTermsAccepted(!termsAccepted)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${termsAccepted ? "bg-teal-600 border-teal-600" : "border-red-400 bg-red-50"}`}>
                  {termsAccepted && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm text-stone-700" onClick={() => setTermsAccepted(!termsAccepted)}>
                  He leído y acepto los <span className="text-teal-600 underline">Términos y Condiciones</span>
                  <span className="text-red-500 ml-0.5">*</span>
                </span>
              </label>

              {/* Newsletter — opcional */}
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
              <div className="flex justify-between">
                <span className="text-teal-700">Servicio</span>
                <span className="font-medium text-teal-900">{technique.name} · {duration} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-teal-700">Fecha y hora</span>
                <span className="font-medium text-teal-900 capitalize">
                  {format(new Date(date + "T12:00:00"), "d MMM", { locale: es })} · {slot.time} hrs
                </span>
              </div>
              {getPriceForDuration(technique, duration!) && (
                <div className="flex justify-between border-t border-teal-200 pt-2 mt-1">
                  <span className="text-teal-700 font-medium">Total</span>
                  <span className="font-bold text-teal-900">${getPriceForDuration(technique, duration!)!.toLocaleString("es-CL")}</span>
                </div>
              )}
            </div>

            <Button
              className="w-full h-12 text-base rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
              onClick={handleSubmit}
              disabled={bookMut.isPending || !termsAccepted}
            >
              {bookMut.isPending ? "Enviando reserva..." : "Confirmar reserva"}
            </Button>
            {!termsAccepted && (
              <p className="text-xs text-center text-red-500">Debes aceptar los Términos y Condiciones para continuar.</p>
            )}
            <p className="text-xs text-center text-muted-foreground">Tu reserva queda pendiente de confirmación por nuestro equipo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
