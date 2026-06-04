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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Star, FileText, Trash2, ExternalLink, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const KPI_LABELS = [
  { key: "puntualidad", label: "Puntualidad" },
  { key: "tecnica", label: "Técnica y ejecución" },
  { key: "satisfaccionCliente", label: "Satisfacción del cliente" },
  { key: "presentacionHigiene", label: "Presentación e higiene" },
  { key: "comunicacion", label: "Comunicación y trato" },
  { key: "usoInsumos", label: "Uso correcto de insumos" },
];

const DOC_TIPOS: Record<string, string> = {
  certificado: "Certificado", boleta: "Boleta", contrato: "Contrato", otro: "Otro",
};
const DOC_COLORS: Record<string, string> = {
  certificado: "text-blue-600 bg-blue-50 border-blue-200",
  boleta: "text-green-600 bg-green-50 border-green-200",
  contrato: "text-purple-600 bg-purple-50 border-purple-200",
  otro: "text-slate-600 bg-slate-50 border-slate-200",
};

function ScoreBar({ value }: { value: number }) {
  const color = value >= 8 ? "bg-green-500" : value >= 6 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value * 10}%` }} />
      </div>
      <span className="text-sm font-semibold w-5 text-right">{value}</span>
    </div>
  );
}

function EvaluacionesPanel({ therapist }: { therapist: any }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({
    period: format(new Date(), "yyyy-MM"),
    puntualidad: 0, tecnica: 0, satisfaccionCliente: 0,
    presentacionHigiene: 0, comunicacion: 0, usoInsumos: 0,
    comentarios: "",
  });

  const { data: evaluaciones, isLoading } = trpc.masajes.rrhh.getEvaluations.useQuery({ therapistId: therapist.id });

  const upsertMut = trpc.masajes.rrhh.upsertEvaluation.useMutation({
    onSuccess: () => { utils.masajes.rrhh.getEvaluations.invalidate({ therapistId: therapist.id }); toast.success("Evaluación guardada"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.masajes.rrhh.deleteEvaluation.useMutation({
    onSuccess: () => { utils.masajes.rrhh.getEvaluations.invalidate({ therapistId: therapist.id }); toast.success("Evaluación eliminada"); },
    onError: e => toast.error(e.message),
  });

  const openCreate = () => {
    setForm({ period: format(new Date(), "yyyy-MM"), puntualidad: 7, tecnica: 7, satisfaccionCliente: 7, presentacionHigiene: 7, comunicacion: 7, usoInsumos: 7, comentarios: "" });
    setOpen(true);
  };
  const openEdit = (ev: any) => {
    setForm({ ...ev, comentarios: ev.comentarios ?? "" });
    setOpen(true);
  };

  const handleSave = () => {
    upsertMut.mutate({ therapistId: therapist.id, ...form as any });
  };

  const scoreColor = (s: number) => s >= 8 ? "text-green-600" : s >= 6 ? "text-amber-600" : "text-red-600";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Evaluaciones KPI mensuales · escala 0–10</p>
        <Button size="sm" onClick={openCreate}><Plus className="w-3.5 h-3.5 mr-1" />Nueva evaluación</Button>
      </div>

      {isLoading ? <Skeleton className="h-20 w-full" /> :
        !evaluaciones || evaluaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sin evaluaciones registradas.</p>
        ) : (
          <div className="space-y-3">
            {evaluaciones.map(ev => {
              const avg = ((ev.puntualidad + ev.tecnica + ev.satisfaccionCliente + ev.presentacionHigiene + ev.comunicacion + ev.usoInsumos) / 6);
              return (
                <Card key={ev.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => openEdit(ev)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="font-semibold">{ev.period}</span>
                          <span className={`text-lg font-bold ${scoreColor(avg)}`}>{avg.toFixed(1)}<span className="text-sm font-normal text-muted-foreground">/10</span></span>
                          <div className="flex">
                            {[1,2,3,4,5].map(s => (
                              <Star key={s} className={`w-3.5 h-3.5 ${s <= Math.round(avg/2) ? "text-amber-400 fill-amber-400" : "text-muted"}`} />
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {KPI_LABELS.map(k => (
                            <div key={k.key} className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground w-44">{k.label}</span>
                              <ScoreBar value={ev[k.key as keyof typeof ev] as number} />
                            </div>
                          ))}
                        </div>
                        {ev.comentarios && <p className="text-xs text-muted-foreground mt-3 italic border-t pt-2">"{ev.comentarios}"</p>}
                      </div>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive shrink-0"
                        onClick={e => { e.stopPropagation(); if (confirm("¿Eliminar evaluación?")) deleteMut.mutate({ id: ev.id }); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Evaluación KPI — {therapist.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label>Período (mes)</Label>
              <Input type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} />
            </div>
            <div className="space-y-4">
              {KPI_LABELS.map(k => (
                <div key={k.key}>
                  <div className="flex items-center justify-between mb-1">
                    <Label>{k.label}</Label>
                    <span className={`font-bold text-sm ${form[k.key] >= 8 ? "text-green-600" : form[k.key] >= 6 ? "text-amber-600" : "text-red-600"}`}>
                      {form[k.key]}/10
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={10} step={1}
                    value={form[k.key]}
                    onChange={e => setForm(f => ({ ...f, [k.key]: Number(e.target.value) }))}
                    className="w-full accent-teal-600"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>Deficiente</span><span>Regular</span><span>Bueno</span><span>Excelente</span>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Label>Comentarios y observaciones</Label>
              <Textarea value={form.comentarios} onChange={e => setForm(f => ({ ...f, comentarios: e.target.value }))} rows={3}
                placeholder="Fortalezas, áreas de mejora, incidentes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsertMut.isPending}>Guardar evaluación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentosPanel({ therapist }: { therapist: any }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tipo: "certificado", nombre: "", descripcion: "", archivoUrl: "", periodo: "" });

  const { data: documentos, isLoading } = trpc.masajes.rrhh.getDocuments.useQuery({ therapistId: therapist.id });

  const addMut = trpc.masajes.rrhh.addDocument.useMutation({
    onSuccess: () => { utils.masajes.rrhh.getDocuments.invalidate({ therapistId: therapist.id }); toast.success("Documento agregado"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.masajes.rrhh.deleteDocument.useMutation({
    onSuccess: () => { utils.masajes.rrhh.getDocuments.invalidate({ therapistId: therapist.id }); toast.success("Documento eliminado"); },
    onError: e => toast.error(e.message),
  });

  const handleSave = () => {
    if (!form.nombre.trim()) { toast.error("El nombre es requerido"); return; }
    addMut.mutate({ therapistId: therapist.id, tipo: form.tipo as any, nombre: form.nombre, descripcion: form.descripcion || undefined, archivoUrl: form.archivoUrl || undefined, periodo: form.periodo || undefined });
  };

  const byTipo = (tipo: string) => documentos?.filter(d => d.tipo === tipo) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Documentos contractuales, certificados y boletas</p>
        <Button size="sm" onClick={() => { setForm({ tipo: therapist.type === "freelance" ? "boleta" : "certificado", nombre: "", descripcion: "", archivoUrl: "", periodo: "" }); setOpen(true); }}>
          <Plus className="w-3.5 h-3.5 mr-1" />Agregar documento
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-20 w-full" /> :
        !documentos || documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sin documentos registrados.</p>
        ) : (
          <div className="space-y-4">
            {(therapist.type === "inhouse" ? ["contrato", "certificado", "otro"] : ["boleta", "certificado", "otro"]).map(tipo => {
              const docs = byTipo(tipo);
              if (docs.length === 0) return null;
              return (
                <div key={tipo}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{DOC_TIPOS[tipo]}s</h4>
                  <div className="space-y-2">
                    {docs.map(doc => (
                      <div key={doc.id} className={`flex items-center justify-between border rounded-lg px-3 py-2.5 ${DOC_COLORS[doc.tipo]}`}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="w-4 h-4 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{doc.nombre}</p>
                            <div className="flex gap-2 text-xs opacity-70">
                              {doc.periodo && <span>{doc.periodo}</span>}
                              {doc.descripcion && <span className="truncate">{doc.descripcion}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {doc.archivoUrl && (
                            <a href={doc.archivoUrl} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ExternalLink className="w-3.5 h-3.5" /></Button>
                            </a>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => { if (confirm("¿Eliminar documento?")) deleteMut.mutate({ id: doc.id }); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar documento — {therapist.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {therapist.type === "freelance" && <SelectItem value="boleta">Boleta</SelectItem>}
                  <SelectItem value="certificado">Certificado</SelectItem>
                  <SelectItem value="contrato">Contrato</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nombre del documento *</Label>
              <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder={form.tipo === "boleta" ? "Boleta enero 2026" : form.tipo === "certificado" ? "Certificado masoterapia" : "Nombre..."} />
            </div>
            {form.tipo === "boleta" && (
              <div>
                <Label>Período (mes)</Label>
                <Input type="month" value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Descripción</Label>
              <Textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>URL del archivo</Label>
              <Input value={form.archivoUrl} onChange={e => setForm(f => ({ ...f, archivoUrl: e.target.value }))}
                placeholder="https://... (Drive, Dropbox, Cloudinary...)" />
              <p className="text-xs text-muted-foreground mt-1">Pega el enlace del archivo subido a Drive, Dropbox u otro servicio.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={addMut.isPending}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MasajesRRHH() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<"evaluaciones" | "documentos">("evaluaciones");

  const { data: therapists, isLoading } = trpc.masajes.terapeutas.getAll.useQuery();

  const inhouse = therapists?.filter(t => t.type === "inhouse" && t.active === 1) ?? [];
  const freelance = therapists?.filter(t => t.type === "freelance" && t.active === 1) ?? [];
  const selected = therapists?.find(t => t.id === selectedId);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">RRHH — Masajes</h1>
          <p className="text-muted-foreground text-sm mt-1">Evaluaciones KPI mensuales y gestión de documentos por terapeuta</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de terapeutas */}
          <div className="space-y-4">
            {isLoading ? <Skeleton className="h-40 w-full" /> : (
              <>
                {inhouse.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Inhouse</p>
                    <div className="space-y-1.5">
                      {inhouse.map(t => (
                        <button key={t.id} onClick={() => setSelectedId(t.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${selectedId === t.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                          <div>
                            <p className="font-medium text-sm">{t.name}</p>
                            <p className="text-xs text-muted-foreground">{t.contractType || "Full Time"}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {freelance.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Freelance</p>
                    <div className="space-y-1.5">
                      {freelance.sort((a, b) => (a.callPriority ?? 99) - (b.callPriority ?? 99)).map(t => (
                        <button key={t.id} onClick={() => setSelectedId(t.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${selectedId === t.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                          <div>
                            <p className="font-medium text-sm">{t.name}</p>
                            <p className="text-xs text-muted-foreground">Honorarios</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {inhouse.length === 0 && freelance.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin terapeutas activos.</p>
                )}
              </>
            )}
          </div>

          {/* Panel derecho */}
          <div className="lg:col-span-2">
            {!selected ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  Selecciona un terapeuta para ver sus evaluaciones y documentos
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-lg">
                    {selected.name[0]}
                  </div>
                  <div>
                    <h2 className="font-semibold">{selected.name}</h2>
                    <p className="text-sm text-muted-foreground">{selected.type === "inhouse" ? "Inhouse" : "Freelance"} · {selected.contractType || (selected.type === "inhouse" ? "Full Time" : "Honorarios")}</p>
                  </div>
                </div>

                <Tabs value={tab} onValueChange={v => setTab(v as any)}>
                  <TabsList>
                    <TabsTrigger value="evaluaciones" className="flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5" />Evaluaciones KPI
                    </TabsTrigger>
                    <TabsTrigger value="documentos" className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />Documentos
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="evaluaciones" className="mt-4">
                    <EvaluacionesPanel therapist={selected} />
                  </TabsContent>
                  <TabsContent value="documentos" className="mt-4">
                    <DocumentosPanel therapist={selected} />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
