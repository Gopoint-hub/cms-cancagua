import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Users, TrendingUp, Star, RefreshCw, Search, Mail, Phone, CalendarCheck, Heart, Globe } from "lucide-react";

const SERVICE_COLORS: Record<string, string> = {
  "Hot Tub": "#0ea5e9", "Horario Ingreso": "#10b981", "Masajes": "#ec4899",
  "Sauna Nativo": "#f59e0b", "Clases Regulares": "#8b5cf6", "Eventos": "#f97316", "Tablas": "#0f766e",
};
const GENDER_COLORS: Record<string, string> = { F: "#ec4899", M: "#0ea5e9", nd: "#94a3b8" };
const GENDER_LABELS: Record<string, string> = { F: "Femenino", M: "Masculino", nd: "No det." };
const RETENTION_COLORS = ["#0f766e", "#0ea5e9", "#f59e0b"];

const fmt = (n: any) => Number(n || 0).toLocaleString("es-CL");
const fmtCLP = (n: any) => `$${fmt(n)}`;

function KPICard({ icon: Icon, label, value, sub, color = "" }: any) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" />{label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function DashboardBI() {
  const { data: stats, isLoading: ls } = trpc.clientes.getBIStats.useQuery();
  const { data: charts, isLoading: lc } = trpc.clientes.getBICharts.useQuery();

  if (ls || lc) return <div className="space-y-4">{[1,2,3].map(i=><Skeleton key={i} className="h-48 w-full"/>)}</div>;

  const ingresosData = (charts?.porMes ?? [])
    .filter((m: any) => m.mes >= "2025-01")
    .map((m: any) => ({ mes: m.mes?.slice(2), ingresos: Math.round(Number(m.ingresos||0)/1000) }));

  const generoData = (charts?.generos ?? []).map((g: any) => ({
    name: GENDER_LABELS[g.genero] || g.genero, value: Number(g.n),
    fill: GENDER_COLORS[g.genero] || "#94a3b8",
  }));

  const frecData = (charts?.frecuencia ?? []).map((f: any) => ({
    tramo: f.tramo, clientes: Number(f.n),
  }));

  const retData = [
    { name: "Leales (2 años)", value: Number(charts?.retencion?.leales||0) },
    { name: "Nuevos 2026", value: Number(charts?.retencion?.solo2026||0) },
    { name: "Sin retornar", value: Number(charts?.retencion?.solo2025||0) },
  ];

  const topClientes = (charts?.topClientes ?? []).map((c: any) => ({
    name: (c.name||c.email||"?").split(" ").slice(0,2).join(" "),
    gasto: Math.round(Number(c.totalGasto||0)/1000),
  })).reverse();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard icon={Users} label="Total clientes" value={fmt(stats?.totalClientes)} />
        <KPICard icon={TrendingUp} label="Ingresos históricos" value={`$${Math.round(Number(stats?.totalGasto||0)/1000000)}M`} color="text-green-600" />
        <KPICard icon={CalendarCheck} label="Ticket promedio" value={fmtCLP(Math.round(Number(stats?.promedioGasto||0)))} />
        <KPICard icon={Star} label="VIP (6+ visitas)" value={fmt(stats?.clientes6plus)} sub={`${fmt(stats?.clientes2_5)} con 2–5 visitas`} color="text-amber-600" />
        <KPICard icon={Heart} label="Leales (2 años)" value={fmt(stats?.leales)} color="text-rose-600" />
        <KPICard icon={RefreshCw} label="Nuevos 30 días" value={fmt(stats?.nuevos30d)} color="text-blue-600" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Ingresos por mes — 2025 y 2026 ($ miles CLP)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={ingresosData} margin={{ top:5, right:10, left:0, bottom:5 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#0f766e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis dataKey="mes" tick={{ fontSize:10 }}/>
              <YAxis tick={{ fontSize:10 }} tickFormatter={v=>`$${v}k`}/>
              <Tooltip formatter={(v:any)=>[`$${v}k`, "Ingresos"]}/>
              <Area type="monotone" dataKey="ingresos" stroke="#0f766e" fill="url(#grad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Frecuencia de visitas</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={frecData} layout="vertical" margin={{ left:65, right:10 }}>
                <XAxis type="number" tick={{ fontSize:10 }}/>
                <YAxis dataKey="tramo" type="category" tick={{ fontSize:9 }} width={60}/>
                <Tooltip formatter={(v:any)=>[fmt(v)+" clientes", ""]}/>
                <Bar dataKey="clientes" fill="#0f766e" radius={[0,3,3,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Distribución por género</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={generoData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                  label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {generoData.map((g:any,i:number)=><Cell key={i} fill={g.fill}/>)}
                </Pie>
                <Tooltip formatter={(v:any)=>[fmt(v)+" clientes", ""]}/>
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Retención 2025 → 2026</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={retData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75}>
                  {retData.map((_,i)=><Cell key={i} fill={RETENTION_COLORS[i]}/>)}
                </Pie>
                <Tooltip formatter={(v:any)=>[fmt(v)+" clientes", ""]}/>
                <Legend iconSize={10} wrapperStyle={{ fontSize:10 }}/>
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Top 15 clientes por gasto histórico</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={topClientes} layout="vertical" margin={{ left:90, right:30 }}>
              <XAxis type="number" tick={{ fontSize:10 }} tickFormatter={v=>`$${v}k`}/>
              <YAxis dataKey="name" type="category" tick={{ fontSize:10 }} width={85}/>
              <Tooltip formatter={(v:any)=>[`$${v}k`, "Gasto"]}/>
              <Bar dataKey="gasto" fill="#0f766e" radius={[0,3,3,0]} name="Gasto ($k)"/>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {(charts?.idiomas ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4"/>Clientes por idioma (no hispanohablantes)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(charts?.idiomas ?? []).map((l:any,i:number)=>(
                <div key={i} className="flex items-center gap-1.5 border rounded-full px-3 py-1 text-sm">
                  <span className="font-medium">{l.idioma?.toUpperCase()}</span>
                  <Badge variant="secondary" className="text-xs">{l.n}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TablaClientes() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [orderBy, setOrderBy] = useState<any>("ultima_visita");
  const [generoFilter, setGeneroFilter] = useState<any>("");
  const [lealFilter, setLealFilter] = useState<string>("");

  const { data, isLoading } = trpc.clientes.getAll.useQuery({
    search: debouncedSearch, page, limit: 50, orderBy,
    genero: (generoFilter || undefined) as any,
    esLeal: lealFilter === "" ? undefined : lealFilter === "1",
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / 50);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((window as any).__st);
    (window as any).__st = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 350);
  };

  const serviceBadges = (json: string | null | undefined) => {
    if (!json) return null;
    try {
      const arr: string[] = JSON.parse(json);
      return arr.filter(Boolean).slice(0,3).map((s,i)=>(
        <span key={i} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: (SERVICE_COLORS[s]||"#94a3b8")+"22", color: SERVICE_COLORS[s]||"#6b7280" }}>
          {s}
        </span>
      ));
    } catch { return null; }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <Input className="pl-9" placeholder="Nombre, email o teléfono..." value={search} onChange={e=>handleSearch(e.target.value)}/>
        </div>
        <Select value={orderBy} onValueChange={v=>{setOrderBy(v);setPage(1);}}>
          <SelectTrigger className="w-44"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="ultima_visita">Última visita</SelectItem>
            <SelectItem value="total_visitas">Más visitas</SelectItem>
            <SelectItem value="total_gasto">Mayor gasto</SelectItem>
            <SelectItem value="name">Nombre A–Z</SelectItem>
            <SelectItem value="created_at">Fecha registro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={generoFilter} onValueChange={v=>{setGeneroFilter(v);setPage(1);}}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Género"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            <SelectItem value="F">Femenino</SelectItem>
            <SelectItem value="M">Masculino</SelectItem>
            <SelectItem value="nd">No determinado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={lealFilter} onValueChange={v=>{setLealFilter(v);setPage(1);}}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Fidelidad"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            <SelectItem value="1">⭐ Leales (2 años)</SelectItem>
            <SelectItem value="0">Sin retorno</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{fmt(total)} clientes</p>
        {pages > 1 && <p className="text-sm text-muted-foreground">Página {page} de {pages}</p>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5,6].map(i=><Skeleton key={i} className="h-12 w-full"/>)}</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-muted/40">
              <tr>
                {["Cliente","Contacto","Visitas (25·26)","Gasto total","Ticket prom.","Última visita","Servicios"].map((h,i)=>(
                  <th key={i} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.length===0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">Sin resultados para esta búsqueda</td></tr>
              ) : items.map((cli:any)=>{
                const gv = Number(cli.genero==='F'?'F':cli.genero==='M'?'M':'N');
                const initColor = cli.genero==='F'?"#fce7f3":cli.genero==='M'?"#e0f2fe":"#f1f5f9";
                const initText  = cli.genero==='F'?"#ec4899":cli.genero==='M'?"#0ea5e9":"#94a3b8";
                return (
                  <tr key={cli.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: initColor, color: initText }}>
                          {(cli.name||cli.email||"?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[160px]">{cli.name || "—"}</p>
                          {cli.esLeal===1&&<span className="text-[10px] text-amber-600 font-medium">⭐ Leal</span>}
                          {cli.idioma&&cli.idioma!=='es'&&<Badge variant="outline" className="text-[9px] ml-1 py-0">{cli.idioma.toUpperCase()}</Badge>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-muted-foreground space-y-0.5 min-w-0">
                        {cli.email&&<div className="flex items-center gap-1 truncate max-w-[180px]"><Mail className="w-3 h-3 shrink-0"/><span className="truncate">{cli.email}</span></div>}
                        {cli.phone&&<div className="flex items-center gap-1"><Phone className="w-3 h-3 shrink-0"/>{cli.phone}</div>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold text-base ${Number(cli.totalVisitas)>=6?"text-amber-500":Number(cli.totalVisitas)>=3?"text-blue-500":""}`}>
                        {cli.totalVisitas||0}
                      </span>
                      <div className="text-[10px] text-muted-foreground">{cli.visitas2025||0}·{cli.visitas2026||0}</div>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-green-700 whitespace-nowrap">
                      {Number(cli.totalGasto)>0?fmtCLP(cli.totalGasto):"—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                      {Number(cli.ticketPromedio)>0?fmtCLP(cli.ticketPromedio):"—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {cli.ultimaVisita?String(cli.ultimaVisita).slice(0,10):"—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1 flex-wrap">{serviceBadges(cli.serviciosUsados)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages>1&&(
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Anterior</Button>
          <div className="flex gap-1">
            {Array.from({length:Math.min(pages,7)},(_,i)=>i+1).map(p=>(
              <Button key={p} variant={p===page?"default":"outline"} size="sm" className="w-8 h-8 p-0" onClick={()=>setPage(p)}>{p}</Button>
            ))}
            {pages>7&&<span className="px-2 self-center text-muted-foreground text-sm">…{pages}</span>}
          </div>
          <Button variant="outline" size="sm" disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Siguiente →</Button>
        </div>
      )}
    </div>
  );
}

export default function CMSClientes() {
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Base de datos completa · Análisis BI · Histórico 2025–2026
          </p>
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList>
            <TabsTrigger value="dashboard" className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5"/>Dashboard BI
            </TabsTrigger>
            <TabsTrigger value="tabla" className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5"/>Base de clientes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6"><DashboardBI/></TabsContent>
          <TabsContent value="tabla" className="mt-6"><TablaClientes/></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
