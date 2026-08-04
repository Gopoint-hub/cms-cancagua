import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { Ban, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type BlockReason =
  "technical" | "temperature" | "private_event" | "maintenance" | "other";
const reasons: Record<BlockReason, string> = {
  technical: "Problema técnico",
  temperature: "Temperatura fuera de estándar",
  private_event: "Evento privado B2B",
  maintenance: "Mantención",
  other: "Otro",
};
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
const yearLater = () => {
  const value = new Date();
  value.setFullYear(value.getFullYear() + 1);
  return value.toISOString().slice(0, 10);
};

export default function BiopiscinasBlocks() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    startDate: today(),
    endDate: today(),
    startTime: "10:00",
    endTime: "22:00",
    blockedCapacity: 40,
    reason: "technical" as keyof typeof reasons,
    notes: "",
  });
  const utils = trpc.useUtils();
  const { data: services } = trpc.biopools.services.list.useQuery();
  const service =
    services?.find(item => item.status !== "archived") ?? services?.[0];
  const { data: blocks } = trpc.biopools.blocks.list.useQuery(
    { serviceId: service?.id ?? 0, from: today(), to: yearLater() },
    { enabled: Boolean(service) }
  );
  const create = trpc.biopools.blocks.create.useMutation({
    onSuccess: () => {
      toast.success("Bloqueo aplicado");
      setOpen(false);
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.biopools.blocks.remove.useMutation({
    onSuccess: () => {
      toast.success("Bloqueo desactivado");
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const submit = () =>
    service &&
    create.mutate({
      ...form,
      serviceId: service.id,
      notes: form.notes || undefined,
    });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-700">
              Control operacional
            </p>
            <h1 className="text-3xl font-semibold">Bloqueos de capacidad</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cierra un horario completo o descuenta parte del aforo de 40
              personas.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo bloqueo
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-amber-600" />
              Bloqueos próximos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(blocks ?? [])
              .filter(block => block.active)
              .map(block => (
                <div
                  key={block.id}
                  className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <strong>{reasons[block.reason]}</strong>
                      <Badge
                        variant={
                          block.blockedCapacity >= (service?.capacity ?? 40)
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {block.blockedCapacity} cupos bloqueados
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {block.startDate} al {block.endDate} · {block.startTime}–
                      {block.endTime}
                    </p>
                    {block.notes && (
                      <p className="text-sm mt-2">{block.notes}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600"
                    onClick={() => remove.mutate({ id: block.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            {!blocks?.some(block => block.active) && (
              <p className="py-10 text-center text-muted-foreground">
                No existen bloqueos activos.
              </p>
            )}
          </CardContent>
        </Card>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bloquear Biopiscinas</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Desde</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={e =>
                    setForm({
                      ...form,
                      startDate: e.target.value,
                      endDate:
                        e.target.value > form.endDate
                          ? e.target.value
                          : form.endDate,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Hasta</Label>
                <Input
                  type="date"
                  min={form.startDate}
                  value={form.endDate}
                  onChange={e => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora inicial</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={e =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Hora final</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={e => setForm({ ...form, endTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cupos a bloquear</Label>
                <Input
                  type="number"
                  min={1}
                  max={service?.capacity ?? 40}
                  value={form.blockedCapacity}
                  onChange={e =>
                    setForm({
                      ...form,
                      blockedCapacity: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Select
                  value={form.reason}
                  onValueChange={(reason: keyof typeof reasons) =>
                    setForm({ ...form, reason })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(reasons).map(([value, label]) => (
                      <SelectItem value={value} key={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Detalle interno</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Ej.: temperatura bajo el estándar o nombre del evento privado"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={create.isPending}>
                {create.isPending ? "Aplicando…" : "Aplicar bloqueo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
