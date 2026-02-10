/**
 * Servicios Disponibles - Módulo Concierge (Admin)
 * Info de servicios viene de Skedu, precios diferenciados se configuran en CMS.
 * Diseño sin imágenes: usa iconos y colores por categoría para identificación rápida.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { toast } from "sonner";
import {
  Plus,
  Edit,
  Trash2,
  Package,
  DollarSign,
  Loader2,
  X,
  Clock,
} from "lucide-react";
import { getCategoryInfo, getCategoryName } from "@/lib/serviceCategories";

interface PriceEntry {
  label: string;
  price: number;
  sortOrder: number;
  active: number;
}

interface ServicePrice {
  id: number;
  serviceId: number;
  label: string;
  price: number;
  sortOrder: number;
  active: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ConciergeService {
  id: number;
  serviceId: number;
  dailyQuota: number;
  active: number;
  sellerNotes: string | null;
  serviceName: string | null;
  serviceDescription: string | null;
  serviceDuration: number | null;
  serviceImageUrl: string | null;
  serviceCategory: string | null;
  createdAt: Date;
  prices: ServicePrice[];
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
  const [editingService, setEditingService] = useState<ConciergeService | null>(
    null
  );
  const [formData, setFormData] = useState({
    serviceId: 0,
    dailyQuota: -1,
    active: 1,
    sellerNotes: "",
  });
  const [prices, setPrices] = useState<PriceEntry[]>([
    { label: "Adulto", price: 0, sortOrder: 0, active: 1 },
  ]);

  // Obtener servicios Concierge con precios
  const {
    data: conciergeServices,
    isLoading,
    refetch,
  } = trpc.concierge.services.getAll.useQuery({ activeOnly: false });

  // Obtener servicios base de Skedu para el selector
  const { data: baseServices } = trpc.services.getAll.useQuery();

  // Mutación para crear/actualizar servicio con precios
  const upsertMutation = trpc.concierge.services.upsert.useMutation({
    onSuccess: () => {
      refetch();
      setIsDialogOpen(false);
      resetForm();
      toast.success(
        editingService ? "Servicio actualizado" : "Servicio agregado"
      );
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al guardar el servicio");
    },
  });

  // Mutación para eliminar servicio
  const deleteMutation = trpc.concierge.services.delete.useMutation({
    onSuccess: (data) => {
      refetch();
      if (data.deactivated) {
        toast.info("Este servicio tiene ventas asociadas. Se desactivó en vez de eliminarse para conservar el historial.");
      } else {
        toast.success("Servicio eliminado");
      }
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
      dailyQuota: -1,
      active: 1,
      sellerNotes: "",
    });
    setPrices([{ label: "Adulto", price: 0, sortOrder: 0, active: 1 }]);
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
      dailyQuota: service.dailyQuota,
      active: service.active,
      sellerNotes: service.sellerNotes || "",
    });
    // Load existing prices
    if (service.prices && service.prices.length > 0) {
      setPrices(
        service.prices.map((p) => ({
          label: p.label,
          price: p.price,
          sortOrder: p.sortOrder,
          active: p.active,
        }))
      );
    } else {
      setPrices([{ label: "Adulto", price: 0, sortOrder: 0, active: 1 }]);
    }
    setIsDialogOpen(true);
  };

  // Guardar servicio
  const handleSave = () => {
    if (!formData.serviceId) {
      toast.error("Selecciona un servicio");
      return;
    }
    const validPrices = prices.filter((p) => p.label.trim() && p.price > 0);
    if (validPrices.length === 0) {
      toast.error("Agrega al menos un precio válido");
      return;
    }

    upsertMutation.mutate({
      ...formData,
      id: editingService?.id,
      prices: validPrices.map((p, i) => ({ ...p, sortOrder: i })),
    });
  };

  // Eliminar servicio
  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro? Si el servicio tiene ventas asociadas, se desactivará en vez de eliminarse.")) {
      deleteMutation.mutate({ id });
    }
  };

  // Agregar nueva fila de precio
  const addPriceRow = () => {
    setPrices([
      ...prices,
      { label: "", price: 0, sortOrder: prices.length, active: 1 },
    ]);
  };

  // Actualizar una fila de precio
  const updatePrice = (
    index: number,
    field: keyof PriceEntry,
    value: string | number
  ) => {
    const updated = [...prices];
    (updated[index] as any)[field] = value;
    setPrices(updated);
  };

  // Eliminar una fila de precio
  const removePrice = (index: number) => {
    if (prices.length <= 1) {
      toast.error("Debe haber al menos un precio");
      return;
    }
    setPrices(prices.filter((_, i) => i !== index));
  };

  // Get price range string for a service
  const getPriceRange = (service: ConciergeService) => {
    const activePrices = service.prices.filter((p) => p.active);
    if (activePrices.length === 0) return "Sin precio";
    if (activePrices.length === 1)
      return formatPrice(activePrices[0].price);
    const min = Math.min(...activePrices.map((p) => p.price));
    const max = Math.max(...activePrices.map((p) => p.price));
    if (min === max) return formatPrice(min);
    return `${formatPrice(min)} - ${formatPrice(max)}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Servicios Disponibles</h1>
            <p className="text-gray-500">
              Servicios con precios diferenciados para el canal Concierge
            </p>
          </div>
          <Button onClick={handleNew}>
            <Plus className="w-4 h-4 mr-2" />
            Agregar Servicio
          </Button>
        </div>

        {/* Grid de servicios como tarjetas */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : conciergeServices?.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No hay servicios configurados
              </h3>
              <p className="text-gray-500 mb-4">
                Agrega servicios y configura precios diferenciados
              </p>
              <Button onClick={handleNew}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar Primer Servicio
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {conciergeServices?.map((service) => {
              const cat = getCategoryInfo(service.serviceCategory);
              const IconComponent = cat.icon;
              return (
                <Card
                  key={service.id}
                  className={`relative overflow-hidden border-2 ${cat.borderColor} ${!service.active ? "opacity-60" : ""}`}
                >
                  {/* Category color bar at top */}
                  <div className={`h-1.5 ${cat.bgColor.replace("100", "400")}`} />

                  <CardContent className="p-4">
                    {/* Top row: Icon + Name + Status */}
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className={`w-12 h-12 rounded-xl ${cat.bgColor} flex items-center justify-center shrink-0`}
                      >
                        <IconComponent className={`w-6 h-6 ${cat.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base leading-tight mb-0.5">
                          {service.serviceName || "Servicio"}
                        </h3>
                        <span className={`text-xs font-medium ${cat.accentColor}`}>
                          {cat.name}
                        </span>
                      </div>
                      <Badge
                        variant={service.active ? "default" : "secondary"}
                        className="shrink-0 text-xs"
                      >
                        {service.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>

                    {/* Prices */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      {service.prices && service.prices.length > 0 ? (
                        <div className="space-y-1.5">
                          {service.prices
                            .filter((p) => p.active)
                            .map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between"
                              >
                                <span className="text-sm text-gray-600">
                                  {p.label}
                                </span>
                                <span className={`text-sm font-bold ${cat.accentColor}`}>
                                  {formatPrice(p.price)}
                                </span>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">
                          Sin precios configurados
                        </span>
                      )}
                    </div>

                    {/* Bottom row: Availability + Duration + Actions */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {service.dailyQuota === -1
                            ? "Ilimitado"
                            : `${service.dailyQuota} cupos/día`}
                        </Badge>
                        {service.serviceDuration && service.serviceDuration > 0 && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {service.serviceDuration}min
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(service)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => handleDelete(service.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Seller notes if any */}
                    {service.sellerNotes && (
                      <p className="text-xs text-gray-500 mt-2 italic border-t pt-2">
                        {service.sellerNotes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Diálogo de crear/editar */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingService ? "Editar Servicio" : "Agregar Servicio"}
              </DialogTitle>
              <DialogDescription>
                {editingService
                  ? "Modifica la configuración y precios del servicio"
                  : "Selecciona un servicio y configura precios diferenciados"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              {/* Selector de servicio base */}
              <div className="space-y-2">
                <Label>Servicio *</Label>
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
                      <SelectItem
                        key={service.id}
                        value={service.id.toString()}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {getCategoryName(service.category)}
                          </span>
                          <span className="font-medium">{service.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Precios diferenciados */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    Precios Diferenciados *
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addPriceRow}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Agregar Precio
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Ej: Adulto $25.000, Niño $15.000, Tercera Edad $20.000
                </p>

                <div className="space-y-2">
                  {prices.map((entry, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-3 border rounded-lg bg-gray-50/50"
                    >
                      <div className="flex-1">
                        <Input
                          placeholder="Etiqueta (ej: Adulto)"
                          value={entry.label}
                          onChange={(e) =>
                            updatePrice(index, "label", e.target.value)
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="w-36 relative">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <Input
                          type="number"
                          min="0"
                          placeholder="Precio CLP"
                          value={entry.price || ""}
                          onChange={(e) =>
                            updatePrice(
                              index,
                              "price",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="pl-7 h-9"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-gray-400 hover:text-red-500"
                        onClick={() => removePrice(index)}
                        disabled={prices.length <= 1}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cupos diarios */}
              <div className="space-y-2">
                <Label htmlFor="dailyQuota">Cupos Diarios</Label>
                <Input
                  id="dailyQuota"
                  type="number"
                  min="-1"
                  value={formData.dailyQuota}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      dailyQuota: parseInt(e.target.value) || -1,
                    })
                  }
                />
                <p className="text-xs text-gray-500">
                  Cantidad máxima de personas que se pueden atender por día. Usa -1 para ilimitado.
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
