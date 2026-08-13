import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { addMonths, format } from "date-fns";
import { Ban, Plus } from "lucide-react";
import { toast } from "sonner";

const reasons = {
  maintenance: "Mantención",
  private_event: "Evento privado",
  detox: "Programa Detox",
  operational: "Operación",
  other: "Otro",
} as const;

export default function SaunaBlocks() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    blockDate: today,
    startTime: "10:00",
    endTime: "11:00",
    blockedCapacity: 6,
    reason: "maintenance" as keyof typeof reasons,
    notes: "",
  });
  const query = trpc.sauna.blocks.list.useQuery({
    from: today,
    to: format(addMonths(new Date(), 6), "yyyy-MM-dd"),
  });
  const utils = trpc.useUtils();
  const create = trpc.sauna.blocks.create.useMutation({
    onSuccess: () => {
      toast.success("Bloqueo creado");
      setOpen(false);
      void utils.sauna.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const toggle = trpc.sauna.blocks.setActive.useMutation({
    onSuccess: () => void utils.sauna.invalidate(),
    onError: error => toast.error(error.message),
  });
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-700">Sauna</p>
            <h1 className="text-3xl font-bold">Bloqueos y excepciones</h1>
            <p className="text-muted-foreground">
              Descuenta entre 1 y 6 cupos por mantención, operación o eventos.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo bloqueo
          </Button>
        </div>
        <div className="space-y-3">
          {query.data?.map(block => (
            <Card key={block.id} className={!block.active ? "opacity-50" : ""}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Ban className="h-4 w-4 text-amber-700" />
                    <strong>
                      {String(block.blockDate).slice(0, 10)} · {block.startTime}
                      –{block.endTime}
                    </strong>
                    <Badge variant="outline">
                      {block.blockedCapacity}/6 cupos
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {reasons[block.reason]}
                    {block.notes ? ` · ${block.notes}` : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toggle.mutate({
                      id: block.id,
                      active: !Boolean(block.active),
                    })
                  }
                >
                  {block.active ? "Desactivar" : "Reactivar"}
                </Button>
              </CardContent>
            </Card>
          ))}
          {!query.data?.length && (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                No hay bloqueos próximos.
              </CardContent>
            </Card>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo bloqueo de cupos</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fecha">
                <Input
                  type="date"
                  value={form.blockDate}
                  onChange={event =>
                    setForm({ ...form, blockDate: event.target.value })
                  }
                />
              </Field>
              <Field label="Cupos bloqueados">
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={form.blockedCapacity}
                  onChange={event =>
                    setForm({
                      ...form,
                      blockedCapacity: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Desde">
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={event =>
                    setForm({ ...form, startTime: event.target.value })
                  }
                />
              </Field>
              <Field label="Hasta">
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={event =>
                    setForm({ ...form, endTime: event.target.value })
                  }
                />
              </Field>
              <Field label="Motivo">
                <Select
                  value={form.reason}
                  onValueChange={(value: any) =>
                    setForm({ ...form, reason: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(reasons).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notas">
                  <Textarea
                    value={form.notes}
                    onChange={event =>
                      setForm({ ...form, notes: event.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() =>
                  create.mutate({ ...form, notes: form.notes || undefined })
                }
                disabled={create.isPending}
              >
                Crear bloqueo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
