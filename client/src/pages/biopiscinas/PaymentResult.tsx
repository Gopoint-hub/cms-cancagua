import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export default function BiopoolPaymentResult() {
  const params = new URLSearchParams(window.location.search);
  const orderToken = params.get("order") || "";
  const query = trpc.biopools.public.paymentStatus.useQuery(
    { orderToken },
    { enabled: orderToken.length >= 20, refetchInterval: data => data.state.data?.status === "payment_pending" ? 2500 : false }
  );
  const paid = query.data?.status === "paid";
  const fullyDiscounted = paid && query.data?.totalClp === 0 && Boolean(query.data?.discountCode);
  const pending = query.data?.status === "payment_pending" || query.data?.status === "initiating";
  return <main className="min-h-screen bg-[#f5f1e9] px-4 py-12 grid place-items-center"><Card className="w-full max-w-xl border-0 shadow-xl"><CardContent className="p-8 text-center space-y-5">
    {query.isLoading ? <><Clock3 className="mx-auto h-14 w-14 animate-pulse text-[#536481]" /><h1 className="font-serif text-3xl">Confirmando tu reserva…</h1></> : paid ? <><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" /><h1 className="font-serif text-3xl">¡Reserva confirmada!</h1><p className="text-stone-600">{fullyDiscounted ? <>El código <strong>{query.data?.discountCode}</strong> cubrió el 100% del servicio. No se realizó ningún cobro.</> : <>Tu pago de {clp.format(query.data?.totalClp ?? 0)} fue aprobado.</>} Enviamos la confirmación a {query.data?.clientEmail}.</p><div className="rounded-xl bg-emerald-50 p-4 text-emerald-900"><strong>Reserva {query.data?.bookingCode}</strong><br />{query.data?.date} · ingreso {query.data?.startTime}</div></> : pending ? <><Clock3 className="mx-auto h-16 w-16 text-amber-600" /><h1 className="font-serif text-3xl">Estamos verificando tu reserva</h1><p className="text-stone-600">No cierres esta página. La confirmación puede tardar unos segundos.</p></> : <><XCircle className="mx-auto h-16 w-16 text-red-600" /><h1 className="font-serif text-3xl">La reserva no se completó</h1><p className="text-stone-600">No se generó una reserva ni se realizó un cobro confirmado. Puedes intentarlo nuevamente.</p></>}
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-center"><Button asChild><a href="/reservar/biopiscinas">Nueva reserva</a></Button><Button asChild variant="outline"><a href="https://cancagua.cl">Volver a Cancagua</a></Button></div>
  </CardContent></Card></main>;
}
