import { useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  RefreshCw,
  Waves,
} from "lucide-react";
import { useParams } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

function money(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function providerLabel(provider?: string) {
  return String(provider ?? "")
    .toLowerCase()
    .includes("getnet")
    ? "Getnet"
    : "Webpay";
}

function normalizedStatus(status?: string) {
  const value = String(status ?? "pending").toLowerCase();
  if (["paid", "completed", "approved", "authorized"].includes(value))
    return "paid" as const;
  if (["expired", "cancelled", "canceled"].includes(value))
    return "expired" as const;
  if (["rejected", "failed", "error"].includes(value))
    return "rejected" as const;
  if (value === "reconciliation_required") return "reconciliation" as const;
  if (["processing", "initiated"].includes(value)) return "processing" as const;
  return "pending" as const;
}

function submitWebpay(action: string, token: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "token_ws";
  input.value = token;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

function safePaymentUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:")
    throw new Error("El proveedor entregó un enlace de pago no seguro");
  return url.toString();
}

export default function ReservationPaymentPage() {
  const { token = "" } = useParams<{ token: string }>();
  const query = trpc.reservationPaymentLinks.get.useQuery(
    { token },
    {
      enabled: Boolean(token),
      refetchInterval: 4_000,
      refetchOnWindowFocus: true,
    }
  );
  const start = trpc.reservationPaymentLinks.start.useMutation();
  const data: any = query.data;
  // El estado persistido manda sobre el parámetro de retorno. Ante una
  // respuesta ambigua la pasarela puede devolver `error`, pero el servidor
  // mantiene `processing` para impedir que el cliente pague dos veces.
  const status = normalizedStatus(data?.status);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void query.refetch();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [query.refetch]);

  const pay = async () => {
    try {
      const result: any = await start.mutateAsync({ token });
      if (result.alreadyPaid || result.status === "paid") {
        await query.refetch();
        return;
      }
      const providerUrl = result.paymentUrl ?? result.url;
      const paymentUrl = providerUrl ? safePaymentUrl(providerUrl) : "";
      if (!paymentUrl)
        throw new Error("No se recibió el enlace del medio de pago");
      const webpayToken =
        result.tokenWs ?? result.webpayToken ?? result.token_ws ?? result.token;
      if (
        String(result.provider ?? data?.provider)
          .toLowerCase()
          .includes("webpay") &&
        webpayToken
      ) {
        submitWebpay(paymentUrl, webpayToken);
        return;
      }
      window.location.assign(paymentUrl);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible iniciar el pago. Intenta nuevamente."
      );
    }
  };

  const clientName = data?.client?.name ?? data?.clientName;
  const items: any[] = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.reservations)
      ? data.reservations
      : [];
  const canPay =
    data?.canPay ??
    ["active", "pending", "rejected", "error"].includes(
      String(data?.status ?? "").toLowerCase()
    );

  return (
    <main className="min-h-screen bg-[#f4efe8] px-4 py-8 text-stone-900 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#9a7655] text-white shadow-sm">
            <Waves className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xl font-semibold tracking-wide">CANCAGUA</p>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
              Bienestar y naturaleza
            </p>
          </div>
        </div>

        <Card className="overflow-hidden border-stone-200 shadow-lg">
          <div className="bg-[#7b5c43] px-5 py-6 text-white sm:px-8">
            <p className="text-sm text-white/75">Pago seguro de reserva</p>
            <h1 className="mt-1 text-2xl font-semibold">
              {clientName ? `Hola, ${clientName}` : "Completa tu pago"}
            </h1>
          </div>
          <CardContent className="space-y-5 p-5 sm:p-8">
            {query.isLoading ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-stone-500">
                <Loader2 className="h-7 w-7 animate-spin" />
                <p>Buscando tu reserva…</p>
              </div>
            ) : query.error || !data ? (
              <div className="space-y-4 py-8 text-center">
                <AlertCircle className="mx-auto h-10 w-10 text-rose-600" />
                <div>
                  <p className="font-semibold">No encontramos este link</p>
                  <p className="mt-1 text-sm text-stone-500">
                    Revisa que esté completo o solicita uno nuevo a Cancagua.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {status === "paid" && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                    <p className="mt-2 text-lg font-semibold text-emerald-950">
                      Pago confirmado
                    </p>
                    <p className="text-sm text-emerald-800">
                      Tu reserva ya quedó actualizada en Cancagua.
                    </p>
                  </div>
                )}
                {status === "processing" && (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-center text-sky-950">
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-600" />
                    <p className="mt-2 font-semibold">Confirmando tu pago</p>
                    <p className="text-sm">
                      Esta página se actualizará automáticamente.
                    </p>
                  </div>
                )}
                {status === "expired" && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                    <p className="font-semibold">Este link venció</p>
                    <p className="text-sm">
                      Tu reserva continúa vigente. Solicita un nuevo link para
                      pagar.
                    </p>
                  </div>
                )}
                {status === "rejected" && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-950">
                    <p className="font-semibold">El pago no fue aprobado</p>
                    <p className="text-sm">
                      Tu reserva continúa vigente y pendiente de pago. Puedes
                      volver a intentarlo.
                    </p>
                  </div>
                )}
                {status === "reconciliation" && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                    <p className="font-semibold">Pago en revisión</p>
                    <p className="text-sm">
                      Estamos verificando la confirmación con el proveedor. No
                      realices otro pago; tu reserva continúa vigente.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <h2 className="font-semibold">Resumen de la reserva</h2>
                  {items.map((item, index) => (
                    <div
                      key={item.id ?? index}
                      className="rounded-xl border border-stone-200 bg-stone-50 p-4"
                    >
                      <p className="font-medium">
                        {item.name ??
                          item.serviceName ??
                          item.title ??
                          "Servicio Cancagua"}
                      </p>
                      {(item.date ?? item.bookingDate) && (
                        <p className="mt-1 flex items-center gap-2 text-sm text-stone-500">
                          <Clock3 className="h-4 w-4" />
                          {item.date ?? item.bookingDate}
                          {(item.time ?? item.startTime) &&
                            ` · ${item.time ?? item.startTime}`}
                        </p>
                      )}
                      {Number(item.amountClp ?? item.totalClp ?? 0) > 0 && (
                        <p className="mt-2 text-sm font-semibold">
                          {money(Number(item.amountClp ?? item.totalClp))}
                        </p>
                      )}
                    </div>
                  ))}
                  {!items.length && (
                    <p className="rounded-xl border bg-stone-50 p-4 text-sm text-stone-500">
                      Reserva asociada correctamente.
                    </p>
                  )}
                </div>

                <div className="flex items-end justify-between gap-3 border-t pt-5">
                  <div>
                    <p className="text-sm text-stone-500">Total a pagar</p>
                    <p className="text-2xl font-bold">
                      {money(Number(data.totalClp))}
                    </p>
                  </div>
                  <p className="text-right text-xs text-stone-500">
                    Pago mediante
                    <br />
                    {providerLabel(data.provider)}
                  </p>
                </div>

                {canPay && status !== "paid" && (
                  <Button
                    className="h-12 w-full bg-[#9a7655] text-base hover:bg-[#806044]"
                    disabled={start.isPending}
                    onClick={pay}
                  >
                    {start.isPending ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : status === "rejected" ? (
                      <RefreshCw className="mr-2 h-5 w-5" />
                    ) : (
                      <CreditCard className="mr-2 h-5 w-5" />
                    )}
                    {status === "rejected"
                      ? "Intentar nuevamente"
                      : "Pagar ahora"}
                  </Button>
                )}
                <p className="text-center text-xs leading-relaxed text-stone-500">
                  Un pago rechazado o un link vencido no cancela tu reserva. Si
                  necesitas ayuda, contáctanos por WhatsApp.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
