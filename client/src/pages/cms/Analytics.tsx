import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, DollarSign, Eye, MousePointerClick, Search,
  RefreshCw, BarChart3, Target, ShoppingCart, Loader2,
  ArrowUpRight, ArrowDownRight, Globe, Megaphone,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SEOHead } from "@/components/SEOHead";

const MONTHS = [
  { value: "01", label: "Enero" },
  { value: "02", label: "Febrero" },
  { value: "03", label: "Marzo" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Mayo" },
  { value: "06", label: "Junio" },
  { value: "07", label: "Julio" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

const CHANNEL_COLORS = {
  "Google Ads": "#f59e0b",
  "Meta Ads": "#3b82f6",
  "SEO Orgánico": "#22c55e",
};

function getYears() {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2].map(y => ({ value: String(y), label: String(y) }));
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatCLP(amount: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("es-CL").format(Math.round(n));
}

function formatPercent(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

// ==========================================
// KPI Card
// ==========================================

function KpiCard({ title, value, subtitle, icon: Icon, color = "text-primary" }: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center bg-muted ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ==========================================
// Main Component
// ==========================================

export default function CMSAnalytics() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState(String(now.getFullYear()));

  const periodKey = `${year}-${month}`;
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${getDaysInMonth(parseInt(year), parseInt(month))}`;

  // Cargar datos desde caché (BD) al entrar y al cambiar mes
  const { data: cached, isLoading: loadingCache } = trpc.analytics.getCached.useQuery(
    { periodKey },
    { refetchOnWindowFocus: false }
  );

  // Mutation para actualizar desde APIs externas
  const refreshMutation = trpc.analytics.refresh.useMutation();

  const handleRefresh = () => {
    refreshMutation.mutate({ startDate, endDate, periodKey });
  };

  // Usar datos del refresh si acaba de ejecutarse, sino usar caché
  const data = refreshMutation.data || cached?.data || null;
  const lastUpdated = refreshMutation.data ? new Date() : cached?.updatedAt ? new Date(cached.updatedAt) : null;
  const isLoading = loadingCache;
  const isRefreshing = refreshMutation.isPending;

  const monthLabel = MONTHS.find(m => m.value === month)?.label || month;

  return (
    <DashboardLayout>
      <SEOHead title="Analytics | Cancagua CMS" description="Dashboard de analytics" noindex />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground">
              Cruce de datos: campañas, ventas y tendencias de búsqueda
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={month} onValueChange={(v) => handlePeriodChange("month", v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={year} onValueChange={(v) => handlePeriodChange("year", v)}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getYears().map(y => (
                  <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Actualizar
            </Button>
          </div>
        </div>

        {/* Loading from cache */}
        {isLoading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Cargando datos...</p>
            </CardContent>
          </Card>
        )}

        {/* Refreshing from APIs */}
        {isRefreshing && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-muted-foreground">Actualizando desde APIs externas...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Google Ads, Meta Ads, Search Console, Skedu y DataForSEO
              </p>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!data && !isLoading && !isRefreshing && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sin datos para {monthLabel} {year}</h3>
              <p className="text-muted-foreground max-w-md">
                Presiona <strong>"Actualizar"</strong> para consultar Google Ads, Meta Ads, Search Console y Skedu.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Dashboard Content */}
        {data && !isLoading && (
          <>
            {/* Last updated indicator */}
            {lastUpdated && (
              <p className="text-xs text-muted-foreground">
                Última actualización: {lastUpdated.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}

            {/* KPI Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard
                title="Inversión Total"
                value={formatCLP(data.summary.totalInvestment)}
                subtitle={`Google: ${formatCLP(data.googleAds?.totalCost || 0)} | Meta: ${formatCLP(data.metaAds?.totalSpend || 0)}`}
                icon={DollarSign}
                color="text-red-500"
              />
              <KpiCard
                title="Ventas Skedu"
                value={formatCLP(data.summary.totalRevenue)}
                subtitle={`${data.skedu?.confirmedBookings || 0} reservas confirmadas`}
                icon={ShoppingCart}
                color="text-green-500"
              />
              <KpiCard
                title="ROAS"
                value={data.summary.roas > 0 ? `${data.summary.roas.toFixed(1)}x` : "—"}
                subtitle={data.summary.roas > 1 ? "Retorno positivo" : "Sin datos suficientes"}
                icon={TrendingUp}
                color={data.summary.roas >= 1 ? "text-green-500" : "text-amber-500"}
              />
              <KpiCard
                title="Conversiones Ads"
                value={formatNumber(data.summary.totalConversions)}
                subtitle={data.summary.costPerConversion > 0 ? `Costo/conv: ${formatCLP(data.summary.costPerConversion)}` : ""}
                icon={Target}
                color="text-blue-500"
              />
              <KpiCard
                title="Visitas SEO"
                value={formatNumber(data.searchConsole?.totalClicks || 0)}
                subtitle={`${formatNumber(data.searchConsole?.totalImpressions || 0)} impresiones`}
                icon={Search}
                color="text-emerald-500"
              />
            </div>

            {/* Channel Comparison */}
            <div className="grid lg:grid-cols-2 gap-6">
              <ChannelComparisonChart data={data} />
              <ChannelBreakdownPie data={data} />
            </div>

            {/* Campaigns Tables */}
            <div className="grid lg:grid-cols-2 gap-6">
              <GoogleAdsCampaignsTable campaigns={data.googleAds?.campaigns || []} />
              <MetaAdsCampaignsTable campaigns={data.metaAds?.campaigns || []} />
            </div>

            {/* Search & Keywords */}
            <div className="grid lg:grid-cols-2 gap-6">
              <SearchQueriesTable queries={data.searchConsole?.topQueries || []} />
              <KeywordTrendsTable keywords={data.keywordTrends} />
            </div>

            {/* Skedu Services & Search Pages */}
            <div className="grid lg:grid-cols-2 gap-6">
              <SkeduServicesTable services={data.skedu?.serviceBreakdown || []} />
              <SearchPagesTable pages={data.searchPages} />
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

// ==========================================
// Charts
// ==========================================

function ChannelComparisonChart({ data }: { data: any }) {
  const chartData = [
    {
      name: "Google Ads",
      inversión: Math.round(data.googleAds?.totalCost || 0),
      clics: data.googleAds?.totalClicks || 0,
      conversiones: Math.round(data.googleAds?.totalConversions || 0),
    },
    {
      name: "Meta Ads",
      inversión: Math.round(data.metaAds?.totalSpend || 0),
      clics: data.metaAds?.totalClicks || 0,
      conversiones: data.metaAds?.totalPurchases || 0,
    },
    {
      name: "SEO",
      inversión: 0,
      clics: data.searchConsole?.totalClicks || 0,
      conversiones: 0,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Comparación por Canal
        </CardTitle>
        <CardDescription>Inversión y clics por plataforma</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value: number, name: string) =>
                name === "inversión" ? formatCLP(value) : formatNumber(value)
              }
            />
            <Legend />
            <Bar dataKey="clics" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Clics" />
            <Bar dataKey="conversiones" fill="#22c55e" radius={[4, 4, 0, 0]} name="Conversiones" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ChannelBreakdownPie({ data }: { data: any }) {
  const pieData = [
    { name: "Google Ads", value: Math.round(data.googleAds?.totalCost || 0), color: "#f59e0b" },
    { name: "Meta Ads", value: Math.round(data.metaAds?.totalSpend || 0), color: "#3b82f6" },
  ].filter(d => d.value > 0);

  const clicksPie = [
    { name: "Google Ads", value: data.googleAds?.totalClicks || 0, color: "#f59e0b" },
    { name: "Meta Ads", value: data.metaAds?.totalClicks || 0, color: "#3b82f6" },
    { name: "SEO Orgánico", value: data.searchConsole?.totalClicks || 0, color: "#22c55e" },
  ].filter(d => d.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Distribución de Tráfico
        </CardTitle>
        <CardDescription>De dónde vienen los clics</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={clicksPie}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {clicksPie.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatNumber(value)} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ==========================================
// Tables
// ==========================================

function GoogleAdsCampaignsTable({ campaigns }: { campaigns: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-amber-500" />
          Campañas Google Ads
        </CardTitle>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin campañas activas</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead className="text-right">Clics</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[200px] truncate">
                      <div className="flex items-center gap-2">
                        <Badge variant={c.status === "ENABLED" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {c.status === "ENABLED" ? "ON" : "OFF"}
                        </Badge>
                        <span className="truncate text-sm">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">{formatNumber(c.impressions)}</TableCell>
                    <TableCell className="text-right text-sm">{formatNumber(c.clicks)}</TableCell>
                    <TableCell className="text-right text-sm">{formatCLP(c.cost)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatNumber(c.conversions)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetaAdsCampaignsTable({ campaigns }: { campaigns: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-blue-500" />
          Campañas Meta Ads
        </CardTitle>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin campañas activas</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead className="text-right">Clics</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-[200px] truncate text-sm">{c.name}</TableCell>
                    <TableCell className="text-right text-sm">{formatNumber(c.impressions)}</TableCell>
                    <TableCell className="text-right text-sm">{formatNumber(c.clicks)}</TableCell>
                    <TableCell className="text-right text-sm">{formatCLP(c.spend)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{c.purchases}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SearchQueriesTable({ queries }: { queries: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4 text-emerald-500" />
          Búsquedas en Google (Search Console)
        </CardTitle>
        <CardDescription>Qué busca la gente para encontrarte</CardDescription>
      </CardHeader>
      <CardContent>
        {queries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin datos de búsqueda</p>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead className="text-right">Clics</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Pos.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queries.map((q, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{q.query}</TableCell>
                    <TableCell className="text-right text-sm">{q.clicks}</TableCell>
                    <TableCell className="text-right text-sm">{formatNumber(q.impressions)}</TableCell>
                    <TableCell className="text-right text-sm">{formatPercent(q.ctr)}</TableCell>
                    <TableCell className="text-right text-sm">{q.position.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KeywordTrendsTable({ keywords }: { keywords: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-purple-500" />
          Tendencias de Keywords (DataForSEO)
        </CardTitle>
        <CardDescription>Volúmenes de búsqueda para proyectar servicios</CardDescription>
      </CardHeader>
      <CardContent>
        {keywords.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin datos de keywords</p>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead className="text-right">Vol. mensual</TableHead>
                  <TableHead className="text-right">Competencia</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((k, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{k.keyword}</TableCell>
                    <TableCell className="text-right text-sm">
                      <span className="font-semibold">{formatNumber(k.searchVolume)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={
                        k.competition === "HIGH" ? "destructive" :
                        k.competition === "MEDIUM" ? "default" : "secondary"
                      } className="text-[10px]">
                        {k.competition === "HIGH" ? "Alta" :
                         k.competition === "MEDIUM" ? "Media" :
                         k.competition === "LOW" ? "Baja" : k.competition}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {k.cpc > 0 ? `$${k.cpc.toFixed(0)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkeduServicesTable({ services }: { services: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-green-500" />
          Servicios más vendidos (Skedu)
        </CardTitle>
        <CardDescription>Desglose por servicio del mes</CardDescription>
      </CardHeader>
      <CardContent>
        {services.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin reservas en el período</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Servicio</TableHead>
                  <TableHead className="text-right">Reservas</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{s.name}</TableCell>
                    <TableCell className="text-right text-sm">{s.count}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatCLP(s.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SearchPagesTable({ pages }: { pages: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4 text-cyan-500" />
          Páginas más visitadas (SEO)
        </CardTitle>
        <CardDescription>Qué páginas atraen más tráfico orgánico</CardDescription>
      </CardHeader>
      <CardContent>
        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin datos</p>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Página</TableHead>
                  <TableHead className="text-right">Clics</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium max-w-[200px] truncate">{p.page}</TableCell>
                    <TableCell className="text-right text-sm">{p.clicks}</TableCell>
                    <TableCell className="text-right text-sm">{formatNumber(p.impressions)}</TableCell>
                    <TableCell className="text-right text-sm">{formatPercent(p.ctr)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
