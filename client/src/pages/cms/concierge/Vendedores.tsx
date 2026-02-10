/**
 * Comisiones Concierge - Módulo Concierge (Admin)
 * Gestión de comisiones y métricas de ventas
 * Los vendedores se gestionan desde el módulo de Usuarios
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Edit,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Loader2,
  Building2,
  Percent,
  BarChart3,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";

interface ConciergeSeller {
  id: number;
  userId: number;
  commissionRate: number;
  sellerCode: string;
  companyName: string | null;
  notes: string | null;
  active: number;
  createdAt: Date;
  userName: string | null;
  userEmail: string | null;
}

interface CommissionSummary {
  sellerId: number;
  sellerName: string | null;
  sellerCode: string | null;
  companyName: string | null;
  commissionRate: number | null;
  totalSales: number;
  totalCommission: number;
  transactionCount: number;
}

type PeriodType = "today" | "week" | "month";

export default function Vendedores() {
  const [activeTab, setActiveTab] = useState("commissions");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<ConciergeSeller | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<ConciergeSeller | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [formData, setFormData] = useState({
    userId: 0,
    commissionRate: 10,
    companyName: "",
    notes: "",
    active: 1,
  });

  // Calcular fechas según el período
  const getDateRange = () => {
    const now = new Date();
    switch (periodType) {
      case "today":
        return {
          startDate: format(now, "yyyy-MM-dd"),
          endDate: format(now, "yyyy-MM-dd"),
        };
      case "week":
        return {
          startDate: format(startOfWeek(now, { locale: es }), "yyyy-MM-dd"),
          endDate: format(endOfWeek(now, { locale: es }), "yyyy-MM-dd"),
        };
      case "month":
      default:
        return {
          startDate: format(startOfMonth(now), "yyyy-MM-dd"),
          endDate: format(endOfMonth(now), "yyyy-MM-dd"),
        };
    }
  };

  const dateRange = getDateRange();

  // Obtener vendedores (para el selector de métricas y edición)
  const { data: sellers, refetch: refetchSellers } = trpc.concierge.sellers.getAll.useQuery({ activeOnly: false });

  // Obtener resumen de comisiones
  const { data: commissionsSummary, isLoading: loadingCommissions } = trpc.concierge.commissions.getSummary.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // Obtener métricas de un vendedor específico
  const { data: sellerMetrics, isLoading: loadingMetrics } = trpc.concierge.sellers.getRealtimeMetrics.useQuery(
    {
      sellerId: selectedSeller?.id || 0,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    { enabled: !!selectedSeller }
  );

  // Mutación para actualizar vendedor
  const upsertMutation = trpc.concierge.sellers.upsert.useMutation({
    onSuccess: () => {
      refetchSellers();
      setIsDialogOpen(false);
      resetForm();
      toast.success("Vendedor actualizado");
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al guardar el vendedor");
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
      userId: 0,
      commissionRate: 10,
      companyName: "",
      notes: "",
      active: 1,
    });
    setEditingSeller(null);
  };

  // Abrir diálogo para editar vendedor desde la tabla de comisiones
  const handleEditSeller = (sellerId: number) => {
    const seller = sellers?.find((s: ConciergeSeller) => s.id === sellerId);
    if (seller) {
      setEditingSeller(seller);
      setFormData({
        userId: seller.userId,
        commissionRate: seller.commissionRate,
        companyName: seller.companyName || "",
        notes: seller.notes || "",
        active: seller.active,
      });
      setIsDialogOpen(true);
    }
  };

  // Guardar vendedor
  const handleSave = () => {
    upsertMutation.mutate({
      ...formData,
      id: editingSeller?.id,
    });
  };

  // Calcular totales
  const totals = commissionsSummary?.reduce(
    (acc: { sales: number; commission: number; transactions: number }, item: CommissionSummary) => ({
      sales: acc.sales + (item.totalSales || 0),
      commission: acc.commission + (item.totalCommission || 0),
      transactions: acc.transactions + (item.transactionCount || 0),
    }),
    { sales: 0, commission: 0, transactions: 0 }
  ) || { sales: 0, commission: 0, transactions: 0 };

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Comisiones Concierge</h1>
        <p className="text-gray-500">
          Gestiona comisiones y métricas de ventas del canal Concierge
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="commissions" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Comisiones
          </TabsTrigger>
          <TabsTrigger value="metrics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Métricas
          </TabsTrigger>
        </TabsList>

        {/* Tab: Comisiones */}
        <TabsContent value="commissions" className="space-y-4">
          {/* Selector de período */}
          <div className="flex items-center gap-4">
            <Label>Período:</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <ShoppingCart className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Ventas</p>
                    <p className="text-2xl font-bold">{formatPrice(totals.sales)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Comisiones</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatPrice(totals.commission)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Transacciones</p>
                    <p className="text-2xl font-bold">{totals.transactions}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabla de comisiones por vendedor */}
          <Card>
            <CardHeader>
              <CardTitle>Comisiones por Vendedor</CardTitle>
              <CardDescription>
                Resumen del período: {dateRange.startDate} al {dateRange.endDate}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingCommissions ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : commissionsSummary?.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No hay ventas en este período
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Transacciones</TableHead>
                      <TableHead className="text-right">Comisión (%)</TableHead>
                      <TableHead className="text-right">A Pagar</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissionsSummary?.map((item: CommissionSummary) => (
                      <TableRow key={item.sellerId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.sellerName || "Sin nombre"}</p>
                            <code className="text-xs text-gray-500">{item.sellerCode}</code>
                          </div>
                        </TableCell>
                        <TableCell>{item.companyName || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPrice(item.totalSales)}
                        </TableCell>
                        <TableCell className="text-right">{item.transactionCount}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{item.commissionRate}%</Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">
                          {formatPrice(item.totalCommission)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Ver métricas"
                              onClick={() => {
                                const seller = sellers?.find((s: ConciergeSeller) => s.id === item.sellerId);
                                if (seller) {
                                  setSelectedSeller(seller);
                                  setActiveTab("metrics");
                                }
                              }}
                            >
                              <BarChart3 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar comisión"
                              onClick={() => handleEditSeller(item.sellerId)}
                            >
                              <Edit className="w-4 h-4" />
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
        </TabsContent>

        {/* Tab: Métricas */}
        <TabsContent value="metrics" className="space-y-4">
          {/* Selector de vendedor */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Label>Vendedor:</Label>
                <Select
                  value={selectedSeller?.id?.toString() || ""}
                  onValueChange={(v) => {
                    const seller = sellers?.find((s: ConciergeSeller) => s.id.toString() === v);
                    setSelectedSeller(seller || null);
                  }}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Selecciona un vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sellers?.map((seller: ConciergeSeller) => (
                      <SelectItem key={seller.id} value={seller.id.toString()}>
                        {seller.userName || seller.userEmail} ({seller.sellerCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label>Período:</Label>
                <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoy</SelectItem>
                    <SelectItem value="week">Esta semana</SelectItem>
                    <SelectItem value="month">Este mes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {selectedSeller ? (
            <>
              {/* Info del vendedor */}
              <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm opacity-90">Vendedor</p>
                      <p className="text-xl font-bold">{selectedSeller.userName}</p>
                      <p className="text-sm opacity-75">{selectedSeller.companyName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm opacity-90">Código</p>
                      <code className="text-lg font-mono">{selectedSeller.sellerCode}</code>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Métricas del vendedor */}
              {loadingMetrics ? (
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : sellerMetrics ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 rounded-lg">
                          <ShoppingCart className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Ventas</p>
                          <p className="text-2xl font-bold">
                            {formatPrice(sellerMetrics.totalSales)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-100 rounded-lg">
                          <DollarSign className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Comisión Generada</p>
                          <p className="text-2xl font-bold text-green-600">
                            {formatPrice(sellerMetrics.totalCommission)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-100 rounded-lg">
                          <TrendingUp className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Transacciones</p>
                          <p className="text-2xl font-bold">
                            {sellerMetrics.transactionCount}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </>
          ) : (
            <Card className="p-12 text-center">
              <BarChart3 className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Selecciona un vendedor</h3>
              <p className="text-gray-500">
                Elige un vendedor para ver sus métricas detalladas
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Diálogo de editar vendedor (comisión, empresa, notas) */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Vendedor</DialogTitle>
            <DialogDescription>
              Modifica la comisión y configuración del vendedor
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Info del vendedor (solo lectura) */}
            {editingSeller && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium">{editingSeller.userName || editingSeller.userEmail}</p>
                <p className="text-sm text-gray-500">Código: {editingSeller.sellerCode}</p>
              </div>
            )}

            {/* Comisión */}
            <div className="space-y-2">
              <Label htmlFor="commission">Porcentaje de Comisión *</Label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="commission"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.commissionRate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      commissionRate: parseInt(e.target.value) || 0,
                    })
                  }
                  className="pl-10"
                />
              </div>
            </div>

            {/* Empresa */}
            <div className="space-y-2">
              <Label htmlFor="company">Empresa / Hotel</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="company"
                  placeholder="Nombre de la empresa"
                  value={formData.companyName}
                  onChange={(e) =>
                    setFormData({ ...formData, companyName: e.target.value })
                  }
                  className="pl-10"
                />
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notas internas</Label>
              <Textarea
                id="notes"
                placeholder="Información adicional sobre el vendedor..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            {/* Estado activo */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Estado</Label>
                <p className="text-sm text-gray-500">
                  Los vendedores inactivos no pueden realizar ventas
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
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
