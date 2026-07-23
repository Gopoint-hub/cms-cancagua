import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Search, MapPin, Phone, Mail } from "lucide-react";
import { getMassageCancellationLabel } from "./MassageCancellationDialog";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente", confirmed: "Confirmada", completed: "Completada",
  cancelled: "Cancelada", no_show: "No llegó",
};
const STATUS_VARIANTS: Record<string, any> = {
  pending: "secondary", confirmed: "default", completed: "outline",
  cancelled: "destructive", no_show: "destructive",
};

export default function MasajesClientes() {
  const [search, setSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const { data: clients, isLoading } = trpc.masajes.clientes.getAll.useQuery({ limit: 100, offset: 0 });
  const { data: history, isLoading: loadingHistory } = trpc.masajes.clientes.getHistory.useQuery(
    { clientEmail: selectedEmail ?? "" },
    { enabled: !!selectedEmail }
  );

  const filtered = clients?.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.clientName?.toLowerCase().includes(q) ||
      c.clientEmail?.toLowerCase().includes(q) ||
      c.clientPhone?.toLowerCase().includes(q)
    );
  }) ?? [];

  const selectedClient = clients?.find(c => c.clientEmail === selectedEmail);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">Base de clientes del área de masajes</p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, email o teléfono..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            {search ? "Sin resultados para esa búsqueda." : "Sin clientes registrados aún."}
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((c, i) => (
              <Card
                key={`${c.clientEmail}-${i}`}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => c.clientEmail && setSelectedEmail(c.clientEmail)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
                    <div className="flex-1">
                      <p className="font-semibold">{c.clientName}</p>
                      <div className="flex gap-3 flex-wrap mt-1 text-xs text-muted-foreground">
                        {c.clientEmail && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.clientEmail}</span>}
                        {c.clientPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.clientPhone}</span>}
                        {c.clientOrigin && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.clientOrigin}</span>}
                      </div>
                    </div>
                    <div className="w-full border-t pt-3 text-left text-sm sm:w-auto sm:border-0 sm:pt-0 sm:text-right">
                      <p className="font-semibold">{c.totalBookings} reserva{Number(c.totalBookings) !== 1 ? "s" : ""}</p>
                      {c.totalSpent && Number(c.totalSpent) > 0 && (
                        <p className="text-green-600 font-medium">$ {Number(c.totalSpent).toLocaleString("es-CL")}</p>
                      )}
                      {c.lastBookingDate && (
                        <p className="text-muted-foreground text-xs mt-0.5">
                          Última: {c.lastBookingDate}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal historial */}
      <Dialog open={!!selectedEmail} onOpenChange={open => !open && setSelectedEmail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de {selectedClient?.clientName}</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="flex gap-4 text-sm text-muted-foreground flex-wrap mb-2">
              {selectedClient.clientEmail && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{selectedClient.clientEmail}</span>}
              {selectedClient.clientPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{selectedClient.clientPhone}</span>}
              {selectedClient.clientOrigin && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{selectedClient.clientOrigin}</span>}
            </div>
          )}
          {loadingHistory ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !history || history.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Sin historial disponible.</p>
          ) : (
            <div className="space-y-3">
              {history.map(h => (
                <div key={h.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{h.bookingDate} a las {h.startTime}</p>
                      <p className="text-muted-foreground">
                        {h.techniqueName ?? "—"} · {h.duration} min
                        {h.therapistName && ` · ${h.therapistName}`}
                      </p>
                      {h.crossSellServices && (
                        <p className="text-xs text-muted-foreground mt-0.5">Cross-sell: {h.crossSellServices}</p>
                      )}
                      {h.status === "cancelled" && h.cancellationReason && (
                        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800">
                          <p className="font-semibold">{getMassageCancellationLabel(h.cancellationCategory)}</p>
                          <p className="mt-0.5 whitespace-pre-wrap">{h.cancellationReason}</p>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant={STATUS_VARIANTS[h.status ?? ""]}>{STATUS_LABELS[h.status ?? ""] ?? h.status}</Badge>
                      {h.amountPaid && Number(h.amountPaid) > 0 && (
                        <p className="text-green-600 font-medium mt-1">$ {Number(h.amountPaid).toLocaleString("es-CL")}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
