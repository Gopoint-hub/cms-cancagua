import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, RefreshCw, Copy, CalendarX, Plus,
  Sun, Moon, Ban, Calendar, Users, AlertTriangle,
} from "lucide-react";

// ─── Helpers de fecha ──────────────────────────────────────────
const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("es-CL", { month: "long", year: "numeric" });
};

const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, "0")}`;
};

const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, "0")}`;
};

const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

const getDay0 = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).getDay(); // 0=Dom
};

const TODAY = new Date().toISOString().slice(0, 10);

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const LEAVE_TYPES: Record<string, string> = {
  vacation: "Vacaciones",
  sick_leave: "Licencia médica",
  maternity: "Pre/Post natal",
  personal: "Permiso personal",
  other: "Otro",
};

const BLOCK_COLORS: Record<string, string> = {
  vacation: "bg-blue-100 text-blue-800 border-blue-200",
  sick_leave: "bg-red-100 text-red-800 border-red-200",
  maternity: "bg-pink-100 text-pink-800 border-pink-200",
  personal: "bg-orange-100 text-orange-800 border-orange-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

// ─── Selector de mes ───────────────────────────────────────────
function MonthSelector({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" onClick={() => onChange(prevMonth(month))}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="font-medium capitalize min-w-36 text-center">{monthLabel(month)}</span>
      <Button size="sm" variant="ghost" onClick={() => onChange(nextMonth(month))}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Celda de día ──────────────────────────────────────────────
function DayCell({
  dateStr,
  record,
  onClick,
}: {
  dateStr: string;
  record?: { isAvailable: number; startTime?: string | null; endTime?: string | null; shift?: string | null; blockType?: string | null };
  onClick: () => void;
}) {
  const day = parseInt(dateStr.slice(8, 10));
  const isToday = dateStr === TODAY;
  const isPast = dateStr < TODAY;

  let content: React.ReactNode = (
    <span className="text-muted-foreground text-xs">—</span>
  );
  let cellClass = "bg-muted/30 border border-dashed border-muted-foreground/20";

  if (record) {
    if (record.isAvailable === 0) {
      const color = record.blockType ? BLOCK_COLORS[record.blockType] ?? BLOCK_COLORS.other : "bg-red-100 text-red-700 border-red-200";
      cellClass = `border ${color}`;
      content = (
        <div className="flex flex-col items-center gap-0.5">
          <Ban className="w-3 h-3" />
          <span className="text-[10px] leading-tight truncate max-w-full">
            {record.blockType ? LEAVE_TYPES[record.blockType] ?? "Bloqueado" : "Bloqueado"}
          </span>
        </div>
      );
    } else if (record.shift === "am") {
      cellClass = "bg-amber-50 border border-amber-200 text-amber-800";
      content = (
        <div className="flex flex-col items-center gap-0.5">
          <Sun className="w-3 h-3" />
          <span className="text-[10px]">AM</span>
          {record.startTime && <span className="hidden text-[9px] text-amber-600 sm:inline">{record.startTime}–{record.endTime}</span>}
        </div>
      );
    } else if (record.shift === "pm") {
      cellClass = "bg-indigo-50 border border-indigo-200 text-indigo-800";
      content = (
        <div className="flex flex-col items-center gap-0.5">
          <Moon className="w-3 h-3" />
          <span className="text-[10px]">PM</span>
          {record.startTime && <span className="hidden text-[9px] text-indigo-600 sm:inline">{record.startTime}–{record.endTime}</span>}
        </div>
      );
    } else if (record.isAvailable === 1) {
      cellClass = "bg-green-50 border border-green-200 text-green-800";
      content = (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-medium">Disp.</span>
          {record.startTime && <span className="hidden text-[9px] text-green-600 sm:inline">{record.startTime}–{record.endTime}</span>}
        </div>
      );
    }
  }

  return (
    <button
      onClick={onClick}
      className={`relative min-h-[52px] w-full overflow-hidden rounded-lg p-1 text-center cursor-pointer transition-all hover:opacity-80 flex flex-col items-center justify-start gap-0.5 sm:min-h-[60px] sm:p-1.5 ${cellClass} ${isPast ? "opacity-50" : ""} ${isToday ? "ring-2 ring-primary" : ""}`}
    >
      <span className={`text-xs font-semibold ${isToday ? "text-primary" : ""}`}>{day}</span>
      {content}
    </button>
  );
}

// ─── Grilla mensual ────────────────────────────────────────────
function MonthGrid({
  month,
  availability,
  onDayClick,
}: {
  month: string;
  availability: Record<string, any>;
  onDayClick: (dateStr: string) => void;
}) {
  const total = daysInMonth(month);
  const firstDow = getDay0(month); // domingo=0
  const [y, m] = month.split("-").map(Number);

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-1">
        {DIAS_SEMANA.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: total }, (_, i) => {
          const day = i + 1;
          const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          return (
            <DayCell
              key={dateStr}
              dateStr={dateStr}
              record={availability[dateStr]}
              onClick={() => onDayClick(dateStr)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Modal edición de un día ────────────────────────────────────
type DayEditMode = "inhouse" | "freelance";

function DayEditDialog({
  open,
  onClose,
  dateStr,
  therapistId,
  therapistName,
  mode,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dateStr: string;
  therapistId: number;
  therapistName: string;
  mode: DayEditMode;
  existing?: any;
  onSaved: () => void;
}) {
  const utils = trpc.useUtils();
  const [type, setType] = useState<"available" | "blocked">(
    existing?.isAvailable === 0 ? "blocked" : "available"
  );
  const [shift, setShift] = useState<"am" | "pm">(existing?.shift ?? "am");
  const [startTime, setStartTime] = useState(existing?.startTime ?? "10:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "18:00");
  const [blockType, setBlockType] = useState<string>(existing?.blockType ?? "vacation");
  const [blockNotes, setBlockNotes] = useState(existing?.blockNotes ?? "");

  const upsertDay = trpc.masajes.disponibilidad.upsertDay.useMutation({
    onSuccess: () => { utils.masajes.disponibilidad.getMonth.invalidate(); onSaved(); onClose(); },
    onError: e => toast.error(e.message),
  });
  const deleteDay = trpc.masajes.disponibilidad.deleteDay.useMutation({
    onSuccess: () => { utils.masajes.disponibilidad.getMonth.invalidate(); onSaved(); onClose(); },
    onError: e => toast.error(e.message),
  });

  const handleSave = () => {
    if (type === "blocked") {
      upsertDay.mutate({
        therapistId,
        date: dateStr,
        isAvailable: 0,
        startTime: undefined,
        endTime: undefined,
        shift: undefined,
        blockType: blockType as any,
        blockNotes: blockNotes || undefined,
        autoGenerated: 0,
      });
    } else {
      const finalShift = mode === "inhouse" ? shift : undefined;
      const finalStart = mode === "inhouse"
        ? (shift === "am" ? "10:00" : "14:00")
        : startTime;
      const finalEnd = mode === "inhouse"
        ? (shift === "am" ? "18:00" : "22:00")
        : endTime;
      upsertDay.mutate({
        therapistId,
        date: dateStr,
        isAvailable: 1,
        startTime: finalStart,
        endTime: finalEnd,
        shift: finalShift,
        autoGenerated: 0,
      });
    }
  };

  const dayLabel = new Date(dateStr + "T12:00:00").toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="capitalize">{dayLabel}</DialogTitle>
          <p className="text-sm text-muted-foreground">{therapistName}</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button
              size="sm" variant={type === "available" ? "default" : "outline"}
              onClick={() => setType("available")} className="flex-1"
            >
              Disponible
            </Button>
            <Button
              size="sm" variant={type === "blocked" ? "destructive" : "outline"}
              onClick={() => setType("blocked")} className="flex-1"
            >
              Bloquear
            </Button>
          </div>

          {type === "available" && mode === "inhouse" && (
            <div className="space-y-2">
              <Label>Turno</Label>
              <div className="flex gap-2">
                <Button
                  size="sm" variant={shift === "am" ? "default" : "outline"}
                  onClick={() => setShift("am")} className="flex-1"
                >
                  <Sun className="w-3 h-3 mr-1" />AM (10:00–18:00)
                </Button>
                <Button
                  size="sm" variant={shift === "pm" ? "default" : "outline"}
                  onClick={() => setShift("pm")} className="flex-1"
                >
                  <Moon className="w-3 h-3 mr-1" />PM (14:00–22:00)
                </Button>
              </div>
            </div>
          )}

          {type === "available" && mode === "freelance" && (
            <div className="space-y-2">
              <Label>Horario disponible</Label>
              <div className="flex gap-2 items-center">
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full" />
                <span className="text-muted-foreground">–</span>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full" />
              </div>
            </div>
          )}

          {type === "blocked" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Tipo de bloqueo</Label>
                <Select value={blockType} onValueChange={setBlockType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAVE_TYPES).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Notas (opcional)</Label>
                <Input value={blockNotes} onChange={e => setBlockNotes(e.target.value)} placeholder="Motivo..." />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {existing && (
            <Button
              size="sm" variant="ghost"
              className="text-destructive mr-auto"
              onClick={() => deleteDay.mutate({ therapistId, date: dateStr })}
            >
              Quitar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={upsertDay.isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal para generar mes con rotación ───────────────────────
function RotationDialog({
  open,
  onClose,
  month,
  barbara,
  daniela,
}: {
  open: boolean;
  onClose: () => void;
  month: string;
  barbara: any;
  daniela: any;
}) {
  const utils = trpc.useUtils();
  const [barbaraShift, setBarbaraShift] = useState<"am" | "pm">("am");

  const generateMut = trpc.masajes.disponibilidad.generateMonthRotation.useMutation({
    onSuccess: (res) => {
      utils.masajes.disponibilidad.getMonth.invalidate();
      utils.masajes.disponibilidad.getAllForMonth.invalidate();
      toast.success(`Mes generado: ${res.generated} registros creados`);
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  if (!barbara || !daniela) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Generar mes con rotación</DialogTitle>
          <p className="text-sm text-muted-foreground capitalize">{monthLabel(month)}</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm">¿Qué turno trabaja <strong>{barbara.name}</strong> la primera semana de {monthLabel(month).split(" ")[0]}?</p>
          <div className="flex gap-2">
            <Button
              size="sm" variant={barbaraShift === "am" ? "default" : "outline"}
              onClick={() => setBarbaraShift("am")} className="flex-1"
            >
              <Sun className="w-3 h-3 mr-1" />AM (10:00–18:00)
            </Button>
            <Button
              size="sm" variant={barbaraShift === "pm" ? "default" : "outline"}
              onClick={() => setBarbaraShift("pm")} className="flex-1"
            >
              <Moon className="w-3 h-3 mr-1" />PM (14:00–22:00)
            </Button>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 space-y-1">
            <p><strong>{barbara.name}</strong>: semana 1 → {barbaraShift === "am" ? "AM" : "PM"}, semana 2 → {barbaraShift === "am" ? "PM" : "AM"}…</p>
            <p><strong>{daniela.name}</strong>: semana 1 → {barbaraShift === "am" ? "PM" : "AM"}, semana 2 → {barbaraShift === "am" ? "AM" : "PM"}…</p>
            <p className="text-amber-600 flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3" />Los días ya editados manualmente no se sobreescriben.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            onClick={() => generateMut.mutate({
              month,
              barbaraFirstWeekShift: barbaraShift,
              barbaraId: barbara.id,
              danielaId: daniela.id,
            })}
            disabled={generateMut.isPending}
          >
            <RefreshCw className="w-3 h-3 mr-1" />Generar mes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal agregar licencia/vacación ───────────────────────────
function LeaveDialog({
  open,
  onClose,
  therapistId,
  therapistName,
}: {
  open: boolean;
  onClose: () => void;
  therapistId: number;
  therapistName: string;
}) {
  const utils = trpc.useUtils();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState<string>("vacation");
  const [notes, setNotes] = useState("");

  const addLeave = trpc.masajes.disponibilidad.addLeave.useMutation({
    onSuccess: (res) => {
      utils.masajes.disponibilidad.getMonth.invalidate();
      utils.masajes.disponibilidad.getLeaves.invalidate();
      toast.success(`${res.blocked} días bloqueados y registrados en RRHH`);
      onClose();
      setStartDate(""); setEndDate(""); setNotes("");
    },
    onError: e => toast.error(e.message),
  });

  const handleSave = () => {
    if (!startDate || !endDate) { toast.error("Indica las fechas"); return; }
    if (startDate > endDate) { toast.error("La fecha inicio debe ser anterior al fin"); return; }
    addLeave.mutate({ therapistId, startDate, endDate, type: type as any, notes: notes || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Agregar licencia / vacación</DialogTitle>
          <p className="text-sm text-muted-foreground">{therapistName}</p>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LEAVE_TYPES).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Desde</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Hasta</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notas (opcional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Motivo, observaciones..." />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" />Se registra en RRHH y bloquea los días en el calendario.
          </p>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={addLeave.isPending}>
            <CalendarX className="w-3 h-3 mr-1" />Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Panel de un terapeuta inhouse ─────────────────────────────
function InhouseTherapistPanel({
  therapist,
  month,
  isRotating,
  showRotateButton,
  onRotateClick,
}: {
  therapist: any;
  month: string;
  isRotating: boolean;
  showRotateButton: boolean;
  onRotateClick?: () => void;
}) {
  const utils = trpc.useUtils();
  const [editDay, setEditDay] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const { data: rawAvail, isLoading } = trpc.masajes.disponibilidad.getMonth.useQuery({
    therapistId: therapist.id, month,
  });

  const availability = useMemo(() => {
    const map: Record<string, any> = {};
    (rawAvail ?? []).forEach(r => { if (r.date) map[r.date] = r; });
    return map;
  }, [rawAvail]);

  const copyPrev = trpc.masajes.disponibilidad.copyPreviousMonth.useMutation({
    onSuccess: (res) => {
      utils.masajes.disponibilidad.getMonth.invalidate();
      toast.success(res.copied > 0 ? `${res.copied} días copiados del mes anterior` : "No había días nuevos que copiar");
    },
    onError: () => { /* sin error si no hay mes anterior */ },
  });

  const setAutoFill = trpc.masajes.disponibilidad.setAutoFill.useMutation({
    onSuccess: () => utils.masajes.terapeutas.getAll.invalidate(),
  });

  const hasDaysThisMonth = Object.keys(availability).length > 0;
  const autoFill = therapist.autoFillMonth === 1;

  // Auto-copiar solo una vez al cargar, si no hay datos y el flag está activo
  const autoCopiedRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${therapist.id}-${month}`;
    if (!hasDaysThisMonth && autoFill && !isLoading && rawAvail !== undefined && autoCopiedRef.current !== key && !copyPrev.isPending) {
      autoCopiedRef.current = key;
      copyPrev.mutate({ therapistId: therapist.id, month });
    }
  }, [hasDaysThisMonth, autoFill, isLoading, rawAvail, therapist.id, month]);

  const editingRecord = editDay ? availability[editDay] : undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">{therapist.name}</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {showRotateButton ? (
              <Button size="sm" variant="outline" onClick={onRotateClick}>
                <RefreshCw className="w-3 h-3 mr-1" />Generar con rotación
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Auto-copiar mes anterior</Label>
                <Switch
                  checked={autoFill}
                  onCheckedChange={v => setAutoFill.mutate({ therapistId: therapist.id, autoFillMonth: v ? 1 : 0 })}
                />
                {!autoFill && (
                  <Button size="sm" variant="outline" onClick={() => copyPrev.mutate({ therapistId: therapist.id, month })} disabled={copyPrev.isPending}>
                    <Copy className="w-3 h-3 mr-1" />Copiar mes anterior
                  </Button>
                )}
              </div>
            )}
            <Button size="sm" variant="ghost" onClick={() => setLeaveOpen(true)}>
              <CalendarX className="w-3 h-3 mr-1" />Licencia
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading
          ? <Skeleton className="h-48 w-full" />
          : (
            <MonthGrid
              month={month}
              availability={availability}
              onDayClick={d => setEditDay(d)}
            />
          )
        }
      </CardContent>

      {editDay && (
        <DayEditDialog
          open={!!editDay}
          onClose={() => setEditDay(null)}
          dateStr={editDay}
          therapistId={therapist.id}
          therapistName={therapist.name}
          mode="inhouse"
          existing={editingRecord}
          onSaved={() => setEditDay(null)}
        />
      )}

      <LeaveDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        therapistId={therapist.id}
        therapistName={therapist.name}
      />
    </Card>
  );
}

// ─── Panel de un terapeuta freelance ───────────────────────────
function FreelanceTherapistPanel({ therapist, month }: { therapist: any; month: string }) {
  const utils = trpc.useUtils();
  const [editDay, setEditDay] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const { data: rawAvail, isLoading } = trpc.masajes.disponibilidad.getMonth.useQuery({
    therapistId: therapist.id, month,
  });

  const availability = useMemo(() => {
    const map: Record<string, any> = {};
    (rawAvail ?? []).forEach(r => { if (r.date) map[r.date] = r; });
    return map;
  }, [rawAvail]);

  const { data: leaves } = trpc.masajes.disponibilidad.getLeaves.useQuery({ therapistId: therapist.id });
  const deleteLeave = trpc.masajes.disponibilidad.deleteLeave.useMutation({
    onSuccess: () => { utils.masajes.disponibilidad.getMonth.invalidate(); utils.masajes.disponibilidad.getLeaves.invalidate(); toast.success("Licencia eliminada"); },
    onError: e => toast.error(e.message),
  });

  const editingRecord = editDay ? availability[editDay] : undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">{therapist.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Aviso mínimo: {(therapist.leadTimeMinutes ?? 120) / 60}h</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setLeaveOpen(true)}>
            <CalendarX className="w-3 h-3 mr-1" />Licencia
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading
          ? <Skeleton className="h-48 w-full" />
          : (
            <MonthGrid
              month={month}
              availability={availability}
              onDayClick={d => setEditDay(d)}
            />
          )
        }

        {/* Historial de licencias */}
        {(leaves ?? []).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Licencias registradas</p>
            {(leaves ?? []).slice(0, 5).map(l => (
              <div key={l.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2">
                <span>{LEAVE_TYPES[l.type] ?? l.type}: {l.startDate} → {l.endDate}</span>
                <Button
                  size="sm" variant="ghost" className="h-5 text-destructive hover:text-destructive px-1"
                  onClick={() => { if (confirm("¿Eliminar esta licencia y desbloquear los días?")) deleteLeave.mutate({ leaveId: l.id }); }}
                >×</Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {editDay && (
        <DayEditDialog
          open={!!editDay}
          onClose={() => setEditDay(null)}
          dateStr={editDay}
          therapistId={therapist.id}
          therapistName={therapist.name}
          mode="freelance"
          existing={editingRecord}
          onSaved={() => setEditDay(null)}
        />
      )}

      <LeaveDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        therapistId={therapist.id}
        therapistName={therapist.name}
      />
    </Card>
  );
}

// ─── Vista resumen (todos los terapeutas en paralelo) ──────────
function ResumenView({ month }: { month: string }) {
  const { data: rows, isLoading } = trpc.masajes.disponibilidad.getAllForMonth.useQuery({ month });
  const { data: therapists } = trpc.masajes.terapeutas.getAll.useQuery();

  const byTherapist = useMemo(() => {
    const map: Record<number, Record<string, any>> = {};
    (rows ?? []).forEach(r => {
      if (!map[r.therapistId]) map[r.therapistId] = {};
      if (r.date) map[r.therapistId][r.date] = r;
    });
    return map;
  }, [rows]);

  const activeTherapists = therapists ?? [];
  const total = daysInMonth(month);
  const [y, m] = month.split("-").map(Number);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background text-left py-1 px-2 font-medium text-muted-foreground border-b min-w-32">Terapeuta</th>
            {Array.from({ length: total }, (_, i) => {
              const day = i + 1;
              const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dow = new Date(dateStr + "T12:00:00").getDay();
              const isWeekend = dow === 0;
              return (
                <th key={dateStr} className={`text-center py-1 px-0.5 border-b font-normal min-w-[32px] ${isWeekend ? "bg-muted/20 text-muted-foreground" : ""} ${dateStr === TODAY ? "bg-primary/10 text-primary font-semibold" : ""}`}>
                  <div>{day}</div>
                  <div className="text-[9px]">{DIAS_SEMANA[dow]}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {activeTherapists.map(t => (
            <tr key={t.id} className="border-b">
              <td className="sticky left-0 bg-background py-1.5 px-2 font-medium border-r">
                <div className="flex items-center gap-1">
                  <span>{t.name}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                    {t.type === "inhouse" ? "In" : "FL"}
                  </Badge>
                </div>
              </td>
              {Array.from({ length: total }, (_, i) => {
                const day = i + 1;
                const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const rec = byTherapist[t.id]?.[dateStr];
                const dow = new Date(dateStr + "T12:00:00").getDay();
                const isWeekend = dow === 0;

                let cellContent = <span className="text-muted-foreground/30">·</span>;
                let cellClass = isWeekend ? "bg-muted/10" : "";

                if (rec) {
                  if (rec.isAvailable === 0) {
                    cellClass = "bg-red-50";
                    cellContent = <Ban className="w-3 h-3 text-red-400 mx-auto" />;
                  } else if (rec.shift === "am") {
                    cellClass = "bg-amber-50";
                    cellContent = <Sun className="w-3 h-3 text-amber-500 mx-auto" />;
                  } else if (rec.shift === "pm") {
                    cellClass = "bg-indigo-50";
                    cellContent = <Moon className="w-3 h-3 text-indigo-500 mx-auto" />;
                  } else if (rec.isAvailable === 1) {
                    cellClass = "bg-green-50";
                    cellContent = <span className="text-green-600 font-bold">✓</span>;
                  }
                }

                return (
                  <td key={dateStr} className={`text-center py-1 px-0.5 ${cellClass} ${dateStr === TODAY ? "ring-1 ring-inset ring-primary/30" : ""}`}>
                    {cellContent}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-amber-500" /> Turno AM</span>
        <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-indigo-500" /> Turno PM</span>
        <span className="flex items-center gap-1 text-green-600 font-bold">✓ <span>Disponible</span></span>
        <span className="flex items-center gap-1"><Ban className="w-3 h-3 text-red-400" /> Bloqueado</span>
        <span className="text-muted-foreground/50">· Sin registro</span>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────
export default function Disponibilidad() {
  const todayMonth = TODAY.slice(0, 7);
  const [month, setMonth] = useState(todayMonth);
  const [rotationOpen, setRotationOpen] = useState(false);

  const { data: therapists, isLoading } = trpc.masajes.terapeutas.getAll.useQuery();

  const inhouse = (therapists ?? []).filter(t => t.type === "inhouse");
  const freelance = (therapists ?? []).filter(t => t.type === "freelance");

  // Barbara y Daniela: inhouse no-manager (las dos que rotan)
  const rotating = inhouse.filter(t => !t.isManager);
  const fixed = inhouse.filter(t => !!t.isManager);
  const barbara = rotating[0];
  const daniela = rotating[1];

  if (isLoading) return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Calendario de Disponibilidades</h2>
          <p className="text-sm text-muted-foreground">Gestiona el horario mensual de cada terapeuta</p>
        </div>
        <MonthSelector month={month} onChange={setMonth} />
      </div>

      <Tabs defaultValue="inhouse">
        <TabsList>
          <TabsTrigger value="inhouse">
            <Users className="w-3 h-3 mr-1" />Inhouse ({inhouse.length})
          </TabsTrigger>
          <TabsTrigger value="freelance">
            Freelance ({freelance.length})
          </TabsTrigger>
          <TabsTrigger value="resumen">
            <Calendar className="w-3 h-3 mr-1" />Resumen general
          </TabsTrigger>
        </TabsList>

        {/* ── Tab Inhouse ── */}
        <TabsContent value="inhouse" className="mt-4 space-y-4">
          {inhouse.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">Sin terapeutas inhouse activos</p>
          )}

          {/* Terapeutas con horario fijo (Tamara) */}
          {fixed.map(t => (
            <InhouseTherapistPanel
              key={t.id}
              therapist={t}
              month={month}
              isRotating={false}
              showRotateButton={false}
            />
          ))}

          {/* Terapeutas con rotación (Barbara y Daniela) */}
          {rotating.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Terapeutas con turno rotativo</h3>
                {barbara && daniela && (
                  <Button size="sm" variant="outline" onClick={() => setRotationOpen(true)}>
                    <RefreshCw className="w-3 h-3 mr-1" />Generar mes con rotación
                  </Button>
                )}
              </div>
              {rotating.map(t => (
                <InhouseTherapistPanel
                  key={t.id}
                  therapist={t}
                  month={month}
                  isRotating={true}
                  showRotateButton={false}
                />
              ))}
            </>
          )}
        </TabsContent>

        {/* ── Tab Freelance ── */}
        <TabsContent value="freelance" className="mt-4 space-y-4">
          {freelance.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">Sin terapeutas freelance activos</p>
          )}
          {freelance
            .sort((a, b) => (a.callPriority ?? 99) - (b.callPriority ?? 99))
            .map(t => (
              <FreelanceTherapistPanel key={t.id} therapist={t} month={month} />
            ))}
        </TabsContent>

        {/* ── Tab Resumen ── */}
        <TabsContent value="resumen" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base capitalize">Vista general — {monthLabel(month)}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResumenView month={month} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo de rotación Barbara/Daniela */}
      {barbara && daniela && (
        <RotationDialog
          open={rotationOpen}
          onClose={() => setRotationOpen(false)}
          month={month}
          barbara={barbara}
          daniela={daniela}
        />
      )}
    </div>
  );
}
