import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

function getQueryParam(key: string): string {
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

export default function ConfirmacionPago() {
  const [, setLocation] = useLocation();

  // Getnet devuelve params en la returnUrl; nosotros fijamos ?ref=masaje-{bookingId}
  // Getnet también puede agregar ?requestId=... directamente
  const requestId = getQueryParam("requestId") || getQueryParam("request_id");
  const ref = getQueryParam("ref");

  const [ready, setReady] = useState(!!requestId || !!ref);

  useEffect(() => {
    if (!requestId && !ref) {
      setLocation("/masajes");
    } else if (!requestId && ref) {
      const t = setTimeout(() => setReady(true), 1500);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isError } = trpc.masajes.public.checkPaymentStatus.useQuery(
    { requestId: requestId || undefined, ref: ref || undefined },
    { enabled: ready && (!!requestId || !!ref), retry: 3, retryDelay: 2000 }
  );

  if (!ready || isLoading) return <LoadingView />;
  if (isError || !data) return <PendingView onRetry={() => window.location.reload()} />;

  if (data.status === "APPROVED") return <ApprovedView amount={data.amount} />;
  if (data.status === "REJECTED" || data.status === "FAILED") return <RejectedView />;
  return <PendingView onRetry={() => window.location.reload()} />;
}

function LoadingView() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-stone-50 px-4">
      <div className="w-12 h-12 rounded-full border-4 border-stone-300 border-t-stone-700 animate-spin" />
      <p className="text-stone-600 text-lg">Verificando tu pago...</p>
    </div>
  );
}

function ApprovedView({ amount }: { amount?: number }) {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-stone-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-10 max-w-md w-full text-center flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-stone-800 mb-2">¡Pago exitoso!</h1>
          <p className="text-stone-600">Tu reserva está confirmada.</p>
          {amount && (
            <p className="text-stone-500 text-sm mt-1">
              Monto pagado:{" "}
              <span className="font-medium text-stone-700">
                {new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(amount)}
              </span>
            </p>
          )}
        </div>
        <div className="bg-green-50 rounded-xl p-4 w-full text-left">
          <p className="text-green-800 text-sm">
            Te llegará un <strong>email y WhatsApp</strong> con todos los detalles de tu reserva.
            ¡Te esperamos en Cancagua Spa!
          </p>
        </div>
        <button
          onClick={() => setLocation("/masajes")}
          className="w-full py-3 px-6 bg-stone-800 text-white rounded-xl text-sm font-medium hover:bg-stone-700 transition-colors"
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}

function RejectedView() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-stone-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-10 max-w-md w-full text-center flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-stone-800 mb-2">Pago no procesado</h1>
          <p className="text-stone-600">Tu pago no fue procesado. Puedes intentarlo nuevamente.</p>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={() => history.back()}
            className="w-full py-3 px-6 bg-stone-800 text-white rounded-xl text-sm font-medium hover:bg-stone-700 transition-colors"
          >
            Intentar de nuevo
          </button>
          <button
            onClick={() => setLocation("/masajes")}
            className="w-full py-3 px-6 bg-white text-stone-700 border border-stone-300 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );
}

function PendingView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-stone-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-10 max-w-md w-full text-center flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-stone-800 mb-2">Verificando tu pago...</h1>
          <p className="text-stone-600 text-sm">
            Tu pago está siendo procesado. Si el problema persiste, contáctanos.
          </p>
        </div>
        <button
          onClick={onRetry}
          className="w-full py-3 px-6 bg-stone-800 text-white rounded-xl text-sm font-medium hover:bg-stone-700 transition-colors"
        >
          Verificar nuevamente
        </button>
      </div>
    </div>
  );
}
