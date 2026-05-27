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
import { Plus, Edit, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";

type SupplyForm = {
  name: string;
  unit: string;
  currentStock: string;
  minimumStock: string;
  notes: string;
};

const emptyForm: SupplyForm = { name: "", unit: "", currentStock: "0", minimumStock: "0", notes: "" };

export default function MasajesInventario() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<SupplyForm>(emptyForm);
  const [adjustId, setAdjustId] = useState<number | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);

  const { data: supplies, isLoading } = trpc.masajes.inventario.getAll.useQuery();

  const createMut = trpc.masajes.inventario.create.useMutation({
    onSuccess: () => { utils.masajes.inventario.getAll.invalidate(); toast.success("Insumo creado"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.masajes.inventario.update.useMutation({
    onSuccess: () => { utils.masajes.inventario.getAll.invalidate(); toast.success("Insumo actualizado"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const adjustMut = trpc.masajes.inventario.adjustStock.useMutation({
    onSuccess: () => {
      utils.masajes.inventario.getAll.invalidate();
      utils.masajes.inventario.getLowStock.invalidate();
      toast.success("Stock ajustado");
      setAdjustOpen(false);
      setAdjustDelta("");
    },
    onError: e => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (s: any) => {
    setEditing(s.id);
    setForm({
      name: s.name, unit: s.unit,
      currentStock: String(s.currentStock ?? "0"),
      minimumStock: String(s.minimumStock ?? "0"),
      notes: s.notes ?? "",
    });
    setOpen(true);
  };

  const openAdjust = (id: number) => {
    setAdjustId(id);
    setAdjustDelta("");
    setAdjustOpen(true);
  };

  const handleSave = () => {
    if (editing) updateMut.mutate({ id: editing, ...form });
    else createMut.mutate(form);
  };

  const handleAdjust = (sign: "+" | "-") => {
    if (!adjustId || !adjustDelta) return;
    const delta = sign === "+" ? adjustDelta : `-${adjustDelta}`;
    adjustMut.mutate({ id: adjustId, delta });
  };

  const isLow = (s: any) => Number(s.currentStock) <= Number(s.minimumStock);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Inventario</h1>
            <p className="text-muted-foreground text-sm mt-1">Control de insumos y materiales de masaje</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Nuevo insumo</Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : !supplies || supplies.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Sin insumos registrados.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {supplies.map(s => (
              <Card key={s.id} className={s.active === 0 ? "opacity-50" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{s.name}</span>
                        <Badge variant="outline" className="text-xs">{s.unit}</Badge>
                        {isLow(s) && s.active === 1 && (
                          <Badge variant="destructive" className="text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />Stock bajo
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <span className={`font-medium ${isLow(s) && s.active === 1 ? "text-destructive" : "text-foreground"}`}>
                          Stock actual: <strong>{s.currentStock} {s.unit}</strong>
                        </span>
                        <span className="text-muted-foreground">
                          Mínimo: {s.minimumStock} {s.unit}
                        </span>
                      </div>
                      {s.notes && <p className="text-xs text-muted-foreground mt-1 italic">{s.notes}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openAdjust(s.id)}>
                        Ajustar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Edit className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar insumo" : "Nuevo insumo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Unidad de medida *</Label>
              <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="ml, g, unidades..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Stock actual</Label>
                <Input type="number" value={form.currentStock} onChange={e => setForm(f => ({ ...f, currentStock: e.target.value }))} />
              </div>
              <div>
                <Label>Stock mínimo</Label>
                <Input type="number" value={form.minimumStock} onChange={e => setForm(f => ({ ...f, minimumStock: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {editing ? "Guardar cambios" : "Crear insumo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal ajuste de stock */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Ajustar stock</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Ingresa la cantidad a agregar o descontar del stock actual.
            </p>
            <div>
              <Label>Cantidad</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={adjustDelta}
                onChange={e => setAdjustDelta(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
            <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => handleAdjust("-")} disabled={adjustMut.isPending || !adjustDelta}>
              <ArrowDown className="w-4 h-4 mr-1" />Descontar
            </Button>
            <Button onClick={() => handleAdjust("+")} disabled={adjustMut.isPending || !adjustDelta}>
              <ArrowUp className="w-4 h-4 mr-1" />Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
