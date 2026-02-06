import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Edit,
  Trash2,
  FileText,
  ChevronDown,
  ChevronRight,
  Building2,
  Calendar,
  DollarSign,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const PIPELINE_LABELS: Record<string, string> = {
  jornada_autocuidado: "Jornada de Autocuidado",
  eventos_corporativos: "Eventos Corporativos",
  retiros: "Retiros",
  spa_day: "Spa Day",
};

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  nuevo: { label: "Nuevo", color: "bg-gray-500" },
  reunion_programada: { label: "Reunión Programada", color: "bg-blue-500" },
  cotizacion_enviada: { label: "Cotización Enviada", color: "bg-yellow-500" },
  negociacion: { label: "Negociación", color: "bg-orange-500" },
  cerrado_ganado: { label: "Cerrado Ganado", color: "bg-green-500" },
  cerrado_perdido: { label: "Cerrado Perdido", color: "bg-red-500" },
};

const QUOTE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Borrador", color: "bg-gray-500" },
  sent: { label: "Enviada", color: "bg-blue-500" },
  approved: { label: "Aprobada", color: "bg-green-500" },
  event_completed: { label: "Jornada Efectuada", color: "bg-purple-500" },
  paid: { label: "Pagada", color: "bg-emerald-500" },
  invoiced: { label: "Facturada", color: "bg-indigo-500" },
};

