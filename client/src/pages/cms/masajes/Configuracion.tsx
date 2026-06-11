import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Eye, ShieldAlert } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function MasajesConfiguracion() {
  const { user } = useAuth();
  const canEdit = user?.role === "super_admin" || user?.role === "admin";

  const { data: disclaimer, isLoading } = trpc.masajes.config.getDisclaimer.useQuery();
  const updateMut = trpc.masajes.config.updateDisclaimer.useMutation({
    onSuccess: () => toast.success("Exención de responsabilidad actualizada"),
    onError: e => toast.error(e.message),
  });

  const [text, setText] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (disclaimer !== undefined) setText(disclaimer);
  }, [disclaimer]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Configuración — Masajes</h1>
          <p className="text-muted-foreground text-sm mt-1">Ajustes generales del módulo de masajes</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              Exención de responsabilidad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Este texto se muestra al cliente antes de confirmar su reserva. Debe aceptarlo haciendo clic en "Acepto" para poder continuar.
              {!canEdit && <span className="ml-1 text-amber-600">Solo admin y superadmin pueden editar este texto.</span>}
            </p>

            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <div className="flex gap-2 mb-2">
                  <Button size="sm" variant={preview ? "default" : "outline"} onClick={() => setPreview(!preview)}>
                    <Eye className="w-3.5 h-3.5 mr-1" />{preview ? "Editar" : "Vista previa"}
                  </Button>
                </div>

                {preview ? (
                  <div className="border rounded-xl p-4 bg-amber-50 border-amber-200 text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">
                    {text}
                  </div>
                ) : (
                  <Textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={8}
                    disabled={!canEdit}
                    className="resize-none font-mono text-sm"
                    placeholder="Texto de exención de responsabilidad..."
                  />
                )}

                {canEdit && (
                  <div className="flex justify-end">
                    <Button
                      onClick={() => updateMut.mutate({ value: text.trim() })}
                      disabled={updateMut.isPending || !text.trim()}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {updateMut.isPending ? "Guardando..." : "Guardar cambios"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
