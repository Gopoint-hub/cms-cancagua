import { useState, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Users, Plus, Trash2, Download, Upload, Search, Filter, UserPlus, UserMinus, Sparkles, Mail, Calendar, Tag, List, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

export default function CMSSuscriptores() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddToListModal, setShowAddToListModal] = useState(false);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  
  // Form states
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [csvData, setCsvData] = useState("");
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: subscribers, isLoading, refetch } = trpc.subscribers.getAll.useQuery();
  const { data: lists } = trpc.lists.getAll.useQuery();

  // Mutations
  const createMutation = trpc.subscribers.create.useMutation({
    onSuccess: () => {
      toast.success("Suscriptor agregado");
      setShowAddModal(false);
      setNewEmail("");
      setNewName("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al agregar suscriptor");
    },
  });

  const deleteMutation = trpc.subscribers.delete.useMutation({
    onSuccess: () => {
      toast.success("Suscriptor eliminado");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar suscriptor");
    },
  });

  const bulkDeleteMutation = trpc.subscribers.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} suscriptores eliminados`);
      setSelectedIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar suscriptores");
    },
  });

  const bulkUpdateStatusMutation = trpc.subscribers.bulkUpdateStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} suscriptores actualizados`);
      setSelectedIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al actualizar suscriptores");
    },
  });

  const importCSVMutation = trpc.subscribers.importCSV.useMutation({
    onSuccess: (data) => {
      toast.success(`Importados: ${data.imported}, Omitidos: ${data.skipped}`);
      setShowImportModal(false);
      setCsvData("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al importar CSV");
    },
  });

  const analyzeAndSegmentMutation = trpc.subscribers.analyzeAndSegment.useMutation({
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast.success("Análisis completado");
    },
    onError: (error) => {
      toast.error(error.message || "Error al analizar datos");
    },
  });

  const bulkAddToListMutation = trpc.lists.bulkAddSubscribers.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} suscriptores agregados a la lista`);
      setShowAddToListModal(false);
      setSelectedIds([]);
      setSelectedListId(null);
    },
    onError: (error) => {
      toast.error(error.message || "Error al agregar a lista");
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
              No tienes permisos para ver los suscriptores.
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

  // Filtrar suscriptores
  const filteredSubscribers = subscribers?.filter((sub: any) => {
    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    const matchesSearch = !searchQuery || 
      sub.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500 hover:bg-green-600">Activo</Badge>;
      case "unsubscribed":
        return <Badge variant="secondary">Dado de baja</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "website":
        return <Badge variant="outline" className="text-blue-600 border-blue-300">Web</Badge>;
      case "import":
        return <Badge variant="outline" className="text-purple-600 border-purple-300">Importado</Badge>;
      case "manual":
        return <Badge variant="outline" className="text-gray-600 border-gray-300">Manual</Badge>;
      default:
        return <Badge variant="outline">{source}</Badge>;
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

  const handleSelectAll = () => {
    if (selectedIds.length === filteredSubscribers?.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSubscribers?.map((s: any) => s.id) || []);
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
    if (confirm(`¿Eliminar ${selectedIds.length} suscriptores seleccionados?`)) {
      bulkDeleteMutation.mutate({ ids: selectedIds });
    }
  };

  const handleBulkUnsubscribe = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`¿Dar de baja ${selectedIds.length} suscriptores seleccionados?`)) {
      bulkUpdateStatusMutation.mutate({ ids: selectedIds, status: "unsubscribed" });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCsvData(content);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!csvData.trim()) {
      toast.error("Por favor carga un archivo CSV");
      return;
    }
    importCSVMutation.mutate({ csvData });
  };

  const handleAnalyze = () => {
    if (!csvData.trim()) {
      toast.error("Por favor carga un archivo CSV primero");
      return;
    }
    setShowAnalyzeModal(true);
    analyzeAndSegmentMutation.mutate({ csvData });
  };

  const handleAddToList = () => {
    if (!selectedListId || selectedIds.length === 0) return;
    bulkAddToListMutation.mutate({
      listId: selectedListId,
      subscriberIds: selectedIds,
    });
  };

  const exportToCSV = () => {
    if (!filteredSubscribers || filteredSubscribers.length === 0) {
      toast.error("No hay suscriptores para exportar");
      return;
    }

    const headers = ["Email", "Nombre", "Estado", "Fuente", "Fecha Suscripción"];
    const rows = filteredSubscribers.map((s: any) => [
      s.email,
      s.name || "",
      s.status,
      s.source,
      formatDate(s.subscribedAt),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any) => row.map((cell: any) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `suscriptores_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("CSV exportado correctamente");
  };

  // Estadísticas
  const stats = {
    total: subscribers?.length || 0,
    active: subscribers?.filter((s: any) => s.status === "active").length || 0,
    unsubscribed: subscribers?.filter((s: any) => s.status === "unsubscribed").length || 0,
    fromWeb: subscribers?.filter((s: any) => s.source === "website").length || 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Suscriptores</h1>
            <p className="text-gray-500">Gestiona tu lista de contactos para newsletters</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Importar CSV
            </Button>
            <Button onClick={() => setShowAddModal(true)} className="bg-[#44580E] hover:bg-[#3a4c0c]">
              <Plus className="w-4 h-4 mr-2" />
              Agregar Suscriptor
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Users className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-gray-500">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <UserPlus className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.active}</p>
                  <p className="text-sm text-gray-500">Activos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <UserMinus className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.unsubscribed}</p>
                  <p className="text-sm text-gray-500">Dados de baja</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.fromWeb}</p>
                  <p className="text-sm text-gray-500">Desde Web</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por email o nombre..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full sm:w-64"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="unsubscribed">Dados de baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedIds.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddToListModal(true)}
                    >
                      <List className="w-4 h-4 mr-2" />
                      Agregar a Lista
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkUnsubscribe}
                      disabled={bulkUpdateStatusMutation.isPending}
                    >
                      <UserMinus className="w-4 h-4 mr-2" />
                      Dar de Baja
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBulkDelete}
                      disabled={bulkDeleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar ({selectedIds.length})
                    </Button>
                  </>
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
            ) : !filteredSubscribers || filteredSubscribers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No hay suscriptores</h3>
                <p className="text-gray-500 mb-4">Agrega suscriptores manualmente o importa desde CSV</p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={() => setShowImportModal(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar CSV
                  </Button>
                  <Button onClick={() => setShowAddModal(true)} className="bg-[#44580E] hover:bg-[#3a4c0c]">
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Suscriptor
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <Checkbox
                          checked={selectedIds.length === filteredSubscribers.length && filteredSubscribers.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Nombre</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Estado</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Fuente</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Fecha</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredSubscribers.map((subscriber: any) => (
                      <tr key={subscriber.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selectedIds.includes(subscriber.id)}
                            onCheckedChange={() => handleSelectOne(subscriber.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-gray-400" />
                            <span className="font-medium">{subscriber.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {subscriber.name || "-"}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(subscriber.status)}
                        </td>
                        <td className="px-4 py-3">
                          {getSourceBadge(subscriber.source)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {formatDate(subscriber.subscribedAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("¿Eliminar este suscriptor?")) {
                                  deleteMutation.mutate({ id: subscriber.id });
                                }
                              }}
                              disabled={deleteMutation.isPending}
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
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/cms/listas")}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#44580E]/10 rounded-lg">
                  <Tag className="w-6 h-6 text-[#44580E]" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Gestionar Listas</h3>
                  <p className="text-sm text-gray-500">Crea y organiza listas de segmentación</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/cms/newsletter")}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#44580E]/10 rounded-lg">
                  <Mail className="w-6 h-6 text-[#44580E]" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Crear Newsletter</h3>
                  <p className="text-sm text-gray-500">Envía campañas a tus suscriptores</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Subscriber Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Suscriptor</DialogTitle>
            <DialogDescription>
              Agrega un nuevo suscriptor manualmente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="name">Nombre (opcional)</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del suscriptor"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate({ email: newEmail, name: newName || undefined })}
              disabled={createMutation.isPending || !newEmail}
              className="bg-[#44580E] hover:bg-[#3a4c0c]"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV Modal */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar Suscriptores desde CSV</DialogTitle>
            <DialogDescription>
              Carga un archivo CSV con columnas: email, nombre (opcional), y otros campos
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv"
              className="hidden"
            />
            
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              {csvData ? (
                <div className="space-y-2">
                  <p className="text-green-600 font-medium">Archivo cargado</p>
                  <p className="text-sm text-gray-500">
                    {csvData.split("\n").length - 1} filas detectadas
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setCsvData("")}>
                    <X className="w-4 h-4 mr-2" />
                    Quitar archivo
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-2">Arrastra un archivo CSV aquí o</p>
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                    Seleccionar Archivo
                  </Button>
                </>
              )}
            </div>

            {csvData && (
              <div>
                <Label>Vista previa</Label>
                <Textarea
                  value={csvData.split("\n").slice(0, 6).join("\n")}
                  readOnly
                  className="mt-1 font-mono text-xs h-32"
                />
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleAnalyze}
              disabled={!csvData || analyzeAndSegmentMutation.isPending}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Analizar con IA
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowImportModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={importCSVMutation.isPending || !csvData}
                className="bg-[#44580E] hover:bg-[#3a4c0c]"
              >
                {importCSVMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Importar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to List Modal */}
      <Dialog open={showAddToListModal} onOpenChange={setShowAddToListModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar a Lista</DialogTitle>
            <DialogDescription>
              Selecciona la lista a la que agregar los {selectedIds.length} suscriptores seleccionados
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Seleccionar Lista</Label>
            <Select value={selectedListId?.toString() || ""} onValueChange={(v) => setSelectedListId(parseInt(v))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecciona una lista" />
              </SelectTrigger>
              <SelectContent>
                {lists?.map((list: any) => (
                  <SelectItem key={list.id} value={list.id.toString()}>
                    {list.name} ({list.subscriberCount || 0} suscriptores)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddToListModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddToList}
              disabled={bulkAddToListMutation.isPending || !selectedListId}
              className="bg-[#44580E] hover:bg-[#3a4c0c]"
            >
              {bulkAddToListMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analyze Modal */}
      <Dialog open={showAnalyzeModal} onOpenChange={setShowAnalyzeModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Análisis de Segmentación con IA</DialogTitle>
            <DialogDescription>
              Sugerencias de listas basadas en los datos del CSV
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {analyzeAndSegmentMutation.isPending ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-[#44580E] mb-4" />
                <p className="text-gray-500">Analizando datos...</p>
              </div>
            ) : analysisResult ? (
              <div className="space-y-4">
                {analysisResult.insights && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Observaciones</h4>
                    <p className="text-sm text-blue-700">{analysisResult.insights}</p>
                  </div>
                )}
                {analysisResult.segments && analysisResult.segments.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Listas Sugeridas</h4>
                    <div className="space-y-3">
                      {analysisResult.segments.map((segment: any, index: number) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium">{segment.name}</h5>
                            <Button size="sm" variant="outline" onClick={() => {
                              toast.success(`Lista "${segment.name}" creada (pendiente implementación)`);
                            }}>
                              Crear Lista
                            </Button>
                          </div>
                          <p className="text-sm text-gray-500">{segment.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">
                No hay resultados de análisis
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnalyzeModal(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
