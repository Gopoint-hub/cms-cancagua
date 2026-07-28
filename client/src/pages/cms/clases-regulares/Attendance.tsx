import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";
import { clp, RegularClassesHeader, todayString } from "./shared";

type ViewMode = "day" | "week" | "month";

type AttendanceSession = {
  id: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "completed" | "cancelled";
  disciplineId: number;
  disciplineName: string;
  capacity: number | null;
  teacherId: number;
  teacherName: string;
  teacherColor: string;
  attendanceCount: number;
};

const parseDate = (value: string) => new Date(`${value}T12:00:00`);
const dateKey = (value: Date) => format(value, "yyyy-MM-dd");
const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

function rangeFor(view: ViewMode, anchor: Date) {
  if (view === "day") {
    const key = dateKey(anchor);
    return { from: key, to: key };
  }
  if (view === "week") {
    return {
      from: dateKey(startOfWeek(anchor, { weekStartsOn: 1 })),
      to: dateKey(endOfWeek(anchor, { weekStartsOn: 1 })),
    };
  }
  return {
    from: dateKey(startOfMonth(anchor)),
    to: dateKey(endOfMonth(anchor)),
  };
}

function periodTitle(view: ViewMode, anchor: Date) {
  if (view === "day") {
    return capitalize(format(anchor, "EEEE d 'de' MMMM yyyy", { locale: es }));
  }
  if (view === "week") {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const end = endOfWeek(anchor, { weekStartsOn: 1 });
    return `${format(start, "d MMM", { locale: es })} — ${format(end, "d MMM yyyy", { locale: es })}`;
  }
  return capitalize(format(anchor, "MMMM yyyy", { locale: es }));
}

