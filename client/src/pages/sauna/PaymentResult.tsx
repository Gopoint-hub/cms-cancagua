import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default function SaunaPaymentResult() {
  const orderToken =
    new URLSearchParams(window.location.search).get("order") || "";
  const query = trpc.sauna.public.paymentStatus.useQuery(
    { orderToken },
    {
      enabled: orderToken.length >= 20,
      refetchInterval: data =>
        ["payment_pending", "initiating"].includes(
          data.state.data?.status ?? ""
        )
          ? 2500
          : false,
    }
  );
  const paid = query.data?.status === "paid";
  const pending =
    query.data?.status === "payment_pending" ||
    query.data?.status === "initiating";
  const refunded = query.data?.status === "refunded";
  const manualReview = query.data?.status === "manual_review";
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f1e9] px-4 py-12">
      <Card className="w-full max-w-xl border-0 shadow-xl">
        <CardContent className="space-y-5 p-8 text-center">
          {query.isLoading ? (
            <>
              <Clock3 className="mx-auto h-14 w-14 animate-pulse text-amber-700" />
              <h1 className="font-serif text-3xl">Confirmando tu reserva…</h1>
            </>
          ) : paid ? (
            <>
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
              <h1 className="font-serif text-3xl">¡Sauna confirmado!</h1>
              <p className="text-stone-600">
                Tu pago de {clp.format(query.data?.totalClp ?? 0)} fue aprobado.
                Enviamos la confirmación a {query.data?.clientEmail}.
              </p>
              <div className="rounded-xl bg-emerald-50 p-4 text-emerald-900">
                <strong>Reserva {query.data?.bookingCode}</strong>
                <br />
                {query.data?.date} · {query.data?.startTime} ·{" "}
                {query.data?.isPrivate
                  ? "Privado"
                  : `${query.data?.guests} cupos compartidos`}
              </div>
            </>
          ) : pending ? (
            <>
              <Clock3 className="mx-auto h-16 w-16 text-amber-600" />
              <h1 className="font-serif text-3xl">
                Estamos verificando tu pago
              </h1>
              <p className="text-stone-600">
                No cierres esta página; puede tardar unos segundos.
              </p>
            </>
          ) : refunded ? (
            <>
              <XCircle className="mx-auto h-16 w-16 text-amber-600" />
              <h1 className="font-serif text-3xl">Pago reembolsado</h1>
              <p className="text-stone-600">
                El horario dejó de estar disponible antes de completar la
                reserva. Solicitamos automáticamente la devolución de{" "}
                {clp.format(query.data?.totalClp ?? 0)} a tu medio de pago.
              </p>
            </>
          ) : manualReview ? (
            <>
              <Clock3 className="mx-auto h-16 w-16 text-amber-600" />
              <h1 className="font-serif text-3xl">Pago en revisión</h1>
              <p className="text-stone-600">
                No vuelvas a pagar. Nuestro equipo debe conciliar esta
                transacción y se comunicará contigo.
              </p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto h-16 w-16 text-red-600" />
              <h1 className="font-serif text-3xl">La reserva no se completó</h1>
              <p className="text-stone-600">
                Los cupos temporales serán liberados y puedes volver a
                intentarlo.
              </p>
            </>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild>
              <a href="/reservar/sauna">Nueva reserva</a>
            </Button>
            <Button asChild variant="outline">
              <a href="https://cancagua.cl">Volver a Cancagua</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
