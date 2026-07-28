import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
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
import { clp, RegularClassesHeader } from "./shared";

function defaultPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 26, 12);
  if (now.getDate() < 26) start.setMonth(start.getMonth() - 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25, 12);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function RegularClassesMySettlements() {
  const initial = defaultPeriod();
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const settlement = trpc.regularClasses.settlements.mine.useQuery({ periodStart, periodEnd });
  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <RegularClassesHeader title="Mi liquidación" description="Cálculo informativo según las asistencias efectivamente marcadas." />
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-2"><Label>Inicio</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
            <div className="space-y-2"><Label>Término</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Asistencias", settlement.data?.attendances ?? 0],
            ["Comisión bruta", clp(settlement.data?.commissionClp)],
            ["Impuestos incluidos", clp((settlement.data?.withholdingClp ?? 0) + (settlement.data?.vatIncludedClp ?? 0))],
            ["Líquido estimado", clp(settlement.data?.liquidPayableClp)],
          ].map(([label, value]) => (
            <Card key={String(label)}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{value}</p></CardContent></Card>
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Detalle por alumno</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Alumno</TableHead><TableHead>Plan</TableHead><TableHead>Asistencias</TableHead><TableHead>Comisión</TableHead><TableHead>Líquido</TableHead></TableRow></TableHeader>
              <TableBody>{settlement.data?.lines.map((line) => (
                <TableRow key={`${line.membershipId}-${line.teacherId}`}>
                  <TableCell>{line.studentName}</TableCell><TableCell>{line.planName}</TableCell>
                  <TableCell>{line.attendanceCount}</TableCell><TableCell>{clp(line.teacherCommissionClp)}</TableCell><TableCell>{clp(line.liquidPayableClp)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
