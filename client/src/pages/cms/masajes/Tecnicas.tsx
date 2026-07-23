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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit, ChevronDown, ChevronRight, Trash2, Save, Link2, Image as ImageIcon } from "lucide-react";

const DRAFT_KEY = "masajes:draft:tecnica";
const DURATIONS = [20, 40, 50, 80, 110];
const PRICE_FIELDS = ["price50min", "price80min", "price110min"] as const;

type TechniqueForm = {
  name: string;
  description: string;
  imageUrl: string;
  durations: number[];
  price50min: string;
  price80min: string;
  price110min: string;
};

const emptyForm: TechniqueForm = {
  name: "", description: "", imageUrl: "", durations: [50, 80, 110],
  price50min: "", price80min: "", price110min: "",
};

type RecipeForm = {
  supplyId: string;
  quantityPer50min: string;
  quantityPer80min: string;
  quantityPer110min: string;
};
const emptyRecipe: RecipeForm = { supplyId: "", quantityPer50min: "", quantityPer80min: "", quantityPer110min: "" };

const normalizeDecimalText = (value: string) => {
  const match = value.replace(",", ".").match(/^-?\d*(?:\.\d*)?/);
  return match?.[0] ?? "";
};

export default function MasajesTecnicas() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<TechniqueForm>(emptyForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeForm, setRecipeForm] = useState<RecipeForm>(emptyRecipe);
  const [editingRecipeId, setEditingRecipeId] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const { data: techniques, isLoading } = trpc.masajes.tecnicas.getAll.useQuery();
  const { data: supplies } = trpc.masajes.inventario.getAll.useQuery();
  const { data: recipes, refetch: refetchRecipes } = trpc.masajes.tecnicas.getRecipes.useQuery(
    { techniqueId: expandedId ?? 0 },
    { enabled: expandedId !== null }
  );

  // Auto-save draft (solo en modo crear)
  useEffect(() => {
    if (open && !editing) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }
  }, [form, open, editing]);

  const createMut = trpc.masajes.tecnicas.create.useMutation({
    onSuccess: () => {
      utils.masajes.tecnicas.getAll.invalidate();
      toast.success("Técnica creada");
      localStorage.removeItem(DRAFT_KEY);
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.masajes.tecnicas.update.useMutation({
    onSuccess: () => { utils.masajes.tecnicas.getAll.invalidate(); toast.success("Técnica actualizada"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const uploadImageMut = trpc.masajes.tecnicas.uploadImage.useMutation();
  const deleteMut = trpc.masajes.tecnicas.delete.useMutation({
    onSuccess: () => { utils.masajes.tecnicas.getAll.invalidate(); toast.success("Técnica eliminada"); },
    onError: e => toast.error(e.message),
  });
  const upsertRecipeMut = trpc.masajes.tecnicas.upsertRecipe.useMutation({
    onSuccess: () => { refetchRecipes(); toast.success("Insumo guardado en receta"); setRecipeOpen(false); },
    onError: e => toast.error(e.message),
  });
  const deleteRecipeMut = trpc.masajes.tecnicas.deleteRecipe.useMutation({
    onSuccess: () => { refetchRecipes(); toast.success("Insumo eliminado"); },
    onError: e => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setImageFile(null);
    const saved = localStorage.getItem(DRAFT_KEY);
    setForm(saved ? { ...emptyForm, ...JSON.parse(saved) } : emptyForm);
    setOpen(true);
  };

  const openEdit = (t: any) => {
    setEditing(t.id);
    const durs = (t.durations ?? "50,80,110").split(",").map(Number);
    setForm({
      name: t.name,
      description: t.description ?? "",
      imageUrl: t.imageUrl ?? "",
      durations: durs,
      price50min: t.price50min ?? "",
      price80min: t.price80min ?? "",
      price110min: t.price110min ?? "",
    });
    setImageFile(null);
    setOpen(true);
  };

  const toggleDuration = (d: number) => {
    setForm(f => ({
      ...f,
      durations: f.durations.includes(d) ? f.durations.filter(x => x !== d) : [...f.durations, d].sort((a, b) => a - b),
    }));
  };

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("El nombre es requerido"); return; }
    if (form.durations.length === 0) { toast.error("Selecciona al menos una duración"); return; }
    let imageUrl = form.imageUrl.trim();
    if (imageFile) {
      const imageData = await fileToDataUrl(imageFile);
      const uploaded = await uploadImageMut.mutateAsync({ imageData, mimeType: imageFile.type });
      imageUrl = uploaded.url;
    }
    const sorted = [...form.durations].sort((a, b) => a - b);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      imageUrl: imageUrl || null,
      durations: sorted.join(","),
      // Mapeo posicional: 1ª duración → price50min, 2ª → price80min, 3ª → price110min
      price50min: sorted.length >= 1 ? (form.price50min || undefined) : "0",
      price80min: sorted.length >= 2 ? (form.price80min || undefined) : "0",
      price110min: sorted.length >= 3 ? (form.price110min || undefined) : "0",
    };
    if (editing) updateMut.mutate({ id: editing, ...payload });
    else createMut.mutate({ ...payload, imageUrl: imageUrl || undefined });
  };

  const handleSaveRecipe = () => {
    if (!expandedId || !recipeForm.supplyId || !recipeForm.quantityPer50min) {
      toast.error("Completa insumo y cantidad para 50 min");
      return;
    }
    upsertRecipeMut.mutate({
      techniqueId: expandedId,
      supplyId: Number(recipeForm.supplyId),
      quantityPer50min: recipeForm.quantityPer50min,
      quantityPer80min: recipeForm.quantityPer80min || undefined,
      quantityPer110min: recipeForm.quantityPer110min || undefined,
    });
  };

  const selectedSupply = supplies?.find(s => String(s.id) === recipeForm.supplyId);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Técnicas</h1>
            <p className="text-muted-foreground text-sm mt-1">Tipos de masaje, precios y recetas de insumos</p>
          </div>
          <Button className="w-full sm:w-auto" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Nueva técnica</Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : !techniques || techniques.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Sin técnicas. Agrega la primera.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {techniques.map(t => {
              const durs = (t.durations ?? "").split(",").map(s => s.trim()).filter(Boolean);
              return (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      {t.imageUrl ? (
                        <img src={t.imageUrl} alt={t.name} className="h-36 w-full rounded-md object-cover border sm:h-20 sm:w-28" />
                      ) : (
                        <div className="h-28 w-full rounded-md border bg-muted flex items-center justify-center text-muted-foreground sm:h-20 sm:w-28">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{t.name}</span>
                          {t.active === 0 && <Badge variant="secondary">Inactiva</Badge>}
                          {durs.map(d => (
                            <Badge key={d} variant="outline" className="text-xs">{d} min</Badge>
                          ))}
                        </div>
                        {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                          {durs.map((d, i) => {
                            const price = i === 0 ? t.price50min : i === 1 ? t.price80min : t.price110min;
                            return price && Number(price) > 0 ? (
                              <span key={d}>{d} min: <strong>${Number(price).toLocaleString("es-CL")}</strong></span>
                            ) : null;
                          })}
                        </div>
                      </div>
                      <div className="flex w-full flex-wrap justify-end gap-1 sm:w-auto sm:flex-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                          {expandedId === t.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <span className="text-xs ml-1">Insumos</span>
                        </Button>
                        <Button size="sm" variant="ghost" title="Copiar link de reserva"
                          onClick={() => {
                            const url = `${window.location.origin}/reservar/masaje/${t.id}`;
                            navigator.clipboard.writeText(url);
                            toast.success("Link copiado");
                          }}>
                          <Link2 className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => { if (confirm("¿Eliminar técnica?")) deleteMut.mutate({ id: t.id }); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {expandedId === t.id && (
                      <div className="mt-4 border-t pt-4">
                        <div className="mb-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-sm font-medium">Insumos requeridos por sesión</span>
                          <Button size="sm" variant="outline" onClick={() => { setRecipeForm(emptyRecipe); setRecipeOpen(true); }}>
                            <Plus className="w-3 h-3 mr-1" />Agregar insumo
                          </Button>
                        </div>
                        {!recipes || recipes.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Sin insumos asignados.</p>
                        ) : (
                          <div className="space-y-2 overflow-x-auto pb-1">
                            <div className="grid min-w-[420px] grid-cols-5 gap-2 text-xs text-muted-foreground font-medium px-2">
                              <span className="col-span-2">Insumo</span>
                              {durs.map(d => <span key={d}>{d} min</span>)}
                            </div>
                            {recipes.map(r => (
                              <div key={r.id} className="grid min-w-[420px] grid-cols-5 gap-2 items-center text-sm border rounded-lg px-2 py-2">
                                <span className="col-span-2 font-medium">{r.supplyName} ({r.unit})</span>
                                <span>{r.quantityPer50min}</span>
                                <span>{r.quantityPer80min ?? "—"}</span>
                                <div className="flex items-center justify-between">
                                  <span>{r.quantityPer110min ?? "—"}</span>
                                  <div className="flex gap-0.5">
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                      onClick={() => {
                                        setEditingRecipeId(r.id);
                                        setRecipeForm({
                                          supplyId: String(r.supplyId),
                                          quantityPer50min: r.quantityPer50min ?? "",
                                          quantityPer80min: r.quantityPer80min ?? "",
                                          quantityPer110min: r.quantityPer110min ?? "",
                                        });
                                        setRecipeOpen(true);
                                      }}>
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                      onClick={() => deleteRecipeMut.mutate({ id: r.id })}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal técnica */}
      <Dialog open={open} onOpenChange={o => { setOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {editing ? "Editar técnica" : "Nueva técnica"}
              {!editing && <span className="text-xs font-normal text-muted-foreground flex items-center gap-1"><Save className="w-3 h-3" />Borrador guardado automáticamente</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Masaje Relajante" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Foto para la página web</Label>
              {(imageFile || form.imageUrl) && (
                <img
                  src={imageFile ? URL.createObjectURL(imageFile) : form.imageUrl}
                  alt="Vista previa"
                  className="h-36 w-full rounded-md object-cover border"
                />
              )}
              <Input
                type="file"
                accept="image/*"
                onChange={e => setImageFile(e.target.files?.[0] ?? null)}
              />
              <Input
                value={form.imageUrl}
                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                placeholder="O pega una URL de imagen"
              />
            </div>
            <div>
              <Label>Duraciones disponibles *</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {DURATIONS.map(d => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={form.durations.includes(d) ? "default" : "outline"}
                    onClick={() => toggleDuration(d)}
                  >
                    {d} min
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Precio a público ($ CLP)</Label>
              <div className="grid grid-cols-3 gap-3 mt-1">
                {[...form.durations].sort((a, b) => a - b).slice(0, PRICE_FIELDS.length).map((d, i) => (
                  <div key={d}>
                    <span className="text-xs text-muted-foreground">{d} min</span>
                    <Input
                      value={form[PRICE_FIELDS[i]]}
                      onChange={e => setForm(f => ({ ...f, [PRICE_FIELDS[i]]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              {form.durations.length === 0 && <p className="text-xs text-muted-foreground mt-1">Selecciona una duración para ingresar precios.</p>}
            </div>
            {editing && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                Los insumos requeridos por sesión se configuran desde la lista, haciendo clic en "Insumos" de cada técnica.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending || uploadImageMut.isPending}>
              {editing ? "Guardar cambios" : "Crear técnica"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal receta */}
      <Dialog open={recipeOpen} onOpenChange={o => { setRecipeOpen(o); if (!o) { setEditingRecipeId(null); setRecipeForm(emptyRecipe); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRecipeId ? "Editar cantidades" : "Agregar insumo a la receta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Insumo *</Label>
              {editingRecipeId ? (
                <p className="text-sm font-medium border rounded-md px-3 py-2 bg-muted mt-1">
                  {supplies?.find(s => String(s.id) === recipeForm.supplyId)?.name ?? "—"}
                </p>
              ) : (!supplies || supplies.filter(s => s.active === 1).length === 0) ? (
                <p className="text-sm text-muted-foreground mt-1">No hay insumos en inventario. Agrégalos primero desde la sección Inventario.</p>
              ) : (
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                  value={recipeForm.supplyId}
                  onChange={e => setRecipeForm(f => ({ ...f, supplyId: e.target.value }))}
                >
                  <option value="">Seleccionar insumo</option>
                  {supplies.filter(s => s.active === 1).map(s => (
                    <option key={s.id} value={String(s.id)}>{s.name} ({s.unit})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <Label>Cantidad utilizada por sesión</Label>
              {selectedSupply && (
                <p className="text-xs text-muted-foreground mt-1">
                  Ingresa solo el numero. Unidad: {selectedSupply.unit}.
                </p>
              )}
              <div className="grid grid-cols-3 gap-3 mt-1">
                <div>
                  <span className="text-xs text-muted-foreground">50 min *</span>
                  <Input
                    inputMode="decimal"
                    value={recipeForm.quantityPer50min}
                    onChange={e => setRecipeForm(f => ({ ...f, quantityPer50min: normalizeDecimalText(e.target.value) }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">80 min</span>
                  <Input
                    inputMode="decimal"
                    value={recipeForm.quantityPer80min}
                    onChange={e => setRecipeForm(f => ({ ...f, quantityPer80min: normalizeDecimalText(e.target.value) }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">110 min</span>
                  <Input
                    inputMode="decimal"
                    value={recipeForm.quantityPer110min}
                    onChange={e => setRecipeForm(f => ({ ...f, quantityPer110min: normalizeDecimalText(e.target.value) }))}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecipeOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveRecipe} disabled={upsertRecipeMut.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
