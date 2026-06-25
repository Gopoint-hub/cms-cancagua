import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  LayoutDashboard,
  ListChecks,
  Mail,
  MailPlus,
  Newspaper,
  RefreshCw,
  Send,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link, useLocation } from "wouter";
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
  if (type === "personal") return "Envío personal";
  if (type === "social") return "Redes";
  return "Otro";
}

function eventTypeClass(type: CalendarEvent["type"]) {
  if (type === "newsletter") return "border-purple-300 bg-purple-50 text-purple-800";
  if (type === "personal") return "border-teal-300 bg-teal-50 text-teal-800";
  if (type === "social") return "border-pink-300 bg-pink-50 text-pink-800";
  return "border-slate-300 bg-slate-50 text-slate-800";
}

export default function CMSMarketing() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: newslettersData, isLoading: loadingNewsletters } = trpc.newsletters.getAll.useQuery();
  const { data: subscribersData, isLoading: loadingSubscribers } = trpc.subscribers.getAll.useQuery();
  const { data: listsData, isLoading: loadingLists } = trpc.lists.getAll.useQuery();
  const { data: calendarEvents = [], isLoading: loadingCalendar } = trpc.marketing.listCalendarEvents.useQuery();
  const { data: blogArticles = [], isLoading: loadingBlog } = trpc.marketing.listBlogArticles.useQuery();

  const syncJustoMutation = trpc.marketing.syncJustoDatabase.useMutation({
    onSuccess: (result) => {
      toast.success(`BBDD Justo sincronizada: ${result.created} nuevos, ${result.assigned} asignaciones`);
      utils.subscribers.getAll.invalidate();
      utils.lists.getAll.invalidate();
    },
    onError: (error) => toast.error(error.message || "No se pudo sincronizar Justo"),
  });

  const today = localDateString();
  const weekDates = Array.from({ length: 7 }, (_, index) => localDateString(addDays(new Date(), index)));
  const newsletters = newslettersData ?? [];
  const subscribers = subscribersData ?? [];
  const lists = listsData ?? [];
  const events = calendarEvents as CalendarEvent[];
  const articles = blogArticles as BlogArticle[];

  const sentNewsletters = newsletters.filter((newsletter: any) => newsletter.status === "sent").length;
  const draftNewsletters = newsletters.filter((newsletter: any) => newsletter.status === "draft").length;
  const activeSubscribers = subscribers.filter((subscriber: any) => subscriber.status === "active").length;
  const pendingEvents = events.filter((event) => event.status === "pending");
  const todayActions = pendingEvents.filter((event) => event.date === today);
  const weekEvents = pendingEvents
    .filter((event) => weekDates.includes(event.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const weekMailings = weekEvents.filter((event) => event.type === "newsletter" || event.type === "personal");
  const pendingBlogs = articles.filter((article) => article.status === "draft");
  const approvedBlogs = articles.filter((article) => article.status === "approved");
  const loadingCore = loadingNewsletters || loadingSubscribers || loadingLists || loadingCalendar || loadingBlog;

  const quickLinks = [
    { href: "/cms/marketing", label: "Dashboard", icon: LayoutDashboard },
    { href: "/cms/newsletter", label: "Newsletters", icon: Newspaper },
    { href: "/cms/crear-newsletter", label: "Crear newsletter", icon: MailPlus },
    { href: "/cms/suscriptores", label: "Suscriptores", icon: Users },
    { href: "/cms/listas", label: "Listas", icon: ListChecks },
    { href: "/cms/envio-personal", label: "Envío personal", icon: Mail },
    { href: "/cms/calendario-marketing", label: "Calendario", icon: Calendar },
    { href: "/cms/blog-contenido", label: "Blog & Contenido", icon: BookOpen },
    { href: "/cms/marketing-roi", label: "ROI", icon: BarChart3 },
    { href: "/cms/codigos-descuento", label: "Códigos", icon: Tag },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Marketing</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => syncJustoMutation.mutate()}
            disabled={syncJustoMutation.isPending}
            className="gap-2 w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 ${syncJustoMutation.isPending ? "animate-spin" : ""}`} />
            {syncJustoMutation.isPending ? "Sincronizando Justo..." : "Sincronizar BBDD Justo"}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" /> Acciones hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCalendar ? <Skeleton className="h-8 w-12" /> : (
                <span className="text-3xl font-bold">{todayActions.length}</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Send className="w-4 h-4" /> Mailings semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCalendar ? <Skeleton className="h-8 w-12" /> : (
                <span className="text-3xl font-bold">{weekMailings.length}</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Blog pendiente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBlog ? <Skeleton className="h-8 w-12" /> : (
                <span className="text-3xl font-bold">{pendingBlogs.length}</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Suscriptores activos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSubscribers ? <Skeleton className="h-8 w-24" /> : (
                <span className="text-3xl font-bold">{activeSubscribers.toLocaleString("es-CL")}</span>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <AlertTriangle className="w-5 h-5" />
              Acciones de marketing pendientes hoy
              {!loadingCalendar && todayActions.length > 0 && (
                <Badge variant="outline" className="ml-1 border-amber-400 bg-amber-100 text-amber-800">
                  {todayActions.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCalendar ? (
              <div className="space-y-2">
                {[1, 2].map((item) => <Skeleton key={item} className="h-16 w-full" />)}
              </div>
            ) : todayActions.length === 0 ? (
              <p className="text-sm text-amber-700/70 text-center py-3">Sin mailings ni acciones pendientes para hoy</p>
            ) : (
              <div className="space-y-2">
                {todayActions.map((event) => (
                  <div key={event.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={eventTypeClass(event.type)}>
                          {eventTypeLabel(event.type)}
                        </Badge>
                        {event.audience && <Badge variant="secondary">{event.audience}</Badge>}
                      </div>
                      <p className="font-medium text-sm truncate">{event.title}</p>
                      {event.subject && <p className="text-xs text-muted-foreground truncate">Asunto: {event.subject}</p>}
                    </div>
                    <Button
                      variant={event.type === "personal" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLocation(event.type === "personal" ? "/cms/envio-personal" : "/cms/crear-newsletter")}
                    >
                      {event.type === "personal" ? "Enviar" : "Preparar"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Calendario semanal
                </span>
                <Link href="/cms/calendario-marketing">
                  <span className="text-sm font-normal text-primary cursor-pointer hover:underline">Ver calendario →</span>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCalendar ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
                </div>
              ) : weekEvents.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Sin acciones programadas para los próximos 7 días</p>
              ) : (
                <div className="space-y-3">
                  {weekEvents.slice(0, 7).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setLocation("/cms/calendario-marketing")}
                      className="w-full text-left flex items-start justify-between gap-3 rounded-lg border p-3 hover:border-primary transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{formatDateLabel(event.date)}</p>
                        <p className="text-sm font-medium truncate">{event.title}</p>
                        {event.audience && <p className="text-xs text-muted-foreground truncate">Lista: {event.audience}</p>}
                      </div>
                      <Badge variant="outline" className={`shrink-0 ${eventTypeClass(event.type)}`}>
                        {eventTypeLabel(event.type)}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Contenido pendiente
                </span>
                <Link href="/cms/blog-contenido">
                  <span className="text-sm font-normal text-primary cursor-pointer hover:underline">Ver contenidos →</span>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBlog ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
                </div>
              ) : pendingBlogs.length === 0 && approvedBlogs.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Sin artículos pendientes de aprobación o publicación</p>
              ) : (
                <div className="space-y-3">
                  {pendingBlogs.slice(0, 4).map((article) => (
                    <div key={article.id} className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{article.title}</p>
                        <p className="text-xs text-amber-700">Pendiente de aprobación</p>
                      </div>
                      <FileText className="w-4 h-4 shrink-0 text-amber-700" />
                    </div>
                  ))}
                  {approvedBlogs.slice(0, 3).map((article) => (
                    <div key={article.id} className="flex items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{article.title}</p>
                        <p className="text-xs text-blue-700">Aprobado, listo para publicar</p>
                      </div>
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-700" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href}>
                <Card className="cursor-pointer hover:border-primary transition-colors">
                  <CardContent className="p-4 text-center space-y-2">
                    <Icon className="w-4 h-4 mx-auto text-muted-foreground" />
                    <span className="text-sm font-medium block">{link.label}</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Newsletters enviados</p>
            {loadingNewsletters ? <Skeleton className="h-6 w-12 mt-2" /> : <p className="text-xl font-semibold mt-1">{sentNewsletters}</p>}
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Listas disponibles</p>
            {loadingLists ? <Skeleton className="h-6 w-12 mt-2" /> : <p className="text-xl font-semibold mt-1">{lists.length}</p>}
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Borradores de newsletter</p>
            {loadingCore ? <Skeleton className="h-6 w-12 mt-2" /> : <p className="text-xl font-semibold mt-1">{draftNewsletters}</p>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
