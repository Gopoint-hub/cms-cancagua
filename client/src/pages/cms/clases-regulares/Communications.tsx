import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Check, Mail, RefreshCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { RegularClassesHeader } from "./shared";

const audienceLabels = {
  all_active: "Todos los alumnos activos",
  "2x_plus": "Planes 2x o superiores",
  "3x_plus": "Planes 3x o superiores",
  "4x_plus": "Planes 4x o superiores",
  "5x": "Sólo plan 5x",
  pending_payment: "Prospectos o pagos pendientes",
} as const;

export default function RegularClassesCommunications() {
  const utils = trpc.useUtils();
  const benefits = trpc.regularClasses.benefits.list.useQuery();
  const campaigns = trpc.regularClasses.campaigns.list.useQuery();
  const [form, setForm] = useState({
    name: "",
    subject: "",
    message: "",
    audience: "all_active" as keyof typeof audienceLabels,
  });
  const refresh = trpc.regularClasses.benefits.refresh.useMutation({
    onSuccess: () => {
      toast.success("Beneficios actualizados");
      utils.regularClasses.benefits.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const notify = trpc.regularClasses.benefits.notify.useMutation({
    onSuccess: () => {
      toast.success("Beneficio notificado");
      utils.regularClasses.benefits.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const redeem = trpc.regularClasses.benefits.redeem.useMutation({
    onSuccess: () => {
      toast.success("Beneficio marcado como utilizado");
      utils.regularClasses.benefits.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const send = trpc.regularClasses.campaigns.send.useMutation({
    onSuccess: (result) => {
      toast.success(`Campaña enviada: ${result.sentCount} correos`);
      if (result.failedCount) toast.warning(`${result.failedCount} envíos fallaron`);
      setForm({ name: "", subject: "", message: "", audience: "all_active" });
      utils.regularClasses.campaigns.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <RegularClassesHeader
          title="Beneficios y comunicaciones"
          description="Sauna, Pulso, permanencia e invitaciones segmentadas a eventos."
        />
        <Tabs defaultValue="benefits">
          <TabsList><TabsTrigger value="benefits">Beneficios</TabsTrigger><TabsTrigger value="campaigns">Invitaciones y correos</TabsTrigger></TabsList>
          <TabsContent value="benefits" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div><CardTitle className="text-base">Beneficios generados</CardTitle><p className="mt-1 text-sm text-muted-foreground">Se recalculan desde los períodos pagados y la permanencia.</p></div>
                <Button variant="outline" onClick={() => refresh.mutate()}><RefreshCcw className="mr-2 h-4 w-4" /> Actualizar</Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {benefits.data?.map((benefit) => (
                  <div key={benefit.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{benefit.studentName}</p>
                      <p className="text-sm">{benefit.benefitName}</p>
                      <p className="text-xs text-muted-foreground">Disponible desde {benefit.eligibleAt}</p>
                    </div>
                    <Badge variant={benefit.status === "redeemed" ? "default" : "outline"}>
                      {benefit.status === "available" ? "Disponible" : benefit.status === "notified" ? "Notificado" : benefit.status === "redeemed" ? "Utilizado" : "Vencido"}
                    </Badge>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={!benefit.studentEmail || benefit.status === "redeemed"} onClick={() => notify.mutate({ id: benefit.id })}>
                        <Mail className="mr-1 h-4 w-4" /> Notificar
                      </Button>
                      <Button size="sm" disabled={benefit.status === "redeemed"} onClick={() => redeem.mutate({ id: benefit.id })}>
                        <Check className="mr-1 h-4 w-4" /> Utilizado
                      </Button>
                    </div>
                  </div>
                ))}
                {!benefits.isLoading && benefits.data?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aún no hay beneficios generados.</p>}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="campaigns" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
              <Card>
                <CardHeader><CardTitle className="text-base">Nuevo correo o invitación</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label>Nombre interno</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Invitación solsticio, recordatorio sauna..." /></div>
                  <div className="space-y-2">
                    <Label>Destinatarios</Label>
                    <Select value={form.audience} onValueChange={(audience: keyof typeof audienceLabels) => setForm({ ...form, audience })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(audienceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Asunto</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Mensaje</Label><Textarea rows={10} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
                  <Button className="w-full" disabled={send.isPending || form.name.trim().length < 2 || form.subject.trim().length < 2 || form.message.trim().length < 5} onClick={() => {
                    if (window.confirm(`¿Enviar este correo a: ${audienceLabels[form.audience]}?`)) send.mutate(form);
                  }}><Send className="mr-2 h-4 w-4" /> Enviar campaña</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Historial</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {campaigns.data?.map((campaign) => (
                    <div key={campaign.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{campaign.name}</p>
                        <Badge variant="outline">{campaign.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{audienceLabels[campaign.audience]}</p>
                      <p className="mt-2 text-sm">{campaign.sentCount} enviados · {campaign.failedCount} fallidos</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
