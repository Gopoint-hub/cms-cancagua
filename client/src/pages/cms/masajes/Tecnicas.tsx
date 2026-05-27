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
import { toast } from "sonner";
import { Plus, Edit, ChevronDown, ChevronRight, Trash2 } from "lucide-react";

type TechniqueForm = {
  name: string;
  description: string;
  durations: string;
};

const emptyForm: TechniqueForm = { name: "", description: "", durations: "50,80,110" };

type RecipeForm = {
  supplyId: string;
  quantityPer50min: string;
  quantityPer80min: string;
  quantityPer110min: string;
};

const emptyRecipe: RecipeForm = { supplyId: "", quantityPer50min: "", quantityPer80min: "", quantityPer110min: "" };

export default function MasajesTecnicas() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<TechniqueForm>(emptyForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<number | null>(null);
  const [recipeForm, setRecipeForm] = useState<RecipeForm>(emptyRecipe);

  const { data: techniques, isLoading } = trpc.masajes.tecnicas.getAll.useQuery();
  const { data: supplies } = trpc.masajes.inventario.getAll.useQuery();
  const { data: recipes, refetch: refetchRecipes } = trpc.masajes.tecnicas.getRecipes.useQuery(
    { techniqueId: expandedId ?? 0 },
    { enabled: expandedId !== null }
  );

  const createMut = trpc.masajes.tecnicas.create.useMutation({
    onSuccess: () => { utils.masajes.tecnicas.getAll.invalidate(); toast.success("Técnica creada"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.masajes.tecnicas.update.useMutation({
    onSuccess: () => { utils.masajes.tecnicas.getAll.invalidate(); toast.success("Técnica actualizada"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.masajes.tecnicas.delete.useMutation({
    onSuccess: () => { utils.masajes.tecnicas.getAll.invalidate(); toast.success("Técnica eliminada"); },
    onError: e => toast.error(e.message),
  });
  const upsertRecipeMut = trpc.masajes.tecnicas.upsertRecipe.useMutation({
    onSuccess: () => { refetchRecipes(); toast.success("Receta guardada"); setRecipeOpen(false); },
    onError: e => toast.error(e.message),
  });
  const deleteRecipeMut = trpc.masajes.tecnicas.deleteRecipe.useMutation({
    onSuccess: () => { refetchRecipes(); toast.success("Insumo eliminado de la receta"); },
    onError: e => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (t: any) => {
    setEditing(t.id);
    setForm({ name: t.name, description: t.description ?? "", durations: t.durations ?? "50,80,110" });
    setOpen(true);
  };

  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing, ...form });
    else createMut.mutate(form);
  };

  const openAddRecipe = () => {
    setEditingRecipe(null);
    setRecipeForm(emptyRecipe);
    setRecipeOpen(true);
  };

  const handleSaveRecipe = () => {
    if (!expandedId) return;
    upsertRecipeMut.mutate({
      techniqueId: expandedId,
      supplyId: Number(recipeForm.supplyId),
      quantityPer50min: recipeForm.quantityPer50min,
      quantityPer80min: recipeForm.quantityPer80min || undefined,
      quantityPer110min: recipeForm.quantityPer110min || undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Técnicas</h1>
            <p className="text-muted-foreground text-sm mt-1">Tipos de masaje y sus recetas de insumos</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Nueva técnica</Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : !techniques || techniques.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Sin técnicas. Agrega la primera.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {techniques.map(t => (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{t.name}</span>
                        {t.active === 0 && <Badge variant="secondary">Inactiva</Badge>}
                        {t.durations && t.durations.split(",").map(d => (
                          <Badge key={d} variant="outline" className="text-xs">{d.trim()} min</Badge>
                        ))}
                      </div>
                      {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                        {expandedId === t.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="text-xs ml-1">Receta</span>
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
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium">Insumos requeridos</span>
                        <Button size="sm" variant="outline" onClick={openAddRecipe}>
                          <Plus className="w-3 h-3 mr-1" />Agregar insumo
                        </Button>
                      </div>
                      {!recipes || recipes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sin insumos asignados a esta técnica.</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground font-medium px-2">
                            <span className="col-span-2">Insumo</span>
                            <span>50 min</span>
                            <span>80 min</span>
                            <span>110 min</span>
                          </div>
                          {recipes.map(r => (
                            <div key={r.id} className="grid grid-cols-5 gap-2 items-center text-sm border rounded-lg px-2 py-2">
                              <span className="col-span-2 font-medium">{r.supplyName} ({r.unit})</span>
                              <span>{r.quantityPer50min}</span>
                              <span>{r.quantityPer80min ?? "—"}</span>
                              <div className="flex items-center justify-between">
                                <span>{r.quantityPer110min ?? "—"}</span>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  onClick={() => deleteRecipeMut.mutate({ id: r.id })}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal técnica */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar técnica" : "Nueva técnica"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>Duraciones disponibles (minutos, separadas por coma)</Label>
              <Input value={form.durations} onChange={e => setForm(f => ({ ...f, durations: e.target.value }))} placeholder="50,80,110" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {editing ? "Guardar cambios" : "Crear técnica"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal receta */}
      <Dialog open={recipeOpen} onOpenChange={setRecipeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar insumo a la receta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Insumo *</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={recipeForm.supplyId}
                onChange={e => setRecipeForm(f => ({ ...f, supplyId: e.target.value }))}
              >
                <option value="">Seleccionar insumo</option>
                {supplies?.filter(s => s.active === 1).map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name} ({s.unit})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Cant. 50 min *</Label>
                <Input value={recipeForm.quantityPer50min} onChange={e => setRecipeForm(f => ({ ...f, quantityPer50min: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Cant. 80 min</Label>
                <Input value={recipeForm.quantityPer80min} onChange={e => setRecipeForm(f => ({ ...f, quantityPer80min: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Cant. 110 min</Label>
                <Input value={recipeForm.quantityPer110min} onChange={e => setRecipeForm(f => ({ ...f, quantityPer110min: e.target.value }))} placeholder="0" />
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
