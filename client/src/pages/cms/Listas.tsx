import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Tag, Plus, Trash2, Edit, Users, Search, Eye, ArrowLeft, UserMinus } from "lucide-react";
import { Link, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

export default function CMSListas() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  
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
    onError: (error) => {
      toast.error(error.message || "Error al crear lista");
    },
  });

  const updateMutation = trpc.lists.update.useMutation({
    onSuccess: () => {
      toast.success("Lista actualizada");
      setShowEditModal(false);
      setSelectedList(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al actualizar lista");
    },
  });

  const deleteMutation = trpc.lists.delete.useMutation({
    onSuccess: () => {
      toast.success("Lista eliminada");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar lista");
    },
  });

  const removeSubscriberMutation = trpc.lists.removeSubscriber.useMutation({
    onSuccess: () => {
      toast.success("Suscriptor eliminado de la lista");
      refetchSubscribers();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar suscriptor");
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
              No tienes permisos para ver las listas.
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

  // Filtrar listas
  const filteredLists = lists?.filter((list: any) => {
    return !searchQuery || 
      list.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      list.description?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleCreate = () => {
    if (!listName.trim()) {
      toast.error("Por favor ingresa un nombre para la lista");
      return;
    }
    createMutation.mutate({
      name: listName,
      description: listDescription || undefined,
    });
  };

  const handleUpdate = () => {
    if (!selectedList || !listName.trim()) return;
    updateMutation.mutate({
      id: selectedList.id,
      name: listName,
      description: listDescription || undefined,
    });
  };

  const handleDelete = (list: any) => {
    if (confirm(`¿Eliminar la lista "${list.name}"? Los suscriptores no serán eliminados.`)) {
      deleteMutation.mutate({ id: list.id });
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

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Estadísticas
  const totalSubscribers = lists?.reduce((sum: number, list: any) => sum + (list.subscriberCount || 0), 0) || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Listas de Suscriptores</h1>
            <p className="text-gray-500">Organiza tus suscriptores en listas para envíos segmentados</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="bg-[#44580E] hover:bg-[#3a4c0c]">
            <Plus className="w-4 h-4 mr-2" />
            Crear Lista
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Tag className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{lists?.length || 0}</p>
                  <p className="text-sm text-gray-500">Listas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalSubscribers}</p>
                  <p className="text-sm text-gray-500">Suscriptores en Listas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Search className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <Input
                    placeholder="Buscar listas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lists Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#44580E]" />
          </div>
        ) : !filteredLists || filteredLists.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Tag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No hay listas</h3>
                <p className="text-gray-500 mb-4">Crea tu primera lista para segmentar tus suscriptores</p>
                <Button onClick={() => setShowCreateModal(true)} className="bg-[#44580E] hover:bg-[#3a4c0c]">
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Lista
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLists.map((list: any) => (
              <Card key={list.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-[#44580E]/10 rounded-lg">
                        <Tag className="w-5 h-5 text-[#44580E]" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{list.name}</CardTitle>
                        <CardDescription className="text-sm">
                          {list.subscriberCount || 0} suscriptores
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {formatDate(list.createdAt)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {list.description && (
                    <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                      {list.description}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openViewModal(list)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Ver
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(list)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(list)}
                      disabled={deleteMutation.isPending}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
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
            <DialogDescription>
              Crea una lista para agrupar suscriptores
            </DialogDescription>
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
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !listName.trim()}
              className="bg-[#44580E] hover:bg-[#3a4c0c]"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
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
            <DialogDescription>
              Modifica los datos de la lista
            </DialogDescription>
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
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !listName.trim()}
              className="bg-[#44580E] hover:bg-[#3a4c0c]"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Edit className="w-4 h-4 mr-2" />
              )}
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
            <DialogDescription>
              {selectedList?.description || "Sin descripción"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium">Suscriptores ({listSubscribers?.length || 0})</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowViewModal(false);
                  navigate("/cms/suscriptores");
                }}
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
            <Button variant="outline" onClick={() => setShowViewModal(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