function SessionAttendanceCard({
  session,
  onNewStudent,
}: {
  session: AttendanceSession;
  onNewStudent: (sessionId: number) => void;
}) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(
    new Set()
  );
  const roster = trpc.regularClasses.attendance.roster.useQuery(
    { sessionId: session.id },
    { retry: 1 }
  );
  const mark = trpc.regularClasses.attendance.mark.useMutation();

  const initialStudents = useMemo(
    () =>
      new Set(
        roster.data?.students
          .filter(
            student =>
              student.attendance?.status === "present" ||
              student.attendance?.status === "pending_payment"
          )
          .map(student => student.id) ?? []
      ),
    [roster.data]
  );

  useEffect(() => {
    setSelectedStudents(new Set(initialStudents));
  }, [initialStudents]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (
      roster.data?.students.filter(
        student =>
          !query ||
          `${student.firstName} ${student.lastName ?? ""}`
            .toLowerCase()
            .includes(query) ||
          student.email?.toLowerCase().includes(query) ||
          student.phone?.includes(query)
      ) ?? []
    );
  }, [roster.data, search]);

  const changedStudentIds = useMemo(() => {
    const ids = roster.data?.students.map(student => student.id) ?? [];
    return ids.filter(
      id => selectedStudents.has(id) !== initialStudents.has(id)
    );
  }, [initialStudents, roster.data, selectedStudents]);

  const toggleStudent = (studentId: number, checked: boolean) => {
    setSelectedStudents(current => {
      const next = new Set(current);
      if (checked) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
  };

  const confirmAttendance = async () => {
    if (!changedStudentIds.length) {
      toast.info("La asistencia ya está actualizada");
      return;
    }
    try {
      let pendingPayment = 0;
      for (const studentId of changedStudentIds) {
        const result = await mark.mutateAsync({
          sessionId: session.id,
          studentId,
          present: selectedStudents.has(studentId),
        });
        if (result.status === "pending_payment") pendingPayment += 1;
      }
      await Promise.all([
        utils.regularClasses.attendance.roster.invalidate({
          sessionId: session.id,
        }),
        utils.regularClasses.attendance.sessions.invalidate(),
      ]);
      toast.success(
        pendingPayment
          ? `Asistencia guardada · ${pendingPayment} alumno(s) pendiente(s) de pago`
          : "Asistencia guardada"
      );
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo guardar la asistencia");
    }
  };

  const denominator = session.capacity ? ` / ${session.capacity}` : "";

  return (
    <Card
      className="overflow-hidden border-0 shadow-[0_18px_45px_rgba(42,39,35,0.10)]"
      style={{ borderTop: `4px solid ${session.teacherColor}` }}
    >
      <CardHeader className="space-y-4 border-b bg-white px-5 pb-4 pt-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-xl text-stone-900">
              {session.disciplineName}
            </h3>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-stone-500">
              {format(parseDate(session.sessionDate), "EEEE", { locale: es })} ·{" "}
              {session.startTime}–{session.endTime}
            </p>
            <p className="mt-1 text-xs text-stone-500">{session.teacherName}</p>
          </div>
          <p
            className="whitespace-nowrap text-xs uppercase tracking-[0.16em]"
            style={{ color: session.teacherColor }}
          >
            {selectedStudents.size}
            {denominator} presentes
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar alumno por nombre, correo o teléfono"
            className="border-stone-200 bg-stone-50 pl-9"
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {roster.isLoading && (
          <div className="flex min-h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
          </div>
        )}
        {roster.isError && (
          <div className="m-5 space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p>No pudimos cargar los alumnos: {roster.error.message}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => roster.refetch()}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Reintentar
            </Button>
          </div>
        )}
        {roster.isSuccess && (
          <ScrollArea className="max-h-[390px]">
            <div className="divide-y">
              {filteredStudents.map(student => {
                const checked = selectedStudents.has(student.id);
                const pending =
                  !student.membership ||
                  student.membership.paymentStatus !== "paid" ||
                  student.membership.creditsRemaining <= 0;
                return (
                  <label
                    key={student.id}
                    className="flex min-h-16 cursor-pointer items-center gap-3 px-5 py-3 transition hover:bg-stone-50 sm:px-6"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={value =>
                        toggleStudent(student.id, value === true)
                      }
                      disabled={mark.isPending}
                      className="h-6 w-6 rounded-lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-stone-800">
                        {student.firstName} {student.lastName}
                      </span>
                      {pending && (
                        <span className="mt-0.5 block text-xs text-amber-700">
                          {!student.membership
                            ? "Sin plan activo"
                            : student.membership.paymentStatus !== "paid"
                              ? "Pago pendiente"
                              : "Sin créditos disponibles"}
                        </span>
                      )}
                    </span>
                    <span className="text-xs uppercase tracking-[0.15em] text-stone-400">
                      {student.membership?.planCode === "drop_in"
                        ? "Suelta"
                        : (student.membership?.planCode ?? "—")}
                    </span>
                  </label>
                );
              })}
              {!filteredStudents.length && (
                <p className="px-5 py-10 text-center text-sm text-stone-500">
                  No encontramos alumnos con esa búsqueda.
                </p>
              )}
            </div>
          </ScrollArea>
        )}

        <div className="space-y-3 border-t bg-stone-50/70 p-4 sm:p-5">
          <Button
            variant="outline"
            className="w-full justify-start border-stone-200 bg-white text-stone-600"
            onClick={() => onNewStudent(session.id)}
          >
            <UserRoundPlus className="mr-2 h-4 w-4" /> Alumno nuevo que llegó a
            esta clase
          </Button>
          <Button
            className="w-full bg-stone-900 uppercase tracking-[0.18em] hover:bg-stone-800"
            onClick={confirmAttendance}
            disabled={mark.isPending || roster.isLoading}
          >
            {mark.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Confirmar asistencia
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeekView({
  anchor,
  sessions,
  onOpenDay,
}: {
  anchor: Date;
  sessions: AttendanceSession[];
  onOpenDay: (date: Date) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(anchor, { weekStartsOn: 1 }),
    end: endOfWeek(anchor, { weekStartsOn: 1 }),
  });

  return (
    <div className="overflow-x-auto pb-3">
      <div className="grid min-w-[980px] grid-cols-7 gap-3">
        {days.map(day => {
          const key = dateKey(day);
          const daySessions = sessions.filter(
            session => session.sessionDate === key
          );
          return (
            <Card
              key={key}
              className={`min-h-[250px] border-stone-200 ${isSameDay(day, new Date()) ? "ring-2 ring-slate-500" : ""}`}
            >
              <CardHeader className="border-b p-3 text-center">
                <p className="text-xs uppercase tracking-[0.16em] text-stone-500">
                  {format(day, "EEE", { locale: es })}
                </p>
                <p className="font-serif text-xl">{format(day, "d")}</p>
              </CardHeader>
              <CardContent className="space-y-2 p-2">
                {daySessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => onOpenDay(day)}
                    className="w-full rounded-lg border bg-white p-2 text-left text-xs transition hover:-translate-y-0.5 hover:shadow-sm"
                    style={{ borderLeft: `4px solid ${session.teacherColor}` }}
                  >
                    <span className="block font-medium text-stone-800">
                      {session.disciplineName}
                    </span>
                    <span className="mt-1 block text-stone-500">
                      {session.startTime} · {session.teacherName}
                    </span>
                    <span className="mt-2 block uppercase tracking-[0.12em] text-stone-400">
                      {session.attendanceCount} presentes
                    </span>
                  </button>
                ))}
                {!daySessions.length && (
                  <p className="py-8 text-center text-xs text-stone-400">
                    Sin clases
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({
  anchor,
  sessions,
  onOpenDay,
}: {
  anchor: Date;
  sessions: AttendanceSession[];
  onOpenDay: (date: Date) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(anchor);
  useEffect(() => setSelectedDate(anchor), [anchor]);

  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const selectedSessions = sessions.filter(
    session => session.sessionDate === dateKey(selectedDate)
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1.45fr_0.9fr]">
      <Card className="border-0 shadow-[0_14px_40px_rgba(42,39,35,0.08)]">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-3 grid grid-cols-7 text-center text-[11px] uppercase tracking-[0.16em] text-stone-400">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(day => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map(day => {
              const key = dateKey(day);
              const daySessions = sessions.filter(
                session => session.sessionDate === key
              );
              const selected = isSameDay(day, selectedDate);
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-20 rounded-xl p-2 text-left transition sm:min-h-24 ${
                    selected
                      ? "bg-slate-700 text-white"
                      : isSameMonth(day, anchor)
                        ? "bg-stone-100 hover:bg-stone-200"
                        : "bg-stone-50 text-stone-300"
                  }`}
                >
                  <span className="text-sm">{format(day, "d")}</span>
                  <span className="mt-3 flex flex-wrap gap-1">
                    {daySessions.slice(0, 5).map(session => (
                      <span
                        key={session.id}
                        className="h-2 w-2 rounded-full border border-white/60"
                        style={{ backgroundColor: session.teacherColor }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-[0_14px_40px_rgba(42,39,35,0.08)]">
        <CardHeader className="border-b">
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone-400">
            Clases del día
          </p>
          <h3 className="font-serif text-2xl">
            {capitalize(format(selectedDate, "EEEE d", { locale: es }))}
          </h3>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {selectedSessions.map(session => (
            <button
              key={session.id}
              onClick={() => onOpenDay(selectedDate)}
              className="w-full rounded-xl border p-4 text-left transition hover:bg-stone-50"
              style={{ borderLeft: `4px solid ${session.teacherColor}` }}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-medium">
                    {session.disciplineName}
                  </span>
                  <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-stone-500">
                    {session.startTime}–{session.endTime} ·{" "}
                    {session.teacherName}
                  </span>
                </span>
                <span className="text-xs uppercase tracking-[0.14em] text-slate-600">
                  Corregir
                </span>
              </span>
              <span className="mt-3 block text-xs uppercase tracking-[0.14em] text-stone-400">
                {session.attendanceCount} asistencias registradas
              </span>
            </button>
          ))}
          {!selectedSessions.length && (
            <p className="py-12 text-center text-sm text-stone-500">
              No hay clases programadas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegularClassesAttendance() {
  const utils = trpc.useUtils();
  const today = parseDate(todayString());
  const [view, setView] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState(today);
  const [teacherFilter, setTeacherFilter] = useState<number | null>(null);
  const [newStudentSessionId, setNewStudentSessionId] = useState<number | null>(
    null
  );
  const [newStudent, setNewStudent] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    communicationsConsent: true,
  });
  const range = rangeFor(view, anchor);
  const sessions = trpc.regularClasses.attendance.sessions.useQuery(range, {
    retry: 1,
  });
  const access = trpc.regularClasses.access.useQuery();
  const teachers = trpc.regularClasses.teachers.list.useQuery();
  const plans = trpc.regularClasses.plans.list.useQuery();
  const markNewStudent = trpc.regularClasses.attendance.mark.useMutation();
  const createStudent = trpc.regularClasses.students.create.useMutation({
    onSuccess: async result => {
      if (newStudentSessionId) {
        await markNewStudent.mutateAsync({
          sessionId: newStudentSessionId,
          studentId: result.id,
          present: true,
        });
      }
      toast.success("Alumno registrado; su asistencia quedó pendiente de pago");
      setNewStudentSessionId(null);
      setNewStudent({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        communicationsConsent: true,
      });
      await Promise.all([
        utils.regularClasses.attendance.roster.invalidate(),
        utils.regularClasses.attendance.sessions.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });

  const visibleSessions = useMemo(() => {
    const rows = sessions.data as AttendanceSession[] | undefined;
    return (
      rows?.filter(
        session => !teacherFilter || session.teacherId === teacherFilter
      ) ?? []
    );
  }, [sessions.data, teacherFilter]);

  const daySessions = visibleSessions.filter(
    session => session.sessionDate === dateKey(anchor)
  );

  const move = (direction: -1 | 1) => {
    setAnchor(current => {
      if (view === "day") return addDays(current, direction);
      if (view === "week") return addWeeks(current, direction);
      return addMonths(current, direction);
    });
  };

  const openDay = (date: Date) => {
    setAnchor(date);
    setView("day");
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#f6f4f1] p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <RegularClassesHeader
            title="Marcar asistencia"
            description="Hoy aparece primero. También puedes revisar la semana o corregir días anteriores desde el mes."
          />

          <Card className="border-stone-200 bg-white/90">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="flex flex-wrap items-center gap-2">
                  {(["day", "week", "month"] as ViewMode[]).map(mode => (
                    <Button
                      key={mode}
                      size="sm"
                      variant={view === mode ? "default" : "outline"}
                      className={
                        view === mode ? "bg-stone-900 hover:bg-stone-800" : ""
                      }
                      onClick={() => setView(mode)}
                    >
                      {mode === "day"
                        ? "Día"
                        : mode === "week"
                          ? "Semana"
                          : "Mes"}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAnchor(today)}
                  >
                    Hoy
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => move(-1)}
                    aria-label="Período anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-52 text-center">
                    <p className="font-serif text-lg text-stone-900">
                      {periodTitle(view, anchor)}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400">
                      {visibleSessions.length}{" "}
                      {visibleSessions.length === 1 ? "clase" : "clases"}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => move(1)}
                    aria-label="Período siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {access.data?.isAdmin && (teachers.data?.length ?? 0) > 1 && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  <span className="mr-1 text-[10px] uppercase tracking-[0.2em] text-stone-400">
                    Profesor
                  </span>
                  <Button
                    size="sm"
                    variant={teacherFilter == null ? "default" : "outline"}
                    className={`rounded-full ${teacherFilter == null ? "bg-stone-900 hover:bg-stone-800" : ""}`}
                    onClick={() => setTeacherFilter(null)}
                  >
                    Todos
                  </Button>
                  {teachers.data?.map(teacher => (
                    <Button
                      key={teacher.id}
                      size="sm"
                      variant={
                        teacherFilter === teacher.id ? "default" : "outline"
                      }
                      className="rounded-full"
                      style={
                        teacherFilter === teacher.id
                          ? { backgroundColor: teacher.color }
                          : undefined
                      }
                      onClick={() => setTeacherFilter(teacher.id)}
                    >
                      <span
                        className="mr-2 h-2 w-2 rounded-full"
                        style={{ backgroundColor: teacher.color }}
                      />
                      {teacher.name.split(" ")[0]}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {sessions.isLoading && (
            <div className="flex min-h-80 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-stone-400" />
            </div>
          )}
          {sessions.isError && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center text-red-800">
                <p>No pudimos cargar las clases: {sessions.error.message}</p>
                <Button variant="outline" onClick={() => sessions.refetch()}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reintentar
                </Button>
              </CardContent>
            </Card>
          )}

          {sessions.isSuccess && view === "day" && (
            <div className="mx-auto max-w-5xl space-y-5">
              <div className="flex items-end justify-between border-b border-stone-300 pb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-stone-400">
                    {isSameDay(anchor, today)
                      ? "Clases de hoy"
                      : "Registro histórico"}
                  </p>
                  <h2 className="mt-1 font-serif text-2xl">
                    {periodTitle("day", anchor)}
                  </h2>
                </div>
                <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                  {daySessions.length}{" "}
                  {daySessions.length === 1 ? "clase" : "clases"}
                </p>
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                {daySessions.map(session => (
                  <SessionAttendanceCard
                    key={session.id}
                    session={session}
                    onNewStudent={setNewStudentSessionId}
                  />
                ))}
              </div>
              {!daySessions.length && (
                <Card className="border-dashed border-stone-300 bg-white/70">
                  <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
                    <CalendarDays className="mb-3 h-8 w-8 text-stone-300" />
                    <p className="font-medium text-stone-700">
                      No hay clases programadas para este día.
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      Usa las flechas o cambia a Semana o Mes.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {sessions.isSuccess && view === "week" && (
            <WeekView
              anchor={anchor}
              sessions={visibleSessions}
              onOpenDay={openDay}
            />
          )}

          {sessions.isSuccess && view === "month" && (
            <MonthView
              anchor={anchor}
              sessions={visibleSessions}
              onOpenDay={openDay}
            />
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(newStudentSessionId)}
        onOpenChange={open => !open && setNewStudentSessionId(null)}
      >
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Alumno nuevo</DialogTitle>
            <DialogDescription>
              Muéstrale las alternativas del programa y registra sus datos. La
              asistencia quedará pendiente hasta que pague.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label>Opciones de plan</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {plans.data
                ?.filter(plan => plan.active)
                .map(plan => (
                  <div
                    key={plan.id}
                    className="rounded-xl border bg-stone-50 p-3"
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-stone-500">
                      {plan.code}
                    </p>
                    <p className="mt-1 font-medium">{plan.name}</p>
                    <p className="mt-2 text-lg font-semibold">
                      {clp(plan.priceClp)}
                    </p>
                    <p className="text-xs text-stone-500">
                      {plan.creditsPerPeriod} clase(s) por período
                    </p>
                  </div>
                ))}
            </div>
          </div>

          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={newStudent.firstName}
                onChange={event =>
                  setNewStudent({
                    ...newStudent,
                    firstName: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Apellido</Label>
              <Input
                value={newStudent.lastName}
                onChange={event =>
                  setNewStudent({ ...newStudent, lastName: event.target.value })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Correo</Label>
              <Input
                type="email"
                value={newStudent.email}
                onChange={event =>
                  setNewStudent({ ...newStudent, email: event.target.value })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Teléfono</Label>
              <Input
                value={newStudent.phone}
                onChange={event =>
                  setNewStudent({ ...newStudent, phone: event.target.value })
                }
              />
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
              <Checkbox
                className="mt-0.5"
                checked={newStudent.communicationsConsent}
                onCheckedChange={value =>
                  setNewStudent({
                    ...newStudent,
                    communicationsConsent: value === true,
                  })
                }
              />
              <span>
                El alumno autoriza recibir información del programa y
                comunicaciones relacionadas.
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewStudentSessionId(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={
                createStudent.isPending ||
                markNewStudent.isPending ||
                !newStudent.firstName.trim() ||
                !newStudent.email.trim() ||
                !newStudent.communicationsConsent
              }
              onClick={() =>
                createStudent.mutate({
                  ...newStudent,
                  source: "teacher",
                  sendPaymentInvitation: false,
                })
              }
            >
              {createStudent.isPending || markNewStudent.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Registrar alumno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
