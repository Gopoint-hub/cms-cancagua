import { useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Mail, MessageCircle, Phone, Search, Star, UserRound, WalletCards } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

type ServiceKey = "all" | "massages" | "biopools" | "regular_classes";
const labels: Record<ServiceKey, string> = {
  all: "Todos los servicios",
  massages: "Masajes",
  biopools: "Biopiscinas",
  regular_classes: "Clases regulares",
};
const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const GOOGLE_REVIEW_URL = "https://maps.app.goo.gl/mhKem25vtagvCiSm8";
const TRIPADVISOR_REVIEW_URL = "https://www.tripadvisor.com/Attraction_Review-g294293-d23248044-Reviews-Cancagua-Frutillar_Los_Lagos_Region.html";

function reviewWhatsAppUrl(phone: string | null, platform: "Google" | "Tripadvisor") {
  const destination = platform === "Google" ? GOOGLE_REVIEW_URL : TRIPADVISOR_REVIEW_URL;
  const message = `Hola, muchas gracias por evaluar tan bien tu experiencia en Cancagua. ¿Nos ayudarías compartiéndola también en ${platform}? ${destination}`;
  return `https://wa.me/${(phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

function ClientHistory({ clientKey, service }: { clientKey: string; service: ServiceKey }) {
  const { data = [], isLoading } = trpc.operations360.clients.history.useQuery({
    clientKey,
    service: service === "all" ? undefined : service,
  });
  if (isLoading) return <Skeleton className="h-52" />;
  if (!data.length) return <p className="py-10 text-center text-muted-foreground">No hay movimientos para este filtro.</p>;
  return (
    <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
      {data.map(item => (
        <div key={item.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{item.title}</strong>
                <Badge variant="outline">{labels[item.service]}</Badge>
                <Badge variant="secondary">{item.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.date}{item.startTime ? ` · ${item.startTime}` : ""}
              </p>
              {item.detail && <p className="mt-2 text-sm">{item.detail}</p>}
              {item.npsScore != null && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3">
                  <p className="flex items-center gap-1 text-sm font-semibold text-amber-900">
                    <Star className="h-4 w-4 fill-amber-500 text-amber-500" /> NPS {item.npsScore}/10
                  </p>
                  {item.npsComment && <p className="mt-1 text-sm text-amber-950">“{item.npsComment}”</p>}
                  {item.npsScore >= 9 && item.clientPhone && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <a href={reviewWhatsAppUrl(item.clientPhone, "Google")} target="_blank" rel="noreferrer">
                          <MessageCircle className="mr-1 h-3.5 w-3.5" /> Pedir reseña Google
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={reviewWhatsAppUrl(item.clientPhone, "Tripadvisor")} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1 h-3.5 w-3.5" /> Pedir reseña Tripadvisor
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="font-semibold">{clp.format(item.amountClp)}</p>
              {item.paymentStatus && <p className="text-xs text-muted-foreground">{item.paymentStatus}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Clientes360() {
  const [search, setSearch] = useState("");
  const [service, setService] = useState<ServiceKey>("all");
  const [selected, setSelected] = useState<any>(null);
  const { data: access } = trpc.operations360.access.useQuery();
  const { data = [], isLoading } = trpc.operations360.clients.list.useQuery({
    search: search || undefined,
    service: service === "all" ? undefined : service,
  });
  const totals = useMemo(() => ({
    clients: data.length,
    reservations: data.reduce((sum, client) => sum + client.reservations, 0),
    spent: data.reduce((sum, client) => sum + client.totalSpentClp, 0),
  }), [data]);

  return (
    <DashboardLayout>
      <div className="space-y-5 p-2 sm:p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Historial integrado</p>
          <h1 className="mt-1 text-3xl font-semibold">Cliente 360</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reservas, compras y actividad de cada cliente en todos los servicios autorizados.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="flex items-center gap-3 p-4"><UserRound className="h-7 w-7 text-slate-500" /><div><p className="text-xs text-muted-foreground">Clientes</p><p className="text-2xl font-semibold">{totals.clients}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><CalendarDays className="h-7 w-7 text-cyan-600" /><div><p className="text-xs text-muted-foreground">Movimientos</p><p className="text-2xl font-semibold">{totals.reservations}</p></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4"><WalletCards className="h-7 w-7 text-emerald-600" /><div><p className="text-xs text-muted-foreground">Valor registrado</p><p className="text-2xl font-semibold">{clp.format(totals.spent)}</p></div></CardContent></Card>
        </div>

        <Card>
          <CardContent className="flex flex-wrap gap-3 p-4">
            <div className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nombre, correo o teléfono…" value={search} onChange={event => setSearch(event.target.value)} />
            </div>
            <Select value={service} onValueChange={value => setService(value as ServiceKey)}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los servicios</SelectItem>
                {(access?.clientServices ?? []).map(item => <SelectItem key={item} value={item}>{labels[item]}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div>
        ) : data.length ? (
          <div className="space-y-3">
            {data.map(client => (
              <Card key={client.key} className="transition hover:shadow-sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{client.name}</h2>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {client.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{client.email}</span>}
                      {client.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{client.phone}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {client.services.map(item => <Badge key={item} variant="outline">{labels[item]}</Badge>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div><p className="text-xs text-muted-foreground">Movimientos</p><p className="font-semibold">{client.reservations}</p></div>
                    <div><p className="text-xs text-muted-foreground">Última actividad</p><p className="font-semibold">{client.lastActivity}</p></div>
                    <Button onClick={() => setSelected(client)}>Ver historial</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card><CardContent className="py-14 text-center text-muted-foreground">No encontramos clientes para estos filtros.</CardContent></Card>
        )}

        <Dialog open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>{selected?.name} · historial 360</DialogTitle></DialogHeader>
            {selected && <ClientHistory clientKey={selected.key} service={service} />}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
