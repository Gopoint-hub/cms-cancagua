import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Edit, Phone, Mail, Clock, Star } from "lucide-react";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type TherapistForm = {
  name: string;
  type: "inhouse" | "freelance";
  phone: string;
  email: string;
  contractType: string;
  leadTimeMinutes: number;
  currentShift: "am" | "pm";
  notes: string;
  callPriority: number;
  techniqueIds: number[];
};

const emptyForm: TherapistForm = {
  name: "", type: "freelance", phone: "", email: "",
  contractType: "", leadTimeMinutes: 120, currentShift: "am",
  notes: "", callPriority: 99, techniqueIds: [],
};

export default function MasajesTerapeutas() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<TherapistForm>(emptyForm);

  const { data: therapists, isLoading } = trpc.masajes.terapeutas.getAll.useQuery();
  const { data: techniques } = trpc.masajes.tecnicas.getAll.useQuery();

  const createMut = trpc.masajes.terapeutas.create.useMutation({
    onSuccess: () => { utils.masajes.terapeutas.getAll.invalidate(); toast.success("Terapeuta creado"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.masajes.terapeutas.update.useMutation({
    onSuccess: () => { utils.masajes.terapeutas.getAll.invalidate(); toast.success("Terapeuta actualizado"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const scheduleMut = trpc.masajes.terapeutas.upsertSchedule.useMutation({
    onSuccess: () => { utils.masajes.terapeutas.getAll.invalidate(); toast.success("Horario actualizado"); },
    onError: e => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (t: any) => {
    setEditing(t.id);
    setForm({
      name: t.name, type: t.type, phone: t.phone ?? "", email: t.email ?? "",
      contractType: t.contractType ?? "", leadTimeMinutes: t.leadTimeMinutes ?? 120,
      currentShift: t.currentShift ?? "am", notes: t.notes ?? "",
      callPriority: t.callPriority ?? 99,
      techniqueIds: t.techniques?.map((tc: any) => tc.id) ?? [],
    });
    setOpen(true);
  };

  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing, ...form });
    else createMut.mutate(form);
  };

  const toggleTechnique = (id: number) => {
    setForm(f => ({
      ...f,
      techniqueIds: f.techniqueIds.includes(id) ? f.techniqueIds.filter(t => t !== id) : [...f.techniqueIds, id],
    }));
  };

  const inhouse = therapists?.filter(t => t.type === "inhouse") ?? [];
  const freelance = therapists?.filter(t => t.type === "freelance") ?? [];

  const TherapistCard = ({ t }: { t: any }) => (
    <Card className={t.active === 0 ? "opacity-50" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{t.name}</span>
              <Badge variant="outline" className="text-xs">{t.contractType || (t.type === "inhouse" ? "Full Time" : "Honorarios")}</Badge>
              {t.callPriority <= 2 && <Badge className="text-xs bg-amber-500">Prioridad {t.callPriority}</Badge>}
            </div>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {t.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{t.phone}</span>}
              {t.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{t.email}</span>}
              {t.type === "freelance" && (
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Aviso: {t.leadTimeMinutes / 60}h antes</span>
              )}
              {t.type === "inhouse" && (
                <span className="flex items-center gap-1"><Star className="w-3 h-3" />Turno actual: {t.currentShift === "am" ? "Mañana" : "Tarde"}</span>
              )}
            </div>
            {t.techniques?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {t.techniques.map((tc: any) => (
                  <Badge key={tc.id} variant="secondary" className="text-xs">{tc.name}</Badge>
                ))}
              </div>
            )}
            {t.notes && <p className="text-xs text-muted-foreground mt-2 italic">"{t.notes}"</p>}
          </div>
          <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Edit className="w-4 h-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Terapeutas</h1>
            <p className="text-muted-foreground text-sm mt-1">Gestión de terapeutas inhouse y freelance</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Agregar terapeuta</Button>
        </div>

        <Tabs defaultValue="inhouse">
          <TabsList>
            <TabsTrigger value="inhouse">Inhouse ({inhouse.length})</TabsTrigger>
            <TabsTrigger value="freelance">Freelance ({freelance.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="inhouse" className="mt-4 space-y-3">
            {isLoading ? [1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />) :
              inhouse.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">Sin terapeutas inhouse</p> :
              inhouse.map(t => <TherapistCard key={t.id} t={t} />)}
          </TabsContent>

          <TabsContent value="freelance" className="mt-4 space-y-3">
            {isLoading ? [1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />) :
              freelance.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">Sin terapeutas freelance</p> :
              freelance.sort((a, b) => (a.callPriority ?? 99) - (b.callPriority ?? 99)).map(t => <TherapistCard key={t.id} t={t} />)}
          </TabsContent>
        </Tabs>

        {/* Modal crear/editar */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar terapeuta" : "Nuevo terapeuta"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="col-span-2">
                <Label>Nombre completo</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inhouse">Inhouse</SelectItem>
                    <SelectItem value="freelance">Freelance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Contrato</Label>
                <Input value={form.contractType} onChange={e => setForm(f => ({ ...f, contractType: e.target.value }))} placeholder="Full Time / Honorarios" />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="56 9 1234 5678" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              {form.type === "freelance" && (
                <>
                  <div>
                    <Label>Anticipación mínima (minutos)</Label>
                    <Input type="number" value={form.leadTimeMinutes} onChange={e => setForm(f => ({ ...f, leadTimeMinutes: +e.target.value }))} />
                  </div>
                  <div>
                    <Label>Prioridad de llamado (1 = primero)</Label>
                    <Input type="number" value={form.callPriority} onChange={e => setForm(f => ({ ...f, callPriority: +e.target.value }))} />
                  </div>
                </>
              )}
              {form.type === "inhouse" && (
                <div>
                  <Label>Turno actual</Label>
                  <Select value={form.currentShift} onValueChange={v => setForm(f => ({ ...f, currentShift: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="am">Mañana (10:00–19:00)</SelectItem>
                      <SelectItem value="pm">Tarde (14:00–22:00)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="col-span-2">
                <Label>Notas de disponibilidad</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
              <div className="col-span-2">
                <Label>Técnicas que realiza</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {techniques?.map(tc => (
                    <Badge
                      key={tc.id}
                      variant={form.techniqueIds.includes(tc.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleTechnique(tc.id)}
                    >
                      {tc.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
                {editing ? "Guardar cambios" : "Crear terapeuta"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
