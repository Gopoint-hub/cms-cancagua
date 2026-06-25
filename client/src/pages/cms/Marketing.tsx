import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Newspaper, MailPlus, UsersRound, ListChecks, ArrowRight,
  TrendingUp, Send, Users, Mail, Calendar, BookOpen,
  Bell, AlertCircle, CheckCircle2, FileText, RefreshCw,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type CalendarEvent = {
  id: number;
  date: string;
  title: string;
  type: "newsletter" | "personal" | "social" | "otro";
  audience?: string | null;
  subject?: string | null;
  notes?: string | null;
  status: "pending" | "done" | "cancelled";
};

type BlogArticle = {
  id: number;
  title: string;
  status: "draft" | "approved" | "published";
  category?: string | null;
  campaignSubject?: string | null;
};

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLabel(dateString: string) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function eventTypeLabel(type: CalendarEvent["type"]) {
  if (type === "newsletter") return "Newsletter";
  if (type === "personal") return "Personal";
  if (type === "social") return "Social";
  return "Otro";
}

function eventTypeClass(type: CalendarEvent["type"]) {
  if (type === "newsletter") return "bg-purple-100 text-purple-700 border-purple-200";
  if (type === "personal") return "bg-teal-100 text-teal-700 border-teal-200";
  if (type === "social") return "bg-pink-100 text-pink-700 border-pink-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function CMSMarketing() {
  const [, setLocation] = useLocation();

  const { data: newslettersData } = trpc.newsletters.getAll.useQuery();
  const { data: subscribersData, refetch: refetchSubscribers } = trpc.subscribers.getAll.useQuery();
  const { data: listsData, refetch: refetchLists } = trpc.lists.getAll.useQuery();
  const { data: calendarEvents = [] } = trpc.marketing.listCalendarEvents.useQuery();
  const { data: blogArticles = [] } = trpc.marketing.listBlogArticles.useQuery();
  const syncJustoMutation = trpc.marketing.syncJustoDatabase.useMutation({
    onSuccess: (result) => {
      toast.success(`BBDD Justo sincronizada: ${result.created} nuevos, ${result.assigned} asignaciones`);
      refetchSubscribers();
      refetchLists();
    },
    onError: (error) => toast.error(error.message || "No se pudo sincronizar Justo"),
  });

  const sentNewsletters = newslettersData?.filter((n: any) => n.status === "sent").length || 0;
  const draftNewsletters = newslettersData?.filter((n: any) => n.status === "draft").length || 0;
  const activeSubscribers = subscribersData?.filter((s: any) => s.status === "active").length || 0;
  const totalLists = listsData?.length || 0;
  const today = localDateString();
  const weekDates = Array.from({ length: 7 }, (_, index) => localDateString(addDays(new Date(), index)));
  const pendingEvents = (calendarEvents as CalendarEvent[]).filter((event) => event.status === "pending");
  const todayActions = pendingEvents.filter((event) => event.date === today);
  const weekEvents = pendingEvents
    .filter((event) => weekDates.includes(event.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const pendingBlogs = (blogArticles as BlogArticle[]).filter((article) => article.status === "draft");
  const approvedBlogs = (blogArticles as BlogArticle[]).filter((article) => article.status === "approved");

  const modules = [
    {
      title: "Newsletters",
      description: "Historial de campañas enviadas",
      icon: Newspaper,
      path: "/cms/newsletter",
      color: "bg-purple-500",
      badge: draftNewsletters > 0 ? `${draftNewsletters} borradores` : undefined,
    },
    {
      title: "Crear Newsletter",
      description: "Diseña emails con IA",
      icon: MailPlus,
      path: "/cms/crear-newsletter",
      color: "bg-pink-500",
    },
    {
      title: "Suscriptores",
      description: "Base de datos de contactos",
      icon: UsersRound,
      path: "/cms/suscriptores",
      color: "bg-blue-500",
      badge: `${activeSubscribers} activos`,
    },
    {
      title: "Listas",
      description: "Segmentación de audiencias",
      icon: ListChecks,
      path: "/cms/listas",
      color: "bg-amber-500",
      badge: totalLists > 0 ? `${totalLists} listas` : undefined,
    },
    {
      title: "ROI de Marketing",
      description: "Inversión vs Ventas Reales",
      icon: TrendingUp,
      path: "/cms/marketing-roi",
      color: "bg-emerald-500",
      badge: "Nuevo",
    },
    {
      title: "Envío Personal",
      description: "Email uno a uno desde eventos@cancagua.cl",
      icon: Mail,
      path: "/cms/envio-personal",
      color: "bg-teal-500",
    },
    {
      title: "Calendario",
      description: "Plan editorial de campañas",
      icon: Calendar,
      path: "/cms/calendario-marketing",
      color: "bg-indigo-500",
      badge: todayActions.length > 0 ? `${todayActions.length} para hoy` : undefined,
    },
    {
      title: "Blog & Contenido",
      description: "Generador SEO/AEO con IA",
      icon: BookOpen,
      path: "/cms/blog-contenido",
      color: "bg-rose-500",
      badge: pendingBlogs.length > 0 ? `${pendingBlogs.length} para aprobar` : undefined,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Marketing</h1>
            <p className="text-muted-foreground">
              Acciones del día, calendario editorial y accesos del módulo
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => syncJustoMutation.mutate()}
            disabled={syncJustoMutation.isPending}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncJustoMutation.isPending ? "animate-spin" : ""}`} />
            {syncJustoMutation.isPending ? "Sincronizando Justo..." : "Sincronizar BBDD Justo"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Newsletters Enviados</CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sentNewsletters}</div>
              <p className="text-xs text-muted-foreground">Campañas completadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Borradores</CardTitle>
              <Newspaper className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{draftNewsletters}</div>
              <p className="text-xs text-muted-foreground">En preparación</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suscriptores Activos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeSubscribers}</div>
              <p className="text-xs text-muted-foreground">Reciben newsletters</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Acciones Hoy</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todayActions.length}</div>
              <p className="text-xs text-muted-foreground">Campañas o tareas pendientes</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Acciones para hoy
                  </CardTitle>
                  <CardDescription>{formatDateLabel(today)}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLocation("/cms/calendario-marketing")}>
                  Abrir calendario
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {todayActions.length === 0 ? (
                <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  No hay acciones pendientes programadas para hoy.
                </div>
              ) : (
                todayActions.map((event) => (
                  <div key={event.id} className="rounded-md border p-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={eventTypeClass(event.type)}>
                            {eventTypeLabel(event.type)}
                          </Badge>
                          {event.audience && (
                            <Badge variant="secondary">{event.audience}</Badge>
                          )}
                        </div>
                        <div>
                          <p className="font-medium leading-tight">{event.title}</p>
                          {event.subject && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Asunto: {event.subject}
                            </p>
                          )}
                          {event.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {event.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={event.type === "personal" ? "default" : "outline"}
                        onClick={() => setLocation(event.type === "personal" ? "/cms/envio-personal" : "/cms/crear-newsletter")}
                      >
                        {event.type === "personal" ? "Enviar personal" : "Preparar mailing"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Blog & Contenido
                  </CardTitle>
                  <CardDescription>Aprobación editorial</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLocation("/cms/blog-contenido")}>
                  Abrir
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingBlogs.length === 0 && approvedBlogs.length === 0 ? (
                <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No hay artículos pendientes.
                </div>
              ) : (
                <>
                  {pendingBlogs.slice(0, 4).map((article) => (
                    <div key={article.id} className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{article.title}</p>
                          <p className="text-xs text-amber-700">Pendiente de aprobación</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {approvedBlogs.slice(0, 2).map((article) => (
                    <div key={article.id} className="rounded-md border border-blue-200 bg-blue-50/60 p-3">
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-blue-600 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{article.title}</p>
                          <p className="text-xs text-blue-700">Aprobado, listo para publicar</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Calendario semanal
                </CardTitle>
                <CardDescription>Próximos 7 días de campañas y tareas</CardDescription>
              </div>
              <Badge variant="secondary">{weekEvents.length} pendientes</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
              {weekDates.map((date) => {
                const dayEvents = weekEvents.filter((event) => event.date === date);
                return (
                  <div key={date} className={`min-h-36 rounded-md border p-3 ${date === today ? "bg-primary/5 border-primary/30" : "bg-background"}`}>
                    <div className="mb-3">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        {formatDateLabel(date)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {dayEvents.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin acciones</p>
                      ) : (
                        dayEvents.map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => setLocation("/cms/calendario-marketing")}
                            className="w-full text-left rounded border bg-white p-2 hover:bg-muted/40 transition-colors"
                          >
                            <Badge variant="outline" className={`mb-1 text-[10px] ${eventTypeClass(event.type)}`}>
                              {eventTypeLabel(event.type)}
                            </Badge>
                            <p className="text-xs font-medium leading-snug line-clamp-2">{event.title}</p>
                            {event.audience && (
                              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{event.audience}</p>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((module) => (
            <Card
              key={module.path}
              className="cursor-pointer hover:shadow-md transition-all group"
              onClick={() => setLocation(module.path)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${module.color}`}>
                    <module.icon className="h-5 w-5 text-white" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
                <CardTitle className="text-lg">{module.title}</CardTitle>
                <CardDescription>{module.description}</CardDescription>
              </CardHeader>
              {module.badge && (
                <CardContent className="pt-0">
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                    {module.badge}
                  </span>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
