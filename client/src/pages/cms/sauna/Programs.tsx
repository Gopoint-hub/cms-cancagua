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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { CalendarClock, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";

export default function SaunaPrograms() {
  const query = trpc.sauna.programs.pending.useQuery();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<any>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const schedule = trpc.sauna.programs.schedule.useMutation({
    onSuccess: () => {
      toast.success("Cupos Detox incorporados a la agenda");
      setSelected(null);
      void utils.sauna.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const dismiss = trpc.sauna.programs.dismiss.useMutation({
    onSuccess: () => void utils.sauna.invalidate(),
    onError: error => toast.error(error.message),
  });
  const choose = (program: any) => {
    setSelected(program);
    setDate(
      new Date(program.programStartsAt).toLocaleDateString("en-CA", {
        timeZone: "America/Santiago",
      })
    );
    setNotes(`Horario de sauna para ${program.serviceName}`);
  };
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-amber-700">Cruce de agendas</p>
          <h1 className="text-3xl font-bold">Pases Detox por agendar</h1>
          <p className="max-w-3xl text-muted-foreground">
            Skedu no permite cruzar el programa con Sauna. Cada pase aparece
            aquí hasta que se le asigna la hora exacta; al hacerlo descuenta sus
            personas de los seis cupos.
          </p>
        </div>
        <div className="space-y-3">
          {query.data?.map(program => (
            <Card key={program.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-700" />
                    <strong>{program.serviceName}</strong>
                    <Badge variant="outline">
                      <Users className="mr-1 h-3 w-3" />
                      {program.guests} cupos
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Programa inicia{" "}
                    {new Date(program.programStartsAt).toLocaleString("es-CL", {
                      timeZone: "America/Santiago",
                    })}{" "}
                    · {program.clientName || "Cliente Skedu"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {program.variantName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismiss.mutate({ id: program.id })}
                  >
                    No usa sauna
                  </Button>
                  <Button size="sm" onClick={() => choose(program)}>
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Asignar hora
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!query.data?.length && (
            <Card>
              <CardContent className="p-12 text-center">
                <Sparkles className="mx-auto mb-3 h-8 w-8 text-amber-600" />
                <p className="font-medium">
                  Todos los pases Detox están resueltos
                </p>
                <p className="text-sm text-muted-foreground">
                  Los nuevos programas aparecerán después de sincronizar Skedu.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        <Dialog
          open={Boolean(selected)}
          onOpenChange={open => !open && setSelected(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Asignar sauna al pase Detox</DialogTitle>
            </DialogHeader>
            {selected && (
              <>
                <div className="rounded-lg bg-amber-50 p-3 text-sm">
                  <strong>{selected.guests} cupos</strong> quedarán bloqueados
                  en el horario seleccionado.
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Fecha del sauna">
                    <Input
                      type="date"
                      value={date}
                      onChange={event => setDate(event.target.value)}
                    />
                  </Field>
                  <Field label="Hora del sauna">
                    <Input
                      type="time"
                      value={time}
                      onChange={event => setTime(event.target.value)}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Notas">
                      <Textarea
                        value={notes}
                        onChange={event => setNotes(event.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSelected(null)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() =>
                      schedule.mutate({
                        id: selected.id,
                        bookingDate: date,
                        startTime: time,
                        notes: notes || undefined,
                      })
                    }
                    disabled={schedule.isPending}
                  >
                    Confirmar y descontar cupos
                  </Button>
                </DialogFooter>
              </>
            )}
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
