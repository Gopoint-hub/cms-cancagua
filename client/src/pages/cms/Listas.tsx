import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Tag, Plus, Trash2, Edit, Users, Search, Eye, UserMinus, MapPin, Calendar, Briefcase, List, ChevronDown } from "lucide-react";
import { Link, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

type ListCategory = "all" | "servicio" | "evento" | "ubicacion" | "otro";

function getCategory(name: string): ListCategory {
  if (name.startsWith("Servicio:")) return "servicio";
  if (name.startsWith("Evento:")) return "evento";
  if (name.startsWith("Ubicación:")) return "ubicacion";
  return "otro";
}

function getCategoryLabel(cat: ListCategory): string {
  switch (cat) {
    case "all": return "Todas";
    case "servicio": return "Servicios";
    case "evento": return "Eventos";
    case "ubicacion": return "Ubicaciones";
    case "otro": return "Otras";
  }
}

function getCategoryIcon(cat: ListCategory) {
  switch (cat) {
    case "servicio": return <Briefcase className="w-4 h-4" />;
    case "evento": return <Calendar className="w-4 h-4" />;
    case "ubicacion": return <MapPin className="w-4 h-4" />;
    case "otro": return <List className="w-4 h-4" />;
    default: return <Tag className="w-4 h-4" />;
  }
}

function getCategoryBadgeColor(cat: ListCategory): string {
  switch (cat) {
    case "servicio": return "bg-blue-100 text-blue-700";
    case "evento": return "bg-purple-100 text-purple-700";
    case "ubicacion": return "bg-green-100 text-green-700";
    case "otro": return "bg-gray-100 text-gray-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

function getDisplayName(name: string): string {
  return name.replace(/^(Servicio|Evento|Ubicación): /, "");
}

export default function CMSListas() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ListCategory>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedList, setSelectedList] = useState<any>(null);

  // Form states
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");

  // Queries
  const { data: lists, isLoading, refetch } = trpc.lists.getAll.useQuery();
  const { data: listSubscribers, isLoading: subscribersLoading, refetch: refetchSubscribers } = trpc.lists.getSubscribers.useQuery(
    { listId: selectedList?.id || 0 },
    { enabled: !!selectedList && showViewModal }
  );

  // Mutations
  const createMutation = trpc.lists.create.useMutation({
    onSuccess: () => {
      toast.success("Lista creada");
      setShowCreateModal(false);
      setListName("");
      setListDescription("");
      refetch();
    },
    onError: (error) => toast.error(error.message || "Error al crear lista"),
  });

  const updateMutation = trpc.lists.update.useMutation({
    onSuccess: () => {
      toast.success("Lista actualizada");
      setShowEditModal(false);
      setSelectedList(null);
      refetch();
    },
    onError: (error) => toast.error(error.message || "Error al actualizar lista"),
  });

  const deleteMutation = trpc.lists.delete.useMutation({
    onSuccess: () => {
      toast.success("Lista eliminada");
      refetch();
    },
    onError: (error) => toast.error(error.message || "Error al eliminar lista"),
  });

  const bulkDeleteMutation = trpc.lists.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} listas eliminadas`);
      setSelectedIds(new Set());
      refetch();
    },
    onError: (error) => toast.error(error.message || "Error al eliminar listas"),
  });

  const removeSubscriberMutation = trpc.lists.removeSubscriber.useMutation({
    onSuccess: () => {
      toast.success("Suscriptor eliminado de la lista");
      refetchSubscribers();
      refetch();
    },
    onError: (error) => toast.error(error.message || "Error al eliminar suscriptor"),
  });

  // Category counts
  const categoryCounts = useMemo(() => {
    if (!lists) return { all: 0, servicio: 0, evento: 0, ubicacion: 0, otro: 0 };
    const counts = { all: lists.length, servicio: 0, evento: 0, ubicacion: 0, otro: 0 };
    for (const list of lists) {
      const cat = getCategory(list.name);
      counts[cat]++;
    }
    return counts;
  }, [lists]);

  // Filter lists
  const filteredLists = useMemo(() => {
    if (!lists) return [];
    return lists.filter((list: any) => {
      const matchesCategory = activeCategory === "all" || getCategory(list.name) === activeCategory;
      const matchesSearch = !searchQuery ||
        list.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        list.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [lists, activeCategory, searchQuery]);

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
            <CardDescription>No tienes permisos para ver las listas.</CardDescription>
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

  const handleCreate = () => {
    if (!listName.trim()) {
      toast.error("Por favor ingresa un nombre para la lista");
      return;
    }
    createMutation.mutate({ name: listName, description: listDescription || undefined });
  };

  const handleUpdate = () => {
    if (!selectedList || !listName.trim()) return;
    updateMutation.mutate({ id: selectedList.id, name: listName, description: listDescription || undefined });
  };

  const handleDelete = (list: any) => {
    if (confirm(`¿Eliminar la lista "${list.name}"? Los suscriptores no serán eliminados.`)) {
      deleteMutation.mutate({ id: list.id });
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`¿Eliminar ${selectedIds.size} listas seleccionadas? Los suscriptores no serán eliminados.`)) {
      bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
    }
  };

  const openEditModal = (list: any) => {
    setSelectedList(list);
    setListName(list.name);
    setListDescription(list.description || "");
    setShowEditModal(true);
  };

  const openViewModal = (list: any) => {
    setSelectedList(list);
    setShowViewModal(true);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLists.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLists.map((l: any) => l.id)));
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const totalSubscribers = lists?.reduce((sum: number, list: any) => sum + (list.subscriberCount || 0), 0) || 0;
  const categories: ListCategory[] = ["all", "servicio", "evento", "ubicacion", "otro"];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Listas de Suscriptores</h1>
            <p className="text-gray-500">
              {lists?.length || 0} listas · {totalSubscribers.toLocaleString()} asignaciones totales
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="bg-[#44580E] hover:bg-[#3a4c0c]">
            <Plus className="w-4 h-4 mr-2" />
            Crear Lista
          </Button>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <Button
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => { setActiveCategory(cat); setSelectedIds(new Set()); }}
              className={activeCategory === cat ? "bg-[#44580E] hover:bg-[#3a4c0c]" : ""}
            >
              {cat !== "all" && getCategoryIcon(cat)}
              <span className="ml-1">{getCategoryLabel(cat)}</span>
              <Badge variant="secondary" className="ml-2 text-xs px-1.5 py-0">
                {categoryCounts[cat]}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Search + Bulk Actions */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar listas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{selectedIds.size} seleccionadas</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                {bulkDeleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-1" />
                )}
                Eliminar seleccionadas
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Deseleccionar
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#44580E]" />
          </div>
        ) : !filteredLists || filteredLists.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Tag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchQuery ? "Sin resultados" : "No hay listas"}
                </h3>
                <p className="text-gray-500 mb-4">
                  {searchQuery ? "Intenta con otro término de búsqueda" : "Crea tu primera lista para segmentar tus suscriptores"}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setShowCreateModal(true)} className="bg-[#44580E] hover:bg-[#3a4c0c]">
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Lista
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left w-10">
                      <Checkbox
                        checked={selectedIds.size === filteredLists.length && filteredLists.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Suscriptores</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Creada</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLists.map((list: any) => {
                    const cat = getCategory(list.name);
                    return (
                      <tr
                        key={list.id}
                        className={`hover:bg-gray-50 transition-colors ${selectedIds.has(list.id) ? "bg-blue-50/50" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selectedIds.has(list.id)}
                            onCheckedChange={() => toggleSelect(list.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 text-sm">
                              {getDisplayName(list.name)}
                            </span>
                          </div>
                          {list.description && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{list.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryBadgeColor(cat)}`}>
                            {getCategoryIcon(cat)}
                            {getCategoryLabel(cat).replace(/s$/, "")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-medium text-gray-700">
                            {(list.subscriberCount || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {formatDate(list.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openViewModal(list)}
                              className="h-8 w-8 p-0"
                              title="Ver suscriptores"
                            >
                              <Eye className="w-4 h-4 text-gray-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(list)}
                              className="h-8 w-8 p-0"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4 text-gray-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(list)}
                              disabled={deleteMutation.isPending}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-500">
              Mostrando {filteredLists.length} de {lists?.length || 0} listas
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/cms/suscriptores")}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#44580E]/10 rounded-lg">
                  <Users className="w-6 h-6 text-[#44580E]" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Ver Suscriptores</h3>
                  <p className="text-sm text-gray-500">Gestiona todos tus contactos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/cms/crear-newsletter")}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#44580E]/10 rounded-lg">
                  <Plus className="w-6 h-6 text-[#44580E]" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Crear Newsletter</h3>
                  <p className="text-sm text-gray-500">Envía un email a tus listas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create List Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nueva Lista</DialogTitle>
            <DialogDescription>Crea una lista para agrupar suscriptores</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Nombre de la Lista *</Label>
              <Input
                id="name"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Ej: Clientes VIP"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea
                id="description"
                value={listDescription}
                onChange={(e) => setListDescription(e.target.value)}
                placeholder="Describe el propósito de esta lista..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !listName.trim()}
              className="bg-[#44580E] hover:bg-[#3a4c0c]"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Crear Lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit List Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Lista</DialogTitle>
            <DialogDescription>Modifica los datos de la lista</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="editName">Nombre de la Lista *</Label>
              <Input
                id="editName"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="editDescription">Descripción (opcional)</Label>
              <Textarea
                id="editDescription"
                value={listDescription}
                onChange={(e) => setListDescription(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancelar</Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !listName.trim()}
              className="bg-[#44580E] hover:bg-[#3a4c0c]"
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Edit className="w-4 h-4 mr-2" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View List Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-[#44580E]" />
              {selectedList?.name}
            </DialogTitle>
            <DialogDescription>{selectedList?.description || "Sin descripción"}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium">Suscriptores ({listSubscribers?.length || 0})</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowViewModal(false); navigate("/cms/suscriptores"); }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar Suscriptores
              </Button>
            </div>
            {subscribersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#44580E]" />
              </div>
            ) : !listSubscribers || listSubscribers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p>No hay suscriptores en esta lista</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto border rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Email</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Nombre</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Agregado</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {listSubscribers.map((sub: any) => (
                      <tr key={sub.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm">{sub.email}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{sub.name || "-"}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{formatDate(sub.addedToListAt)}</td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("¿Eliminar este suscriptor de la lista?")) {
                                removeSubscriberMutation.mutate({
                                  listId: selectedList.id,
                                  subscriberId: sub.id,
                                });
                              }
                            }}
                            disabled={removeSubscriberMutation.isPending}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewModal(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
