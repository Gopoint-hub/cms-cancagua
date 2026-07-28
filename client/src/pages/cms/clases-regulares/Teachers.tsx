import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { MailPlus, Pencil, Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { RegularClassesHeader } from "./shared";

const documentLabels: Record<string, string> = {
  pending: "Pendiente de definir",
  honorarium_receipt: "Boleta de honorarios",
  exempt_invoice: "Factura exenta",
  taxable_invoice: "Factura afecta (IVA incluido)",
  none: "Sin documento / 0%",
};

const emptyForm = {
  name: "", email: "", phone: "", bio: "", imageUrl: "", color: "#648596",
  active: true, teacherShare: "70", documentType: "pending",
  withholding: "15.25", vat: "19",
};

export default function RegularClassesTeachers() {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm);
  const teachers = trpc.regularClasses.teachers.list.useQuery();
  const save = trpc.regularClasses.teachers.save.useMutation({
    onSuccess: () => {
      toast.success("Profesor guardado");
      setEditing(null);
      utils.regularClasses.teachers.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const link = trpc.regularClasses.teachers.linkOrInviteUser.useMutation({
    onSuccess: (result) => {
      toast.success(result.emailSent ? "Cuenta creada e invitación enviada" : "Cuenta vinculada correctamente");
      utils.regularClasses.teachers.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const open = (teacher?: any) => {
    setEditing(teacher ?? {});
    setForm(teacher ? {
      name: teacher.name,
      email: teacher.email ?? "",
      phone: teacher.phone ?? "",
      bio: teacher.bio ?? "",
      imageUrl: teacher.imageUrl ?? "",
      color: teacher.color,
      active: Boolean(teacher.active),
      teacherShare: String((teacher.teacherShareBps ?? 0) / 100),
      documentType: teacher.documentType ?? "pending",
      withholding: String((teacher.withholdingBps ?? 1525) / 100),
      vat: String((teacher.vatBps ?? 1900) / 100),
    } : emptyForm);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <RegularClassesHeader
          title="Profesores"
          description="Porcentaje, documento tributario y acceso acumulable al CMS."
          actions={<Button onClick={() => open()}><Plus className="mr-2 h-4 w-4" /> Nuevo profesor</Button>}
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teachers.data?.map((teacher) => (
            <Card key={teacher.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ background: teacher.color }}>
                    {teacher.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-lg">{teacher.name}</CardTitle>
                    <p className="truncate text-sm text-muted-foreground">{teacher.email || "Correo pendiente"}</p>
                  </div>
                  {teacher.cmsUserId
                    ? <Badge className="gap-1"><UserCheck className="h-3 w-3" /> CMS</Badge>
                    : <Badge variant="outline">Sin usuario</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Profesor</p>
                    <p className="text-xl font-semibold">{(teacher.teacherShareBps ?? 0) / 100}%</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Cancagua</p>
                    <p className="text-xl font-semibold">{100 - (teacher.teacherShareBps ?? 0) / 100}%</p>
                  </div>
                </div>
                <p className="text-sm">{documentLabels[teacher.documentType ?? "pending"]}</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => open(teacher)}>
                    <Pencil className="mr-2 h-4 w-4" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={link.isPending || !teacher.email}
                    onClick={() => link.mutate({ teacherId: teacher.id })}
                  >
                    <MailPlus className="mr-2 h-4 w-4" /> {teacher.cmsUserId ? "Vincular" : "Invitar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(openValue) => !openValue && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar profesor" : "Nuevo profesor"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Correo</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Biografía</Label><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
            <div className="space-y-2"><Label>URL fotografía</Label><Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Porcentaje profesor</Label><Input type="number" min="0" max="100" step="0.01" value={form.teacherShare} onChange={(e) => setForm({ ...form, teacherShare: e.target.value })} /></div>
              <div className="space-y-2"><Label>Color</Label><Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Documento tributario</Label>
              <Select value={form.documentType} onValueChange={(documentType) => setForm({ ...form, documentType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(documentLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.documentType === "honorarium_receipt" && (
              <div className="space-y-2"><Label>Retención incluida (%)</Label><Input type="number" step="0.01" value={form.withholding} onChange={(e) => setForm({ ...form, withholding: e.target.value })} /></div>
            )}
            {form.documentType === "taxable_invoice" && (
              <div className="space-y-2"><Label>IVA incluido (%)</Label><Input type="number" step="0.01" value={form.vat} onChange={(e) => setForm({ ...form, vat: e.target.value })} /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button disabled={save.isPending || !form.name.trim()} onClick={() => save.mutate({
              id: editing?.id,
              name: form.name,
              email: form.email || undefined,
              phone: form.phone || undefined,
              bio: form.bio || undefined,
              imageUrl: form.imageUrl || undefined,
              color: form.color,
              active: form.active,
              teacherShareBps: Math.round(Number(form.teacherShare) * 100),
              documentType: form.documentType as any,
              withholdingBps: Math.round(Number(form.withholding) * 100),
              vatBps: Math.round(Number(form.vat) * 100),
            })}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
