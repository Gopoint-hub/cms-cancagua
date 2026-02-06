import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { 
  Loader2, Mail, Phone, MessageSquare, Eye, CheckCheck, 
  Trash2, Download, Search, RefreshCw, MoreHorizontal,
  Send, ExternalLink
} from "lucide-react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function CMSMensajes() {
  const { user, loading: authLoading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "read" | "replied">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Queries
  const { data: messages, isLoading, refetch } = trpc.contactMessages.list.useQuery();

  // Mutations
  const updateStatusMutation = trpc.contactMessages.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Estado actualizado");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al actualizar estado");
    },
  });

  const deleteMutation = trpc.contactMessages.delete.useMutation({
    onSuccess: () => {
      toast.success("Mensaje eliminado");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar mensaje");
    },
  });

  const bulkDeleteMutation = trpc.contactMessages.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} mensajes eliminados`);
      setSelectedIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar mensajes");
    },
  });

  const bulkUpdateStatusMutation = trpc.contactMessages.bulkUpdateStatus.useMutation({
    onSuccess: (data: { count: number }) => {
      toast.success(`${data.count} mensajes actualizados`);
      setSelectedIds([]);
      refetch();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Error al actualizar mensajes");
    },
  });

  const resendEmailMutation = trpc.contactMessages.resendToEmail.useMutation({
    onSuccess: () => {
      toast.success("Mensaje reenviado a contacto@cancagua.cl");
    },
    onError: (error) => {
      toast.error(error.message || "Error al reenviar mensaje");
    },
  });

  // Verificar permisos
  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user || (user.role !== "super_admin" && user.role !== "admin" && user.role !== "editor")) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-96">
            <CardHeader>
              <CardTitle>Acceso Denegado</CardTitle>
              <CardDescription>
                No tienes permisos para ver los mensajes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/cms">Volver al Dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Filtrar mensajes
  const filteredMessages = messages?.filter((message: any) => {
    const matchesStatus = statusFilter === "all" || message.status === statusFilter;
    const matchesSearch = !searchTerm || 
      message.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.message?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  }) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Nuevo</Badge>;
      case "read":
        return <Badge variant="secondary">Leído</Badge>;
      case "replied":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Respondido</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredMessages.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredMessages.map((m: any) => m.id));
    }
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`¿Eliminar ${selectedIds.length} mensajes seleccionados?`)) {
      bulkDeleteMutation.mutate({ ids: selectedIds });
    }
  };

  const handleBulkUpdateStatus = (status: "new" | "read" | "replied") => {
    if (selectedIds.length === 0) return;
    bulkUpdateStatusMutation.mutate({ ids: selectedIds, status });
  };

  const handleWhatsAppReply = (phone: string, name: string) => {
    // Limpiar número de teléfono
    const cleanPhone = phone.replace(/\D/g, "");
    // Agregar código de país si no lo tiene
    const fullPhone = cleanPhone.startsWith("56") ? cleanPhone : `56${cleanPhone}`;
    const message = encodeURIComponent(`Hola ${name}, gracias por contactarnos a través de nuestra web. `);
    window.open(`https://wa.me/${fullPhone}?text=${message}`, "_blank");
  };

  const handleResendEmail = (messageId: number) => {
    resendEmailMutation.mutate({ id: messageId });
  };

  const handleViewDetail = (message: any) => {
    setSelectedMessage(message);
    setIsDetailOpen(true);
    // Marcar como leído si es nuevo
    if (message.status === "new") {
      updateStatusMutation.mutate({ id: message.id, status: "read" });
    }
  };

  const handleExportCSV = () => {
    if (filteredMessages.length === 0) {
      toast.error("No hay mensajes para exportar");
      return;
    }

    const selectedMessages = selectedIds.length > 0
      ? filteredMessages.filter((m: any) => selectedIds.includes(m.id))
      : filteredMessages;

    const headers = ["ID", "Nombre", "Email", "Teléfono", "Mensaje", "Estado", "Fecha"];
    const rows = selectedMessages.map((m: any) => [
      m.id,
      m.name,
      m.email,
      m.phone || "",
      m.message.replace(/\n/g, " ").replace(/"/g, '""'),
      m.status,
      format(new Date(m.createdAt), "dd/MM/yyyy HH:mm", { locale: es }),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mensajes_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();

    toast.success(`${selectedMessages.length} mensajes exportados`);
  };

  // Estadísticas
  const stats = {
    total: messages?.length || 0,
    new: messages?.filter((m: any) => m.status === "new").length || 0,
    read: messages?.filter((m: any) => m.status === "read").length || 0,
    replied: messages?.filter((m: any) => m.status === "replied").length || 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mensajes de Contacto</h1>
            <p className="text-muted-foreground">
              {stats.new > 0 ? `${stats.new} mensajes nuevos` : "Gestiona los mensajes del formulario de contacto"}
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("all")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("new")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Nuevos</CardTitle>
              <Mail className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.new}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("read")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Leídos</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.read}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("replied")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Respondidos</CardTitle>
              <CheckCheck className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.replied}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, email, teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Filter buttons */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={statusFilter === "all" ? "default" : "outline"}
                  onClick={() => setStatusFilter("all")}
                >
                  Todos
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "new" ? "default" : "outline"}
                  onClick={() => setStatusFilter("new")}
                >
                  Nuevos
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "read" ? "default" : "outline"}
                  onClick={() => setStatusFilter("read")}
                >
                  Leídos
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === "replied" ? "default" : "outline"}
                  onClick={() => setStatusFilter("replied")}
                >
                  Respondidos
                </Button>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-4">
                <span className="text-sm font-medium">{selectedIds.length} seleccionados</span>
                <div className="h-4 w-px bg-border" />
                <Button size="sm" variant="outline" onClick={() => handleBulkUpdateStatus("read")}>
                  <Eye className="w-4 h-4 mr-1" /> Marcar leído
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkUpdateStatus("replied")}>
                  <CheckCheck className="w-4 h-4 mr-1" /> Marcar respondido
                </Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                  <Trash2 className="w-4 h-4 mr-1" /> Eliminar
                </Button>
                <div className="ml-auto">
                  <Button size="sm" variant="outline" onClick={handleExportCSV}>
                    <Download className="w-4 h-4 mr-1" /> Exportar
                  </Button>
                </div>
              </div>
            )}

            {/* Table */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No se encontraron mensajes
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIds.length === filteredMessages.length && filteredMessages.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Mensaje</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMessages.map((message: any) => (
                      <TableRow 
                        key={message.id} 
                        className={message.status === "new" ? "bg-blue-50/50" : ""}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(message.id)}
                            onCheckedChange={() => handleSelectOne(message.id)}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(message.createdAt), "dd/MM/yy HH:mm", { locale: es })}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{message.name}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              {message.email}
                            </div>
                            {message.phone && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {message.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="text-sm truncate" title={message.message}>
                            {message.message}
                          </p>
                        </TableCell>
                        <TableCell>{getStatusBadge(message.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* WhatsApp button */}
                            {message.phone && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => handleWhatsAppReply(message.phone, message.name)}
                                title="Responder por WhatsApp"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                            
                            {/* More actions dropdown */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewDetail(message)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Ver detalle
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleResendEmail(message.id)}>
                                  <Send className="mr-2 h-4 w-4" />
                                  Reenviar a email
                                </DropdownMenuItem>
                                {message.phone && (
                                  <DropdownMenuItem onClick={() => handleWhatsAppReply(message.phone, message.name)}>
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    Responder WhatsApp
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  onClick={() => updateStatusMutation.mutate({ id: message.id, status: "replied" })}
                                >
                                  <CheckCheck className="mr-2 h-4 w-4" />
                                  Marcar respondido
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-red-600"
                                  onClick={() => {
                                    if (confirm("¿Eliminar este mensaje?")) {
                                      deleteMutation.mutate({ id: message.id });
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detalle del Mensaje</DialogTitle>
              <DialogDescription>
                Recibido el {selectedMessage?.createdAt && format(new Date(selectedMessage.createdAt), "dd 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}
              </DialogDescription>
            </DialogHeader>
            {selectedMessage && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nombre</p>
                    <p className="font-medium">{selectedMessage.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estado</p>
                    {getStatusBadge(selectedMessage.status)}
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedMessage.email}</p>
                </div>

                {selectedMessage.phone && (
                  <div>
                    <p className="text-sm text-muted-foreground">Teléfono</p>
                    <p className="font-medium">{selectedMessage.phone}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground">Mensaje</p>
                  <p className="mt-1 p-3 bg-muted rounded-lg whitespace-pre-wrap">{selectedMessage.message}</p>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  {selectedMessage.phone && (
                    <Button 
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleWhatsAppReply(selectedMessage.phone, selectedMessage.name)}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Responder por WhatsApp
                    </Button>
                  )}
                  <Button 
                    variant="outline"
                    onClick={() => handleResendEmail(selectedMessage.id)}
                    disabled={resendEmailMutation.isPending}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Reenviar a email
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
