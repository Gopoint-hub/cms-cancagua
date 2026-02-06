import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Mail, Plus, Eye, Copy, Trash2, Download, Send, Calendar, Clock, Users, BarChart3, Search, Filter } from "lucide-react";
import { Link, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

export default function CMSNewsletter() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"drafts" | "sent">("sent");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [previewNewsletter, setPreviewNewsletter] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Queries
  const { data: newsletters, isLoading, refetch } = trpc.newsletters.getAll.useQuery();

  // Mutations
  const deleteMutation = trpc.newsletters.delete.useMutation({
    onSuccess: () => {
      toast.success("Newsletter eliminado");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar newsletter");
    },
  });

  const bulkDeleteMutation = trpc.newsletters.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} newsletters eliminados`);
      setSelectedIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar newsletters");
    },
  });

  const duplicateMutation = trpc.newsletters.duplicate.useMutation({
    onSuccess: () => {
      toast.success("Newsletter duplicado. Redirigiendo al editor...");
      refetch();
      // Navegar al creador con el nuevo newsletter
      setTimeout(() => navigate("/cms/crear-newsletter"), 500);
    },
    onError: (error) => {
      toast.error(error.message || "Error al duplicar newsletter");
    },
  });

  // Verificar permisos
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#44580E]" />
      </div>
    );
  }

  if (!user || (user.role !== "super_admin" && user.role !== "admin" && user.role !== "editor")) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Acceso Denegado</CardTitle>
            <CardDescription>
              No tienes permisos para ver los newsletters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/cms">Volver al Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filtrar newsletters por pestaña
  const filteredNewsletters = newsletters?.filter((newsletter: any) => {
    const matchesTab = activeTab === "drafts" 
      ? newsletter.status === "draft" 
      : newsletter.status === "sent";
    const matchesSearch = !searchQuery || 
      newsletter.subject?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Borrador</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Programado</Badge>;
      case "sending":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Enviando</Badge>;
      case "sent":
        return <Badge className="bg-green-500 hover:bg-green-600">Enviado</Badge>;
      case "failed":
        return <Badge variant="destructive">Fallido</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredNewsletters?.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredNewsletters?.map((n: any) => n.id) || []);
    }
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`¿Eliminar ${selectedIds.length} newsletters seleccionados?`)) {
      bulkDeleteMutation.mutate({ ids: selectedIds });
    }
  };

  const handleDuplicate = (id: number) => {
    duplicateMutation.mutate({ id });
  };

  const handlePreview = (newsletter: any) => {
    setPreviewNewsletter(newsletter);
    setShowPreview(true);
  };

  const exportToCSV = () => {
    if (!filteredNewsletters || filteredNewsletters.length === 0) {
      toast.error("No hay newsletters para exportar");
      return;
    }

    const headers = ["ID", "Asunto", "Estado", "Fecha Envío", "Hora Envío", "Destinatarios", "Aperturas", "Clicks", "Creado"];
    const rows = filteredNewsletters.map((n: any) => [
      n.id,
      n.subject,
      n.status,
      formatDate(n.sentAt || n.scheduledAt),
      formatTime(n.sentAt || n.scheduledAt),
      n.recipientCount || 0,
      n.openCount || 0,
      n.clickCount || 0,
      formatDate(n.createdAt),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any) => row.map((cell: any) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `newsletters_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("CSV exportado correctamente");
  };

  // Estadísticas
  const stats = {
    total: newsletters?.length || 0,
    sent: newsletters?.filter((n: any) => n.status === "sent").length || 0,
    draft: newsletters?.filter((n: any) => n.status === "draft").length || 0,
    scheduled: newsletters?.filter((n: any) => n.status === "scheduled").length || 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Newsletters</h1>
            <p className="text-gray-500">Gestiona tus campañas de email marketing</p>
          </div>
          <Button asChild className="bg-[#44580E] hover:bg-[#3a4c0c]">
            <Link href="/cms/crear-newsletter">
              <Plus className="w-4 h-4 mr-2" />
              Crear Newsletter
            </Link>
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab("sent")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "sent"
                ? "text-[#44580E] border-b-2 border-[#44580E]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Send className="w-4 h-4 inline mr-2" />
            Enviados ({stats.sent})
          </button>
          <button
            onClick={() => setActiveTab("drafts")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "drafts"
                ? "text-[#44580E] border-b-2 border-[#44580E]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Mail className="w-4 h-4 inline mr-2" />
            Borradores ({stats.draft})
          </button>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por asunto..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full sm:w-64"
                  />
                </div>

              </div>

              <div className="flex gap-2">
                {selectedIds.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={bulkDeleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Eliminar ({selectedIds.length})
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={exportToCSV}>
                  <Download className="w-4 h-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#44580E]" />
              </div>
            ) : !filteredNewsletters || filteredNewsletters.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No hay newsletters</h3>
                <p className="text-gray-500 mb-4">Crea tu primer newsletter para comenzar</p>
                <Button asChild className="bg-[#44580E] hover:bg-[#3a4c0c]">
                  <Link href="/cms/crear-newsletter">
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Newsletter
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <Checkbox
                          checked={selectedIds.length === filteredNewsletters.length && filteredNewsletters.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Asunto</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Estado</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Fecha</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Hora</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                        <Users className="w-4 h-4 inline mr-1" />
                        Destinatarios
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                        <Eye className="w-4 h-4 inline mr-1" />
                        Aperturas
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredNewsletters.map((newsletter: any) => (
                      <tr key={newsletter.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selectedIds.includes(newsletter.id)}
                            onCheckedChange={() => handleSelectOne(newsletter.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 max-w-xs truncate">
                            {newsletter.subject}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(newsletter.status)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {formatDate(newsletter.sentAt || newsletter.scheduledAt || newsletter.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatTime(newsletter.sentAt || newsletter.scheduledAt || newsletter.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {newsletter.recipientCount || 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {newsletter.status === "sent" ? (
                            <span>
                              {newsletter.openCount || 0}
                              {newsletter.recipientCount > 0 && (
                                <span className="text-xs text-gray-400 ml-1">
                                  ({Math.round((newsletter.openCount / newsletter.recipientCount) * 100)}%)
                                </span>
                              )}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePreview(newsletter)}
                              title="Vista previa"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDuplicate(newsletter.id)}
                              disabled={duplicateMutation.isPending}
                              title="Duplicar y editar"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("¿Eliminar este newsletter?")) {
                                  deleteMutation.mutate({ id: newsletter.id });
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              title="Eliminar"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/cms/suscriptores")}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#44580E]/10 rounded-lg">
                  <Users className="w-6 h-6 text-[#44580E]" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Gestionar Suscriptores</h3>
                  <p className="text-sm text-gray-500">Ver y administrar tu lista de contactos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/cms/listas")}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#44580E]/10 rounded-lg">
                  <Filter className="w-6 h-6 text-[#44580E]" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Gestionar Listas</h3>
                  <p className="text-sm text-gray-500">Segmenta tu audiencia en listas personalizadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Vista Previa: {previewNewsletter?.subject}</DialogTitle>
            <DialogDescription>
              Así se verá el email en el cliente de correo
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-lg bg-white">
            {previewNewsletter?.htmlContent ? (
              <iframe
                srcDoc={previewNewsletter.htmlContent}
                className="w-full h-[500px] border-0"
                title="Vista previa del newsletter"
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No hay contenido para mostrar
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cerrar
            </Button>
            <Button
              onClick={() => {
                handleDuplicate(previewNewsletter?.id);
                setShowPreview(false);
              }}
              className="bg-[#44580E] hover:bg-[#3a4c0c]"
            >
              <Copy className="w-4 h-4 mr-2" />
              Duplicar y Editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
