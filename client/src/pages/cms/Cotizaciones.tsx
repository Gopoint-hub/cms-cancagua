import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Eye, Edit, Trash2, CheckCircle2, XCircle, DollarSign, FileText, Download, Copy, Send, Loader2, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useLocation } from "wouter";

const STATUS_CONFIG = {
  draft: { label: "Borrador", variant: "secondary" as const, color: "bg-gray-500" },
  sent: { label: "Enviada", variant: "default" as const, color: "bg-blue-500" },
  approved: { label: "Aprobada", variant: "default" as const, color: "bg-green-500" },
  event_completed: { label: "Jornada Efectuada", variant: "default" as const, color: "bg-purple-500" },
  paid: { label: "Pagada", variant: "default" as const, color: "bg-emerald-500" },
  invoiced: { label: "Facturada", variant: "default" as const, color: "bg-indigo-500" },
};

export default function Cotizaciones() {
  const [, setLocation] = useLocation();
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendQuote, setSendQuote] = useState<any>(null);
  const [additionalEmails, setAdditionalEmails] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [dealFilter, setDealFilter] = useState<number | null>(null);

  const { data: allQuotes = [], refetch } = trpc.quotes.getAll.useQuery();
  const { data: deals = [] } = trpc.deals.getAll.useQuery();

  // Filtrar cotizaciones por negocio si hay filtro activo
  const quotes = dealFilter
    ? allQuotes.filter((q: any) => q.dealId === dealFilter)
    : allQuotes;

  // Obtener nombre del negocio filtrado
  const filteredDealName = dealFilter
    ? deals.find((d: any) => d.id === dealFilter)?.name
    : null;
  const generatePDFMutation = trpc.quotes.generatePDF.useMutation();
  const sendByEmailMutation = trpc.quotes.sendByEmail.useMutation();
  const { data: quoteItems = [] } = trpc.quotes.getItems.useQuery(
    { quoteId: selectedQuote?.id || 0 },
    { enabled: !!selectedQuote }
  );
  const updateStatusMutation = trpc.quotes.updateStatus.useMutation();
  const deleteQuoteMutation = trpc.quotes.delete.useMutation();
  const bulkDeleteMutation = trpc.quotes.bulkDelete.useMutation();
  const bulkUpdateStatusMutation = trpc.quotes.bulkUpdateStatus.useMutation();
  const bulkDuplicateMutation = trpc.quotes.bulkDuplicate.useMutation();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("es-CL");
  };

  const handleViewDetails = (quote: any) => {
    setSelectedQuote(quote);
    setShowDetailsDialog(true);
  };

  const handleChangeStatus = (quote: any) => {
    setSelectedQuote(quote);
    setNewStatus(quote.status);
    setShowStatusDialog(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedQuote || !newStatus) return;

    try {
      await updateStatusMutation.mutateAsync({
        id: selectedQuote.id,
        status: newStatus as any,
      });
      toast.success("Estado actualizado correctamente");
      setShowStatusDialog(false);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar estado");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta cotización?")) return;

    try {
      await deleteQuoteMutation.mutateAsync({ id });
      toast.success("Cotización eliminada");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar cotización");
    }
  };

  const handleExportPDF = async (id: number) => {
    try {
      toast.info("Generando PDF...");
      const result = await generatePDFMutation.mutateAsync({ id });
      
      // Convertir base64 a blob y descargar
      const byteCharacters = atob(result.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      
      // Crear enlace de descarga
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success("PDF generado correctamente");
    } catch (error: any) {
      toast.error(error.message || "Error al generar PDF");
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === quotes.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(quotes.map((q: any) => q.id));
    }
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.length} cotizaciones seleccionadas?`)) return;

    try {
      await bulkDeleteMutation.mutateAsync({ ids: selectedIds });
      toast.success(`${selectedIds.length} cotizaciones eliminadas`);
      setSelectedIds([]);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar cotizaciones");
    }
  };

  const handleBulkUpdateStatus = async (status: string) => {
    if (selectedIds.length === 0) return;

    try {
      await bulkUpdateStatusMutation.mutateAsync({ ids: selectedIds, status: status as any });
      toast.success(`${selectedIds.length} cotizaciones actualizadas`);
      setSelectedIds([]);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar cotizaciones");
    }
  };

  const handleBulkDuplicate = async () => {
    if (selectedIds.length === 0) return;

    try {
      toast.info(`Duplicando ${selectedIds.length} cotizaciones...`);
      const result = await bulkDuplicateMutation.mutateAsync({ ids: selectedIds });
      toast.success(`${result.count} cotizaciones duplicadas`);
      setSelectedIds([]);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Error al duplicar cotizaciones");
    }
  };

  const handleOpenSendDialog = (quote: any) => {
    setSendQuote(quote);
    setAdditionalEmails("");
    setCustomMessage("");
    setShowSendDialog(true);
  };

  const handleSendQuote = async () => {
    if (!sendQuote) return;

    try {
      toast.info("Enviando cotización...");
      
      // Parsear emails adicionales
      const emailList = additionalEmails
        .split(/[,;\s]+/)
        .map(e => e.trim())
        .filter(e => e && e.includes("@"));
      
      await sendByEmailMutation.mutateAsync({
        id: sendQuote.id,
        customMessage: customMessage || undefined,
        additionalEmails: emailList.length > 0 ? emailList : undefined,
      });
      
      const recipients = [sendQuote.clientEmail, ...emailList].join(", ");
      toast.success(`Cotización enviada a: ${recipients}`);
      setShowSendDialog(false);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Error al enviar cotización");
    }
  };

  const handleExportCSV = () => {
    if (quotes.length === 0) {
      toast.error("No hay cotizaciones para exportar");
      return;
    }

    const selectedQuotes = selectedIds.length > 0
      ? quotes.filter((q: any) => selectedIds.includes(q.id))
      : quotes;

    const headers = ["Número", "Cliente", "Email", "Empresa", "Fecha Creación", "Personas", "Total", "Estado", "Válida Hasta"];
    const rows = selectedQuotes.map((q: any) => [
      q.quoteNumber,
      q.clientName,
      q.clientEmail,
      q.clientCompany || "",
      formatDate(q.createdAt),
      q.numberOfPeople,
      q.total,
      STATUS_CONFIG[q.status as keyof typeof STATUS_CONFIG].label,
      formatDate(q.validUntil),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `cotizaciones_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast.success(`${selectedQuotes.length} cotizaciones exportadas`);
  };

  // Agrupar cotizaciones por estado
  const quotesByStatus = quotes.reduce((acc: any, quote: any) => {
    if (!acc[quote.status]) {
      acc[quote.status] = [];
    }
    acc[quote.status].push(quote);
    return acc;
  }, {});

  // Estadísticas
  const stats = {
    total: quotes.length,
    sent: quotes.filter((q: any) => q.status === "sent").length,
    approved: quotes.filter((q: any) => q.status === "approved").length,
    totalValue: quotes
      .filter((q: any) => q.status === "approved" || q.status === "event_completed" || q.status === "paid")
      .reduce((sum: number, q: any) => sum + q.total, 0),
  };

  return (
    <DashboardLayout>
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Cotizaciones</h1>
          <p className="text-muted-foreground mt-2">
            CRM para seguimiento de cotizaciones corporativas
          </p>
        </div>
        <Button onClick={() => setLocation("/cms/cotizacion-wizard")}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cotización
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Cotizaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Enviadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.sent}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aprobadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.approved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor Total Aprobado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(stats.totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de acciones masivas */}
      {quotes.length > 0 && (
        <div className="bg-white border rounded-lg p-4 mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.length === quotes.length && quotes.length > 0}
              onCheckedChange={handleSelectAll}
            />
            <span className="text-sm font-medium">
              {selectedIds.length > 0 ? `${selectedIds.length} seleccionadas` : "Seleccionar todas"}
            </span>
          </div>

          {selectedIds.length > 0 && (
            <>
              <div className="h-6 w-px bg-gray-300" />
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkDuplicate}
                disabled={bulkDuplicateMutation.isPending}
              >
                <Copy className="w-4 h-4 mr-1" />
                Duplicar
              </Button>
              <Select onValueChange={handleBulkUpdateStatus}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Cambiar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="sent">Enviada</SelectItem>
                  <SelectItem value="approved">Aprobada</SelectItem>
                  <SelectItem value="event_completed">Jornada Efectuada</SelectItem>
                  <SelectItem value="paid">Pagada</SelectItem>
                  <SelectItem value="invoiced">Facturada</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Eliminar
              </Button>
            </>
          )}

          <div className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCSV}
            >
              <Download className="w-4 h-4 mr-1" />
              Exportar CSV
            </Button>
          </div>
        </div>
      )}

      {/* Tabla de cotizaciones */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {filteredDealName
                  ? `Cotizaciones de "${filteredDealName}" (${quotes.length})`
                  : `Todas las Cotizaciones (${quotes.length})`}
              </CardTitle>
              {filteredDealName && (
                <CardDescription className="mt-1">
                  Mostrando cotizaciones filtradas por negocio
                </CardDescription>
              )}
            </div>
            {dealFilter && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDealFilter(null)}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Limpiar filtro
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Negocio</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha Creación</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No hay cotizaciones registradas. Crea una para comenzar.
                  </TableCell>
                </TableRow>
              ) : (
                quotes.map((quote: any) => (
                  <TableRow key={quote.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(quote.id)}
                        onCheckedChange={() => handleSelectOne(quote.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono font-medium">
                      {quote.quoteNumber}
                    </TableCell>
                    <TableCell>
                      {quote.dealName ? (
                        <button
                          onClick={() => setDealFilter(quote.dealId)}
                          className="text-left hover:underline text-primary font-medium"
                        >
                          {quote.dealName}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{quote.clientName}</p>
                        <p className="text-sm text-muted-foreground">{quote.clientEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(quote.createdAt)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatPrice(quote.total)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_CONFIG[quote.status as keyof typeof STATUS_CONFIG].variant}
                        className={STATUS_CONFIG[quote.status as keyof typeof STATUS_CONFIG].color}
                      >
                        {STATUS_CONFIG[quote.status as keyof typeof STATUS_CONFIG].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewDetails(quote)}
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setLocation(`/cms/cotizacion-wizard/${quote.id}`)}
                          title="Editar cotización"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleExportPDF(quote.id)}
                          title="Exportar a PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenSendDialog(quote)}
                          title="Enviar por email"
                          disabled={sendByEmailMutation.isPending}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleChangeStatus(quote)}
                          title="Cambiar estado"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(quote.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog: Detalles de cotización */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles de Cotización {selectedQuote?.quoteNumber}</DialogTitle>
            <DialogDescription>
              Cliente: {selectedQuote?.clientName}
            </DialogDescription>
          </DialogHeader>

          {selectedQuote && (
            <div className="space-y-6">
              {/* Información general */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Estado</p>
                  <Badge
                    variant={STATUS_CONFIG[selectedQuote.status as keyof typeof STATUS_CONFIG].variant}
                    className={`${STATUS_CONFIG[selectedQuote.status as keyof typeof STATUS_CONFIG].color} mt-1`}
                  >
                    {STATUS_CONFIG[selectedQuote.status as keyof typeof STATUS_CONFIG].label}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Número de Personas</p>
                  <p className="text-lg font-medium">{selectedQuote.numberOfPeople}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Fecha del Evento</p>
                  <p className="text-lg font-medium">{formatDate(selectedQuote.eventDate)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Válida Hasta</p>
                  <p className="text-lg font-medium">{formatDate(selectedQuote.validUntil)}</p>
                </div>
              </div>

              {/* Productos */}
              <div>
                <h3 className="font-bold mb-3">Productos y Servicios</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center">Cantidad</TableHead>
                      <TableHead className="text-right">Precio Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quoteItems.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium">{item.productName}</p>
                          {item.description && (
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatPrice(item.unitPrice)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPrice(item.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-bold">
                        TOTAL
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg">
                        {formatPrice(selectedQuote.total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Itinerario */}
              {selectedQuote.itinerary && (
                <div>
                  <h3 className="font-bold mb-3">Itinerario</h3>
                  <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded">
                    {selectedQuote.itinerary}
                  </pre>
                </div>
              )}

              {/* Notas */}
              {selectedQuote.notes && (
                <div>
                  <h3 className="font-bold mb-3">Notas Internas</h3>
                  <p className="text-sm bg-muted p-4 rounded">{selectedQuote.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowDetailsDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cambiar estado */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Estado de Cotización</DialogTitle>
            <DialogDescription>
              Cotización: {selectedQuote?.quoteNumber} - {selectedQuote?.clientName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Estado Actual:</p>
              <Badge
                variant={STATUS_CONFIG[selectedQuote?.status as keyof typeof STATUS_CONFIG]?.variant}
                className={STATUS_CONFIG[selectedQuote?.status as keyof typeof STATUS_CONFIG]?.color}
              >
                {STATUS_CONFIG[selectedQuote?.status as keyof typeof STATUS_CONFIG]?.label}
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Nuevo Estado:</p>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="sent">Cotización Enviada</SelectItem>
                  <SelectItem value="approved">Aprobado por el Cliente</SelectItem>
                  <SelectItem value="event_completed">Jornada Efectuada</SelectItem>
                  <SelectItem value="paid">Jornada Pagada</SelectItem>
                  <SelectItem value="invoiced">Factura Enviada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg text-sm">
              <p className="font-medium mb-2">Flujo recomendado:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Borrador → Cotización Enviada</li>
                <li>Cotización Enviada → Aprobado por el Cliente</li>
                <li>Aprobado → Jornada Efectuada</li>
                <li>Jornada Efectuada → Jornada Pagada</li>
                <li>Jornada Pagada → Factura Enviada</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateStatus}
              disabled={updateStatusMutation.isPending || newStatus === selectedQuote?.status}
            >
              Actualizar Estado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Enviar cotización por email */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Enviar Cotización por Email
            </DialogTitle>
            <DialogDescription>
              Cotización: {sendQuote?.quoteNumber} - {sendQuote?.clientName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg text-sm space-y-2">
              <p><strong>Remitente:</strong> Cotización Cancagua &lt;cotizacion@cancagua.cl&gt;</p>
              <p><strong>Copia automática:</strong> eventos@cancagua.cl</p>
              <p><strong>Respuestas a:</strong> eventos@cancagua.cl</p>
            </div>

            <div>
              <Label>Destinatario Principal</Label>
              <Input
                value={sendQuote?.clientEmail || ""}
                disabled
                className="mt-1 bg-gray-50"
              />
            </div>

            <div>
              <Label htmlFor="additionalEmails">Destinatarios Adicionales (opcional)</Label>
              <Input
                id="additionalEmails"
                value={additionalEmails}
                onChange={(e) => setAdditionalEmails(e.target.value)}
                placeholder="email1@ejemplo.com, email2@ejemplo.com"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separa múltiples emails con comas o espacios
              </p>
            </div>

            <div>
              <Label htmlFor="customMessage">Mensaje Personalizado (opcional)</Label>
              <Textarea
                id="customMessage"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Agregue un mensaje personalizado para el cliente..."
                className="mt-1"
                rows={3}
              />
            </div>

            <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-800">
              <p>Se adjuntará automáticamente el PDF de la cotización.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendQuote}
              disabled={sendByEmailMutation.isPending}
              className="bg-[#44580E] hover:bg-[#3a4c0c]"
            >
              {sendByEmailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Cotización
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
