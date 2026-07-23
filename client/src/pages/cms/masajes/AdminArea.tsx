import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type AdjustmentCategory = "courtesy" | "refund" | "extra_cost" | "correction" | "other";
type Adjustment = {
  category: AdjustmentCategory;
  description: string;
  amount: number;
};

const adjustmentLabels: Record<AdjustmentCategory, string> = {
  courtesy: "Cortesía",
  refund: "Devolución",
  extra_cost: "Costo adicional",
  correction: "Corrección",
  other: "Otro",
};

function defaultCloseMonth() {
  const today = new Date();
  const reference = new Date(today.getFullYear(), today.getMonth() + (today.getDate() >= 25 ? 1 : 0), 1);
  return format(reference, "yyyy-MM");
}

const money = (value: number | string | null | undefined) =>
  `$${Math.round(Number(value ?? 0)).toLocaleString("es-CL")}`;

const numberInput = (value: string) => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function MasajesAdminArea() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [closeMonth, setCloseMonth] = useState(defaultCloseMonth);
  const [freelanceTripCount, setFreelanceTripCount] = useState(0);
  const [barbaraBaseSalary, setBarbaraBaseSalary] = useState<number | null>(null);
  const [danielaBaseSalary, setDanielaBaseSalary] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);

  const access = trpc.masajes.areaAdmin.access.useQuery();
  const preview = trpc.masajes.areaAdmin.preview.useQuery(
    { closeMonth },
    { enabled: access.data?.allowed === true },
  );
  const closureList = trpc.masajes.areaAdmin.list.useQuery(undefined, {
    enabled: access.data?.allowed === true,
  });
  const saveMutation = trpc.masajes.areaAdmin.save.useMutation();
  const closeMutation = trpc.masajes.areaAdmin.close.useMutation();
  const reopenMutation = trpc.masajes.areaAdmin.reopen.useMutation();
  const exportMutation = trpc.masajes.areaAdmin.markExported.useMutation();

  const calculation = preview.data?.calculation;
  const closure = preview.data?.closure;
  const isClosed = closure?.status === "closed";

  useEffect(() => {
    if (!calculation) return;
    setFreelanceTripCount(Number(calculation.parameters.freelanceTripCount ?? 0));
    setBarbaraBaseSalary(calculation.parameters.barbaraBaseSalary ?? null);
    setDanielaBaseSalary(calculation.parameters.danielaBaseSalary ?? null);
    setNotes(calculation.parameters.notes ?? "");
    setAdjustments((calculation.adjustments ?? []).map((item: Adjustment) => ({
      category: item.category,
      description: item.description,
      amount: Number(item.amount),
    })));
  }, [closeMonth, calculation?.calculatedAt, closure?.status]);

  const formInput = useMemo(() => ({
    closeMonth,
    freelanceTripCount,
    barbaraBaseSalary,
    danielaBaseSalary,
    notes,
    adjustments: adjustments
      .filter((item) => item.description.trim() && Number.isFinite(item.amount))
      .map((item) => ({ ...item, description: item.description.trim() })),
  }), [adjustments, barbaraBaseSalary, closeMonth, danielaBaseSalary, freelanceTripCount, notes]);

  const refresh = async () => {
    await Promise.all([
      utils.masajes.areaAdmin.preview.invalidate({ closeMonth }),
      utils.masajes.areaAdmin.list.invalidate(),
    ]);
  };

  const save = async (showToast = true) => {
    await saveMutation.mutateAsync(formInput);
    await refresh();
    if (showToast) toast.success("Borrador del cierre guardado");
  };

  const closePeriod = async () => {
    if (barbaraBaseSalary == null || danielaBaseSalary == null) {
      toast.error("Ingresa los sueldos de Bárbara y Daniela antes de cerrar");
      return;
    }
    if (!window.confirm("¿Cerrar y bloquear este período? El cálculo quedará guardado como una fotografía.")) return;
    try {
      await save(false);
      const result = await closeMutation.mutateAsync({ closeMonth });
      await refresh();
      const missingAssignments = result.missingAssignments ?? 0;
      toast.success(
        missingAssignments > 0
          ? `Cierre completado con ${missingAssignments} alerta(s) de terapeuta`
          : "Cierre completado correctamente",
      );
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo cerrar el período");
    }
  };

  const reopen = async () => {
    const reason = window.prompt("Escribe el motivo para reabrir este cierre:");
    if (!reason?.trim()) return;
    try {
      await reopenMutation.mutateAsync({ closeMonth, reason: reason.trim() });
      await refresh();
      toast.success("El cierre volvió a estado borrador");
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo reabrir");
    }
  };

  const downloadExcel = async () => {
    if (!calculation) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const addSheet = (name: string, rows: Record<string, unknown>[], widths: number[] = []) => {
        const sheet = XLSX.utils.json_to_sheet(rows);
        if (widths.length) sheet["!cols"] = widths.map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
      };
      const totals = calculation.totals;
      const params = calculation.parameters;
      addSheet("Estado de Resultados", [
        { Concepto: "Período", Valor: `${calculation.period.start} al ${calculation.period.end}` },
        { Concepto: "Estado", Valor: isClosed ? "Cerrado" : "Borrador" },
        { Concepto: "Masajes realizados", Valor: totals.totalMassages },
        { Concepto: "Ingresos originales", Valor: totals.grossOriginalRevenue },
        { Concepto: "Descuentos", Valor: totals.discounts },
        { Concepto: "Ingresos totales", Valor: totals.revenue },
        { Concepto: "Insumos", Valor: -totals.costs.supplies },
        { Concepto: "Lavandería", Valor: -totals.costs.laundry },
        { Concepto: "Traslado regular", Valor: -totals.costs.regularTransport },
        { Concepto: "Traslados freelance adicionales", Valor: -totals.costs.additionalTrips },
        { Concepto: "Energía eléctrica", Valor: -totals.costs.electricity },
        { Concepto: "Contabilidad", Valor: -totals.costs.accounting },
        { Concepto: "Ajustes manuales", Valor: -totals.costs.manualAdjustments },
        { Concepto: "Costos generales", Valor: -totals.costs.generalCosts },
        { Concepto: "Sueldos base", Valor: -totals.costs.salaries },
        { Concepto: "Previred", Valor: -totals.costs.previred },
        { Concepto: "Comisiones inhouse", Valor: -totals.inhouseCommissions },
        { Concepto: "Comisiones freelance", Valor: -totals.freelanceCommissions },
        { Concepto: "Resultado operacional", Valor: totals.operationalResult },
        { Concepto: "Bono Tamara", Valor: -totals.tamaraBonus },
        { Concepto: "Resultado unidad masajes", Valor: totals.unitResult },
      ], [34, 24]);
      addSheet("Detalle Masajes", calculation.details.map((row: any) => ({
        Origen: row.source === "skedu_program" ? "Programa Skedu" : "Masaje directo",
        "ID reserva": row.bookingId,
        Fecha: row.serviceDate,
        Hora: row.startTime,
        Cliente: row.clientName,
        Servicio: row.serviceName,
        "Duración (min)": row.duration,
        Terapeuta: row.therapistName,
        Tipo: row.therapistType ?? "Sin asignar",
        "Valor original": row.originalAmount,
        Descuento: row.discountAmount,
        "Ingreso bruto": row.grossRevenue,
        "Ingreso neto": row.netRevenue,
        "Medio de pago": row.paymentMethod,
        "Estado pago": row.paymentStatus,
        Comisión: row.commission,
        "Base comisión": row.commissionBasis,
        "Completado automáticamente": row.inferredCompleted ? "Sí" : "No",
      })), [18, 12, 12, 9, 24, 30, 14, 24, 14, 16, 14, 16, 16, 18, 14, 14, 16, 22]);
      addSheet("Resumen por servicio", calculation.byService.map((row: any) => ({
        Servicio: row.serviceName,
        "Masajes realizados": row.massages,
        Ingresos: row.revenue,
      })), [34, 20, 18]);
      addSheet("Terapeutas", calculation.byTherapist.map((row: any) => ({
        Terapeuta: row.therapistName,
        Tipo: row.therapistType ?? "Sin asignar",
        Masajes: row.massages,
        "Días trabajados": row.daysWorked,
        "Domingos trabajados": row.sundaysWorked,
        "Ingreso bruto asociado": row.revenue,
        "Ingreso neto asociado": row.netRevenue,
        Comisión: row.commission,
        Licencias: row.leaves.map((leave: any) =>
          `${leave.type}: ${leave.startDate}–${leave.endDate}`).join("; "),
      })), [26, 14, 12, 18, 20, 22, 22, 16, 42]);
      addSheet("Liquidaciones Inhouse", calculation.byTherapist
        .filter((row: any) => row.therapistType === "inhouse")
        .map((row: any) => ({
          Terapeuta: row.therapistName,
          "Días trabajados": row.daysWorked,
          "Domingos trabajados": row.sundaysWorked,
          Masajes: row.massages,
          "Sueldo base": row.therapistName.toLowerCase().includes("tamara")
            ? params.tamaraBaseSalary
            : row.therapistName.toLowerCase().includes("barbara") || row.therapistName.toLowerCase().includes("bárbara")
              ? params.barbaraBaseSalary
              : row.therapistName.toLowerCase().includes("daniela")
                ? params.danielaBaseSalary
                : "",
          Comisión: row.commission,
          Licencias: row.leaves.map((leave: any) =>
            `${leave.type}: ${leave.startDate}–${leave.endDate}`).join("; "),
        })), [26, 18, 20, 12, 18, 16, 42]);
      addSheet("Boletas Freelance", calculation.byTherapist
        .filter((row: any) => row.therapistType === "freelance")
        .map((row: any) => ({
          Terapeuta: row.therapistName,
          Masajes: row.massages,
          "Días trabajados": row.daysWorked,
          "Valor bruto asociado": row.revenue,
          "Monto boleta sugerido": row.commission,
        })), [28, 12, 18, 22, 22]);
      addSheet("Costos y Ajustes", [
        { Categoría: "Parámetro", Descripción: "Insumos por masaje", Cantidad: totals.totalMassages, "Valor unitario": params.supplyUnitCost, Total: totals.costs.supplies },
        { Categoría: "Parámetro", Descripción: "Lavandería por masaje", Cantidad: totals.totalMassages, "Valor unitario": params.laundryUnitCost, Total: totals.costs.laundry },
        { Categoría: "Fijo", Descripción: "Traslado regular", Cantidad: 1, "Valor unitario": params.regularTransportCost, Total: totals.costs.regularTransport },
        { Categoría: "Variable", Descripción: "Traslados freelance", Cantidad: params.freelanceTripCount, "Valor unitario": params.freelanceTripUnitCost, Total: totals.costs.additionalTrips },
        { Categoría: "Fijo", Descripción: "Energía eléctrica", Cantidad: 1, "Valor unitario": params.electricityCost, Total: totals.costs.electricity },
        { Categoría: "Fijo", Descripción: "Contabilidad", Cantidad: 1, "Valor unitario": params.accountingCost, Total: totals.costs.accounting },
        ...calculation.adjustments.map((row: Adjustment) => ({
          Categoría: adjustmentLabels[row.category],
          Descripción: row.description,
          Cantidad: 1,
          "Valor unitario": row.amount,
          Total: row.amount,
        })),
      ], [18, 36, 12, 18, 18]);
      addSheet("Parámetros", [
        { Parámetro: "Costo insumos por masaje", Valor: params.supplyUnitCost },
        { Parámetro: "Costo lavandería por masaje", Valor: params.laundryUnitCost },
        { Parámetro: "Traslado regular", Valor: params.regularTransportCost },
        { Parámetro: "Traslado freelance por viaje", Valor: params.freelanceTripUnitCost },
        { Parámetro: "Energía eléctrica", Valor: params.electricityCost },
        { Parámetro: "Contabilidad", Valor: params.accountingCost },
        { Parámetro: "Sueldo Tamara", Valor: params.tamaraBaseSalary },
        { Parámetro: "Sueldo Bárbara", Valor: params.barbaraBaseSalary },
        { Parámetro: "Sueldo Daniela", Valor: params.danielaBaseSalary },
        { Parámetro: "Previred", Valor: params.previredRate },
        { Parámetro: "Comisión freelance", Valor: params.freelanceCommissionRate },
        { Parámetro: "Comisión inhouse", Valor: params.inhouseCommissionRate },
        { Parámetro: "Bono Tamara", Valor: params.tamaraBonusRate },
        { Parámetro: "Notas", Valor: params.notes },
      ], [34, 40]);
      addSheet("Alertas", [
        ...calculation.alerts.missingAssignments.map((row: any) => ({
          Tipo: "Sin terapeuta asignado",
          Origen: row.source,
          "ID reserva": row.bookingId,
          Fecha: row.serviceDate,
          Hora: row.startTime,
          Cliente: row.clientName,
          Servicio: row.serviceName,
        })),
        ...calculation.alerts.pendingPayments.map((row: any) => ({
          Tipo: "Pago pendiente",
          Origen: "Masaje directo",
          "ID reserva": row.bookingId,
          Fecha: row.serviceDate,
          Hora: "",
          Cliente: row.clientName,
          Servicio: "",
        })),
      ], [24, 18, 12, 12, 10, 24, 28]);
      addSheet("Auditoría", (preview.data?.audit ?? []).map((row: any) => ({
        Acción: row.action,
        "ID usuario": row.userId,
        Fecha: row.createdAt ? new Date(row.createdAt).toLocaleString("es-CL", { timeZone: "America/Santiago" }) : "",
        Detalle: row.detail ?? "",
      })), [18, 14, 24, 70]);
      XLSX.writeFile(workbook, `cierre-masajes-${closeMonth}.xlsx`);
      await exportMutation.mutateAsync({ closeMonth }).catch(() => undefined);
      toast.success("Excel de cierre descargado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo generar el Excel");
    }
  };

  if (access.isLoading) {
    return <DashboardLayout><div className="p-4"><Skeleton className="h-96 w-full" /></div></DashboardLayout>;
  }
  if (!access.data?.allowed) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center p-4">
          <Card className="max-w-lg">
            <CardContent className="p-8 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
              <h1 className="mt-4 text-xl font-semibold">Acceso restringido</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Este submódulo está disponible solamente para Tamara Muñoz y superadministradores.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] space-y-5 p-1 sm:p-2 lg:p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Admin área de masajes</h1>
              <Badge variant={isClosed ? "default" : "secondary"}>
                {isClosed ? <Lock className="mr-1 h-3 w-3" /> : <Calculator className="mr-1 h-3 w-3" />}
                {isClosed ? "Cerrado" : "Borrador"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Cierre mensual, liquidaciones y boletas de honorarios.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <div>
              <Label htmlFor="close-month" className="text-xs">Mes de cierre</Label>
              <Input
                id="close-month"
                type="month"
                value={closeMonth}
                onChange={(event) => setCloseMonth(event.target.value)}
                className="mt-1 w-full sm:w-44"
              />
            </div>
            <Button variant="outline" onClick={downloadExcel} disabled={!calculation}>
              <Download className="mr-2 h-4 w-4" /> Descargar Excel
            </Button>
            {!isClosed && (
              <>
                <Button variant="outline" onClick={() => save()} disabled={saveMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" /> Guardar borrador
                </Button>
                <Button onClick={closePeriod} disabled={closeMutation.isPending || saveMutation.isPending}>
                  <Lock className="mr-2 h-4 w-4" /> Cerrar período
                </Button>
              </>
            )}
            {isClosed && user?.role === "super_admin" && (
              <Button variant="outline" onClick={reopen} disabled={reopenMutation.isPending}>
                <RefreshCw className="mr-2 h-4 w-4" /> Reabrir
              </Button>
            )}
          </div>
        </div>

        {preview.isLoading || !calculation ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-28 w-full" />)}
          </div>
        ) : (
          <>
            <Card className="border-primary/20 bg-primary/[0.025]">
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Período contable</p>
                  <p className="mt-1 font-semibold">{calculation.period.start} al {calculation.period.end}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Los confirmados cuya hora ya terminó se consideran realizados automáticamente.
                </p>
              </CardContent>
            </Card>

            {calculation.alerts.missingAssignments.length > 0 && (
              <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-5 w-5" />
                    {calculation.alerts.missingAssignments.length} masaje(s) sin terapeuta asignado
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
                    Revisa estas reservas. Se incluyen en ingresos y costos, pero no generan comisión hasta tener terapeuta.
                  </p>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {calculation.alerts.missingAssignments.map((item: any) => (
                      <div key={`${item.source}-${item.bookingId}`} className="rounded-lg border border-amber-200 bg-background/80 p-3 text-sm">
                        <p className="font-medium">{item.clientName} · {item.serviceName}</p>
                        <p className="text-xs text-muted-foreground">{item.serviceDate} · {item.startTime} · Reserva #{item.bookingId}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {calculation.alerts.pendingPayments.length > 0 && (
              <Card className="border-orange-200">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-orange-600" />
                  <div>
                    <p className="font-medium">{calculation.alerts.pendingPayments.length} masaje(s) realizado(s) con pago pendiente</p>
                    <p className="text-sm text-muted-foreground">Se contabilizan para costos operacionales, pero con ingreso y comisión en $0.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-5">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Users className="h-4 w-4" /> Masajes realizados</p>
                  <p className="mt-2 text-2xl font-bold">{calculation.totals.totalMassages}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Directos y programas Skedu</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><WalletCards className="h-4 w-4" /> Ingresos totales</p>
                  <p className="mt-2 text-2xl font-bold">{money(calculation.totals.revenue)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{money(calculation.totals.discounts)} descontados</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Calculator className="h-4 w-4" /> Resultado operacional</p>
                  <p className={`mt-2 text-2xl font-bold ${calculation.totals.operationalResult < 0 ? "text-destructive" : "text-emerald-700"}`}>
                    {money(calculation.totals.operationalResult)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Antes del bono de Tamara</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> Resultado unidad</p>
                  <p className={`mt-2 text-2xl font-bold ${calculation.totals.unitResult < 0 ? "text-destructive" : "text-primary"}`}>
                    {money(calculation.totals.unitResult)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Bono Tamara: {money(calculation.totals.tamaraBonus)}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
              <Card>
                <CardHeader><CardTitle className="text-lg">Estado de resultados</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableBody>
                        <TableRow><TableCell className="font-medium">Ingresos totales</TableCell><TableCell className="text-right font-semibold">{money(calculation.totals.revenue)}</TableCell></TableRow>
                        <TableRow><TableCell>Costos generales</TableCell><TableCell className="text-right text-destructive">− {money(calculation.totals.costs.generalCosts)}</TableCell></TableRow>
                        <TableRow><TableCell>Sueldos base + Previred</TableCell><TableCell className="text-right text-destructive">− {money(calculation.totals.costs.hrCosts)}</TableCell></TableRow>
                        <TableRow><TableCell>Comisiones inhouse</TableCell><TableCell className="text-right text-destructive">− {money(calculation.totals.inhouseCommissions)}</TableCell></TableRow>
                        <TableRow><TableCell>Comisiones freelance</TableCell><TableCell className="text-right text-destructive">− {money(calculation.totals.freelanceCommissions)}</TableCell></TableRow>
                        <TableRow className="border-t-2"><TableCell className="font-semibold">Resultado operacional</TableCell><TableCell className="text-right font-bold">{money(calculation.totals.operationalResult)}</TableCell></TableRow>
                        <TableRow><TableCell>Bono Tamara (10%)</TableCell><TableCell className="text-right text-destructive">− {money(calculation.totals.tamaraBonus)}</TableCell></TableRow>
                        <TableRow className="bg-muted/40"><TableCell className="font-bold">Resultado unidad masajes</TableCell><TableCell className="text-right text-lg font-bold">{money(calculation.totals.unitResult)}</TableCell></TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Costos generales</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[
                    ["Insumos ($707 × masaje)", calculation.totals.costs.supplies],
                    ["Lavandería", calculation.totals.costs.laundry],
                    ["Traslado regular", calculation.totals.costs.regularTransport],
                    ["Traslados freelance", calculation.totals.costs.additionalTrips],
                    ["Energía eléctrica", calculation.totals.costs.electricity],
                    ["Contabilidad", calculation.totals.costs.accounting],
                    ["Ajustes manuales", calculation.totals.costs.manualAdjustments],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
                      <span className="text-muted-foreground">{label}</span><span className="font-medium">{money(value as number)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {!isClosed && (
              <div className="grid gap-5 xl:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-lg">Información mensual</CardTitle></CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Viajes adicionales freelance</Label>
                      <Input type="number" min={0} value={freelanceTripCount} onChange={(event) => setFreelanceTripCount(Math.max(0, Number(event.target.value) || 0))} />
                      <p className="mt-1 text-xs text-muted-foreground">{money(calculation.parameters.freelanceTripUnitCost)} por viaje</p>
                    </div>
                    <div>
                      <Label>Sueldo base Bárbara</Label>
                      <Input type="number" min={0} value={barbaraBaseSalary ?? ""} onChange={(event) => setBarbaraBaseSalary(numberInput(event.target.value))} placeholder="Información contadora" />
                    </div>
                    <div>
                      <Label>Sueldo base Daniela</Label>
                      <Input type="number" min={0} value={danielaBaseSalary ?? ""} onChange={(event) => setDanielaBaseSalary(numberInput(event.target.value))} placeholder="Información contadora" />
                    </div>
                    <div>
                      <Label>Sueldo base Tamara</Label>
                      <Input value={money(calculation.parameters.tamaraBaseSalary)} disabled />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Notas del cierre</Label>
                      <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Observaciones para contadora o jefatura" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-lg">Ajustes manuales</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => setAdjustments((current) => [
                      ...current,
                      { category: "other", description: "", amount: 0 },
                    ])}>
                      <Plus className="mr-1 h-4 w-4" /> Agregar
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {adjustments.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">Sin ajustes manuales.</p>}
                    {adjustments.map((adjustment, index) => (
                      <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[150px_1fr_130px_auto]">
                        <Select value={adjustment.category} onValueChange={(value: AdjustmentCategory) =>
                          setAdjustments((current) => current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, category: value } : item))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(adjustmentLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={adjustment.description} placeholder="Descripción obligatoria" onChange={(event) =>
                          setAdjustments((current) => current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, description: event.target.value } : item))} />
                        <Input type="number" value={adjustment.amount} onChange={(event) =>
                          setAdjustments((current) => current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, amount: Number(event.target.value) || 0 } : item))} />
                        <Button size="icon" variant="ghost" aria-label="Eliminar ajuste" onClick={() =>
                          setAdjustments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            <Card>
              <CardHeader><CardTitle className="text-lg">Liquidaciones y boletas</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Terapeuta</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Masajes</TableHead>
                        <TableHead className="text-right">Días</TableHead>
                        <TableHead className="text-right">Domingos</TableHead>
                        <TableHead className="text-right">Ingreso asociado</TableHead>
                        <TableHead className="text-right">Comisión / boleta</TableHead>
                        <TableHead>Licencias</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculation.byTherapist.map((row: any) => (
                        <TableRow key={row.therapistId ?? "missing"}>
                          <TableCell className="font-medium">{row.therapistName}</TableCell>
                          <TableCell><Badge variant="outline">{row.therapistType === "freelance" ? "Freelance" : row.therapistType === "inhouse" ? "Inhouse" : "Sin asignar"}</Badge></TableCell>
                          <TableCell className="text-right">{row.massages}</TableCell>
                          <TableCell className="text-right">{row.daysWorked}</TableCell>
                          <TableCell className="text-right">{row.sundaysWorked}</TableCell>
                          <TableCell className="text-right">{money(row.revenue)}</TableCell>
                          <TableCell className="text-right font-medium">{money(row.commission)}</TableCell>
                          <TableCell className="max-w-60 text-xs text-muted-foreground">
                            {row.leaves.length
                              ? row.leaves.map((leave: any) => `${leave.startDate}–${leave.endDate} (${leave.type})`).join(", ")
                              : "Sin licencias"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileSpreadsheet className="h-5 w-5" /> Cierres guardados</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {closureList.data?.length ? closureList.data.map((item) => (
                    <Button key={item.id} variant={item.closeMonth === closeMonth ? "default" : "outline"} size="sm" onClick={() => setCloseMonth(item.closeMonth)}>
                      {item.closeMonth} · {item.status === "closed" ? "Cerrado" : "Borrador"}
                    </Button>
                  )) : <p className="text-sm text-muted-foreground">Aún no hay cierres guardados.</p>}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
