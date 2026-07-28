import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Check, Loader2, Mail, Plus, Search, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { RegularClassesHeader, todayString } from "./shared";

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function RegularClassesAttendance() {
  const utils = trpc.useUtils();
  const today = todayString();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({
    firstName: "", lastName: "", email: "", phone: "", communicationsConsent: true,
  });
  const sessions = trpc.regularClasses.attendance.sessions.useQuery({
    from: addDays(today, -3),
    to: addDays(today, 7),
  }, { retry: 1 });
  const selectedId = selectedSessionId
    ?? sessions.data?.find((session) => session.sessionDate === today)?.id
    ?? sessions.data?.[0]?.id
    ?? null;
  const roster = trpc.regularClasses.attendance.roster.useQuery(
    { sessionId: selectedId! },
    { enabled: Boolean(selectedId) },
  );
  const mark = trpc.regularClasses.attendance.mark.useMutation({
    onSuccess: (result) => {
      utils.regularClasses.attendance.roster.invalidate({ sessionId: selectedId! });
      utils.regularClasses.attendance.sessions.invalidate();
      if (result.status === "pending_payment") {
        toast.warning("Asistencia pendiente de pago");
      }
    },
    onError: (error) => toast.error(error.message),
  });
  const create = trpc.regularClasses.students.create.useMutation({
    onSuccess: async (result) => {
      if (selectedId) {
        await mark.mutateAsync({ sessionId: selectedId, studentId: result.id, present: true });
      }
      toast.success(result.invitationSent
        ? "Alumno registrado y enlace de pago enviado"
        : "Alumno registrado; revisa el envío del enlace");
      setNewOpen(false);
      setNewStudent({ firstName: "", lastName: "", email: "", phone: "", communicationsConsent: true });
      utils.regularClasses.attendance.roster.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return roster.data?.students.filter((student) =>
      !query
      || `${student.firstName} ${student.lastName ?? ""}`.toLowerCase().includes(query)
      || student.email?.toLowerCase().includes(query)
      || student.phone?.includes(query)) ?? [];
  }, [roster.data, search]);

  const selectedSession = sessions.data?.find((session) => session.id === selectedId);

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <RegularClassesHeader
          title="Asistencia"
          description="No se requiere reserva previa. Marca únicamente a quienes llegaron a la clase."
          actions={
            <Button onClick={() => setNewOpen(true)} disabled={!selectedId}>
              <UserRoundPlus className="mr-2 h-4 w-4" /> Alumno nuevo
            </Button>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader><CardTitle className="text-base">Clases</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {sessions.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
              {sessions.isError && (
                <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p>No pudimos cargar las clases: {sessions.error.message}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sessions.refetch()}
                    disabled={sessions.isFetching}
                  >
                    {sessions.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reintentar
                  </Button>
                </div>
              )}
              {sessions.isSuccess && sessions.data.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No hay clases programadas entre {addDays(today, -3)} y {addDays(today, 7)}.
                </p>
              )}
              {sessions.data?.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectedId === session.id ? "border-slate-700 bg-slate-50" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{session.disciplineName}</span>
                    <Badge variant={session.status === "completed" ? "default" : "outline"}>
                      {session.attendanceCount} presentes
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {session.sessionDate} · {session.startTime}–{session.endTime}
                  </p>
                  <p className="text-xs text-muted-foreground">{session.teacherName}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">
                {selectedSession
                  ? `${selectedSession.disciplineName} · ${selectedSession.sessionDate}`
                  : "Selecciona una clase"}
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar alumno por nombre, correo o teléfono"
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[58vh] pr-3">
                <div className="space-y-2">
                  {roster.isLoading && (
                    <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin" />
                  )}
                  {roster.isError && (
                    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <p>No pudimos cargar los alumnos: {roster.error.message}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => roster.refetch()}
                        disabled={roster.isFetching}
                      >
                        {roster.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Reintentar
                      </Button>
                    </div>
                  )}
                  {filtered.map((student) => {
                    const checked = student.attendance?.status === "present"
                      || student.attendance?.status === "pending_payment";
                    const pending = student.attendance?.status === "pending_payment"
                      || !student.membership
                      || student.membership.paymentStatus !== "paid";
                    return (
                      <button
                        key={student.id}
                        disabled={mark.isPending}
                        onClick={() => selectedId && mark.mutate({
                          sessionId: selectedId,
                          studentId: student.id,
                          present: !checked,
                        })}
                        className={`flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                          checked ? "border-emerald-400 bg-emerald-50" : "hover:bg-muted/50"
                        }`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                          checked ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white"
                        }`}>
                          {checked && <Check className="h-5 w-5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {student.firstName} {student.lastName}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {student.membership
                              ? `${student.membership.planName}: ${student.membership.creditsUsed}/${student.membership.creditsTotal} utilizadas`
                              : "Sin plan activo"}
                          </span>
                        </span>
                        {pending && <Badge variant="outline" className="border-amber-400 text-amber-700">Pago pendiente</Badge>}
                      </button>
                    );
                  })}
                  {!selectedId && !sessions.isLoading && !sessions.isError && (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Selecciona una clase para ver los alumnos.
                    </p>
                  )}
                  {selectedId && roster.isSuccess && filtered.length === 0 && (
                    <p className="py-10 text-center text-sm text-muted-foreground">No se encontraron alumnos.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inscribir alumno nuevo</DialogTitle>
            <DialogDescription>
              Se registrará su asistencia como pendiente y recibirá los planes con enlace de pago.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={newStudent.firstName} onChange={(e) => setNewStudent({ ...newStudent, firstName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Apellido</Label>
              <Input value={newStudent.lastName} onChange={(e) => setNewStudent({ ...newStudent, lastName: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Correo</Label>
              <Input type="email" value={newStudent.email} onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Teléfono</Label>
              <Input value={newStudent.phone} onChange={(e) => setNewStudent({ ...newStudent, phone: e.target.value })} />
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={newStudent.communicationsConsent}
                onChange={(e) => setNewStudent({ ...newStudent, communicationsConsent: e.target.checked })}
              />
              <span>El alumno autoriza recibir por correo la información del programa, el enlace de pago y comunicaciones relacionadas.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button
              disabled={create.isPending || !newStudent.firstName.trim() || !newStudent.email.trim() || !newStudent.communicationsConsent}
              onClick={() => create.mutate({
                ...newStudent,
                source: "teacher",
                sendPaymentInvitation: true,
              })}
            >
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Registrar y enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
