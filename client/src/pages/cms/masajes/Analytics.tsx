import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { BarChart3, TrendingUp, CalendarCheck, XCircle, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export default function MasajesAnalytics() {
  const [from, setFrom] = useState(fmt(startOfMonth(new Date())));
  const [to, setTo] = useState(fmt(endOfMonth(new Date())));
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.masajes.analytics.summary.useQuery({ from, to });
  const { data: history, isLoading: loadingHistory } = trpc.masajes.analytics.history.useQuery({ from, to, page, pageSize: 25 });
  const exportQuery = trpc.masajes.analytics.exportHistory.useQuery({ from, to }, { enabled: false });

  const setPreset = (months: number) => {
    const ref = months === 0 ? new Date() : subMonths(new Date(), months - 1);
    setFrom(fmt(startOfMonth(ref)));
    setTo(fmt(endOfMonth(new Date())));
    setPage(1);
  };

  const totalRevenue = Number(data?.totals?.totalRevenue ?? 0);
  const totalBookings = Number(data?.totals?.totalBookings ?? 0);
  const paidBookings = Number(data?.totals?.paidBookings ?? 0);
  const completed = Number(data?.totals?.completedBookings ?? 0);
  const cancelled = Number(data?.totals?.cancelledBookings ?? 0);
  const avgTicket = paidBookings > 0 ? totalRevenue / paidBookings : 0;

  const downloadExcel = async () => {
    try {
      const result = await exportQuery.refetch();
      const records = result.data ?? [];
      if (records.length === 0) return toast.error("No hay ventas en el período seleccionado");
      const XLSX = await import("xlsx");
      const rows = records.map((sale) => ({
        "ID venta": sale.id,
        "ID reserva": sale.bookingId,
        "Fecha de compra": new Date(sale.soldAt).toLocaleString("es-CL", { timeZone: "America/Santiago" }),
        "Fecha del masaje": sale.serviceDate,
        "Hora": sale.startTime,
        "Cliente": sale.clientName,
        "Email": sale.clientEmail ?? "",
        "Técnica": sale.techniqueName,
        "Duración (min)": sale.duration,
        "Terapeuta": sale.therapistName ?? "Sin asignar",
        "Monto": Number(sale.amount),
        "Medio de pago": sale.paymentMethod === "getnet" ? "Getnet" : "CMS manual",
        "Referencia": sale.paymentReference ?? "",
        "Estado venta": sale.saleStatus === "refunded" ? "Reembolsada" : "Pagada",
        "Estado reserva": sale.bookingStatus ?? "",
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [10, 11, 22, 18, 9, 24, 28, 26, 15, 22, 14, 16, 22, 16, 16].map(wch => ({ wch }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Ventas masajes");
      XLSX.writeFile(workbook, `ventas-masajes-${from}-${to}.xlsx`);
      toast.success(`${records.length} ventas exportadas a Excel`);
    } catch (error) {
      console.error(error);
      toast.error("No se pudo generar el archivo Excel");
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Ventas & Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Resumen de ingresos y reservas por período</p>
        </div>

        {/* Filtros de fecha */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label>Desde</Label>
                <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="w-40" />
              </div>
              <div>
                <Label>Hasta</Label>
                <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="w-40" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setPreset(0)}>Este mes</Button>
                <Button variant="outline" size="sm" onClick={() => setPreset(3)}>Últimos 3 meses</Button>
                <Button variant="outline" size="sm" onClick={() => setPreset(6)}>Últimos 6 meses</Button>
              </div>
              <Button onClick={downloadExcel} disabled={exportQuery.isFetching || !history?.total}>
                <Download className="w-4 h-4 mr-2" />
                {exportQuery.isFetching ? "Generando..." : "Descargar Excel"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : !data ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Sin datos para el período seleccionado.</CardContent></Card>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />Ingresos totales
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-1">
                  <p className="text-2xl font-bold">$ {totalRevenue.toLocaleString("es-CL")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <CalendarCheck className="w-3.5 h-3.5" />Reservas totales
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-1">
                  <p className="text-2xl font-bold">{totalBookings}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{completed} completadas · {cancelled} canceladas</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <BarChart3 className="w-3.5 h-3.5" />Ticket promedio
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-1">
                  <p className="text-2xl font-bold">$ {avgTicket.toLocaleString("es-CL", { maximumFractionDigits: 0 })}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />Tasa cancelación
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-1">
                  <p className="text-2xl font-bold">
                    {totalBookings > 0 ? ((cancelled / totalBookings) * 100).toFixed(1) : "0"}%
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Por técnica */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Por técnica</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.byTechnique.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
                  ) : (
                    <div className="space-y-3">
                      {data.byTechnique.map((row, i) => {
                        const maxCount = Math.max(...data.byTechnique.map(r => Number(r.count)));
                        const pct = maxCount > 0 ? (Number(row.count) / maxCount) * 100 : 0;
                        return (
                          <div key={i}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium">{row.techniqueName ?? "Sin técnica"}</span>
                              <span className="text-muted-foreground">{row.count} · $ {Number(row.revenue ?? 0).toLocaleString("es-CL")}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Por duración */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Por duración</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.byDuration.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
                  ) : (
                    <div className="space-y-3">
                      {data.byDuration.map((row, i) => {
                        const maxCount = Math.max(...data.byDuration.map(r => Number(r.count)));
                        const pct = maxCount > 0 ? (Number(row.count) / maxCount) * 100 : 0;
                        return (
                          <div key={i}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium">{row.duration} min</span>
                              <span className="text-muted-foreground">{row.count} · $ {Number(row.revenue ?? 0).toLocaleString("es-CL")}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Por terapeuta */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Por terapeuta</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.byTherapist.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
                  ) : (
                    <div className="space-y-3">
                      {data.byTherapist.map((row, i) => {
                        const maxCount = Math.max(...data.byTherapist.map(r => Number(r.count)));
                        const pct = maxCount > 0 ? (Number(row.count) / maxCount) * 100 : 0;
                        return (
                          <div key={i}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium">{row.therapistName ?? "Sin asignar"}</span>
                              <span className="text-muted-foreground">{row.count} · $ {Number(row.revenue ?? 0).toLocaleString("es-CL")}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
                  <span>Historial de ventas</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {history?.total ?? 0} venta{history?.total === 1 ? "" : "s"} en el período
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingHistory ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : !history || history.records.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin ventas para las fechas seleccionadas.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-3 pr-4 font-medium">Fecha masaje</th>
                            <th className="py-3 pr-4 font-medium">Cliente</th>
                            <th className="py-3 pr-4 font-medium">Técnica</th>
                            <th className="py-3 pr-4 font-medium">Terapeuta</th>
                            <th className="py-3 pr-4 font-medium">Pago</th>
                            <th className="py-3 text-right font-medium">Ingreso</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.records.map((sale) => (
                            <tr key={sale.id} className="border-b last:border-0 align-top">
                              <td className="py-3 pr-4 whitespace-nowrap">
                                <p className="font-medium">{sale.serviceDate}</p>
                                <p className="text-xs text-muted-foreground">{sale.startTime} hrs</p>
                              </td>
                              <td className="py-3 pr-4 min-w-[170px]">
                                <p className="font-medium">{sale.clientName}</p>
                                {sale.clientEmail && <p className="text-xs text-muted-foreground">{sale.clientEmail}</p>}
                              </td>
                              <td className="py-3 pr-4 min-w-[170px]">
                                <p>{sale.techniqueName}</p>
                                <p className="text-xs text-muted-foreground">{sale.duration} min · Reserva #{sale.bookingId}</p>
                              </td>
                              <td className="py-3 pr-4 whitespace-nowrap">{sale.therapistName ?? "Sin asignar"}</td>
                              <td className="py-3 pr-4 whitespace-nowrap">
                                <Badge variant={sale.saleStatus === "paid" ? "outline" : "destructive"}>
                                  {sale.saleStatus === "paid" ? "Pagada" : "Reembolsada"}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1">{sale.paymentMethod === "getnet" ? "Getnet" : "CMS manual"}</p>
                              </td>
                              <td className={`py-3 text-right font-semibold whitespace-nowrap ${sale.saleStatus === "refunded" ? "text-red-600 line-through" : "text-green-700"}`}>
                                $ {Number(sale.amount).toLocaleString("es-CL")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t">
                      <p className="text-xs text-muted-foreground">
                        Mostrando {(history.page - 1) * 25 + 1}–{Math.min(history.page * 25, history.total)} de {history.total}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={history.page <= 1} onClick={() => setPage(current => current - 1)}>
                          <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                        </Button>
                        <span className="text-sm">Página {history.page} de {history.totalPages}</span>
                        <Button variant="outline" size="sm" disabled={history.page >= history.totalPages} onClick={() => setPage(current => current + 1)}>
                          Siguiente <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
