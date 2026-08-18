import { useEffect, useMemo, useState } from "react";
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
import { ChevronDown, ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

type DiscountType = "percentage" | "fixed" | "nth_free";
type ModuleId = "masajes" | "clases" | "biopiscinas" | "sauna";
type CatalogModule = {
  id: ModuleId;
  name: string;
  itemName: string;
  services: Array<{ id: string; name: string }>;
};
type DiscountScope = { module: ModuleId; all: boolean; serviceIds: string[] };
type ScopeState = Record<ModuleId, { selected: boolean; all: boolean; serviceIds: string[] }>;
type FormState = {
  id?: number;
  code: string;
  name: string;
  description: string;
  discountType: DiscountType;
  validWeekdays?: number[];
  discountValue: string;
  indefinite: boolean;
  startsAt: string;
  expiresAt: string;
  active: boolean;
  scopes: ScopeState;
};

const CODES_PER_PAGE = 10;

// 0 = domingo, para que calce con getDay() de JavaScript.
const DIAS_SEMANA = [
  { valor: 1, corto: "Lu" },
  { valor: 2, corto: "Ma" },
  { valor: 3, corto: "Mi" },
  { valor: 4, corto: "Ju" },
  { valor: 5, corto: "Vi" },
  { valor: 6, corto: "Sá" },
  { valor: 0, corto: "Do" },
];

const emptyScopes = (): ScopeState => ({
  masajes: { selected: false, all: true, serviceIds: [] },
  clases: { selected: false, all: true, serviceIds: [] },
  biopiscinas: { selected: false, all: true, serviceIds: [] },
  sauna: { selected: false, all: true, serviceIds: [] },
});

const emptyForm = (): FormState => ({
  code: "",
  name: "",
  description: "",
  discountType: "percentage",
  validWeekdays: [] as number[],
  discountValue: "",
  indefinite: true,
  startsAt: "",
  expiresAt: "",
  active: true,
  scopes: emptyScopes(),
});

const toLocalInput = (value?: Date | string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export default function DiscountCodes360() {
  const utils = trpc.useUtils();
  const { data: codes = [], isLoading, error: codesError } = trpc.discounts360.list.useQuery();
  // Estos tres catálogos públicos son los mismos que alimentan las vitrinas y
  // carritos. Consultarlos por separado evita que la caída de un módulo o una
  // consulta administrativa deje ocultos también los otros dos.
  const massageCatalog = trpc.masajes.public.getCatalog.useQuery();
  const classesCatalog = trpc.regularClasses.public.catalog.useQuery();
  const biopoolsCatalog = trpc.biopools.public.catalog.useQuery();
  const saunaCatalog = trpc.sauna.public.catalog.useQuery();
  const [search, setSearch] = useState("");
  const [descending, setDescending] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const catalog = useMemo<CatalogModule[]>(() => [
    {
      id: "masajes",
      name: "Masajes",
      itemName: "técnicas",
      services: (massageCatalog.data ?? []).map((item) => ({ id: String(item.id), name: item.name })),
    },
    {
      id: "clases",
      name: "Clases regulares",
      itemName: "planes",
      services: (classesCatalog.data?.plans ?? []).map((item) => ({ id: String(item.id), name: item.name })),
    },
    {
      id: "biopiscinas",
      name: "Biopiscinas",
      itemName: "servicios",
      services: (biopoolsCatalog.data?.services ?? []).map((item) => ({ id: String(item.service.id), name: item.service.name })),
    },
    {
      id: "sauna",
      name: "Sauna",
      itemName: "servicios",
      // El catálogo público repite el servicio privado para 4 y 5 personas, así
      // que hay que dejar un solo registro por id o el selector los duplica.
      services: Array.from(
        new Map(
          (saunaCatalog.data?.services ?? []).map((item) => [String(item.id), { id: String(item.id), name: item.name }])
        ).values()
      ),
    },
  ], [massageCatalog.data, classesCatalog.data, biopoolsCatalog.data, saunaCatalog.data]);
  const catalogLoading = massageCatalog.isLoading || classesCatalog.isLoading || biopoolsCatalog.isLoading || saunaCatalog.isLoading;
  const catalogErrors = [massageCatalog.error, classesCatalog.error, biopoolsCatalog.error, saunaCatalog.error].filter(Boolean);

  const refresh = () => utils.discounts360.list.invalidate();
  const create = trpc.discounts360.create.useMutation({
    onSuccess: () => { toast.success("Código creado"); setOpen(false); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const update = trpc.discounts360.update.useMutation({
    onSuccess: () => { toast.success("Código actualizado"); setOpen(false); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.discounts360.remove.useMutation({
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
  const pageCount = Math.max(1, Math.ceil(visible.length / CODES_PER_PAGE));
  const paginatedCodes = useMemo(() => {
    const firstIndex = (currentPage - 1) * CODES_PER_PAGE;
    return visible.slice(firstIndex, firstIndex + CODES_PER_PAGE);
  }, [visible, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, descending]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  const status = (item: typeof codes[number]) => {
    const now = Date.now();
    if (item.active !== 1) return { label: "Inactivo", variant: "secondary" as const };
    if (item.startsAt && new Date(item.startsAt).getTime() > now) return { label: "Programado", variant: "outline" as const };
    if (item.expiresAt && new Date(item.expiresAt).getTime() < now) return { label: "Vencido", variant: "destructive" as const };
    return { label: "Activo", variant: "default" as const };
  };

  const scopeSummary = (item: typeof codes[number]) => item.scopes.map((scope: DiscountScope) => {
    const module = catalog.find((candidate) => candidate.id === scope.module);
    if (scope.all) return `${module?.name ?? scope.module}: todos`;
    return `${module?.name ?? scope.module}: ${scope.serviceIds.length}`;
  }).join(" · ") || "Sin servicios 360";

  const edit = (item: typeof codes[number]) => {
    const scopes = emptyScopes();
    for (const scope of item.scopes as DiscountScope[]) {
      scopes[scope.module] = { selected: true, all: scope.all, serviceIds: [...scope.serviceIds] };
    }
    setForm({
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description ?? "",
      discountType: item.discountType,
      validWeekdays: [...((item as any).validWeekdays ?? [])],
      discountValue: String(item.discountValue),
      indefinite: !item.startsAt && !item.expiresAt,
      startsAt: toLocalInput(item.startsAt),
      expiresAt: toLocalInput(item.expiresAt),
      active: item.active === 1,
      scopes,
    });
    setOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const scopes = (Object.entries(form.scopes) as Array<[ModuleId, ScopeState[ModuleId]]>)
      .filter(([, scope]) => scope.selected)
      .map(([module, scope]) => ({ module, all: scope.all, serviceIds: scope.serviceIds }));
    if (!scopes.length) {
      toast.error("Selecciona al menos un módulo de servicios.");
      return;
    }
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      discountType: form.discountType,
      validWeekdays: form.validWeekdays ?? [],
      discountValue: Number(form.discountValue),
      startsAt: form.indefinite || !form.startsAt ? null : new Date(form.startsAt),
      expiresAt: form.indefinite || !form.expiresAt ? null : new Date(form.expiresAt),
      active: form.active ? 1 : 0,
      scopes,
    };
    if (form.id) update.mutate({ id: form.id, ...payload });
    else create.mutate(payload);
  };

  const download = async () => {
    const XLSX = await import("xlsx");
    const rows = visible.map((item) => ({
      Código: item.code,
      Nombre: item.name,
      Tipo: item.discountType === "percentage" ? "Porcentaje" : item.discountType === "nth_free" ? "Lleva N paga N-1" : "Monto fijo",
      Valor: item.discountValue,
      "Servicios aplicables": scopeSummary(item),
      Inicio: item.startsAt ? new Date(item.startsAt).toLocaleString("es-CL") : "Indefinido",
      Término: item.expiresAt ? new Date(item.expiresAt).toLocaleString("es-CL") : "Indefinido",
      Estado: status(item).label,
      Usos: item.currentUses,
      "Total descontado": Number(item.totalDiscounted),
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [18, 28, 14, 12, 55, 22, 22, 14, 10, 20].map((wch) => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Códigos 360");
    XLSX.writeFile(book, "codigos-descuento-360.xlsx");
  };

  const setModuleScope = (module: ModuleId, patch: Partial<ScopeState[ModuleId]>) => {
    setForm((current) => ({
      ...current,
      scopes: { ...current.scopes, [module]: { ...current.scopes[module], ...patch } },
    }));
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Códigos de descuento 360</h1>
            <p className="text-sm text-muted-foreground">Promociones aplicables a todos los servicios de Cancagua</p>
          </div>
          <Button className="w-full sm:w-auto" onClick={() => { setForm(emptyForm()); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />Nuevo código
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3">
            <div className="relative min-w-0 w-full flex-1 sm:min-w-[240px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o nombre" className="pl-9" />
            </div>
            <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => setDescending((value) => !value)}>
              Orden {descending ? "Z–A" : "A–Z"}
            </Button>
            <Button className="flex-1 sm:flex-none" variant="outline" onClick={download} disabled={!visible.length}>
              <Download className="w-4 h-4 mr-2" />Excel
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{visible.length} código{visible.length === 1 ? "" : "s"}</CardTitle></CardHeader>
          <CardContent>
            {codesError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                No se pudieron cargar los códigos. {codesError.message}
              </div>
            ) : isLoading ? <p>Cargando…</p> : !visible.length ? <p className="py-8 text-center text-muted-foreground">No hay códigos para mostrar.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="py-3 pr-4">Código / nombre</th><th className="pr-4">Descuento</th>
                    <th className="pr-4">Servicios</th><th className="pr-4">Vigencia</th>
                    <th className="pr-4">Estado</th><th className="pr-4 text-right">Usos</th>
                    <th className="pr-4 text-right">Descontado</th><th />
                  </tr></thead>
                  <tbody>{paginatedCodes.map((item) => {
                    const itemStatus = status(item);
                    return <tr key={item.id} className="border-b">
                      <td className="py-3 pr-4"><code className="font-semibold">{item.code}</code><p className="text-muted-foreground">{item.name}</p></td>
                      <td className="pr-4">{item.discountType === "percentage" ? `${item.discountValue}%` : item.discountType === "nth_free" ? `${item.discountValue}x${item.discountValue - 1}` : `$${item.discountValue.toLocaleString("es-CL")}`}{((item as any).validWeekdays ?? []).length > 0 && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{DIAS_SEMANA.filter((d) => ((item as any).validWeekdays ?? []).includes(d.valor)).map((d) => d.corto).join(" ")}</span>}</td>
                      <td className="pr-4 max-w-[320px]">{scopeSummary(item)}</td>
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
                {pageCount > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 mt-2">
                    <p className="text-sm text-muted-foreground">
                      Mostrando {(currentPage - 1) * CODES_PER_PAGE + 1}–{Math.min(currentPage * CODES_PER_PAGE, visible.length)} de {visible.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />Anterior
                      </Button>
                      <span className="min-w-24 text-center text-sm">Página {currentPage} de {pageCount}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentPage === pageCount}
                        onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                      >
                        Siguiente<ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Editar" : "Nuevo"} código de descuento</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Código *</Label><Input required minLength={3} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="RELAX20" /></div>
              <div><Label>Nombre *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Promoción invierno" /></div>
              <div><Label>Tipo *</Label><Select value={form.discountType} onValueChange={(value: DiscountType) => setForm({ ...form, discountType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Porcentaje</SelectItem><SelectItem value="fixed">Monto fijo CLP</SelectItem><SelectItem value="nth_free">Lleva N, paga N−1 (2x1, 3x2…)</SelectItem></SelectContent></Select></div>
              <div className="sm:col-span-2">
                <Label>Días en que aplica</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DIAS_SEMANA.map((dia) => {
                    const activo = (form.validWeekdays ?? []).includes(dia.valor);
                    return (
                      <button
                        key={dia.valor}
                        type="button"
                        onClick={() => {
                          const actuales = form.validWeekdays ?? [];
                          setForm({
                            ...form,
                            validWeekdays: activo
                              ? actuales.filter((d) => d !== dia.valor)
                              : [...actuales, dia.valor],
                          });
                        }}
                        className={`h-9 w-11 rounded-full border text-sm transition ${activo ? "border-transparent bg-primary font-medium text-primary-foreground" : "border-input bg-background hover:bg-accent"}`}
                      >
                        {dia.corto}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(form.validWeekdays ?? []).length === 0
                    ? "Sin días marcados el código aplica todos los días."
                    : "Se valida contra el día de la visita, no el de la compra."}
                </p>
              </div>
              <div><Label>{form.discountType === "percentage" ? "Porcentaje" : form.discountType === "nth_free" ? "Cada cuántos, uno gratis" : "Monto CLP"} *</Label><Input required type="number" min={form.discountType === "nth_free" ? 2 : 1} max={form.discountType === "percentage" ? 100 : undefined} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />{form.discountType === "nth_free" && <p className="mt-1 text-xs text-muted-foreground">2 = 2x1 (la segunda gratis). El sobrante impar paga completo y se regala siempre la unidad más barata.</p>}</div>
            </div>
            <div><Label>Descripción interna</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.indefinite} onChange={(e) => setForm({ ...form, indefinite: e.target.checked })} />Vigencia indefinida</label>
            {!form.indefinite && <div className="grid sm:grid-cols-2 gap-4"><div><Label>Inicio</Label><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div><div><Label>Término</Label><Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div></div>}

            <div className="space-y-3">
              <div><Label>Servicios aplicables *</Label><p className="text-xs text-muted-foreground">Elige uno o más módulos y luego todos sus servicios o sólo algunos.</p></div>
              {catalogLoading && (
                <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Cargando servicios disponibles…</p>
              )}
              {catalogErrors.length > 0 && !catalogLoading && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  Uno de los catálogos no pudo cargarse. Puedes volver a intentar recargando esta ventana.
                </p>
              )}
              {catalog.map((module) => {
                const scope = form.scopes[module.id];
                return <div key={module.id} className={`rounded-lg border ${scope.selected ? "border-primary/40 bg-primary/[0.02]" : ""}`}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 p-3 font-medium">
                    <span className="flex items-center gap-2"><input type="checkbox" checked={scope.selected} onChange={(event) => setModuleScope(module.id, { selected: event.target.checked })} />{module.name}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${scope.selected ? "rotate-180" : ""}`} />
                  </label>
                  {scope.selected && <div className="border-t p-3 space-y-3">
                    <div className="flex flex-wrap gap-5 text-sm">
                      <label className="flex items-center gap-2"><input type="radio" name={`${module.id}-mode`} checked={scope.all} onChange={() => setModuleScope(module.id, { all: true, serviceIds: [] })} />Todos los {module.itemName}</label>
                      <label className="flex items-center gap-2"><input type="radio" name={`${module.id}-mode`} checked={!scope.all} onChange={() => setModuleScope(module.id, { all: false })} />Seleccionar específicos</label>
                    </div>
                    {!scope.all && <div className="grid sm:grid-cols-2 gap-2 rounded-md bg-muted/40 p-3">
                      {module.services.map((service) => <label key={service.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-0.5" checked={scope.serviceIds.includes(service.id)} onChange={(event) => setModuleScope(module.id, {
                          serviceIds: event.target.checked ? [...scope.serviceIds, service.id] : scope.serviceIds.filter((id) => id !== service.id),
                        })} />{service.name}
                      </label>)}
                      {!module.services.length && <p className="text-sm text-muted-foreground">No hay servicios configurados en este módulo.</p>}
                    </div>}
                  </div>}
                </div>;
              })}
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Código activo</label>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={create.isPending || update.isPending}>Guardar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
