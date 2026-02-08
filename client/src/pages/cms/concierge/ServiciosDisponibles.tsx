/**
 * Servicios Disponibles - Módulo Concierge (Admin)
 * Gestión de servicios que pueden vender los vendedores
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus,
  Edit,
  Trash2,
  Package,
  DollarSign,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface ConciergeService {
  id: number;
  serviceId: number;
  price: number;
  availableQuantity: number;
  active: number;
  sellerNotes: string | null;
  serviceName: string | null;
  serviceDescription: string | null;
  serviceDuration: number | null;
  serviceImageUrl: string | null;
  serviceCategory: string | null;
  createdAt: Date;
}

interface BaseService {
  id: number;
  name: string;
  description: string | null;
  price: number | null;
  duration: number | null;
  category: string | null;
}

export default function ServiciosDisponibles() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ConciergeService | null>(null);
  const [formData, setFormData] = useState({
    serviceId: 0,
    price: 0,
    availableQuantity: -1,
    active: 1,
    sellerNotes: "",
  });

  // Obtener servicios Concierge
  const { data: conciergeServices, isLoading, refetch } = trpc.concierge.services.getAll.useQuery({ activeOnly: false });

  // Obtener servicios base de Skedu para el selector
  const { data: baseServices } = trpc.services.getAll.useQuery();

  // Mutación para crear/actualizar servicio
  const upsertMutation = trpc.concierge.services.upsert.useMutation({
    onSuccess: () => {
      refetch();
      setIsDialogOpen(false);
      resetForm();
      toast.success(editingService ? "Servicio actualizado" : "Servicio agregado");
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al guardar el servicio");
    },
  });

  // Mutación para eliminar servicio
  const deleteMutation = trpc.concierge.services.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Servicio eliminado");
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el servicio");
    },
  });

  // Formatear precio
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(price);
  };

  // Reset formulario
  const resetForm = () => {
    setFormData({
      serviceId: 0,
      price: 0,
      availableQuantity: -1,
      active: 1,
      sellerNotes: "",
    });
    setEditingService(null);
  };

  // Abrir diálogo para nuevo servicio
  const handleNew = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  // Abrir diálogo para editar
  const handleEdit = (service: ConciergeService) => {
    setEditingService(service);
    setFormData({
      serviceId: service.serviceId,
      price: service.price,
      availableQuantity: service.availableQuantity,
      active: service.active,
      sellerNotes: service.sellerNotes || "",
    });
    setIsDialogOpen(true);
  };

  // Guardar servicio
  const handleSave = () => {
    if (!formData.serviceId) {
      toast.error("Selecciona un servicio");
      return;
    }
    if (formData.price <= 0) {
      toast.error("El precio debe ser mayor a 0");
      return;
    }

    upsertMutation.mutate({
      ...formData,
      id: editingService?.id,
    });
  };

  // Eliminar servicio
  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro de eliminar este servicio?")) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Servicios Disponibles</h1>
          <p className="text-gray-500">
            Gestiona los servicios que pueden vender los vendedores Concierge
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="w-4 h-4 mr-2" />
          Agregar Servicio
        </Button>
      </div>

      {/* Tabla de servicios */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : conciergeServices?.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay servicios configurados</h3>
              <p className="text-gray-500 mb-4">
                Agrega servicios para que los vendedores puedan ofrecerlos
              </p>
              <Button onClick={handleNew}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar Primer Servicio
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Precio Concierge</TableHead>
                  <TableHead>Disponibilidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conciergeServices?.map((service: ConciergeService) => (
                  <TableRow key={service.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {service.serviceImageUrl ? (
                          <img
                            src={service.serviceImageUrl}
                            alt={service.serviceName || ""}
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                            <Package className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{service.serviceName}</p>
                          {service.serviceCategory && (
                            <p className="text-sm text-gray-500">{service.serviceCategory}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-blue-600">
                        {formatPrice(service.price)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {service.availableQuantity === -1 ? (
                        <Badge variant="outline">Ilimitado</Badge>
                      ) : (
                        <Badge variant={service.availableQuantity > 0 ? "default" : "destructive"}>
                          {service.availableQuantity} disponibles
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={service.active ? "default" : "secondary"}>
                        {service.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(service)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(service.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de crear/editar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingService ? "Editar Servicio" : "Agregar Servicio"}
            </DialogTitle>
            <DialogDescription>
              {editingService
                ? "Modifica la configuración del servicio para el canal Concierge"
                : "Selecciona un servicio de Skedu y configura su precio para vendedores"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Selector de servicio base */}
            <div className="space-y-2">
              <Label>Servicio de Skedu *</Label>
              <Select
                value={formData.serviceId?.toString() || ""}
                onValueChange={(value) =>
                  setFormData({ ...formData, serviceId: parseInt(value) })
                }
                disabled={!!editingService}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un servicio" />
                </SelectTrigger>
                <SelectContent>
                  {baseServices?.map((service: BaseService) => (
                    <SelectItem key={service.id} value={service.id.toString()}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Precio */}
            <div className="space-y-2">
              <Label htmlFor="price">Precio Concierge (CLP) *</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="price"
                  type="number"
                  min="0"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: parseInt(e.target.value) || 0 })
                  }
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-gray-500">
                Este es el precio que verán los vendedores y clientes
              </p>
            </div>

            {/* Cantidad disponible */}
            <div className="space-y-2">
              <Label htmlFor="quantity">Cantidad Disponible</Label>
              <Input
                id="quantity"
                type="number"
                min="-1"
                value={formData.availableQuantity}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    availableQuantity: parseInt(e.target.value) || -1,
                  })
                }
              />
              <p className="text-xs text-gray-500">
                Usa -1 para cantidad ilimitada
              </p>
            </div>

            {/* Notas para vendedores */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notas para Vendedores</Label>
              <Textarea
                id="notes"
                placeholder="Información adicional para los vendedores..."
                value={formData.sellerNotes}
                onChange={(e) =>
                  setFormData({ ...formData, sellerNotes: e.target.value })
                }
              />
            </div>

            {/* Estado activo */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Estado</Label>
                <p className="text-sm text-gray-500">
                  Los servicios inactivos no aparecen para los vendedores
                </p>
              </div>
              <Switch
                checked={formData.active === 1}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, active: checked ? 1 : 0 })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingService ? "Guardar Cambios" : "Agregar Servicio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
