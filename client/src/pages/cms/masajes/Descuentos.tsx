import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

type DiscountType = "percentage" | "fixed";
type FormState = {
  id?: number;
  code: string;
  name: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  indefinite: boolean;
  startsAt: string;
  expiresAt: string;
  active: boolean;
  techniqueIds: number[];
};

const emptyForm: FormState = {
  code: "", name: "", description: "", discountType: "percentage", discountValue: "",
  indefinite: true, startsAt: "", expiresAt: "", active: true, techniqueIds: [],
};

const toLocalInput = (value?: Date | string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export default function MasajesDescuentos() {
  const utils = trpc.useUtils();
  const { data: codes = [], isLoading } = trpc.masajes.descuentos.list.useQuery();
  const { data: techniques = [] } = trpc.masajes.public.getCatalog.useQuery();
  const [search, setSearch] = useState("");
  const [descending, setDescending] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const refresh = () => utils.masajes.descuentos.list.invalidate();
  const create = trpc.masajes.descuentos.create.useMutation({
    onSuccess: () => { toast.success("Código creado"); setOpen(false); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const update = trpc.masajes.descuentos.update.useMutation({
    onSuccess: () => { toast.success("Código actualizado"); setOpen(false); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.masajes.descuentos.remove.useMutation({
    onSuccess: (result) => {
      toast.success(result.archived ? "Código archivado para conservar su historial" : "Código eliminado");
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...codes].filter((item) =>
      !query || item.code.toLowerCase().includes(query) || item.name.toLowerCase().includes(query)
    ).sort((a, b) => {
      const comparison = a.code.localeCompare(b.code, "es", { sensitivity: "base" });
      return descending ? -comparison : comparison;
    });
  }, [codes, search, descending]);

  const status = (item: typeof codes[number]) => {
    const now = Date.now();
    if (item.active !== 1) return { label: "Inactivo", variant: "secondary" as const };
    if (item.startsAt && new Date(item.startsAt).getTime() > now) return { label: "Programado", variant: "outline" as const };
    if (item.expiresAt && new Date(item.expiresAt).getTime() < now) return { label: "Vencido", variant: "destructive" as const };
    return { label: "Activo", variant: "default" as const };
  };

  const edit = (item: typeof codes[number]) => {
    setForm({
      id: item.id, code: item.code, name: item.name, description: item.description ?? "",
      discountType: item.discountType, discountValue: String(item.discountValue),
      indefinite: !item.startsAt && !item.expiresAt,
      startsAt: toLocalInput(item.startsAt), expiresAt: toLocalInput(item.expiresAt),
      active: item.active === 1, techniqueIds: item.techniqueIds,
    });
    setOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      code: form.code.trim().toUpperCase(), name: form.name.trim(), description: form.description.trim() || undefined,
      discountType: form.discountType, discountValue: Number(form.discountValue),
      startsAt: form.indefinite || !form.startsAt ? null : new Date(form.startsAt),
      expiresAt: form.indefinite || !form.expiresAt ? null : new Date(form.expiresAt),
      active: form.active ? 1 : 0, techniqueIds: form.techniqueIds,
    };
    if (form.id) update.mutate({ id: form.id, ...payload });
    else create.mutate(payload);
  };

  const download = async () => {
    const XLSX = await import("xlsx");
    const rows = visible.map((item) => ({
      Código: item.code, Nombre: item.name,
      Tipo: item.discountType === "percentage" ? "Porcentaje" : "Monto fijo",
      Valor: item.discountValue,
      Servicios: item.techniqueIds.length
        ? techniques.filter((technique) => item.techniqueIds.includes(technique.id)).map((technique) => technique.name).join(", ")
        : "Todos los masajes",
      Inicio: item.startsAt ? new Date(item.startsAt).toLocaleString("es-CL") : "Indefinido",
      Término: item.expiresAt ? new Date(item.expiresAt).toLocaleString("es-CL") : "Indefinido",
      Estado: status(item).label, Usos: item.currentUses, "Total descontado": Number(item.totalDiscounted),
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [18, 28, 14, 12, 45, 22, 22, 14, 10, 20].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Códigos masajes");
    XLSX.writeFile(book, "codigos-descuento-masajes.xlsx");
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Códigos de descuento</h1>
            <p className="text-sm text-muted-foreground">Promociones exclusivas para servicios de masajes</p>
          </div>
          <Button className="w-full sm:w-auto" onClick={() => { setForm(emptyForm); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />Nuevo código</Button>
        </div>
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3">
            <div className="relative min-w-0 w-full flex-1 sm:min-w-[240px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o nombre" className="pl-9" />
            </div>
            <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => setDescending((value) => !value)}>Orden {descending ? "Z–A" : "A–Z"}</Button>
            <Button className="flex-1 sm:flex-none" variant="outline" onClick={download} disabled={!visible.length}><Download className="w-4 h-4 mr-2" />Excel</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{visible.length} código{visible.length === 1 ? "" : "s"}</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p>Cargando…</p> : !visible.length ? <p className="py-8 text-center text-muted-foreground">No hay códigos para mostrar.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="py-3 pr-4">Código / nombre</th><th className="pr-4">Descuento</th>
                    <th className="pr-4">Servicios</th><th className="pr-4">Vigencia</th>
                    <th className="pr-4">Estado</th><th className="pr-4 text-right">Usos</th>
                    <th className="pr-4 text-right">Descontado</th><th />
                  </tr></thead>
                  <tbody>{visible.map((item) => {
                    const itemStatus = status(item);
                    return <tr key={item.id} className="border-b">
                      <td className="py-3 pr-4"><code className="font-semibold">{item.code}</code><p className="text-muted-foreground">{item.name}</p></td>
                      <td className="pr-4">{item.discountType === "percentage" ? `${item.discountValue}%` : `$${item.discountValue.toLocaleString("es-CL")}`}</td>
                      <td className="pr-4">{item.techniqueIds.length ? `${item.techniqueIds.length} específico(s)` : "Todos"}</td>
                      <td className="pr-4 whitespace-nowrap">{item.expiresAt ? `Hasta ${new Date(item.expiresAt).toLocaleDateString("es-CL")}` : "Indefinida"}</td>
                      <td className="pr-4"><Badge variant={itemStatus.variant}>{itemStatus.label}</Badge></td>
                      <td className="pr-4 text-right">{item.currentUses}</td>
                      <td className="pr-4 text-right">${Number(item.totalDiscounted).toLocaleString("es-CL")}</td>
                      <td className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => edit(item)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-red-600" onClick={() => confirm(`¿Eliminar ${item.code}?`) && remove.mutate({ id: item.id })}><Trash2 className="w-4 h-4" /></Button>
                      </td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Editar" : "Nuevo"} código de descuento</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Código *</Label><Input required minLength={3} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="RELAX20" /></div>
              <div><Label>Nombre *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Promoción invierno" /></div>
              <div><Label>Tipo *</Label><Select value={form.discountType} onValueChange={(value: DiscountType) => setForm({ ...form, discountType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Porcentaje</SelectItem><SelectItem value="fixed">Monto fijo CLP</SelectItem></SelectContent></Select></div>
              <div><Label>{form.discountType === "percentage" ? "Porcentaje" : "Monto CLP"} *</Label><Input required type="number" min={1} max={form.discountType === "percentage" ? 100 : undefined} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} /></div>
            </div>
            <div><Label>Descripción interna</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.indefinite} onChange={(e) => setForm({ ...form, indefinite: e.target.checked })} />Vigencia indefinida</label>
            {!form.indefinite && <div className="grid sm:grid-cols-2 gap-4"><div><Label>Inicio</Label><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div><div><Label>Término</Label><Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div></div>}
            <div>
              <Label>Servicios aplicables</Label>
              <p className="text-xs text-muted-foreground mb-2">Sin selección aplica a todos los masajes.</p>
              <div className="grid sm:grid-cols-2 gap-2 rounded-lg border p-3">
                {techniques.map((technique) => <label key={technique.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.techniqueIds.includes(technique.id)} onChange={(e) => setForm({
                    ...form, techniqueIds: e.target.checked ? [...form.techniqueIds, technique.id] : form.techniqueIds.filter((id) => id !== technique.id),
                  })} />{technique.name}
                </label>)}
              </div>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Código activo</label>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={create.isPending || update.isPending}>Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
