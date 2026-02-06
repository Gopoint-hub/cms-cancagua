import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { 
  FileText, Search, Filter, Plus, GripVertical,
  Building2, Calendar, DollarSign, User, Phone, Mail,
  ExternalLink, MoreHorizontal, Eye
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Estados del pipeline
const pipelineStages = [
  { id: "draft", label: "Borrador", color: "bg-slate-500", description: "Cotizaciones en preparación" },
  { id: "sent", label: "Enviada", color: "bg-blue-500", description: "Esperando respuesta del cliente" },
  { id: "approved", label: "Aprobada", color: "bg-green-500", description: "Cliente confirmó el evento" },
  { id: "event_completed", label: "Evento Realizado", color: "bg-purple-500", description: "Evento ya se realizó" },
  { id: "invoiced", label: "Facturada", color: "bg-amber-500", description: "Factura emitida" },
  { id: "paid", label: "Pagada", color: "bg-emerald-600", description: "Pago recibido" },
] as const;

type StageId = typeof pipelineStages[number]["id"];

// Usar any para evitar conflictos con el tipo real del backend
type Quote = any;

export default function CRMPipeline() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [draggedQuote, setDraggedQuote] = useState<Quote | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageId | null>(null);

  const { data: quotes, isLoading, refetch } = trpc.quotes.getAll.useQuery();
  const updateStatusMutation = trpc.quotes.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Estado actualizado");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al actualizar estado");
    },
  });

  // Agrupar cotizaciones por estado
  const quotesByStage = pipelineStages.reduce((acc, stage) => {
    acc[stage.id] = (quotes || []).filter((q: Quote) => q.status === stage.id);
    return acc;
  }, {} as Record<StageId, Quote[]>);

  // Filtrar por búsqueda
  const filterQuotes = (stageQuotes: Quote[]) => {
    if (!searchQuery) return stageQuotes;
    const query = searchQuery.toLowerCase();
    return stageQuotes.filter(q => 
      q.quoteNumber.toLowerCase().includes(query) ||
      q.clientName.toLowerCase().includes(query) ||
      q.companyName?.toLowerCase().includes(query) ||
      q.eventType.toLowerCase().includes(query)
    );
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, quote: Quote) => {
    setDraggedQuote(quote);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, stageId: StageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: StageId) => {
    e.preventDefault();
    setDragOverStage(null);
    
    if (draggedQuote && draggedQuote.status !== targetStage) {
      updateStatusMutation.mutate({
        id: draggedQuote.id,
        status: targetStage,
      });
    }
    setDraggedQuote(null);
  };

  const handleDragEnd = () => {
    setDraggedQuote(null);
    setDragOverStage(null);
  };

  // Calcular totales por etapa
  const getStageTotals = (stageId: StageId) => {
    const stageQuotes = quotesByStage[stageId] || [];
    const count = stageQuotes.length;
    const total = stageQuotes.reduce((sum, q) => sum + (q.totalAmount || 0), 0);
    return { count, total };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">CRM Pipeline</h1>
            <p className="text-muted-foreground">
              Gestiona el embudo de ventas de eventos corporativos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cotización..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Button onClick={() => setLocation("/cms/crear-cotizacion")}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Cotización
            </Button>
          </div>
        </div>

        {/* Pipeline Kanban */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {pipelineStages.map((stage) => {
              const { count, total } = getStageTotals(stage.id);
              const stageQuotes = filterQuotes(quotesByStage[stage.id] || []);
              const isOver = dragOverStage === stage.id;

              return (
                <div
                  key={stage.id}
                  className={cn(
                    "w-80 flex-shrink-0 rounded-lg border bg-muted/30 transition-colors",
                    isOver && "ring-2 ring-primary bg-primary/5"
                  )}
                  onDragOver={(e) => handleDragOver(e, stage.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, stage.id)}
                >
                  {/* Stage Header */}
                  <div className="p-3 border-b bg-background rounded-t-lg">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={cn("h-3 w-3 rounded-full", stage.color)} />
                        <h3 className="font-semibold text-sm">{stage.label}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {count}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{stage.description}</p>
                    {total > 0 && (
                      <p className="text-xs font-medium text-primary mt-1">
                        {formatCurrency(total)}
                      </p>
                    )}
                  </div>

                  {/* Stage Content */}
                  <div className="p-2 space-y-2 min-h-[400px] max-h-[600px] overflow-y-auto">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      </div>
                    ) : stageQuotes.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <FileText className="h-8 w-8 mb-2 opacity-50" />
                        <p className="text-xs">Sin cotizaciones</p>
                      </div>
                    ) : (
                      stageQuotes.map((quote) => (
                        <Card
                          key={quote.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, quote)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedQuote(quote)}
                          className={cn(
                            "cursor-pointer hover:shadow-md transition-all",
                            draggedQuote?.id === quote.id && "opacity-50 scale-95"
                          )}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xs font-mono text-muted-foreground">
                                  {quote.quoteNumber}
                                </span>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setSelectedQuote(quote)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Ver detalles
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setLocation(`/cms/cotizaciones?edit=${quote.id}`)}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Editar cotización
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            <h4 className="font-medium text-sm mb-1 line-clamp-1">
                              {quote.companyName || quote.clientName}
                            </h4>

                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span className="truncate">{quote.clientName}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDate(quote.eventDate)}</span>
                                <span className="mx-1">•</span>
                                <span>{quote.guestCount} personas</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between mt-3 pt-2 border-t">
                              <Badge variant="outline" className="text-xs">
                                {quote.eventType}
                              </Badge>
                              <span className="text-sm font-semibold text-primary">
                                {formatCurrency(quote.totalAmount)}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {pipelineStages.map((stage) => {
            const { count, total } = getStageTotals(stage.id);
            return (
              <Card key={stage.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("h-2 w-2 rounded-full", stage.color)} />
                    <span className="text-xs font-medium">{stage.label}</span>
                  </div>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(total)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Modal de detalles */}
      <Dialog open={!!selectedQuote} onOpenChange={() => setSelectedQuote(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Cotización {selectedQuote?.quoteNumber}
            </DialogTitle>
            <DialogDescription>
              Detalles de la cotización
            </DialogDescription>
          </DialogHeader>

          {selectedQuote && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cliente</p>
                  <p className="font-medium">{selectedQuote.clientName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Empresa</p>
                  <p className="font-medium">{selectedQuote.companyName || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Email</p>
                  <p className="font-medium">{selectedQuote.clientEmail}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Teléfono</p>
                  <p className="font-medium">{selectedQuote.clientPhone || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fecha del Evento</p>
                  <p className="font-medium">
                    {new Date(selectedQuote.eventDate).toLocaleDateString("es-CL", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tipo de Evento</p>
                  <p className="font-medium">{selectedQuote.eventType}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Invitados</p>
                  <p className="font-medium">{selectedQuote.guestCount} personas</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total</p>
                  <p className="font-medium text-lg text-primary">
                    {formatCurrency(selectedQuote.totalAmount)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setSelectedQuote(null);
                    setLocation(`/cms/cotizaciones?edit=${selectedQuote.id}`);
                  }}
                >
                  Editar Cotización
                </Button>
                <Button 
                  className="flex-1"
                  onClick={() => setSelectedQuote(null)}
                >
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
