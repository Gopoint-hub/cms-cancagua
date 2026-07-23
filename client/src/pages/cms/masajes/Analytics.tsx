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
import {
  BarChart3,
  TrendingUp,
  CalendarCheck,
  XCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Globe2,
  MessageCircleHeart,
  UserPlus,
  WalletCards,
} from "lucide-react";
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
  const grossRevenue = Number(data?.totals?.grossRevenue ?? 0);
  const totalDiscounted = Number(data?.totals?.totalDiscounted ?? 0);
  const salesWithDiscount = Number(data?.totals?.salesWithDiscount ?? 0);
  const completed = Number(data?.totals?.completedBookings ?? 0);
  const cancelled = Number(data?.totals?.cancelledBookings ?? 0);
  const avgTicket = paidBookings > 0 ? totalRevenue / paidBookings : 0;
  const money = (value: number) => `$ ${value.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;
  const maxHourly = Math.max(1, ...(data?.period.hourly.map(row => row.reservations) ?? [1]));

  const downloadExcel = async () => {
    try {
      const result = await exportQuery.refetch();
      const records = result.data ?? [];
      if (records.length === 0) return toast.error("No hay ventas en el período seleccionado");
      const XLSX = await import("xlsx");
      const rows = records.map((sale) => ({
        "Origen": sale.source === "skedu_program" ? "Programa Skedu" : "Servicio de masaje",
        "ID venta": sale.id,
        "ID reserva": sale.bookingId,
        "Fecha de registro/compra": new Date(sale.soldAt).toLocaleString("es-CL", { timeZone: "America/Santiago" }),
        "Fecha del masaje": sale.serviceDate,
        "Hora": sale.startTime,
        "Cliente": sale.clientName,
        "Email": sale.clientEmail ?? "",
        "Técnica": sale.techniqueName,
        "Duración (min)": sale.duration,
        "Terapeuta": sale.therapistName ?? "Sin asignar",
        "Valor original": Number(sale.originalAmount),
        "Código de descuento": sale.discountCode ?? "No",
        "Tipo descuento": sale.discountType === "percentage" ? "Porcentaje" : sale.discountType === "fixed" ? "Monto fijo" : "",
        "Valor configurado": sale.discountValue ?? "",
        "Monto descontado": Number(sale.discountAmount),
        "Valor realmente pagado": Number(sale.amount),
        "Medio de pago": sale.paymentMethod === "getnet"
          ? "Getnet"
          : sale.paymentMethod === "skedu_program" ? "Programa Skedu" : "CMS manual",
        "Referencia": sale.paymentReference ?? "",
        "Estado venta": sale.saleStatus === "refunded"
          ? "Reembolsada"
          : sale.saleStatus === "cancelled" ? "Anulada" : "Pagada",
        "Estado reserva": sale.bookingStatus ?? "",
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [18, 10, 11, 22, 18, 9, 24, 28, 26, 15, 22, 16, 20, 18, 18, 18, 22, 16, 22, 16, 16, 16].map(wch => ({ wch }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Ventas masajes");
      XLSX.writeFile(workbook, `ventas-masajes-${from}-${to}.xlsx`);
      toast.success(`${records.length} masajes exportados a Excel`);
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
              <div className="w-full sm:w-auto">
                <Label>Desde</Label>
                <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="w-full sm:w-40" />
              </div>
              <div className="w-full sm:w-auto">
                <Label>Hasta</Label>
                <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="w-full sm:w-40" />
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setPreset(0)}>Este mes</Button>
                <Button variant="outline" size="sm" onClick={() => setPreset(3)}>Últimos 3 meses</Button>
                <Button variant="outline" size="sm" onClick={() => setPreset(6)}>Últimos 6 meses</Button>
              </div>
              <Button className="w-full sm:w-auto" onClick={downloadExcel} disabled={exportQuery.isFetching || !history?.total}>
                <Download className="w-4 h-4 mr-2" />
                {exportQuery.isFetching ? "Generando..." : "Descargar Excel"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : !data ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Sin datos para el período seleccionado.</CardContent></Card>
        ) : (
          <>
            <div>
              <h2 className="mb-3 text-lg font-semibold">Resumen de hoy</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CalendarDays className="h-4 w-4" /> Reservas para hoy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-1">
                    <p className="text-2xl font-bold">{data.daily.reservationsForToday}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {data.daily.massageServicesToday} masajes · {data.daily.skeduProgramsToday} programas Skedu
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CalendarCheck className="h-4 w-4" /> Reservas creadas hoy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-1">
                    <p className="text-2xl font-bold">{data.daily.reservationsCreatedToday}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Creadas durante el día calendario de Chile</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CircleDollarSign className="h-4 w-4" /> Pagos recibidos hoy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-1">
                    <p className="text-2xl font-bold">{money(data.daily.paymentsReceivedToday)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Pagos registrados hoy, sin importar fecha del masaje</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Globe2 className="h-4 w-4" /> Reservas vía web hoy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-1">
                    <p className="text-2xl font-bold">{data.daily.webMassageServicesToday}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Masaje solo vía web · Skedu: {data.daily.skeduProgramsToday}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Reporte del período</h2>
                <p className="text-xs text-muted-foreground">{from} al {to}</p>
              </div>
              <Badge variant={data.period.revenueChangePercent >= 0 ? "outline" : "destructive"} className="whitespace-nowrap">
                {data.period.revenueChangePercent >= 0 ? "+" : ""}
                {data.period.revenueChangePercent.toFixed(1)}% vs. período anterior
              </Badge>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Reservas confirmadas</CardTitle></CardHeader>
                <CardContent className="pt-1"><p className="text-xl font-bold text-emerald-700">{data.totals.confirmedBookings}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Reservas anuladas</CardTitle></CardHeader>
                <CardContent className="pt-1"><p className="text-xl font-bold text-red-600">{data.totals.cancelledBookings}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <UserPlus className="h-4 w-4" /> Clientes nuevos
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-1"><p className="text-xl font-bold">{data.totals.newCustomers}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Ingresos período anterior</CardTitle></CardHeader>
                <CardContent className="pt-1">
                  <p className="text-xl font-bold">{money(data.period.previousRevenue)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{data.period.previousFrom} al {data.period.previousTo}</p>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Ventas brutas</CardTitle></CardHeader><CardContent className="pt-1"><p className="text-xl font-bold">$ {grossRevenue.toLocaleString("es-CL")}</p></CardContent></Card>
              <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Descontado por códigos</CardTitle></CardHeader><CardContent className="pt-1"><p className="text-xl font-bold text-amber-700">$ {totalDiscounted.toLocaleString("es-CL")}</p></CardContent></Card>
              <Card><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Ventas con código</CardTitle></CardHeader><CardContent className="pt-1"><p className="text-xl font-bold">{salesWithDiscount}</p></CardContent></Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <WalletCards className="h-4 w-4" /> Pagos online versus otros pagos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {[
                    { label: "Pagos online (Getnet)", value: data.period.onlineRevenue, color: "bg-indigo-500" },
                    { label: "Otros pagos (CMS manual + Skedu)", value: data.period.otherRevenue, color: "bg-emerald-500" },
                  ].map((payment) => {
                    const percentage = totalRevenue > 0 ? (payment.value / totalRevenue) * 100 : 0;
                    return (
                      <div key={payment.label}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                          <span>{payment.label}</span>
                          <span className="font-semibold">{money(payment.value)} · {percentage.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full ${payment.color}`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">
                    Skedu: $35.000 por masaje de 30 min y $45.000 por masaje de 50 min.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe2 className="h-4 w-4" /> Origen de reservas
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Servicios de masaje</p>
                    <p className="mt-1 text-2xl font-bold">{data.period.massageServices}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Masajes vía web</p>
                    <p className="mt-1 text-2xl font-bold">{data.period.webMassageServices}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Programas Skedu</p>
                    <p className="mt-1 text-2xl font-bold">{data.period.skeduPrograms}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{money(data.period.skeduRevenue)} en masajes</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock3 className="h-4 w-4" /> Reservas por rango horario
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.period.hourly.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No hay reservas en el período.</p>
                ) : (
                  <div className="space-y-3">
                    {data.period.hourly.map((row) => (
                      <div key={row.hour} className="grid grid-cols-[52px_1fr_32px] items-center gap-3">
                        <span className="text-xs text-muted-foreground">{row.label}</span>
                        <div className="h-3 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-400"
                            style={{ width: `${(row.reservations / maxHourly) * 100}%` }}
                          />
                        </div>
                        <span className="text-right text-sm font-semibold">{row.reservations}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircleHeart className="h-4 w-4" /> NPS de masajes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                  <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">NPS</p><p className="mt-1 text-2xl font-bold">{data.nps.score ?? "—"}</p></div>
                  <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Promedio</p><p className="mt-1 text-2xl font-bold">{data.nps.average?.toFixed(1) ?? "—"}</p></div>
                  <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Respuestas</p><p className="mt-1 text-2xl font-bold">{data.nps.responses}</p></div>
                  <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Tasa respuesta</p><p className="mt-1 text-2xl font-bold">{data.nps.responseRate.toFixed(1)}%</p></div>
                  <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Promotores</p><p className="mt-1 text-2xl font-bold text-emerald-700">{data.nps.promoters}</p></div>
                  <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Detractores</p><p className="mt-1 text-2xl font-bold text-red-600">{data.nps.detractors}</p></div>
                </div>
                {data.nps.recent.length > 0 && (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[650px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-4 font-medium">Fecha</th>
                          <th className="py-2 pr-4 font-medium">Cliente</th>
                          <th className="py-2 pr-4 font-medium">Servicio</th>
                          <th className="py-2 pr-4 font-medium">Nota</th>
                          <th className="py-2 font-medium">Comentario</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.nps.recent.map((response) => (
                          <tr key={response.id} className="border-b last:border-0">
                            <td className="py-3 pr-4 whitespace-nowrap">{response.serviceDate}</td>
                            <td className="py-3 pr-4">{response.clientName}</td>
                            <td className="py-3 pr-4">{response.serviceName}</td>
                            <td className="py-3 pr-4 font-semibold">{response.score}/10</td>
                            <td className="py-3">{response.comment || "Sin comentario"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-4 text-xs text-muted-foreground">
                  La encuesta se envía automáticamente por WhatsApp 30 minutos después de terminar el masaje.
                  NPS = % promotores (9–10) menos % detractores (0–6).
                </p>
              </CardContent>
            </Card>

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
                  <span>Historial de ingresos</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {history?.total ?? 0} masaje{history?.total === 1 ? "" : "s"} en el período
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
                            <th className="py-3 pr-4 font-medium">Origen</th>
                            <th className="py-3 pr-4 font-medium">Fecha masaje</th>
                            <th className="py-3 pr-4 font-medium">Cliente</th>
                            <th className="py-3 pr-4 font-medium">Técnica</th>
                            <th className="py-3 pr-4 font-medium">Terapeuta</th>
                            <th className="py-3 pr-4 font-medium">Valor original</th>
                            <th className="py-3 pr-4 font-medium">Descuento</th>
                            <th className="py-3 pr-4 font-medium">Valor pagado</th>
                            <th className="py-3 pr-4 font-medium">Código</th>
                            <th className="py-3 font-medium">Medio de pago</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.records.map((sale) => (
                            <tr key={sale.id} className="border-b last:border-0 align-top">
                              <td className="py-3 pr-4 whitespace-nowrap">
                                <Badge variant="secondary">
                                  {sale.source === "skedu_program" ? "Skedu" : "Masaje"}
                                </Badge>
                              </td>
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
                              <td className="py-3 pr-4 whitespace-nowrap">$ {Number(sale.originalAmount).toLocaleString("es-CL")}</td>
                              <td className="py-3 pr-4 whitespace-nowrap text-amber-700">−$ {Number(sale.discountAmount).toLocaleString("es-CL")}</td>
                              <td className={`py-3 pr-4 font-semibold whitespace-nowrap ${sale.saleStatus !== "paid" ? "text-red-600 line-through" : "text-green-700"}`}>
                                $ {Number(sale.amount).toLocaleString("es-CL")}
                              </td>
                              <td className="py-3 pr-4 whitespace-nowrap">{sale.discountCode ?? "No"}</td>
                              <td className="py-3 whitespace-nowrap">
                                <Badge variant={sale.saleStatus === "paid" ? "outline" : "destructive"}>
                                  {sale.saleStatus === "paid" ? "Pagada" : sale.saleStatus === "cancelled" ? "Anulada" : "Reembolsada"}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {sale.paymentMethod === "getnet"
                                    ? "Getnet"
                                    : sale.paymentMethod === "skedu_program" ? "Programa Skedu" : "CMS manual"}
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col items-stretch gap-3 mt-5 pt-4 border-t sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        Mostrando {(history.page - 1) * 25 + 1}–{Math.min(history.page * 25, history.total)} de {history.total}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button className="order-2 flex-1 sm:order-none sm:flex-none" variant="outline" size="sm" disabled={history.page <= 1} onClick={() => setPage(current => current - 1)}>
                          <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                        </Button>
                        <span className="order-1 w-full text-center text-sm sm:order-none sm:w-auto">Página {history.page} de {history.totalPages}</span>
                        <Button className="order-2 flex-1 sm:order-none sm:flex-none" variant="outline" size="sm" disabled={history.page >= history.totalPages} onClick={() => setPage(current => current + 1)}>
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
