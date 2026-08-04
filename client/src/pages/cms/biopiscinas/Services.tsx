import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Copy, Eye, EyeOff, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function BiopiscinasServices() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: services } = trpc.biopools.services.list.useQuery();
  const update = trpc.biopools.services.update.useMutation({
    onSuccess: () => utils.biopools.invalidate(),
    onError: error => toast.error(error.message),
  });
  const duplicate = trpc.biopools.services.duplicate.useMutation({
    onSuccess: () => {
      toast.success("Servicio duplicado como borrador");
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.biopools.services.remove.useMutation({
    onSuccess: ({ archived }) => {
      toast.success(
        archived
          ? "Servicio archivado para conservar su historial"
          : "Servicio eliminado"
      );
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-700">
            Catálogo
          </p>
          <h1 className="text-3xl font-semibold">Servicios de Biopiscinas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Puedes duplicar, ocultar o publicar sin perder la información
            histórica.
          </p>
        </div>
        <div className="space-y-4">
          {services?.map(service => (
            <Card key={service.id}>
              <CardContent className="p-5 flex flex-wrap items-center justify-between gap-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{service.name}</h2>
                    <Badge variant="outline">{service.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Aforo {service.capacity} · ingresos {service.firstEntryTime}
                    –{service.lastEntryTime} · estadía{" "}
                    {service.standardDurationMinutes / 60} h
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => duplicate.mutate({ id: service.id })}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Duplicar
                  </Button>
                  {service.status === "published" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        update.mutate({ id: service.id, status: "hidden" })
                      }
                    >
                      <EyeOff className="h-4 w-4 mr-1" />
                      Ocultar
                    </Button>
                  ) : (
                    service.status !== "archived" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          update.mutate({ id: service.id, status: "published" })
                        }
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Publicar
                      </Button>
                    )
                  )}
                  <Button asChild size="sm">
                    <Link
                      href={`/cms/biopiscinas/configuracion?service=${service.id}`}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      Editar
                    </Link>
                  </Button>
                  {user?.role === "super_admin" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600"
                      onClick={() =>
                        confirm(
                          "¿Eliminar este servicio? Si tiene reservas será archivado para proteger el historial."
                        ) && remove.mutate({ id: service.id })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
