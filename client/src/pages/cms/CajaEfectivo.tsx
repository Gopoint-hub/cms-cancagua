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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowDownToLine, Banknote, CircleDollarSign, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const SERVICE_LABELS: Record<string, string> = {
  biopools: "Biopiscinas",
  hot_tubs: "Hot Tubs",
  sauna: "Sauna",
  regular_classes: "Clases regulares",
  hot_tub_menu: "Carta Hot Tubs",
  massages: "Masajes",
  cafe: "Cafetería",
  gift_cards: "Gift Cards",
  other: "Otro servicio",
};
const CATEGORY_LABELS: Record<string, string> = {
  bank_deposit: "Depósito en cuenta de la empresa",
  maintenance: "Compra de mantención",
  operations: "Compra de operación",
  other: "Otro retiro",
};

function chileDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}
function chileDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}
function monthStart() {
  return `${chileDate().slice(0, 7)}-01`;
}
function money(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CajaEfectivo() {
  const utils = trpc.useUtils();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(chileDate());
  const [service, setService] = useState("all");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [withdrawal, setWithdrawal] = useState({ amountClp: "", category: "bank_deposit", reason: "", occurredAt: chileDateTime() });
  const [income, setIncome] = useState({ amountClp: "", service: "hot_tubs", reason: "", occurredAt: chileDateTime() });
  const summary = trpc.cashRegister.summary.useQuery({
    from,
    to,
    services: service === "all" ? undefined : [service as any],
  });
  const withdraw = trpc.cashRegister.withdraw.useMutation({
    onSuccess: async () => {
      await utils.cashRegister.summary.invalidate();
      setWithdrawOpen(false);
      setWithdrawal({ amountClp: "", category: "bank_deposit", reason: "", occurredAt: chileDateTime() });
      toast.success("Retiro registrado en la caja");
    },
    onError: error => toast.error(error.message),
  });
  const addIncome = trpc.cashRegister.addManualIncome.useMutation({
    onSuccess: async () => {
      await utils.cashRegister.summary.invalidate();
      setIncomeOpen(false);
      setIncome({ amountClp: "", service: "hot_tubs", reason: "", occurredAt: chileDateTime() });
      toast.success("Ingreso en efectivo registrado");
    },
    onError: error => toast.error(error.message),
  });
  const voidMovement = trpc.cashRegister.voidMovement.useMutation({
    onSuccess: async () => {
      await utils.cashRegister.summary.invalidate();
      toast.success("Movimiento anulado; el saldo fue recalculado");
    },
    onError: error => toast.error(error.message),
  });
  const rows = useMemo(() => summary.data?.transactions ?? [], [summary.data?.transactions]);

  const voidRow = (id: number) => {
    const reason = window.prompt("Motivo de la anulación (queda guardado en el historial):")?.trim();
    if (reason && reason.length >= 5) voidMovement.mutate({ id, reason });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-3 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Administración</p>
            <h1 className="mt-1 text-3xl font-semibold">Caja efectivo</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ingresos cobrados en recepción, retiros y saldo disponible desde la apertura de esta caja{summary.data?.openedAt ? ` el ${new Date(summary.data.openedAt).toLocaleDateString("es-CL")}` : ""}.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setIncomeOpen(true)}><Plus className="mr-2 h-4 w-4" />Registrar ingreso externo</Button>
            <Button onClick={() => setWithdrawOpen(true)}><ArrowDownToLine className="mr-2 h-4 w-4" />Registrar retiro</Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-indigo-200 bg-indigo-50/60"><CardContent className="p-5"><Banknote className="h-5 w-5 text-indigo-700" /><p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Efectivo disponible</p><p className="mt-1 text-3xl font-semibold text-indigo-950">{money(summary.data?.current.balanceClp ?? 0)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><CircleDollarSign className="h-5 w-5 text-emerald-700" /><p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Ingresos del período</p><p className="mt-1 text-2xl font-semibold text-emerald-800">{money(summary.data?.period.incomeClp ?? 0)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><ArrowDownToLine className="h-5 w-5 text-amber-700" /><p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Retiros del período</p><p className="mt-1 text-2xl font-semibold">{money(summary.data?.period.withdrawalsClp ?? 0)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><Plus className="h-5 w-5 text-slate-600" /><p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Ingresos externos</p><p className="mt-1 text-2xl font-semibold">{money(summary.data?.period.manualIncomeClp ?? 0)}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Movimientos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Desde</Label><Input type="date" value={from} onChange={event => setFrom(event.target.value)} /></div>
              <div><Label>Hasta</Label><Input type="date" value={to} onChange={event => setTo(event.target.value)} /></div>
              <div><Label>Servicio</Label><Select value={service} onValueChange={setService}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los servicios</SelectItem>{Object.entries(SERVICE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {summary.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div> : (
              <div className="overflow-hidden rounded-xl border">
                {rows.map((row: any) => {
                  const withdrawalRow = row.kind === "withdrawal";
                  const voided = Boolean(row.voidedAt);
                  return <div key={row.id} className={`grid gap-2 border-b p-4 last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)_150px_auto] sm:items-center ${voided ? "bg-muted/50 opacity-60" : ""}`}>
                    <div><Badge variant={withdrawalRow ? "outline" : "secondary"}>{withdrawalRow ? "Retiro" : "Ingreso"}</Badge><p className="mt-1 text-xs text-muted-foreground">{new Date(row.occurredAt).toLocaleString("es-CL")}</p></div>
                    <div className="min-w-0"><p className={`font-semibold ${voided ? "line-through" : ""}`}>{row.reason}</p><p className="text-xs text-muted-foreground">{withdrawalRow ? CATEGORY_LABELS[row.category] ?? "Retiro" : SERVICE_LABELS[row.service] ?? row.service}{row.createdBy ? ` · ${row.createdBy}` : ""}</p>{voided && <p className="mt-1 text-xs font-medium text-red-700">Anulado: {row.voidReason}</p>}</div>
                    <p className={`font-semibold sm:text-right ${withdrawalRow ? "text-amber-800" : "text-emerald-800"}`}>{withdrawalRow ? "−" : "+"}{money(row.amountClp)}</p>
                    <div>{row.canVoid && <Button size="sm" variant="ghost" disabled={voidMovement.isPending} onClick={() => voidRow(row.recordId)}><RotateCcw className="mr-1 h-4 w-4" />Anular</Button>}</div>
                  </div>;
                })}
                {!rows.length && <p className="py-12 text-center text-sm text-muted-foreground">No hay movimientos en este período.</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent><DialogHeader><DialogTitle>Registrar retiro de efectivo</DialogTitle><DialogDescription>El retiro se descontará del saldo y quedará en el historial de caja.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Monto</Label><Input type="number" min={1} value={withdrawal.amountClp} onChange={event => setWithdrawal({ ...withdrawal, amountClp: event.target.value })} /></div><div><Label>Destino</Label><Select value={withdrawal.category} onValueChange={category => setWithdrawal({ ...withdrawal, category })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>Fecha y hora</Label><Input type="datetime-local" value={withdrawal.occurredAt} onChange={event => setWithdrawal({ ...withdrawal, occurredAt: event.target.value })} /></div><div><Label>Motivo o detalle</Label><Textarea value={withdrawal.reason} onChange={event => setWithdrawal({ ...withdrawal, reason: event.target.value })} placeholder="Ej.: depósito del efectivo recaudado esta semana" /></div></div><DialogFooter><Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancelar</Button><Button disabled={withdraw.isPending || !Number(withdrawal.amountClp) || withdrawal.reason.trim().length < 3} onClick={() => withdraw.mutate({ amountClp: Number(withdrawal.amountClp), category: withdrawal.category as any, reason: withdrawal.reason.trim(), occurredAt: withdrawal.occurredAt })}>{withdraw.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar retiro</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={incomeOpen} onOpenChange={setIncomeOpen}>
        <DialogContent><DialogHeader><DialogTitle>Registrar ingreso externo</DialogTitle><DialogDescription>Usa esta opción solo cuando el servicio no tenga una reserva o pago administrado por el CMS.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Servicio</Label><Select value={income.service} onValueChange={service => setIncome({ ...income, service })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SERVICE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>Monto</Label><Input type="number" min={1} value={income.amountClp} onChange={event => setIncome({ ...income, amountClp: event.target.value })} /></div><div><Label>Fecha y hora</Label><Input type="datetime-local" value={income.occurredAt} onChange={event => setIncome({ ...income, occurredAt: event.target.value })} /></div><div><Label>Detalle</Label><Textarea value={income.reason} onChange={event => setIncome({ ...income, reason: event.target.value })} placeholder="Ej.: pago en efectivo de Hot Tub registrado fuera del CMS" /></div></div><DialogFooter><Button variant="outline" onClick={() => setIncomeOpen(false)}>Cancelar</Button><Button disabled={addIncome.isPending || !Number(income.amountClp) || income.reason.trim().length < 3} onClick={() => addIncome.mutate({ service: income.service as any, amountClp: Number(income.amountClp), reason: income.reason.trim(), occurredAt: income.occurredAt })}>{addIncome.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar ingreso</Button></DialogFooter></DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
