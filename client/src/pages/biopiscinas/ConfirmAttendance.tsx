import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  MapPin,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useParams } from "wouter";

export default function ConfirmBiopoolAttendance() {
  const { token = "" } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.biopools.attendance.get.useQuery(
    { token },
    { enabled: token.length >= 20 }
  );
  const respond = trpc.biopools.attendance.respond.useMutation({
    onSuccess: () => {
      toast.success("Respuesta registrada");
      utils.biopools.attendance.get.invalidate({ token });
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-12 flex items-center justify-center">
      <Card className="w-full max-w-xl border-stone-200 shadow-xl">
        <CardHeader className="text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.32em] text-[#536481]">
            Cancagua Spa
          </p>
          <CardTitle className="text-3xl font-serif">
            Confirma tu asistencia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading && (
            <p className="text-center text-muted-foreground">
              Cargando tu reserva…
            </p>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 p-5 text-center text-red-700">
              {error.message}
            </div>
          )}
          {data && (
            <>
              <div className="rounded-2xl bg-white border p-5 space-y-3">
                <h2 className="font-semibold text-lg">{data.serviceName}</h2>
                <p className="flex gap-2 text-sm">
                  <CalendarCheck className="h-4 w-4 text-[#536481]" />
                  {data.bookingDate}
                </p>
                <p className="flex gap-2 text-sm">
                  <Clock className="h-4 w-4 text-[#536481]" />
                  Ingreso a las {data.startTime}
                </p>
                <p className="text-xs text-muted-foreground">
                  Reserva {data.bookingCode}
                </p>
              </div>
              {data.cancelled ? (
                <div className="rounded-xl bg-red-50 p-4 text-center text-red-700">
                  Esta reserva se encuentra cancelada.
                </div>
              ) : data.response !== "pending" ? (
                <div className="rounded-xl bg-emerald-50 p-5 text-center text-emerald-800">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
                  Tu respuesta quedó registrada como{" "}
                  <strong>
                    {data.response === "confirmed"
                      ? "asistencia confirmada"
                      : "no podrás asistir"}
                  </strong>
                  .
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    size="lg"
                    className="bg-emerald-700 hover:bg-emerald-800"
                    disabled={respond.isPending}
                    onClick={() =>
                      respond.mutate({ token, response: "confirmed" })
                    }
                  >
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Sí, asistiré
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    disabled={respond.isPending}
                    onClick={() =>
                      respond.mutate({ token, response: "declined" })
                    }
                  >
                    <XCircle className="h-5 w-5 mr-2" />
                    No podré asistir
                  </Button>
                </div>
              )}
              <a
                href="https://www.google.com/maps/search/?api=1&query=Cancagua+Spa+Frutillar"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 text-sm text-[#536481] hover:underline"
              >
                <MapPin className="h-4 w-4" />
                Ver ubicación en Google Maps
              </a>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
