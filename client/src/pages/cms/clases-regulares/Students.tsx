import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Loader2, Mail, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { clp, RegularClassesHeader, todayString } from "./shared";

function defaultPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 26, 12);
  if (now.getDate() < 26) start.setMonth(start.getMonth() - 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25, 12);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function RegularClassesStudents() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [enrollStudent, setEnrollStudent] = useState<any | null>(null);
  const [carryStudent, setCarryStudent] = useState<any | null>(null);
  const period = defaultPeriod();
  const [studentForm, setStudentForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [enrollForm, setEnrollForm] = useState({
    planId: "", periodStart: period.start, periodEnd: period.end,
    paymentStatus: "paid" as "paid" | "pending", paymentMethod: "recepcion", paymentReference: "",
  });
  const [carryForm, setCarryForm] = useState({ nextPeriodStart: "", nextPeriodEnd: "", reason: "" });
  const students = trpc.regularClasses.students.list.useQuery();
  const plans = trpc.regularClasses.plans.list.useQuery();
  const access = trpc.regularClasses.access.useQuery();
  const create = trpc.regularClasses.students.create.useMutation({
    onSuccess: () => {
      toast.success("Alumno creado");
      setNewOpen(false);
      setStudentForm({ firstName: "", lastName: "", email: "", phone: "" });
      utils.regularClasses.students.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const enroll = trpc.regularClasses.students.enroll.useMutation({
    onSuccess: () => {
      toast.success("Plan registrado");
      setEnrollStudent(null);
      utils.regularClasses.students.list.invalidate();
      utils.regularClasses.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const invite = trpc.regularClasses.students.sendPaymentInvitation.useMutation({
    onSuccess: (result) => result.sent
      ? toast.success("Enlace de pago enviado")
      : toast.error(result.error || "No se pudo enviar el correo"),
    onError: (error) => toast.error(error.message),
  });
  const carry = trpc.regularClasses.students.carryForward.useMutation({
    onSuccess: () => {
      toast.success("Plan trasladado al siguiente período");
      setCarryStudent(null);
      utils.regularClasses.students.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.data?.filter((student) =>
      !query
      || `${student.firstName} ${student.lastName ?? ""}`.toLowerCase().includes(query)
      || student.email?.toLowerCase().includes(query)
      || student.phone?.includes(query)) ?? [];
  }, [search, students.data]);

  const selectedPlan = plans.data?.find((plan) => String(plan.id) === enrollForm.planId);

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <RegularClassesHeader
          title="Alumnos y pagos"
          description="Inscripciones, créditos del período y pagos en recepción."
          actions={<Button onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" /> Alumno nuevo</Button>}
        />
        <Card>
          <CardHeader>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar alumno" className="pl-9" />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Uso</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <p className="font-medium">{student.firstName} {student.lastName}</p>
                      <p className="text-xs text-muted-foreground">{student.email || student.phone || "Sin contacto"}</p>
                    </TableCell>
                    <TableCell>{student.membership?.planName ?? <Badge variant="outline">Sin plan</Badge>}</TableCell>
                    <TableCell>
                      {student.membership
                        ? `${student.membership.creditsUsed}/${student.membership.creditsTotal}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={student.membership?.paymentStatus === "paid" ? "default" : "outline"}>
                        {student.membership?.paymentStatus === "paid" ? "Pagado" : "Pendiente"}
                      </Badge>
                      {student.membership && <p className="mt-1 text-xs">{clp(student.membership.pricePaidClp)}</p>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {student.membership
                        ? <>{student.membership.periodStart}<br />{student.membership.periodEnd}</>
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => invite.mutate({ studentId: student.id })}>
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button size="sm" onClick={() => setEnrollStudent(student)}>
                          Inscribir
                        </Button>
                        {access.data?.isAdmin && student.membership?.paymentStatus === "paid" && student.membership.creditsUsed === 0 && (
                          <Button size="sm" variant="outline" onClick={() => setCarryStudent(student)}>
                            <ArrowRight className="mr-1 h-4 w-4" /> Postergar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Alumno nuevo</DialogTitle><DialogDescription>Registro desde recepción.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Nombre</Label><Input value={studentForm.firstName} onChange={(e) => setStudentForm({ ...studentForm, firstName: e.target.value })} /></div>
            <div className="space-y-2"><Label>Apellido</Label><Input value={studentForm.lastName} onChange={(e) => setStudentForm({ ...studentForm, lastName: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Correo</Label><Input type="email" value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Teléfono</Label><Input value={studentForm.phone} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button disabled={create.isPending || !studentForm.firstName.trim()} onClick={() => create.mutate({
              ...studentForm, source: "reception", communicationsConsent: false, sendPaymentInvitation: false,
            })}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(enrollStudent)} onOpenChange={(open) => !open && setEnrollStudent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inscribir a {enrollStudent?.firstName}</DialogTitle>
            <DialogDescription>El número de clases se obtiene del plan seleccionado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={enrollForm.planId} onValueChange={(planId) => setEnrollForm({ ...enrollForm, planId })}>
                <SelectTrigger><SelectValue placeholder="Selecciona un plan" /></SelectTrigger>
                <SelectContent>{plans.data?.filter((plan) => plan.active).map((plan) => (
                  <SelectItem key={plan.id} value={String(plan.id)}>
                    {plan.name} · {clp(plan.priceClp)} · {plan.creditsPerPeriod} clases
                  </SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Desde</Label><Input type="date" value={enrollForm.periodStart} onChange={(e) => setEnrollForm({ ...enrollForm, periodStart: e.target.value })} /></div>
              <div className="space-y-2"><Label>Hasta</Label><Input type="date" value={enrollForm.periodEnd} onChange={(e) => setEnrollForm({ ...enrollForm, periodEnd: e.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Estado del pago</Label>
              <Select value={enrollForm.paymentStatus} onValueChange={(value: "paid" | "pending") => setEnrollForm({ ...enrollForm, paymentStatus: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="paid">Pagado</SelectItem><SelectItem value="pending">Pendiente</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Referencia</Label><Input value={enrollForm.paymentReference} onChange={(e) => setEnrollForm({ ...enrollForm, paymentReference: e.target.value })} /></div>
            {selectedPlan && <p className="rounded-lg bg-muted p-3 text-sm">Se registrarán {selectedPlan.creditsPerPeriod} clases por {clp(selectedPlan.priceClp)}.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollStudent(null)}>Cancelar</Button>
            <Button disabled={enroll.isPending || !enrollForm.planId} onClick={() => enroll.mutate({
              studentId: enrollStudent.id,
              planId: Number(enrollForm.planId),
              periodStart: enrollForm.periodStart,
              periodEnd: enrollForm.periodEnd,
              paymentStatus: enrollForm.paymentStatus,
              paymentMethod: enrollForm.paymentMethod,
              paymentReference: enrollForm.paymentReference || undefined,
            })}>Registrar plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(carryStudent)} onOpenChange={(open) => !open && setCarryStudent(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pasar al siguiente período</DialogTitle><DialogDescription>Disponible sólo porque este plan no tiene asistencias.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Nuevo inicio</Label><Input type="date" value={carryForm.nextPeriodStart} onChange={(e) => setCarryForm({ ...carryForm, nextPeriodStart: e.target.value })} /></div>
            <div className="space-y-2"><Label>Nuevo término</Label><Input type="date" value={carryForm.nextPeriodEnd} onChange={(e) => setCarryForm({ ...carryForm, nextPeriodEnd: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Motivo obligatorio</Label><Input value={carryForm.reason} onChange={(e) => setCarryForm({ ...carryForm, reason: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCarryStudent(null)}>Cancelar</Button>
            <Button disabled={carry.isPending || !carryForm.nextPeriodStart || !carryForm.nextPeriodEnd || carryForm.reason.trim().length < 5} onClick={() => carry.mutate({
              membershipId: carryStudent.membership.id,
              ...carryForm,
            })}>Confirmar postergación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
