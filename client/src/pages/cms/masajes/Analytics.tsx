import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { BarChart3, TrendingUp, CalendarCheck, XCircle } from "lucide-react";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export default function MasajesAnalytics() {
  const [from, setFrom] = useState(fmt(startOfMonth(new Date())));
  const [to, setTo] = useState(fmt(endOfMonth(new Date())));

  const { data, isLoading, refetch } = trpc.masajes.analytics.summary.useQuery({ from, to });

  const setPreset = (months: number) => {
    const ref = months === 0 ? new Date() : subMonths(new Date(), months - 1);
    setFrom(fmt(startOfMonth(ref)));
    setTo(fmt(endOfMonth(new Date())));
  };

  const totalRevenue = Number(data?.totals?.totalRevenue ?? 0);
  const totalBookings = Number(data?.totals?.totalBookings ?? 0);
  const completed = Number(data?.totals?.completedBookings ?? 0);
  const cancelled = Number(data?.totals?.cancelledBookings ?? 0);
  const avgTicket = completed > 0 ? totalRevenue / completed : 0;

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
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label>Hasta</Label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setPreset(0)}>Este mes</Button>
                <Button variant="outline" size="sm" onClick={() => setPreset(3)}>Últimos 3 meses</Button>
                <Button variant="outline" size="sm" onClick={() => setPreset(6)}>Últimos 6 meses</Button>
              </div>
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
