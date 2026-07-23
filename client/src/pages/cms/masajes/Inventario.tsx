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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Edit, AlertTriangle, ArrowUp, Package, Wrench, MapPin, Save, Trash2 } from "lucide-react";

const DRAFT_NEW_KEY = "masajes:draft:insumo-nuevo";
const DRAFT_RECEIVE_KEY = "masajes:draft:insumo-recibir";

type NewSupplyForm = {
  name: string; unit: string; categoria: "insumo" | "herramienta";
  ubicacion: string; vidaUtilMeses: string;
  currentStock: string; minimumStock: string;
  purchasedAt: string; openedAt: string; notes: string;
};
type ReceiveForm = {
  supplyId: string; stockReceived: string;
  purchasedAt: string; openedAt: string; notes: string;
};
type EditForm = {
  name: string; unit: string; categoria: "insumo" | "herramienta";
  ubicacion: string; vidaUtilMeses: string;
  currentStock: string; minimumStock: string;
  purchasedAt: string; openedAt: string; notes: string;
};

const emptyNew: NewSupplyForm = {
  name: "", unit: "", categoria: "insumo", ubicacion: "", vidaUtilMeses: "",
  currentStock: "0", minimumStock: "0", purchasedAt: "", openedAt: "", notes: "",
};
const emptyReceive: ReceiveForm = { supplyId: "", stockReceived: "", purchasedAt: "", openedAt: "", notes: "" };

