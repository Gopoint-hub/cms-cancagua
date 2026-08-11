import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { LockKeyhole, Users } from "lucide-react";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default function SaunaServices() {
  const query = trpc.sauna.services.list.useQuery();
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-amber-700">
            Espejo Skedu · solo lectura
          </p>
          <h1 className="text-3xl font-bold">Servicios y precios</h1>
          <p className="text-muted-foreground">
            Los valores se actualizan desde Skedu y todavía no se editan desde
            el CMS.
          </p>
        </div>
        {query.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(item => (
              <Skeleton key={item} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {query.data?.map(service => (
              <Card key={service.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-4">
                    <div className="rounded-xl bg-amber-100 p-3 text-amber-800">
                      {service.kind === "private" ? (
                        <LockKeyhole className="h-5 w-5" />
                      ) : (
                        <Users className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{service.name}</strong>
                        <Badge
                          variant={service.published ? "default" : "secondary"}
                        >
                          {service.published ? "Publicado" : "Oculto"}
                        </Badge>
                        <Badge variant="outline">
                          {service.kind === "private"
                            ? "Privado"
                            : service.kind === "staff"
                              ? "STAFF"
                              : "Compartido"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {service.partySize} persona
                        {service.partySize === 1 ? "" : "s"} · consume{" "}
                        {service.capacityUsed}/6 cupos ·{" "}
                        {service.durationMinutes} min · intervalo{" "}
                        {service.intervalMinutes} min
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">
                      {clp.format(service.priceClp)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sincronizado{" "}
                      {new Date(service.syncedAt).toLocaleString("es-CL")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
            {!query.data?.length && (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  Ejecuta la primera sincronización para cargar los servicios de
                  Skedu.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
