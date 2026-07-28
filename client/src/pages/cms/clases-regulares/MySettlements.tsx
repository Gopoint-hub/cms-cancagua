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
import {
  clp,
  currentMonthString,
  RegularClassesHeader,
} from "./shared";

export default function RegularClassesMySettlements() {
  const [month, setMonth] = useState(currentMonthString());
  const settlement = trpc.regularClasses.settlements.mine.useQuery({ month });
  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <RegularClassesHeader title="Mi liquidación" description="Cálculo informativo según las asistencias efectivamente marcadas." />
        <Card>
          <CardContent className="p-5">
            <div className="max-w-sm space-y-2">
              <Label>Mes</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              <p className="text-xs text-muted-foreground">Desde el día 1 hasta el último día del mes.</p>
            </div>
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