export default function MasajesInventario() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newForm, setNewForm] = useState<NewSupplyForm>(emptyNew);
  const [receiveForm, setReceiveForm] = useState<ReceiveForm>(emptyReceive);
  const [editForm, setEditForm] = useState<EditForm>({ ...emptyNew, currentStock: "0", minimumStock: "0" });
  const [addTab, setAddTab] = useState<"nuevo" | "recibir">("nuevo");
  const [viewCategoria, setViewCategoria] = useState<"insumo" | "herramienta">("insumo");

  const { data: supplies, isLoading } = trpc.masajes.inventario.getAll.useQuery();

  const insumos = supplies?.filter(s => (s.categoria ?? "insumo") === "insumo") ?? [];
  const herramientas = supplies?.filter(s => s.categoria === "herramienta") ?? [];

  // Auto-save drafts
  useEffect(() => {
    if (open && !editingId && addTab === "nuevo") localStorage.setItem(DRAFT_NEW_KEY, JSON.stringify(newForm));
  }, [newForm, open, editingId, addTab]);
  useEffect(() => {
    if (open && !editingId && addTab === "recibir") localStorage.setItem(DRAFT_RECEIVE_KEY, JSON.stringify(receiveForm));
  }, [receiveForm, open, editingId, addTab]);

  const createMut = trpc.masajes.inventario.create.useMutation({
    onSuccess: () => {
      utils.masajes.inventario.getAll.invalidate();
      utils.masajes.inventario.getLowStock.invalidate();
      toast.success("Creado correctamente");
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
      toast.success("Actualizado correctamente");
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteMut = trpc.masajes.inventario.delete.useMutation({
    onSuccess: () => {
      utils.masajes.inventario.getAll.invalidate();
      utils.masajes.inventario.getLowStock.invalidate();
      toast.success("Eliminado correctamente");
    },
    onError: e => toast.error(e.message),
  });

  const openCreate = (categoria: "insumo" | "herramienta") => {
    setEditingId(null);
    const savedNew = localStorage.getItem(DRAFT_NEW_KEY);
    setNewForm(savedNew ? { ...emptyNew, categoria, ...JSON.parse(savedNew) } : { ...emptyNew, categoria });
    const savedReceive = localStorage.getItem(DRAFT_RECEIVE_KEY);
    setReceiveForm(savedReceive ? { ...emptyReceive, ...JSON.parse(savedReceive) } : emptyReceive);
    setAddTab("nuevo");
    setOpen(true);
  };

  const openEdit = (s: any) => {
    setEditingId(s.id);
    setEditForm({
      name: s.name, unit: s.unit,
      categoria: s.categoria ?? "insumo",
      ubicacion: s.ubicacion ?? "",
      vidaUtilMeses: s.vidaUtilMeses ? String(s.vidaUtilMeses) : "",
      currentStock: String(s.currentStock ?? "0"),
      minimumStock: String(s.minimumStock ?? "0"),
      purchasedAt: s.purchasedAt ?? "", openedAt: s.openedAt ?? "",
      notes: s.notes ?? "",
    });
    setOpen(true);
  };

  const handleSaveNew = () => {
    if (!newForm.name.trim() || !newForm.unit.trim()) { toast.error("Nombre y unidad son requeridos"); return; }
    createMut.mutate({
      name: newForm.name.trim(), unit: newForm.unit.trim(),
      categoria: newForm.categoria,
      ubicacion: newForm.ubicacion || undefined,
      vidaUtilMeses: newForm.vidaUtilMeses ? Number(newForm.vidaUtilMeses) : undefined,
      currentStock: newForm.currentStock || "0",
      minimumStock: newForm.minimumStock || "0",
      purchasedAt: newForm.purchasedAt || undefined,
      openedAt: newForm.openedAt || undefined,
      notes: newForm.notes || undefined,
    });
  };

  const handleReceive = () => {
    if (!receiveForm.supplyId || !receiveForm.stockReceived) { toast.error("Selecciona un ítem e ingresa la cantidad"); return; }
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
      name: editForm.name, unit: editForm.unit,
      categoria: editForm.categoria,
      ubicacion: editForm.ubicacion || undefined,
      vidaUtilMeses: editForm.vidaUtilMeses ? Number(editForm.vidaUtilMeses) : undefined,
      currentStock: editForm.currentStock,
      minimumStock: editForm.minimumStock,
      purchasedAt: editForm.purchasedAt || undefined,
      openedAt: editForm.openedAt || undefined,
      notes: editForm.notes || undefined,
    });
  };

  const isLow = (s: any) => (s.categoria ?? "insumo") === "insumo" && Number(s.currentStock) <= Number(s.minimumStock);

  const SupplyCard = ({ s }: { s: any }) => (
    <Card className={s.active === 0 ? "opacity-50" : ""}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{s.name}</span>
              <Badge variant="outline" className="text-xs">{s.unit}</Badge>
              {isLow(s) && s.active === 1 && (
                <Badge variant="destructive" className="text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />Stock bajo
                </Badge>
              )}
              {s.ubicacion && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3" />{s.ubicacion}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm flex-wrap">
              {(s.categoria ?? "insumo") === "insumo" ? (
                <>
                  <span className={`font-medium ${isLow(s) && s.active === 1 ? "text-destructive" : ""}`}>
                    Actual: <strong>{s.currentStock} {s.unit}</strong>
                  </span>
                  <span className="text-muted-foreground">Mínimo: {s.minimumStock} {s.unit}</span>
                </>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {s.vidaUtilMeses ? `Vida útil: ${s.vidaUtilMeses} meses` : "Sin vida útil definida"}
                </span>
              )}
              {s.purchasedAt && <span className="text-muted-foreground text-xs">Compra: {s.purchasedAt}</span>}
              {s.openedAt && <span className="text-muted-foreground text-xs">Apertura: {s.openedAt}</span>}
            </div>
            {s.notes && <p className="text-xs text-muted-foreground mt-1 italic">{s.notes}</p>}
          </div>
          <div className="flex w-full justify-end gap-1 sm:w-auto">
            <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Edit className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => { if (confirm(`¿Eliminar "${s.name}"? Esta acción no se puede deshacer.`)) deleteMut.mutate({ id: s.id }); }}>
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
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Inventario</h1>
            <p className="text-muted-foreground text-sm mt-1">Insumos consumibles y herramientas del área de masajes</p>
          </div>
          <Button className="w-full sm:w-auto" onClick={() => openCreate(viewCategoria)}>
            <Plus className="w-4 h-4 mr-2" />Agregar / Recibir
          </Button>
        </div>

        <Tabs value={viewCategoria} onValueChange={v => setViewCategoria(v as any)}>
          <TabsList>
            <TabsTrigger value="insumo" className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />Insumos ({insumos.length})
            </TabsTrigger>
            <TabsTrigger value="herramienta" className="flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />Herramientas ({herramientas.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="insumo" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">Productos que se consumen en cada sesión (aceites, cremas, etc.)</p>
            {isLoading ? [1,2,3].map(i=><Skeleton key={i} className="h-16 w-full"/>) :
              insumos.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">Sin insumos. Agrega el primero.</CardContent></Card> :
              insumos.map(s => <SupplyCard key={s.id} s={s} />)}
          </TabsContent>

          <TabsContent value="herramienta" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">Equipamiento y materiales que se renuevan por uso (sábanas, mantas, ollas de piedras, etc.)</p>
            {isLoading ? [1,2,3].map(i=><Skeleton key={i} className="h-16 w-full"/>) :
              herramientas.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">Sin herramientas. Agrega la primera.</CardContent></Card> :
              herramientas.map(s => <SupplyCard key={s.id} s={s} />)}
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal crear / recibir / editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          {editingId ? (
            <>
              <DialogHeader>
                <DialogTitle>Editar {editForm.categoria === "herramienta" ? "herramienta" : "insumo"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Nombre *</Label>
                    <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Categoría</Label>
                    <Select value={editForm.categoria} onValueChange={v => setEditForm(f => ({ ...f, categoria: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="insumo">Insumo</SelectItem>
                        <SelectItem value="herramienta">Herramienta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Unidad</Label>
                    <Input value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <Label>Ubicación</Label>
                    <Input value={editForm.ubicacion} onChange={e => setEditForm(f => ({ ...f, ubicacion: e.target.value }))} placeholder="Ej: Bodega 1, Estante A" />
                  </div>
                  {editForm.categoria === "insumo" ? (
                    <>
                      <div>
                        <Label>Stock actual</Label>
                        <Input type="number" value={editForm.currentStock} onChange={e => setEditForm(f => ({ ...f, currentStock: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Stock mínimo</Label>
                        <Input type="number" value={editForm.minimumStock} onChange={e => setEditForm(f => ({ ...f, minimumStock: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Fecha de compra</Label>
                        <Input type="date" value={editForm.purchasedAt} onChange={e => setEditForm(f => ({ ...f, purchasedAt: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Fecha apertura envase</Label>
                        <Input type="date" value={editForm.openedAt} onChange={e => setEditForm(f => ({ ...f, openedAt: e.target.value }))} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label>Fecha de compra</Label>
                        <Input type="date" value={editForm.purchasedAt} onChange={e => setEditForm(f => ({ ...f, purchasedAt: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Vida útil estimada (meses)</Label>
                        <Input type="number" value={editForm.vidaUtilMeses} onChange={e => setEditForm(f => ({ ...f, vidaUtilMeses: e.target.value }))} placeholder="Ej: 12" />
                      </div>
                    </>
                  )}
                  <div className="col-span-2">
                    <Label>Notas</Label>
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
                  {viewCategoria === "herramienta" ? <Wrench className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                  {viewCategoria === "herramienta" ? "Herramientas" : "Insumos"}
                  <span className="text-xs font-normal text-muted-foreground ml-1 flex items-center gap-1"><Save className="w-3 h-3" />Borrador guardado</span>
                </DialogTitle>
              </DialogHeader>
              <Tabs value={addTab} onValueChange={v => setAddTab(v as any)}>
                <TabsList className="w-full">
                  <TabsTrigger value="nuevo" className="flex-1">Nuevo registro</TabsTrigger>
                  <TabsTrigger value="recibir" className="flex-1">
                    {viewCategoria === "herramienta" ? "Actualizar herramienta" : "Recibir stock"}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="nuevo" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label>Nombre *</Label>
                      <Input list="supply-names" value={newForm.name}
                        onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                        placeholder={viewCategoria === "herramienta" ? "Sábana de masaje, Olla de piedras..." : "Aceite de masaje, Crema..."}
                      />
                      <datalist id="supply-names">
                        {supplies?.map(s => <option key={s.id} value={s.name} />)}
                      </datalist>
                    </div>
                    <div>
                      <Label>Unidad *</Label>
                      <Input value={newForm.unit} onChange={e => setNewForm(f => ({ ...f, unit: e.target.value }))}
                        placeholder={viewCategoria === "herramienta" ? "unidades" : "ml, g, unidades..."} />
                    </div>
                    <div>
                      <Label>Categoría</Label>
                      <Select value={newForm.categoria} onValueChange={v => setNewForm(f => ({ ...f, categoria: v as any }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="insumo">Insumo</SelectItem>
                          <SelectItem value="herramienta">Herramienta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label>Ubicación</Label>
                      <Input value={newForm.ubicacion} onChange={e => setNewForm(f => ({ ...f, ubicacion: e.target.value }))}
                        placeholder="Bodega, estante, sala..." />
                    </div>
                    {newForm.categoria === "insumo" ? (
                      <>
                        <div>
                          <Label>Stock inicial</Label>
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
                      </>
                    ) : (
                      <>
                        <div>
                          <Label>Cantidad</Label>
                          <Input type="number" value={newForm.currentStock} onChange={e => setNewForm(f => ({ ...f, currentStock: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Vida útil estimada (meses)</Label>
                          <Input type="number" value={newForm.vidaUtilMeses} onChange={e => setNewForm(f => ({ ...f, vidaUtilMeses: e.target.value }))} placeholder="Ej: 12" />
                        </div>
                        <div className="col-span-2">
                          <Label>Fecha de compra</Label>
                          <Input type="date" value={newForm.purchasedAt} onChange={e => setNewForm(f => ({ ...f, purchasedAt: e.target.value }))} />
                        </div>
                      </>
                    )}
                    <div className="col-span-2">
                      <Label>Notas</Label>
                      <Textarea value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSaveNew} disabled={createMut.isPending}>Crear</Button>
                  </DialogFooter>
                </TabsContent>

                <TabsContent value="recibir" className="space-y-4 mt-4">
                  <div>
                    <Label>Seleccionar ítem existente *</Label>
                    <select className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                      value={receiveForm.supplyId} onChange={e => setReceiveForm(f => ({ ...f, supplyId: e.target.value }))}>
                      <option value="">Seleccionar...</option>
                      {supplies?.filter(s => (s.categoria ?? "insumo") === viewCategoria && s.active === 1).map(s => (
                        <option key={s.id} value={String(s.id)}>
                          {s.name}{viewCategoria === "insumo" ? ` — stock: ${s.currentStock} ${s.unit}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label>{viewCategoria === "herramienta" ? "Cantidad recibida" : "Cantidad recibida"} *</Label>
                      <Input type="number" min="0" step="any" value={receiveForm.stockReceived}
                        onChange={e => setReceiveForm(f => ({ ...f, stockReceived: e.target.value }))} placeholder="0" />
                    </div>
                    <div>
                      <Label>Fecha de compra</Label>
                      <Input type="date" value={receiveForm.purchasedAt} onChange={e => setReceiveForm(f => ({ ...f, purchasedAt: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Fecha apertura</Label>
                      <Input type="date" value={receiveForm.openedAt} onChange={e => setReceiveForm(f => ({ ...f, openedAt: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <Label>Notas</Label>
                      <Textarea value={receiveForm.notes} onChange={e => setReceiveForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Proveedor, lote, etc." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={handleReceive} disabled={receiveMut.isPending}>Confirmar</Button>
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
