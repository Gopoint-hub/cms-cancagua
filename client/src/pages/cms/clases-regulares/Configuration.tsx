import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { clp, RegularClassesHeader } from "./shared";

export default function RegularClassesConfiguration() {
  const utils = trpc.useUtils();
  const plans = trpc.regularClasses.plans.list.useQuery();
  const settings = trpc.regularClasses.settings.get.useQuery();
  const [planForms, setPlanForms] = useState<Record<number, { name: string; priceClp: string; credits: string; benefits: string; active: boolean }>>({});
  const [paymentBaseUrl, setPaymentBaseUrl] = useState("https://cancagua.cl/clases");
  useEffect(() => {
    if (plans.data) {
      setPlanForms(Object.fromEntries(plans.data.map((plan) => [plan.id, {
        name: plan.name,
        priceClp: String(plan.priceClp),
        credits: String(plan.creditsPerPeriod),
        benefits: plan.benefits ?? "",
        active: Boolean(plan.active),
      }])));
    }
  }, [plans.data]);
  useEffect(() => {
    if (settings.data) {
      setPaymentBaseUrl(settings.data.paymentBaseUrl);
    }
  }, [settings.data]);
  const updatePlan = trpc.regularClasses.plans.update.useMutation({
    onSuccess: () => {
      toast.success("Plan actualizado");
      utils.regularClasses.plans.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateSettings = trpc.regularClasses.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Configuración guardada");
      utils.regularClasses.settings.get.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <RegularClassesHeader title="Planes y configuración" description="Todos los valores monetarios se registran en pesos chilenos." />
        <Card>
          <CardHeader><CardTitle className="text-base">Mensualidad e invitación de pago</CardTitle></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-2">
              <p className="rounded-lg bg-muted p-3 text-sm">
                Todos los planes corresponden a un mes calendario: desde el día 1 hasta el último día del mes.
              </p>
              <Label>URL base del enlace de pago</Label>
              <Input type="url" value={paymentBaseUrl} onChange={(e) => setPaymentBaseUrl(e.target.value)} />
              <p className="text-xs text-muted-foreground">El CMS agregará un token de inscripción. La web pública se conectará en una etapa posterior.</p>
            </div>
            <Button onClick={() => updateSettings.mutate({ paymentBaseUrl })}>
              <Save className="mr-2 h-4 w-4" /> Guardar
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {plans.data?.map((plan) => {
            const form = planForms[plan.id];
            if (!form) return null;
            const unitValue = Number(form.credits) > 0 ? Number(form.priceClp) / Number(form.credits) : 0;
            return (
              <Card key={plan.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3 text-base">
                    <span>{plan.code}</span>
                    <span>{clp(unitValue)} por asistencia</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setPlanForms({ ...planForms, [plan.id]: { ...form, name: e.target.value } })} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Precio CLP</Label><Input type="number" min="0" value={form.priceClp} onChange={(e) => setPlanForms({ ...planForms, [plan.id]: { ...form, priceClp: e.target.value } })} /></div>
                    <div className="space-y-2"><Label>Clases por período</Label><Input type="number" min="1" value={form.credits} onChange={(e) => setPlanForms({ ...planForms, [plan.id]: { ...form, credits: e.target.value } })} /></div>
                  </div>
                  <div className="space-y-2"><Label>Beneficios</Label><Textarea value={form.benefits} onChange={(e) => setPlanForms({ ...planForms, [plan.id]: { ...form, benefits: e.target.value } })} /></div>
                  <Button className="w-full" variant="outline" onClick={() => updatePlan.mutate({
                    id: plan.id,
                    name: form.name,
                    priceClp: Number(form.priceClp),
                    creditsPerPeriod: Number(form.credits),
                    benefits: form.benefits,
                    active: form.active,
                  })}><Save className="mr-2 h-4 w-4" /> Guardar plan</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
