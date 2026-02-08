/**
 * Mis Comisiones - Módulo Concierge (Vendedor)
 * Vista personal del vendedor con sus ventas y comisiones acumuladas
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Label } from "@/components/ui/label";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  Percent,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";

type PeriodType = "today" | "week" | "month" | "all";

export default function MisComisiones() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");

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
      case "all":
        return {
          startDate: "2020-01-01",
          endDate: format(now, "yyyy-MM-dd"),
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

  // Obtener información del vendedor
  const { data: sellerInfo, isLoading: loadingInfo } = trpc.concierge.sales.getMySellerInfo.useQuery();

  // Obtener mis ventas (incluye comisiones)
  const { data: myCommissions, isLoading: loadingCommissions } = trpc.concierge.sales.getMySales.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // Formatear precio
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(price);
  };

  // Calcular totales
  const totals = useMemo(() => {
    if (!myCommissions || myCommissions.length === 0) {
      return { totalSales: 0, totalCommission: 0, completedCount: 0, pendingCount: 0 };
    }
    const initial = { totalSales: 0, totalCommission: 0, completedCount: 0, pendingCount: 0 };
    return myCommissions.reduce(
      (acc: typeof initial, sale: any) => ({
        totalSales: acc.totalSales + (sale.status === "completed" ? (sale.totalAmount || 0) : 0),
        totalCommission: acc.totalCommission + (sale.status === "completed" ? (sale.commissionAmount || 0) : 0),
        completedCount: acc.completedCount + (sale.status === "completed" ? 1 : 0),
        pendingCount: acc.pendingCount + (sale.status === "pending" ? 1 : 0),
      }),
      initial
    );
  }, [myCommissions]);

  // Badge de estado
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completada
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            <Clock className="w-3 h-3 mr-1" />
            Pendiente
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
            <XCircle className="w-3 h-3 mr-1" />
            Fallida
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Período legible
  const getPeriodLabel = () => {
    switch (periodType) {
      case "today": return "Hoy";
      case "week": return "Esta semana";
      case "month": return "Este mes";
      case "all": return "Todo el historial";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header con info del vendedor */}
        {loadingInfo ? (
          <Skeleton className="h-24 w-full" />
        ) : sellerInfo ? (
          <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Mi Perfil de Vendedor</p>
                  <p className="text-xl font-bold">{sellerInfo.companyName || "Mi Tienda"}</p>
                  <code className="text-sm opacity-75">{sellerInfo.sellerCode}</code>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Percent className="w-4 h-4 opacity-75" />
                    <span className="text-3xl font-bold">{sellerInfo.commissionRate}</span>
                  </div>
                  <p className="text-sm opacity-75">Comisión</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-6 text-center">
              <p className="text-yellow-800">
                No tienes un perfil de vendedor configurado. Contacta al administrador.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Selector de período */}
        <div className="flex items-center gap-4">
          <Label>Período:</Label>
          <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="month">Este mes</SelectItem>
              <SelectItem value="all">Todo el historial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 rounded-lg">
                  <ShoppingCart className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Ventas Completadas</p>
                  <p className="text-xl font-bold">{totals.completedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-yellow-100 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Pendientes de Pago</p>
                  <p className="text-xl font-bold">{totals.pendingCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Vendido</p>
                  <p className="text-xl font-bold">{formatPrice(totals.totalSales)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-green-200 rounded-lg">
                  <DollarSign className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <p className="text-xs text-green-700">Mi Comisión</p>
                  <p className="text-xl font-bold text-green-700">
                    {formatPrice(totals.totalCommission)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabla de ventas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Mis Ventas - {getPeriodLabel()}
            </CardTitle>
            <CardDescription>
              Detalle de todas tus ventas y comisiones generadas
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loadingCommissions ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !myCommissions || myCommissions.length === 0 ? (
              <div className="p-12 text-center">
                <ShoppingCart className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin ventas en este período</h3>
                <p className="text-gray-500">
                  Las ventas que realices aparecerán aquí con el detalle de tu comisión
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Comisión</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myCommissions.map((sale: any) => (
                    <TableRow key={sale.id}>
                      <TableCell className="text-sm text-gray-600">
                        {sale.createdAt
                          ? format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm", { locale: es })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {sale.saleReference}
                        </code>
                      </TableCell>
                      <TableCell className="font-medium">
                        {sale.serviceName || "-"}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{sale.customerName}</p>
                          <p className="text-xs text-gray-500">{sale.customerEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrice(sale.totalAmount || 0)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-600">
                        {sale.status === "completed"
                          ? formatPrice(sale.commissionAmount || 0)
                          : "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(sale.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
