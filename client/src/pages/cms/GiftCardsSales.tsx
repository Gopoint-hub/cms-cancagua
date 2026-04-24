import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Gift, 
  Search, 
  Mail, 
  Download, 
  Eye, 
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Send
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function GiftCardsSales() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGiftCard, setSelectedGiftCard] = useState<any>(null);
  const [isResendDialogOpen, setIsResendDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Queries
  const { data: giftCards, isLoading, refetch } = trpc.giftCardsAdmin.getAll.useQuery();
  
  // Mutations
  const resendEmail = trpc.giftCardsAdmin.resendEmail.useMutation({
    onSuccess: () => {
      toast.success("Email reenviado correctamente");
      setIsResendDialogOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Error al reenviar: ${error.message}`);
    },
  });

  const generatePDF = trpc.giftCards.generatePDF.useMutation();

  const markAbandoned = trpc.giftCardsAdmin.markAbandonedGiftCards.useMutation({
    onSuccess: (data) => {
      if (data.count > 0) {
        toast.success(`${data.count} gift cards marcadas como abandonadas`);
      } else {
        toast.info("No hay gift cards pendientes para marcar como abandonadas");
      }
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const formatPrecio = (valor: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(valor);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="w-3 h-3 mr-1" /> Completada</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="w-3 h-3 mr-1" /> Pendiente</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="w-3 h-3 mr-1" /> Rechazado</Badge>;
      case "aborted":
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100"><XCircle className="w-3 h-3 mr-1" /> Cancelado</Badge>;
      case "timeout":
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100"><Clock className="w-3 h-3 mr-1" /> Expirado</Badge>;
      case "abandoned":
        return <Badge className="bg-gray-200 text-gray-600 hover:bg-gray-200"><XCircle className="w-3 h-3 mr-1" /> Abandonado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDeliveryBadge = (deliveredAt: Date | null) => {
    if (deliveredAt) {
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Mail className="w-3 h-3 mr-1" /> Enviado</Badge>;
    }
    return <Badge variant="outline" className="text-orange-600"><Clock className="w-3 h-3 mr-1" /> No enviado</Badge>;
  };

  const handleResendEmail = (giftCard: any) => {
    setSelectedGiftCard(giftCard);
    setIsResendDialogOpen(true);
  };

  const handleViewDetails = (giftCard: any) => {
    setSelectedGiftCard(giftCard);
    setIsDetailDialogOpen(true);
  };

  const handleDownloadPDF = async (giftCard: any) => {
    try {
      const result = await generatePDF.mutateAsync({ giftCardId: giftCard.id });
      
      const byteCharacters = atob(result.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success("PDF descargado");
    } catch (error) {
      toast.error("Error al descargar el PDF");
    }
  };

  const confirmResendEmail = () => {
    if (selectedGiftCard) {
      resendEmail.mutate({ giftCardId: selectedGiftCard.id });
    }
  };

  // Filtrar gift cards
  const [filterStatus, setFilterStatus] = useState("all");

  const filteredGiftCards = giftCards?.filter((gc: any) => {
    // Primero filtro por búsqueda
    const searchMatch = !searchTerm || (
      gc.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gc.recipientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gc.recipientEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gc.senderName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gc.senderEmail?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (!searchMatch) return false;

    // Luego filtro por estado
    if (filterStatus === "all") return true;
    if (filterStatus === "completadas") return gc.purchaseStatus === "completed" && gc.status === "active";
    if (filterStatus === "usadas") return gc.status === "redeemed";
    if (filterStatus === "fallidas") return ["rejected", "aborted", "timeout", "abandoned", "pending"].includes(gc.purchaseStatus) && gc.status !== "redeemed";
    
    return true;
  }) || [];

  // Estadísticas
  const stats = {
    total: giftCards?.length || 0,
    completed: giftCards?.filter((gc: any) => gc.purchaseStatus === "completed").length || 0,
    pending: giftCards?.filter((gc: any) => gc.purchaseStatus === "pending").length || 0,
    failed: giftCards?.filter((gc: any) => ["rejected", "aborted", "timeout", "abandoned"].includes(gc.purchaseStatus)).length || 0,
    totalAmount: giftCards?.filter((gc: any) => gc.purchaseStatus === "completed").reduce((sum: number, gc: any) => sum + gc.amount, 0) || 0,
  };

  return (
    <DashboardLayout>
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ventas de Gift Cards</h1>
          <p className="text-muted-foreground">
            Gestiona las gift cards vendidas y reenvía emails si es necesario.
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => markAbandoned.mutate()}
            disabled={markAbandoned.isPending || stats.pending === 0}
            title="Marcar como abandonadas las gift cards pendientes por más de 30 minutos"
          >
            {markAbandoned.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="w-4 h-4 mr-2" />
            )}
            Limpiar Pendientes
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vendidas</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">gift cards completadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">No Completadas</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending + stats.failed}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pending} pendientes, {stats.failed} fallidas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrecio(stats.totalAmount)}</div>
            <p className="text-xs text-muted-foreground">en gift cards vendidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promedio</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.completed > 0 ? formatPrecio(stats.totalAmount / stats.completed) : "$0"}
            </div>
            <p className="text-xs text-muted-foreground">por gift card</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Table */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Ventas</CardTitle>
          <CardDescription>
            Lista de todas las gift cards vendidas. Puedes reenviar el email si el cliente no lo recibió.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código, nombre o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant={filterStatus === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("all")}
              >
                Todas
              </Button>
              <Button 
                variant={filterStatus === "completadas" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("completadas")}
              >
                Compradas
              </Button>
              <Button 
                variant={filterStatus === "usadas" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("usadas")}
              >
                Usadas
              </Button>
              <Button 
                variant={filterStatus === "fallidas" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("fallidas")}
              >
                Pendientes/Fallidas
              </Button>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredGiftCards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No se encontraron gift cards
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Comprador</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Estado Pago</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGiftCards.map((giftCard: any) => (
                    <TableRow key={giftCard.id}>
                      <TableCell className="font-medium">
                        {giftCard.createdAt ? format(new Date(giftCard.createdAt), "dd/MM/yyyy HH:mm", { locale: es }) : "-"}
                      </TableCell>
                      <TableCell>
                        <code className="bg-muted px-2 py-1 rounded text-sm">{giftCard.code}</code>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{giftCard.recipientName || "-"}</div>
                          <div className="text-sm text-muted-foreground">{giftCard.recipientEmail || "-"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{giftCard.senderName || "-"}</div>
                          <div className="text-sm text-muted-foreground">{giftCard.senderEmail || "-"}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrecio(giftCard.amount)}
                      </TableCell>
                      <TableCell>{getStatusBadge(giftCard.purchaseStatus)}</TableCell>
                      <TableCell>{getDeliveryBadge(giftCard.deliveredAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewDetails(giftCard)}
                            title="Ver detalles"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {giftCard.purchaseStatus === "completed" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDownloadPDF(giftCard)}
                                title="Descargar PDF"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleResendEmail(giftCard)}
                                title="Reenviar email"
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resend Email Dialog */}
      <Dialog open={isResendDialogOpen} onOpenChange={setIsResendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reenviar Gift Card por Email</DialogTitle>
            <DialogDescription>
              Se reenviará el email con el PDF de la gift card al destinatario.
            </DialogDescription>
          </DialogHeader>
          {selectedGiftCard && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Código:</span>
                  <code className="font-mono">{selectedGiftCard.code}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Destinatario:</span>
                  <span>{selectedGiftCard.recipientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span>{selectedGiftCard.recipientEmail || selectedGiftCard.senderEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto:</span>
                  <span className="font-medium">{formatPrecio(selectedGiftCard.amount)}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                El email se enviará a <strong>{selectedGiftCard.recipientEmail || selectedGiftCard.senderEmail}</strong> con copia a contacto@cancagua.cl
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResendDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmResendEmail} disabled={resendEmail.isPending}>
              {resendEmail.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Reenviar Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de Gift Card</DialogTitle>
          </DialogHeader>
          {selectedGiftCard && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Código</p>
                  <code className="text-lg font-mono">{selectedGiftCard.code}</code>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monto</p>
                  <p className="text-lg font-bold text-primary">{formatPrecio(selectedGiftCard.amount)}</p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Destinatario</h4>
                <div className="space-y-1">
                  <p><span className="text-muted-foreground">Nombre:</span> {selectedGiftCard.recipientName || "-"}</p>
                  <p><span className="text-muted-foreground">Email:</span> {selectedGiftCard.recipientEmail || "-"}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Comprador</h4>
                <div className="space-y-1">
                  <p><span className="text-muted-foreground">Nombre:</span> {selectedGiftCard.senderName || "-"}</p>
                  <p><span className="text-muted-foreground">Email:</span> {selectedGiftCard.senderEmail || "-"}</p>
                </div>
              </div>

              {selectedGiftCard.personalMessage && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Mensaje Personal</h4>
                  <p className="italic text-muted-foreground">"{selectedGiftCard.personalMessage}"</p>
                </div>
              )}

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Estado</h4>
                <div className="flex gap-2">
                  {getStatusBadge(selectedGiftCard.purchaseStatus)}
                  {getDeliveryBadge(selectedGiftCard.deliveredAt)}
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Fechas</h4>
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Creada:</span> {selectedGiftCard.createdAt ? format(new Date(selectedGiftCard.createdAt), "dd/MM/yyyy HH:mm", { locale: es }) : "-"}</p>
                  <p><span className="text-muted-foreground">Enviada:</span> {selectedGiftCard.deliveredAt ? format(new Date(selectedGiftCard.deliveredAt), "dd/MM/yyyy HH:mm", { locale: es }) : "No enviada"}</p>
                  <p><span className="text-muted-foreground">Expira:</span> {selectedGiftCard.expiresAt ? format(new Date(selectedGiftCard.expiresAt), "dd/MM/yyyy", { locale: es }) : "-"}</p>
                </div>
              </div>

              {selectedGiftCard.webpayAuthorizationCode && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Datos de Pago</h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Código Auth:</span> {selectedGiftCard.webpayAuthorizationCode}</p>
                    <p><span className="text-muted-foreground">Tarjeta:</span> {selectedGiftCard.webpayCardNumber || "-"}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
