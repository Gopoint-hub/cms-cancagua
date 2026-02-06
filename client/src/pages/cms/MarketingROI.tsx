import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    TrendingUp, TrendingDown, DollarSign, Target,
    Calendar as CalendarIcon, Plus, Trash2, ExternalLink, RefreshCw
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';

import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, subDays } from "date-fns";

const CHANNELS = [
    { id: "seo", name: "SEO / Google Organic", color: "#4ade80" },
    { id: "facebook_organic", name: "Facebook Organic", color: "#3b82f6" },
    { id: "instagram_organic", name: "Instagram Organic", color: "#ec4899" },
    { id: "tiktok_organic", name: "TikTok Organic", color: "#000000" },
    { id: "facebook_ads", name: "Meta Ads (Facebook)", color: "#1d4ed8" },
    { id: "instagram_ads", name: "Meta Ads (Instagram)", color: "#be185d" },
    { id: "google_ads", name: "Google Ads", color: "#f59e0b" },
    { id: "tiktok_ads", name: "TikTok Ads", color: "#ff0050" },
    { id: "other", name: "Otros / Directo", color: "#94a3b8" },
];

export default function CMSMarketingROI() {
    const [dateRange, setDateRange] = useState({
        start: startOfMonth(new Date()),
        end: endOfMonth(new Date()),
    });

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newInvestment, setNewInvestment] = useState({
        channel: "facebook_ads",
        amount: 0,
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: format(new Date(), "yyyy-MM-dd"),
        description: "",
    });

    const { data: report, refetch: refetchReport } = trpc.marketing.getROIReport.useQuery({
        startDate: dateRange.start,
        endDate: dateRange.end,
    });

    const { data: investments, refetch: refetchInvestments } = trpc.marketing.getAllInvestments.useQuery();

    const createInvestment = trpc.marketing.createInvestment.useMutation({
        onSuccess: () => {
            toast.success("Inversión registrada correctamente");
            refetchInvestments();
            refetchReport();
            setIsAddDialogOpen(false);
        },
    });

    const deleteInvestment = trpc.marketing.deleteInvestment.useMutation({
        onSuccess: () => {
            toast.success("Inversión eliminada");
            refetchInvestments();
            refetchReport();
        },
    });

    // Skedu sync removed - not available in CMS standalone
    const syncSkedu = { mutate: (_args: any, _opts?: any) => {}, isPending: false };

    const handleCreateInvestment = () => {
        if (newInvestment.amount <= 0) {
            toast.error("El monto debe ser mayor a 0");
            return;
        }
        createInvestment.mutate({
            ...newInvestment,
            channel: newInvestment.channel as any,
            startDate: new Date(newInvestment.startDate),
            endDate: new Date(newInvestment.endDate),
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
    };

    const calculateDelta = (current: number, previous: number) => {
        if (!previous || previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    };

    const TrendIndicator = ({ current, previous, isPercentage = false }: { current: number, previous: number, isPercentage?: boolean }) => {
        const delta = calculateDelta(current, previous);
        if (delta === 0) return null;

        return (
            <div className={`flex items-center text-[10px] font-medium mt-1 ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {delta >= 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                {delta > 0 ? '+' : ''}{delta.toFixed(1)}% vs anterior
            </div>
        );
    };

    const getChannelName = (id: string) => CHANNELS.find(c => c.id === id)?.name || id;

    const chartData = report?.channels.map(ch => ({
        name: getChannelName(ch.name),
        Inversión: ch.investment,
        Ingresos: ch.revenue,
        originalName: ch.name
    })) || [];

    const pieData = report?.channels.filter(ch => ch.revenue > 0).map(ch => ({
        name: getChannelName(ch.name),
        value: ch.revenue,
        color: CHANNELS.find(c => c.id === ch.name)?.color || "#CBD5E1"
    })) || [];

    return (
        <DashboardLayout>
            <div className="space-y-6 pb-10">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">ROI de Marketing</h1>
                        <p className="text-sm text-muted-foreground">
                            Conciliación de inversión publicitaria vs ingresos reales de Skedu.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select onValueChange={(val) => {
                            const now = new Date();
                            if (val === "today") setDateRange({ start: startOfDay(now), end: endOfDay(now) });
                            if (val === "this_month") setDateRange({ start: startOfMonth(now), end: endOfMonth(now) });
                            if (val === "last_month") {
                                const last = subMonths(now, 1);
                                setDateRange({ start: startOfMonth(last), end: endOfMonth(last) });
                            }
                            if (val === "last_7") setDateRange({ start: subDays(now, 7), end: now });
                            if (val === "last_30") setDateRange({ start: subDays(now, 30), end: now });
                        }}>
                            <SelectTrigger className="w-[180px] bg-white border-slate-200">
                                <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                                <SelectValue placeholder="Este Mes" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="today">Hoy</SelectItem>
                                <SelectItem value="last_7">Últimos 7 días</SelectItem>
                                <SelectItem value="last_30">Últimos 30 días</SelectItem>
                                <SelectItem value="this_month">Este Mes</SelectItem>
                                <SelectItem value="last_month">Mes Pasado</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const t = toast.loading("Sincronizando reservas con Skedu...");
                                toast.dismiss(t);
                                toast.info("Sincronización con Skedu no disponible en esta versión.");
                            }}
                            disabled={syncSkedu.isPending}
                            className="text-xs h-10 border-slate-200"
                        >
                            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${syncSkedu.isPending ? "animate-spin" : ""}`} />
                            {syncSkedu.isPending ? "Sincronizando..." : "Actualizar Datos Skedu"}
                        </Button>

                        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-[#1a5276] text-white hover:bg-[#154360] shadow-sm">
                                    <Plus className="mr-2 h-4 w-4" /> Registrar Inversión
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Registrar Gasto de Marketing</DialogTitle>
                                    <DialogDescription>
                                        Ingresa el monto gastado en una plataforma específica para calcular el ROI.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="channel" className="text-right text-xs">Canal</Label>
                                        <div className="col-span-3">
                                            <Select
                                                value={newInvestment.channel}
                                                onValueChange={(v) => setNewInvestment({ ...newInvestment, channel: v })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecciona el canal" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {CHANNELS.map(c => (
                                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="amount" className="text-right text-xs">Monto ($)</Label>
                                        <Input
                                            id="amount"
                                            type="number"
                                            className="col-span-3"
                                            value={newInvestment.amount}
                                            onChange={(e) => setNewInvestment({ ...newInvestment, amount: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="start" className="text-right text-xs">Desde</Label>
                                        <Input
                                            id="start"
                                            type="date"
                                            className="col-span-3 border-slate-200"
                                            value={newInvestment.startDate}
                                            onChange={(e) => setNewInvestment({ ...newInvestment, startDate: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="end" className="text-right text-xs">Hasta</Label>
                                        <Input
                                            id="end"
                                            type="date"
                                            className="col-span-3 border-slate-200"
                                            value={newInvestment.endDate}
                                            onChange={(e) => setNewInvestment({ ...newInvestment, endDate: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
                                    <Button onClick={handleCreateInvestment} disabled={createInvestment.isPending}>
                                        {createInvestment.isPending ? "Guardando..." : "Guardar Inversión"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Resumen de Métricas */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="bg-white border shadow-sm border-slate-100 overflow-hidden">
                        <div className="h-1 bg-slate-300 w-full" />
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Inversión Total</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-slate-900">{formatCurrency(report?.totals.investment || 0)}</div>
                            <TrendIndicator current={report?.totals.investment || 0} previous={report?.comparison.investment || 0} />
                        </CardContent>
                    </Card>

                    <Card className="bg-white border shadow-sm border-slate-100 overflow-hidden">
                        <div className="h-1 bg-blue-500 w-full" />
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Ingresos (Skedu)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-blue-700">{formatCurrency(report?.totals.revenue || 0)}</div>
                            <TrendIndicator current={report?.totals.revenue || 0} previous={report?.comparison.revenue || 0} />
                        </CardContent>
                    </Card>

                    <Card className="bg-white border shadow-sm border-slate-100 overflow-hidden">
                        <div className={`h-1 ${(report?.totals.roi || 0) >= 0 ? 'bg-emerald-500' : 'bg-rose-500'} w-full`} />
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">ROI Global</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold tracking-tight ${(report?.totals.roi || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {(report?.totals.roi || 0) * 100 > 0 ? '+' : ''}{((report?.totals.roi || 0) * 100).toFixed(1)}%
                            </div>
                            <TrendIndicator current={report?.totals.roi || 0} previous={report?.comparison.roi || 0} isPercentage />
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900 border shadow-sm overflow-hidden">
                        <div className="h-1 bg-amber-400 w-full" />
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Eficiencia (x)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-white">
                                {report?.totals.investment ? (report.totals.revenue / report.totals.investment).toFixed(1) : '0'}x
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 opacity-70">Ingresos por cada $1 invertido</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Gráficos */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="border-slate-100 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-sm">Rendimiento por Canal</CardTitle>
                            <CardDescription className="text-xs">Comparativa directa Inversión vs Ingresos</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="name" fontSize={9} angle={-25} textAnchor="end" height={60} axisLine={false} tickLine={false} />
                                    <YAxis fontSize={9} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(val: number) => formatCurrency(val)}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                                    <Bar name="Inversión" dataKey="Inversión" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={20} />
                                    <Bar name="Ingresos" dataKey="Ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-100 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-sm">Origen de Ingresos (%)</CardTitle>
                            <CardDescription className="text-xs">Distribución proporcional de ventas</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px] flex items-center justify-center">
                            {pieData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={70}
                                            outerRadius={100}
                                            paddingAngle={8}
                                            dataKey="value"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(val: number) => formatCurrency(val)} />
                                        <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '10px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="text-muted-foreground text-xs italic opacity-60">Sin datos para el periodo</div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Tabla Detallada */}
                <Card className="border-slate-100 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 py-4 border-b">
                        <CardTitle className="text-sm font-semibold">Detalle de Eficiencia por Canal</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/30">
                                    <TableHead className="text-[10px] uppercase font-bold py-3 pl-6">Canal de Marketing</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase font-bold py-3">Ventas</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase font-bold py-3">Inversión</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase font-bold py-3">Ingresos</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase font-bold py-3 pr-6 text-emerald-700">ROI (%)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {report?.channels.map((ch) => (
                                    <TableRow key={ch.name} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="font-medium py-3 pl-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: CHANNELS.find(c => c.id === ch.name)?.color || '#ccc' }}></div>
                                                <span className="text-sm text-slate-700">{getChannelName(ch.name)}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-slate-500 font-mono">{ch.count}</TableCell>
                                        <TableCell className="text-right text-sm text-slate-600">{formatCurrency(ch.investment)}</TableCell>
                                        <TableCell className="text-right text-sm font-semibold text-blue-800">{formatCurrency(ch.revenue)}</TableCell>
                                        <TableCell className={`text-right text-sm font-bold pr-6 ${ch.roi >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {(ch.roi * 100).toFixed(1)}%
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Listado de Inversiones Registradas */}
                <Card className="border-slate-100 shadow-sm overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between bg-slate-50/50 py-4 border-b">
                        <div>
                            <CardTitle className="text-sm font-semibold">Gastos Adicionales Registrados</CardTitle>
                            <CardDescription className="text-[10px]">Inversiones manuales para conciliación de ROI</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/30">
                                    <TableHead className="text-[10px] uppercase font-bold py-3 pl-6">Fecha Registro</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold py-3">Canal Destino</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold py-3">Nota / Concepto</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase font-bold py-3">Monto Invertido</TableHead>
                                    <TableHead className="w-[80px] py-3 pr-6"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {investments?.map((inv: any) => (
                                    <TableRow key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="text-slate-400 font-mono text-[10px] py-3 pl-6">
                                            {format(new Date(inv.startDate), "dd/MM/yyyy")}
                                        </TableCell>
                                        <TableCell className="font-medium text-sm py-3 text-slate-600">{getChannelName(inv.channel)}</TableCell>
                                        <TableCell className="text-slate-500 italic text-xs py-3 max-w-[200px] truncate">
                                            {inv.description || "-"}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-sm py-3 text-slate-800">{formatCurrency(inv.amount)}</TableCell>
                                        <TableCell className="text-right py-3 pr-6">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-rose-300 hover:text-rose-600 hover:bg-rose-50"
                                                onClick={() => {
                                                    if (confirm("¿Eliminar este registro de gasto?")) {
                                                        deleteInvestment.mutate({ id: inv.id });
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {(!investments || investments.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-10 text-slate-400 text-xs italic">
                                            Aún no hay gastos manuales registrados.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}

