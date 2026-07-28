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
import {
  clp,
  currentMonthString,
  monthLabel,
  RegularClassesHeader,
} from "./shared";

export default function RegularClassesSettlements() {
  const utils = trpc.useUtils();
  const [month, setMonth] = useState(currentMonthString());
  const preview = trpc.regularClasses.settlements.preview.useQuery({ month });
  const close = trpc.regularClasses.settlements.close.useMutation({
    onSuccess: () => {
      toast.success("Mes cerrado y cálculo congelado");
      utils.regularClasses.settlements.preview.invalidate({ month });
    },
    onError: (error) => toast.error(error.message),
  });
  const reopen = trpc.regularClasses.settlements.reopen.useMutation({
    onSuccess: () => {
      toast.success("Mes reabierto");
      utils.regularClasses.settlements.preview.invalidate({ month });
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
      Mes: monthLabel(row.month),
      Plan: row.planName,
      Pagado: row.paidClp,
      "Clases incluidas": row.creditsTotal,
      Asistencias: row.creditsUsed,
      "No utilizadas": row.creditsUnused,
    }))), "Alumnos");
    XLSX.writeFile(workbook, `clases-regulares-${month}.xlsx`);
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
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Mes</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={closed} />
              <p className="text-xs text-muted-foreground">Incluye desde el día 1 hasta el último día del mes.</p>
            </div>
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
                <TableHead>Alumno</TableHead><TableHead>Mes</TableHead><TableHead>Plan</TableHead><TableHead>Pagado</TableHead>
                <TableHead>Incluidas</TableHead><TableHead>Asistidas</TableHead><TableHead>No utilizadas</TableHead>
              </TableRow></TableHeader>
              <TableBody>{calculation?.membershipUsage.map((row: any) => (
                <TableRow key={row.membershipId}>
                  <TableCell>{row.studentName}</TableCell><TableCell>{monthLabel(row.month)}</TableCell><TableCell>{row.planName}</TableCell>
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
              if (reason?.trim()) reopen.mutate({ month, reason: reason.trim() });
            }}><Unlock className="mr-2 h-4 w-4" /> Reabrir</Button>
          ) : (
            <Button onClick={() => {
              if (window.confirm(`¿Cerrar ${monthLabel(month)}? El cálculo quedará congelado.`)) {
                close.mutate({ month });
              }
            }}><Lock className="mr-2 h-4 w-4" /> Cerrar mes</Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