export default function Negocios() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDeals, setExpandedDeals] = useState<number[]>([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingDeal, setEditingDeal] = useState<any>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingDeal, setDeletingDeal] = useState<any>(null);

  const { data: deals = [], refetch: refetchDeals } = trpc.deals.getAll.useQuery();
  const { data: allQuotes = [] } = trpc.quotes.getAll.useQuery();
  const updateDealMutation = trpc.deals.update.useMutation();
  const deleteDealMutation = trpc.deals.delete.useMutation();

  // Filtrar negocios por búsqueda
  const filteredDeals = useMemo(() => {
    if (!searchQuery) return deals;
    const query = searchQuery.toLowerCase();
    return deals.filter((deal: any) =>
      deal.name.toLowerCase().includes(query) ||
      PIPELINE_LABELS[deal.pipeline]?.toLowerCase().includes(query) ||
      STAGE_CONFIG[deal.stage]?.label.toLowerCase().includes(query)
    );
  }, [deals, searchQuery]);

  // Obtener cotizaciones por negocio
  const getQuotesByDeal = (dealId: number) => {
    return allQuotes.filter((q: any) => q.dealId === dealId);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const toggleExpand = (dealId: number) => {
    setExpandedDeals((prev) =>
      prev.includes(dealId)
        ? prev.filter((id) => id !== dealId)
        : [...prev, dealId]
    );
  };

  const handleEdit = (deal: any) => {
    setEditingDeal({ ...deal });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDeal) return;
    try {
      await updateDealMutation.mutateAsync({
        id: editingDeal.id,
        name: editingDeal.name,
        pipeline: editingDeal.pipeline,
        stage: editingDeal.stage,
        closeDate: editingDeal.closeDate,
        notes: editingDeal.notes,
      });
      toast.success("Negocio actualizado");
      setShowEditDialog(false);
      refetchDeals();
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar");
    }
  };

  const handleDelete = (deal: any) => {
    setDeletingDeal(deal);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!deletingDeal) return;
    try {
      await deleteDealMutation.mutateAsync({ id: deletingDeal.id });
      toast.success("Negocio eliminado");
      setShowDeleteDialog(false);
      refetchDeals();
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar");
    }
  };

  const handleCreateQuote = (dealId: number) => {
    setLocation(`/cms/cotizacion-wizard?dealId=${dealId}`);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Negocios</h1>
            <p className="text-muted-foreground mt-1">
              Gestiona tus negocios y sus cotizaciones asociadas
            </p>
          </div>
          <Button onClick={() => setLocation("/cms/cotizacion-wizard")}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Negocio
          </Button>
        </div>

        {/* Búsqueda */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar negocios por nombre, pipeline o etapa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Lista de negocios */}
        <div className="space-y-4">
          {filteredDeals.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {searchQuery
                  ? "No se encontraron negocios con ese criterio de búsqueda."
                  : "No hay negocios registrados. Crea uno desde el wizard de cotizaciones."}
              </CardContent>
            </Card>
          ) : (
            filteredDeals.map((deal: any) => {
              const dealQuotes = getQuotesByDeal(deal.id);
              const isExpanded = expandedDeals.includes(deal.id);
              const totalValue = dealQuotes.reduce(
                (sum: number, q: any) => sum + (q.total || 0),
                0
              );

              return (
                <Card key={deal.id}>
                  <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(deal.id)}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CollapsibleTrigger className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <Building2 className="h-5 w-5 text-primary" />
                            </div>
                            <div className="text-left">
                              <CardTitle className="text-lg">{deal.name}</CardTitle>
                              <CardDescription className="flex items-center gap-2 mt-1">
                                <span>{PIPELINE_LABELS[deal.pipeline] || deal.pipeline}</span>
                                <span>•</span>
                                <Badge
                                  variant="secondary"
                                  className={STAGE_CONFIG[deal.stage]?.color || "bg-gray-500"}
                                >
                                  {STAGE_CONFIG[deal.stage]?.label || deal.stage}
                                </Badge>
                              </CardDescription>
                            </div>
                          </div>
                        </CollapsibleTrigger>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-muted-foreground text-sm">
                              <FileText className="h-4 w-4" />
                              <span>{dealQuotes.length} cotizaciones</span>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1">
                              <DollarSign className="h-4 w-4" />
                              <span>{formatPrice(totalValue)}</span>
                            </div>
                          </div>
                          {deal.closeDate && (
                            <div className="text-right">
                              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                                <Calendar className="h-4 w-4" />
                                <span>Cierre: {formatDate(deal.closeDate)}</span>
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateQuote(deal.id);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Cotización
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(deal);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(deal);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        {dealQuotes.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground border-t">
                            No hay cotizaciones asociadas a este negocio.
                            <Button
                              variant="link"
                              onClick={() => handleCreateQuote(deal.id)}
                              className="ml-2"
                            >
                              Crear una cotización
                            </Button>
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Número</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Fecha</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {dealQuotes.map((quote: any) => (
                                <TableRow key={quote.id}>
                                  <TableCell className="font-mono font-medium">
                                    {quote.quoteNumber}
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium">{quote.clientName}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {quote.clientEmail}
                                      </p>
                                    </div>
                                  </TableCell>
                                  <TableCell>{formatDate(quote.createdAt)}</TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatPrice(quote.total)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="secondary"
                                      className={
                                        QUOTE_STATUS_CONFIG[quote.status]?.color || "bg-gray-500"
                                      }
                                    >
                                      {QUOTE_STATUS_CONFIG[quote.status]?.label || quote.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setLocation(`/cms/cotizacion-wizard?quoteId=${quote.id}`)
                                      }
                                    >
                                      <Edit className="h-4 w-4 mr-1" />
                                      Editar
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Dialog de edición */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Negocio</DialogTitle>
            <DialogDescription>
              Modifica los datos del negocio
            </DialogDescription>
          </DialogHeader>
          {editingDeal && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="editName">Nombre del negocio</Label>
                <Input
                  id="editName"
                  value={editingDeal.name}
                  onChange={(e) =>
                    setEditingDeal({ ...editingDeal, name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editPipeline">Pipeline</Label>
                  <Select
                    value={editingDeal.pipeline}
                    onValueChange={(value) =>
                      setEditingDeal({ ...editingDeal, pipeline: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jornada_autocuidado">
                        Jornada de Autocuidado
                      </SelectItem>
                      <SelectItem value="eventos_corporativos">
                        Eventos Corporativos
                      </SelectItem>
                      <SelectItem value="retiros">Retiros</SelectItem>
                      <SelectItem value="spa_day">Spa Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="editStage">Etapa</Label>
                  <Select
                    value={editingDeal.stage}
                    onValueChange={(value) =>
                      setEditingDeal({ ...editingDeal, stage: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nuevo">Nuevo</SelectItem>
                      <SelectItem value="reunion_programada">
                        Reunión Programada
                      </SelectItem>
                      <SelectItem value="cotizacion_enviada">
                        Cotización Enviada
                      </SelectItem>
                      <SelectItem value="negociacion">Negociación</SelectItem>
                      <SelectItem value="cerrado_ganado">Cerrado Ganado</SelectItem>
                      <SelectItem value="cerrado_perdido">Cerrado Perdido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="editCloseDate">Fecha de cierre</Label>
                <Input
                  id="editCloseDate"
                  type="date"
                  value={editingDeal.closeDate || ""}
                  onChange={(e) =>
                    setEditingDeal({ ...editingDeal, closeDate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="editNotes">Notas</Label>
                <Textarea
                  id="editNotes"
                  value={editingDeal.notes || ""}
                  onChange={(e) =>
                    setEditingDeal({ ...editingDeal, notes: e.target.value })
                  }
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateDealMutation.isPending}>
              {updateDealMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Negocio</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar el negocio "{deletingDeal?.name}"?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteDealMutation.isPending}
            >
              {deleteDealMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
