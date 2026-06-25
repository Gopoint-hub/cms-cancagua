import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Bell, Calendar, Upload, Edit, Plus, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface CalendarEvent {
  id: number;
  date: string;
  title: string;
  type: "newsletter" | "personal" | "social" | "otro";
  audience?: string | null;
  subject?: string | null;
  notes?: string | null;
  status: "pending" | "done" | "cancelled";
  htmlTemplate?: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  newsletter: "bg-purple-100 text-purple-800 border-purple-200",
  personal: "bg-blue-100 text-blue-800 border-blue-200",
  social: "bg-pink-100 text-pink-800 border-pink-200",
  otro: "bg-gray-100 text-gray-800 border-gray-200",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

function getWeekDates(startDate: Date, count = 28): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function formatDate(d: string) {
  const date = new Date(d + "T12:00:00");
  return date.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}

export default function CalendarioMarketing() {
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [viewDate, setViewDate] = useState("2026-06-23");
  const [templateDraft, setTemplateDraft] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const { data: events = [], isLoading, refetch } = trpc.marketing.listCalendarEvents.useQuery();
  const createMutation = trpc.marketing.createCalendarEvent.useMutation({
    onSuccess: () => {
      refetch();
      setEditing(null);
      toast.success("Evento creado");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.marketing.updateCalendarEvent.useMutation({
    onSuccess: () => {
      refetch();
      setEditing(null);
      toast.success("Evento actualizado");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.marketing.deleteCalendarEvent.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Evento eliminado");
    },
    onError: (e) => toast.error(e.message),
  });

  const todayEvents = events.filter((e) => e.date === today && e.status === "pending");

  const startDate = new Date(viewDate + "T12:00:00");
  const dates = getWeekDates(startDate, 28);

  const eventsForDate = (d: string) => events.filter((e) => e.date === d);

  const openNew = (date?: string) => {
    setEditing({
      id: 0,
      date: date || today,
      title: "",
      type: "newsletter",
      audience: "",
      subject: "",
      notes: "",
      status: "pending",
      htmlTemplate: "",
    });
    setTemplateDraft("");
    setIsNew(true);
  };

  const openEdit = (e: CalendarEvent) => {
    setEditing({ ...e });
    setTemplateDraft(e.htmlTemplate || "");
    setIsNew(false);
  };

  const saveEditing = () => {
    if (!editing) return;
    const upd = {
      ...editing,
      audience: editing.audience || undefined,
      subject: editing.subject || undefined,
      notes: editing.notes || undefined,
      htmlTemplate: templateDraft || undefined,
    };
    if (isNew) {
      const { id, ...payload } = upd;
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate(upd);
    }
  };

  const deleteEvent = (id: number) => {
    deleteMutation.mutate({ id });
  };

  const handleTemplateUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      setTemplateDraft(ev.target?.result as string);
      toast.success(`Template cargado: ${file.name}`);
    };
    reader.readAsText(file);
  };

  const prevMonth = () => {
    const d = new Date(viewDate + "T12:00:00");
    d.setDate(d.getDate() - 28);
    setViewDate(d.toISOString().split("T")[0]);
  };
  const nextMonth = () => {
    const d = new Date(viewDate + "T12:00:00");
    d.setDate(d.getDate() + 28);
    setViewDate(d.toISOString().split("T")[0]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Calendar className="h-6 w-6" />
              Calendario de Marketing
            </h1>
            <p className="text-muted-foreground">Plan editorial de campañas email</p>
          </div>
          <Button onClick={() => openNew()} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva tarea
          </Button>
        </div>

        {todayEvents.length > 0 && (
          <Card className="border-amber-400 bg-amber-50">
            <CardContent className="pt-4 flex items-center gap-3">
              <Bell className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">
                  {todayEvents.length === 1
                    ? "Tienes 1 tarea de email para hoy"
                    : `Tienes ${todayEvents.length} tareas de email para hoy`}
                </p>
                <p className="text-sm text-amber-700">
                  {todayEvents.map((e) => e.title).join(" · ")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-40 text-center">
            {formatDate(dates[0])} — {formatDate(dates[27])}
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setViewDate(today)}>
            Hoy
          </Button>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-7 gap-1">
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
              <div key={d} className="text-xs font-medium text-center text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {[0, 1, 2, 3].map((week) => (
            <div key={week} className="grid grid-cols-7 gap-1">
              {dates.slice(week * 7, week * 7 + 7).map((date) => {
                const dayEvents = eventsForDate(date);
                const isToday = date === today;
                const dayNum = new Date(date + "T12:00:00").getDate();

                return (
                  <div
                    key={date}
                    className={`min-h-24 rounded-lg border p-1.5 cursor-pointer hover:border-primary/50 transition-colors ${
                      isToday ? "border-primary bg-primary/5" : "border-border bg-background"
                    }`}
                    onClick={() => openNew(date)}
                  >
                    <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {dayNum}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className={`text-xs px-1 py-0.5 rounded border truncate cursor-pointer hover:opacity-80 ${TYPE_COLORS[ev.type]}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(ev);
                          }}
                          title={ev.title}
                        >
                          {ev.status === "done" ? "✓ " : ""}{ev.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Cargando calendario...
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-base font-semibold">Todas las campañas</h2>
          <div className="space-y-2">
            {events
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((ev) => (
                <Card key={ev.id} className={ev.date === today ? "border-primary/40" : ""}>
                  <CardContent className="py-3 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatDate(ev.date)}
                        </span>
                        <Badge variant="outline" className={`text-xs ${TYPE_COLORS[ev.type]}`}>
                          {ev.type}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[ev.status]}`}>
                          {ev.status === "pending" ? "Pendiente" : ev.status === "done" ? "Enviado" : "Cancelado"}
                        </Badge>
                        {ev.date === today && (
                          <Badge className="text-xs bg-amber-500">HOY</Badge>
                        )}
                      </div>
                      <p className="font-medium text-sm mt-0.5 truncate">{ev.title}</p>
                      <p className="text-xs text-muted-foreground">{ev.audience}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ev)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                        onClick={() => deleteEvent(ev.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {isNew ? "Nueva tarea de marketing" : "Editar tarea"}
              </DialogTitle>
            </DialogHeader>

            {editing && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Fecha</Label>
                    <Input
                      type="date"
                      value={editing.date}
                      onChange={(e) => setEditing((prev) => prev ? { ...prev, date: e.target.value } : prev)}
                    />
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select
                      value={editing.type}
                      onValueChange={(v: any) => setEditing((prev) => prev ? { ...prev, type: v } : prev)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newsletter">Newsletter</SelectItem>
                        <SelectItem value="personal">Email personal</SelectItem>
                        <SelectItem value="social">Redes sociales</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Título</Label>
                  <Input
                    value={editing.title}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, title: e.target.value } : prev)}
                    placeholder="Ej: Newsletter bienvenida VIP"
                  />
                </div>
                <div>
                  <Label>Audiencia / Lista</Label>
                  <Input
                    value={editing.audience || ""}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, audience: e.target.value } : prev)}
                    placeholder="Ej: B2C-VIP, Loyal"
                  />
                </div>
                <div>
                  <Label>Asunto del email</Label>
                  <Input
                    value={editing.subject || ""}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, subject: e.target.value } : prev)}
                    placeholder="Asunto del email"
                  />
                </div>
                <div>
                  <Label>Notas</Label>
                  <Textarea
                    value={editing.notes || ""}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, notes: e.target.value } : prev)}
                    rows={3}
                    placeholder="Notas, instrucciones, links..."
                  />
                </div>
                <div>
                  <Label>Estado</Label>
                  <Select
                    value={editing.status}
                    onValueChange={(v: any) => setEditing((prev) => prev ? { ...prev, status: v } : prev)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="done">Enviado / Listo</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Template HTML (opcional)</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".html,.htm"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleTemplateUpload(f);
                        }}
                      />
                      <Button variant="outline" size="sm" className="gap-2" asChild>
                        <span><Upload className="h-3.5 w-3.5" /> Cargar HTML</span>
                      </Button>
                    </label>
                    {templateDraft && <span className="text-xs text-green-600">Template cargado ✓</span>}
                    {templateDraft && (
                      <Button variant="ghost" size="sm" className="text-xs text-red-500 h-7" onClick={() => setTemplateDraft("")}>
                        Quitar
                      </Button>
                    )}
                  </div>
                  {templateDraft && (
                    <div className="mt-2 h-32 overflow-hidden rounded border">
                      <iframe
                        srcDoc={templateDraft}
                        className="w-full h-full scale-50 origin-top-left"
                        style={{ width: "200%", height: "200%" }}
                        sandbox="allow-same-origin"
                        title="Template preview"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={saveEditing}>{isNew ? "Crear" : "Guardar cambios"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
