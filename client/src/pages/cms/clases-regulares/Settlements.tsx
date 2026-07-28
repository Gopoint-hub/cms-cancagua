import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Download, Lock, RefreshCcw, Unlock } from "lucide-react";
import { toast } from "sonner";
import { clp, RegularClassesHeader } from "./shared";

function defaultPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 26, 12);
  if (now.getDate() < 26) start.setMonth(start.getMonth() - 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25, 12);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function RegularClassesSettlements() {
  const initial = defaultPeriod();
  const utils = trpc.useUtils();
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const preview = trpc.regularClasses.settlements.preview.useQuery({ periodStart, periodEnd });
  const close = trpc.regularClasses.settlements.close.useMutation({
    onSuccess: () => {
      toast.success("Período cerrado y cálculo congelado");
      utils.regularClasses.settlements.preview.invalidate({ periodStart, periodEnd });
    },
    onError: (error) => toast.error(error.message),
  });
  const reopen = trpc.regularClasses.settlements.reopen.useMutation({
    onSuccess: () => {
      toast.success("Período reabierto");
      utils.regularClasses.settlements.preview.invalidate({ periodStart, periodEnd });
    },
    onError: (error) => toast.error(error.message),
  });
  const calculation = preview.data?.calculation;
  const closed = preview.data?.closure?.status === "closed";

  const download = async () => {
    if (!calculation) return;
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(calculation.byTeacher.map((row: any) => ({
      Profesor: row.teacherName,
      Documento: row.documentType,
      Asistencias: row.attendances,
      "Ingreso atribuido": row.attributedRevenueClp,
      "Comisión bruta": row.commissionClp,
      Retención: row.withholdingClp,
      "IVA incluido": row.vatIncludedClp,
      "Líquido a transferir": row.liquidPayableClp,
    }))), "Profesores");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(calculation.membershipUsage.map((row: any) => ({
      Alumno: row.studentName,
      Plan: row.planName,
      Pagado: row.paidClp,
      "Clases incluidas": row.creditsTotal,
      Asistencias: row.creditsUsed,
      "No utilizadas": row.creditsUnused,
    }))), "Alumnos");
    XLSX.writeFile(workbook, `clases-regulares-${periodStart}-${periodEnd}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <RegularClassesHeader
          title="Liquidaciones"
          description="Comisión por asistencias efectivas, calculada sobre las clases incluidas en cada plan."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => preview.refetch()}><RefreshCcw className="mr-2 h-4 w-4" /> Recalcular</Button>
              <Button variant="outline" onClick={download} disabled={!calculation}><Download className="mr-2 h-4 w-4" /> Excel</Button>
            </div>
          }
        />

        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
            <div className="space-y-2"><Label>Inicio</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} disabled={closed} /></div>
            <div className="space-y-2"><Label>Término</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} disabled={closed} /></div>
            <div className="flex items-end">
              <Badge variant={closed ? "default" : "outline"} className="h-10 px-4 text-sm">
                {closed ? <><Lock className="mr-2 h-4 w-4" /> Cerrado</> : "Borrador"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Ingresos pagados", calculation?.totals.totalIncomeClp],
            ["Comisiones profesores", calculation?.totals.totalTeacherCommissionsClp],
            ["Ingreso Cancagua", calculation?.totals.totalCancaguaClp],
            ["Líquido a transferir", calculation?.totals.totalLiquidPayableClp],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{clp(value as number)}</p></CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Por profesor</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Profesor</TableHead><TableHead>Asistencias</TableHead><TableHead>Comisión</TableHead>
                <TableHead>Retención</TableHead><TableHead>IVA incluido</TableHead><TableHead>Líquido</TableHead>
              </TableRow></TableHeader>
              <TableBody>{calculation?.byTeacher.map((row: any) => (
                <TableRow key={row.teacherId}>
                  <TableCell className="font-medium">{row.teacherName}</TableCell>
                  <TableCell>{row.attendances}</TableCell>
                  <TableCell>{clp(row.commissionClp)}</TableCell>
                  <TableCell>{clp(row.withholdingClp)}</TableCell>
                  <TableCell>{clp(row.vatIncludedClp)}</TableCell>
                  <TableCell className="font-semibold">{clp(row.liquidPayableClp)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Uso por alumno</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Alumno</TableHead><TableHead>Plan</TableHead><TableHead>Pagado</TableHead>
                <TableHead>Incluidas</TableHead><TableHead>Asistidas</TableHead><TableHead>No utilizadas</TableHead>
              </TableRow></TableHeader>
              <TableBody>{calculation?.membershipUsage.map((row: any) => (
                <TableRow key={row.membershipId}>
                  <TableCell>{row.studentName}</TableCell><TableCell>{row.planName}</TableCell>
                  <TableCell>{clp(row.paidClp)}</TableCell><TableCell>{row.creditsTotal}</TableCell>
                  <TableCell>{row.creditsUsed}</TableCell><TableCell>{row.creditsUnused}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          {closed ? (
            <Button variant="outline" onClick={() => {
              const reason = window.prompt("Motivo obligatorio para reabrir:");
              if (reason?.trim()) reopen.mutate({ periodStart, periodEnd, reason: reason.trim() });
            }}><Unlock className="mr-2 h-4 w-4" /> Reabrir</Button>
          ) : (
            <Button onClick={() => {
              if (window.confirm("¿Cerrar este período? El cálculo quedará congelado.")) {
                close.mutate({ periodStart, periodEnd });
              }
            }}><Lock className="mr-2 h-4 w-4" /> Cerrar período</Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
