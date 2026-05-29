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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Edit, AlertTriangle, Package, Save } from "lucide-react";

const DRAFT_NEW_KEY = "masajes:draft:insumo-nuevo";
const DRAFT_RECEIVE_KEY = "masajes:draft:insumo-recibir";

type NewSupplyForm = {
  name: string;
  unit: string;
  currentStock: string;
  minimumStock: string;
  purchasedAt: string;
  openedAt: string;
  notes: string;
};

type ReceiveForm = {
  supplyId: string;
  stockReceived: string;
  purchasedAt: string;
  openedAt: string;
  notes: string;
};

type EditForm = {
  name: string;
  unit: string;
  currentStock: string;
  minimumStock: string;
  purchasedAt: string;
  openedAt: string;
  notes: string;
};

const emptyNew: NewSupplyForm = { name: "", unit: "", currentStock: "0", minimumStock: "0", purchasedAt: "", openedAt: "", notes: "" };
const emptyReceive: ReceiveForm = { supplyId: "", stockReceived: "", purchasedAt: "", openedAt: "", notes: "" };

export default function MasajesInventario() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newForm, setNewForm] = useState<NewSupplyForm>(emptyNew);
  const [receiveForm, setReceiveForm] = useState<ReceiveForm>(emptyReceive);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", unit: "", currentStock: "0", minimumStock: "0", purchasedAt: "", openedAt: "", notes: "" });
  const [tab, setTab] = useState<"nuevo" | "recibir">("nuevo");

  const { data: supplies, isLoading } = trpc.masajes.inventario.getAll.useQuery();

  // Auto-save drafts
  useEffect(() => {
    if (open && !editingId && tab === "nuevo") localStorage.setItem(DRAFT_NEW_KEY, JSON.stringify(newForm));
  }, [newForm, open, editingId, tab]);

  useEffect(() => {
    if (open && !editingId && tab === "recibir") localStorage.setItem(DRAFT_RECEIVE_KEY, JSON.stringify(receiveForm));
  }, [receiveForm, open, editingId, tab]);

  const createMut = trpc.masajes.inventario.create.useMutation({
    onSuccess: () => {
      utils.masajes.inventario.getAll.invalidate();
      utils.masajes.inventario.getLowStock.invalidate();
      toast.success("Insumo creado");
      localStorage.removeItem(DRAFT_NEW_KEY);
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const receiveMut = trpc.masajes.inventario.receiveStock.useMutation({
    onSuccess: () => {
      utils.masajes.inventario.getAll.invalidate();
      utils.masajes.inventario.getLowStock.invalidate();
      toast.success("Stock actualizado");
      localStorage.removeItem(DRAFT_RECEIVE_KEY);
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.masajes.inventario.update.useMutation({
    onSuccess: () => {
      utils.masajes.inventario.getAll.invalidate();
      utils.masajes.inventario.getLowStock.invalidate();
      toast.success("Insumo actualizado");
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    const savedNew = localStorage.getItem(DRAFT_NEW_KEY);
    const savedReceive = localStorage.getItem(DRAFT_RECEIVE_KEY);
    setNewForm(savedNew ? { ...emptyNew, ...JSON.parse(savedNew) } : emptyNew);
    setReceiveForm(savedReceive ? { ...emptyReceive, ...JSON.parse(savedReceive) } : emptyReceive);
    setTab("nuevo");
    setOpen(true);
  };

  const openEdit = (s: any) => {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      unit: s.unit,
      currentStock: String(s.currentStock ?? "0"),
      minimumStock: String(s.minimumStock ?? "0"),
      purchasedAt: s.purchasedAt ?? "",
      openedAt: s.openedAt ?? "",
      notes: s.notes ?? "",
    });
    setOpen(true);
  };

  const handleSaveNew = () => {
    if (!newForm.name.trim() || !newForm.unit.trim()) {
      toast.error("Nombre y unidad son requeridos");
      return;
    }
    createMut.mutate({
      name: newForm.name.trim(),
      unit: newForm.unit.trim(),
      currentStock: newForm.currentStock || "0",
      minimumStock: newForm.minimumStock || "0",
      purchasedAt: newForm.purchasedAt || undefined,
      openedAt: newForm.openedAt || undefined,
      notes: newForm.notes || undefined,
    });
  };

  const handleReceive = () => {
    if (!receiveForm.supplyId || !receiveForm.stockReceived) {
      toast.error("Selecciona un insumo e ingresa la cantidad recibida");
      return;
    }
    receiveMut.mutate({
      id: Number(receiveForm.supplyId),
      stockReceived: receiveForm.stockReceived,
      purchasedAt: receiveForm.purchasedAt || undefined,
      openedAt: receiveForm.openedAt || undefined,
      notes: receiveForm.notes || undefined,
    });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    updateMut.mutate({
      id: editingId,
      name: editForm.name,
      unit: editForm.unit,
      currentStock: editForm.currentStock,
      minimumStock: editForm.minimumStock,
      purchasedAt: editForm.purchasedAt || undefined,
      openedAt: editForm.openedAt || undefined,
      notes: editForm.notes || undefined,
    });
  };

  const isLow = (s: any) => Number(s.currentStock) <= Number(s.minimumStock);

  const selectedSupply = supplies?.find(s => String(s.id) === receiveForm.supplyId);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Inventario</h1>
            <p className="text-muted-foreground text-sm mt-1">Control de insumos y materiales de masaje</p>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Agregar / Recibir</Button>
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
                      <div className="flex items-center gap-4 mt-1 text-sm flex-wrap">
                        <span className={`font-medium ${isLow(s) && s.active === 1 ? "text-destructive" : ""}`}>
                          Actual: <strong>{s.currentStock} {s.unit}</strong>
                        </span>
                        <span className="text-muted-foreground">Mínimo: {s.minimumStock} {s.unit}</span>
                        {s.purchasedAt && <span className="text-muted-foreground text-xs">Compra: {s.purchasedAt}</span>}
                        {s.openedAt && <span className="text-muted-foreground text-xs">Apertura: {s.openedAt}</span>}
                      </div>
                      {s.notes && <p className="text-xs text-muted-foreground mt-1 italic">{s.notes}</p>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Edit className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear / recibir / editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          {editingId ? (
            <>
              <DialogHeader>
                <DialogTitle>Editar insumo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Nombre *</Label>
                    <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Unidad</Label>
                    <Input value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Stock mínimo</Label>
                    <Input type="number" value={editForm.minimumStock} onChange={e => setEditForm(f => ({ ...f, minimumStock: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Stock actual</Label>
                    <Input type="number" value={editForm.currentStock} onChange={e => setEditForm(f => ({ ...f, currentStock: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Fecha de compra</Label>
                    <Input type="date" value={editForm.purchasedAt} onChange={e => setEditForm(f => ({ ...f, purchasedAt: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Fecha apertura envase</Label>
                    <Input type="date" value={editForm.openedAt} onChange={e => setEditForm(f => ({ ...f, openedAt: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <Label>Notas (merma, pérdida, etc.)</Label>
                    <Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleUpdate} disabled={updateMut.isPending}>Guardar cambios</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="w-4 h-4" />Insumos
                  <span className="text-xs font-normal text-muted-foreground flex items-center gap-1 ml-2"><Save className="w-3 h-3" />Borrador guardado</span>
                </DialogTitle>
              </DialogHeader>
              <Tabs value={tab} onValueChange={v => setTab(v as any)}>
                <TabsList className="w-full">
                  <TabsTrigger value="nuevo" className="flex-1">Nuevo insumo</TabsTrigger>
                  <TabsTrigger value="recibir" className="flex-1">Recibir stock existente</TabsTrigger>
                </TabsList>

                {/* TAB: Nuevo insumo */}
                <TabsContent value="nuevo" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label>Nombre del insumo *</Label>
                      <Input
                        list="supply-names"
                        value={newForm.name}
                        onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Aceite de masaje, toalla, etc."
                      />
                      <datalist id="supply-names">
                        {supplies?.map(s => <option key={s.id} value={s.name} />)}
                      </datalist>
                    </div>
                    <div>
                      <Label>Unidad de medida *</Label>
                      <Input value={newForm.unit} onChange={e => setNewForm(f => ({ ...f, unit: e.target.value }))} placeholder="ml, g, unidades..." />
                    </div>
                    <div>
                      <Label>Stock que llegó</Label>
                      <Input type="number" value={newForm.currentStock} onChange={e => setNewForm(f => ({ ...f, currentStock: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Stock mínimo</Label>
                      <Input type="number" value={newForm.minimumStock} onChange={e => setNewForm(f => ({ ...f, minimumStock: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Fecha de compra</Label>
                      <Input type="date" value={newForm.purchasedAt} onChange={e => setNewForm(f => ({ ...f, purchasedAt: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Fecha apertura envase</Label>
                      <Input type="date" value={newForm.openedAt} onChange={e => setNewForm(f => ({ ...f, openedAt: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <Label>Notas (merma, pérdida, etc.)</Label>
                      <Textarea value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSaveNew} disabled={createMut.isPending}>Crear insumo</Button>
                  </DialogFooter>
                </TabsContent>

                {/* TAB: Recibir stock existente */}
                <TabsContent value="recibir" className="space-y-4 mt-4">
                  <div>
                    <Label>Insumo existente *</Label>
                    <select
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                      value={receiveForm.supplyId}
                      onChange={e => setReceiveForm(f => ({ ...f, supplyId: e.target.value }))}
                    >
                      <option value="">Seleccionar insumo...</option>
                      {supplies?.filter(s => s.active === 1).map(s => (
                        <option key={s.id} value={String(s.id)}>
                          {s.name} — stock actual: {s.currentStock} {s.unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label>Cantidad recibida *{selectedSupply && ` (${selectedSupply.unit})`}</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={receiveForm.stockReceived}
                        onChange={e => setReceiveForm(f => ({ ...f, stockReceived: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Fecha de compra</Label>
                      <Input type="date" value={receiveForm.purchasedAt} onChange={e => setReceiveForm(f => ({ ...f, purchasedAt: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Fecha apertura envase</Label>
                      <Input type="date" value={receiveForm.openedAt} onChange={e => setReceiveForm(f => ({ ...f, openedAt: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <Label>Notas</Label>
                      <Textarea value={receiveForm.notes} onChange={e => setReceiveForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Proveedor, lote, etc." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={handleReceive} disabled={receiveMut.isPending}>Confirmar recepción</Button>
                  </DialogFooter>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
