import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Edit, Phone, Mail, Clock, Star, Save, Trash2 } from "lucide-react";

const DRAFT_KEY = "masajes:draft:terapeuta";

// Días de la semana: 0=Dom, 1=Lun ... 6=Sáb
const ALL_DAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];
// Freelance trabaja Martes–Domingo (sin Lunes)
const FREELANCE_DAYS = ALL_DAYS.filter(d => d.value !== 1);

type ScheduleRow = {
  dayOfWeek: number;
  available: boolean;
  startTime: string;
  endTime: string;
};

function defaultSchedule(days: typeof ALL_DAYS): ScheduleRow[] {
  return days.map(d => ({ dayOfWeek: d.value, available: false, startTime: "10:00", endTime: "19:00" }));
}

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
  contractType: "Honorarios", leadTimeMinutes: 120, currentShift: "am",
  notes: "", callPriority: 99, techniqueIds: [],
};

export default function MasajesTerapeutas() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<TherapistForm>(emptyForm);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>(defaultSchedule(ALL_DAYS));
  const [formTab, setFormTab] = useState<"datos" | "horarios">("datos");

  const { data: therapists, isLoading } = trpc.masajes.terapeutas.getAll.useQuery();
  const { data: techniques } = trpc.masajes.tecnicas.getAll.useQuery();
  const { data: existingSchedules } = trpc.masajes.terapeutas.getSchedules.useQuery(
    { therapistId: editing ?? 0 },
    { enabled: !!editing }
  );

  // Populate schedule rows when editing
  useEffect(() => {
    if (!editing) return;
    const days = form.type === "freelance" ? FREELANCE_DAYS : ALL_DAYS;
    const rows = days.map(d => {
      const found = existingSchedules?.find(s => s.dayOfWeek === d.value);
      return {
        dayOfWeek: d.value,
        available: found ? found.available === 1 : false,
        startTime: found?.startTime ?? "10:00",
        endTime: found?.endTime ?? "19:00",
      };
    });
    setScheduleRows(rows);
  }, [existingSchedules, editing, form.type]);

  // Auto-save draft (solo crear)
  useEffect(() => {
    if (open && !editing) localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form, open, editing]);

  const createMut = trpc.masajes.terapeutas.create.useMutation({
    onSuccess: (data) => {
      utils.masajes.terapeutas.getAll.invalidate();
      toast.success("Terapeuta creado. Ahora puedes editar sus horarios.");
      localStorage.removeItem(DRAFT_KEY);
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.masajes.terapeutas.update.useMutation({
    onSuccess: () => { utils.masajes.terapeutas.getAll.invalidate(); toast.success("Terapeuta actualizado"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const scheduleMut = trpc.masajes.terapeutas.upsertSchedule.useMutation({
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.masajes.terapeutas.delete.useMutation({
    onSuccess: () => { utils.masajes.terapeutas.getAll.invalidate(); toast.success("Terapeuta eliminado"); },
    onError: e => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    const saved = localStorage.getItem(DRAFT_KEY);
    setForm(saved ? { ...emptyForm, ...JSON.parse(saved) } : emptyForm);
    setScheduleRows(defaultSchedule(ALL_DAYS));
    setFormTab("datos");
    setOpen(true);
  };

  const openEdit = (t: any) => {
    setEditing(t.id);
    setForm({
      name: t.name,
      type: t.type,
      phone: t.phone ?? "",
      email: t.email ?? "",
      contractType: t.contractType ?? (t.type === "inhouse" ? "Full Time" : "Honorarios"),
      leadTimeMinutes: t.leadTimeMinutes ?? 120,
      currentShift: t.currentShift ?? "am",
      notes: t.notes ?? "",
      callPriority: t.callPriority ?? 99,
      techniqueIds: t.techniques?.map((tc: any) => tc.id) ?? [],
    });
    setFormTab("datos");
    setOpen(true);
  };

  const toggleTechnique = (id: number) => {
    setForm(f => ({
      ...f,
      techniqueIds: f.techniqueIds.includes(id)
        ? f.techniqueIds.filter(t => t !== id)
        : [...f.techniqueIds, id],
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("El nombre es requerido"); return; }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      contractType: form.contractType || undefined,
      leadTimeMinutes: form.leadTimeMinutes,
      currentShift: form.type === "inhouse" ? form.currentShift : undefined,
      notes: form.notes.trim() || undefined,
      callPriority: form.callPriority,
      techniqueIds: form.techniqueIds,
    };
    if (editing) updateMut.mutate({ id: editing, ...payload });
    else createMut.mutate(payload);
  };

  const handleSaveSchedules = async () => {
    if (!editing) return;
    let saved = 0;
    for (const row of scheduleRows) {
      await scheduleMut.mutateAsync({
        therapistId: editing,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        available: row.available ? 1 : 0,
      });
      saved++;
    }
    utils.masajes.terapeutas.getAll.invalidate();
    toast.success(`Horario guardado (${saved} días)`);
  };

  const updateScheduleRow = (dayOfWeek: number, field: keyof ScheduleRow, value: any) => {
    setScheduleRows(rows => rows.map(r => r.dayOfWeek === dayOfWeek ? { ...r, [field]: value } : r));
  };

  const days = form.type === "freelance" ? FREELANCE_DAYS : ALL_DAYS;
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
                <span className="flex items-center gap-1"><Star className="w-3 h-3" />Turno: {t.currentShift === "am" ? "Mañana" : "Tarde"}</span>
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
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Edit className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => { if (confirm(`¿Eliminar a ${t.name}? Esta acción no se puede deshacer.`)) deleteMut.mutate({ id: t.id }); }}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
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
            {isLoading ? [1, 2].map(i => <Skeleton key={i} className="h-28 w-full" />) :
              inhouse.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">Sin terapeutas inhouse</p> :
              inhouse.map(t => <TherapistCard key={t.id} t={t} />)}
          </TabsContent>
          <TabsContent value="freelance" className="mt-4 space-y-3">
            {isLoading ? [1, 2].map(i => <Skeleton key={i} className="h-28 w-full" />) :
              freelance.length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">Sin terapeutas freelance</p> :
              freelance.sort((a, b) => (a.callPriority ?? 99) - (b.callPriority ?? 99)).map(t => <TherapistCard key={t.id} t={t} />)}
          </TabsContent>
        </Tabs>

        {/* Modal */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editing ? "Editar terapeuta" : "Nuevo terapeuta"}
                {!editing && <span className="text-xs font-normal text-muted-foreground flex items-center gap-1 ml-2"><Save className="w-3 h-3" />Borrador guardado</span>}
              </DialogTitle>
            </DialogHeader>

            <Tabs value={formTab} onValueChange={v => setFormTab(v as any)}>
              <TabsList>
                <TabsTrigger value="datos">Datos</TabsTrigger>
                {editing && <TabsTrigger value="horarios">Horarios</TabsTrigger>}
              </TabsList>

              {/* TAB DATOS */}
              <TabsContent value="datos">
                <div className="grid grid-cols-2 gap-4 py-3">
                  <div className="col-span-2">
                    <Label>Nombre completo *</Label>
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
                    <Select value={form.contractType} onValueChange={v => setForm(f => ({ ...f, contractType: v }))}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Full Time">Full Time</SelectItem>
                        <SelectItem value="Honorarios">Honorarios</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Label className="mb-2 block">Técnicas que realiza</Label>
                    {!techniques || techniques.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin técnicas registradas. Agrégalas primero en la sección Técnicas.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {techniques.map(tc => (
                          <Badge
                            key={tc.id}
                            variant={form.techniqueIds.includes(tc.id) ? "default" : "outline"}
                            className="cursor-pointer select-none hover:opacity-80 transition-opacity"
                            onClick={() => toggleTechnique(tc.id)}
                          >
                            {tc.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
                    {editing ? "Guardar cambios" : "Crear terapeuta"}
                  </Button>
                </DialogFooter>
              </TabsContent>

              {/* TAB HORARIOS (solo en edición) */}
              {editing && (
                <TabsContent value="horarios">
                  <div className="py-3 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Configura los días y horarios de disponibilidad.
                      {form.type === "freelance" && " (Martes a Domingo)"}
                    </p>
                    <div className="space-y-2">
                      {days.map(day => {
                        const row = scheduleRows.find(r => r.dayOfWeek === day.value);
                        if (!row) return null;
                        return (
                          <div key={day.value} className="flex items-center gap-3 border rounded-lg px-3 py-2">
                            <Switch
                              checked={row.available}
                              onCheckedChange={v => updateScheduleRow(day.value, "available", v)}
                            />
                            <span className={`w-24 text-sm font-medium ${!row.available ? "text-muted-foreground" : ""}`}>
                              {day.label}
                            </span>
                            {row.available ? (
                              <>
                                <Input
                                  type="time"
                                  value={row.startTime}
                                  onChange={e => updateScheduleRow(day.value, "startTime", e.target.value)}
                                  className="w-28 h-8 text-sm"
                                />
                                <span className="text-muted-foreground text-sm">a</span>
                                <Input
                                  type="time"
                                  value={row.endTime}
                                  onChange={e => updateScheduleRow(day.value, "endTime", e.target.value)}
                                  className="w-28 h-8 text-sm"
                                />
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">No disponible</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
                      <Button onClick={handleSaveSchedules} disabled={scheduleMut.isPending}>
                        Guardar horario
                      </Button>
                    </DialogFooter>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
