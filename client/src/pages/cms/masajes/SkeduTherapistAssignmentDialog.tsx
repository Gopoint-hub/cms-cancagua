import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, UserRoundCog } from "lucide-react";
import { toast } from "sonner";

type SkeduBooking = {
  id: number;
  clientName: string;
  techniqueName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  duration: 30 | 50;
  modality: "simple" | "double";
  therapistId: number;
  therapistName: string | null;
  secondTherapistId: number | null;
  secondTherapistName: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: SkeduBooking | null;
  onUpdated?: () => void;
};

export default function SkeduTherapistAssignmentDialog({
  open,
  onOpenChange,
  booking,
  onUpdated,
}: Props) {
  const [therapistId, setTherapistId] = useState("");
  const [secondTherapistId, setSecondTherapistId] = useState("");

  const { data: allTherapists } = trpc.masajes.terapeutas.getAll.useQuery(undefined, { enabled: open });
  const { data: resources, isFetching } = trpc.masajes.agenda.getSkeduProgramResources.useQuery(
    {
      bookingDate: booking?.bookingDate ?? "",
      startTime: booking?.startTime ?? "",
      duration: booking?.duration ?? 30,
      modality: booking?.modality ?? "simple",
      excludeBookingId: booking?.id,
    },
    { enabled: open && !!booking }
  );

  useEffect(() => {
    if (!open || !booking) return;
    setTherapistId(String(booking.therapistId));
    setSecondTherapistId(booking.secondTherapistId ? String(booking.secondTherapistId) : "");
  }, [open, booking]);

  const selectableTherapists = useMemo(() => {
    const byId = new Map<number, { id: number; name: string | null; type: "inhouse" | "freelance" }>();
    for (const therapist of resources?.therapists ?? []) {
      byId.set(therapist.id, { id: therapist.id, name: therapist.name, type: therapist.type });
    }
    const currentIds = [booking?.therapistId, booking?.secondTherapistId].filter(
      (id): id is number => typeof id === "number",
    );
    for (const currentId of currentIds) {
      if (byId.has(currentId)) continue;
      const therapist = allTherapists?.find((item) => item.id === currentId);
      if (therapist) {
        byId.set(currentId, { id: therapist.id, name: therapist.name, type: therapist.type });
      }
    }
    return Array.from(byId.values());
  }, [resources, allTherapists, booking]);

  const availableSecondTherapists = selectableTherapists.filter(
    (therapist) => String(therapist.id) !== therapistId,
  );
  const selectionIsValid = !!booking
    && !!therapistId
    && (booking.modality === "simple" || (!!secondTherapistId && therapistId !== secondTherapistId));
  const hasChanges = !!booking
    && (therapistId !== String(booking.therapistId)
      || secondTherapistId !== String(booking.secondTherapistId ?? ""));

  const updateMutation = trpc.masajes.agenda.updateSkeduProgramTherapists.useMutation({
    onSuccess: () => {
      toast.success("Asignación de terapeutas actualizada");
      onUpdated?.();
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const save = () => {
    if (!booking || !selectionIsValid) {
      toast.error("Selecciona los terapeutas requeridos");
      return;
    }
    updateMutation.mutate({
      id: booking.id,
      therapistId: Number(therapistId),
      secondTherapistId: booking.modality === "double" ? Number(secondTherapistId) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRoundCog className="h-5 w-5 text-violet-600" />
            Editar asignación de terapeutas
          </DialogTitle>
        </DialogHeader>

        {booking && (
          <div className="space-y-5 py-2">
            <div className="rounded-xl border bg-violet-50/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-stone-900">{booking.techniqueName}</p>
                <Badge variant="outline" className="border-violet-300 text-violet-700">
                  {booking.modality === "double" ? "Doble" : "Simple"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{booking.clientName}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {booking.bookingDate} · {booking.startTime}–{booking.endTime} · {booking.duration} min
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className={booking.modality === "simple" ? "sm:col-span-2" : ""}>
                <Label>Terapeuta 1 *</Label>
                <Select value={therapistId} onValueChange={setTherapistId} disabled={isFetching}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={isFetching ? "Revisando disponibilidad…" : "Seleccionar terapeuta"} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableTherapists.map((therapist) => (
                      <SelectItem key={therapist.id} value={String(therapist.id)}>
                        {therapist.name} · {therapist.type === "inhouse" ? "Inhouse" : "Freelance"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {booking.modality === "double" && (
                <div>
                  <Label>Terapeuta 2 *</Label>
                  <Select value={secondTherapistId} onValueChange={setSecondTherapistId} disabled={isFetching}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={isFetching ? "Revisando disponibilidad…" : "Seleccionar terapeuta"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSecondTherapists.map((therapist) => (
                        <SelectItem key={therapist.id} value={String(therapist.id)}>
                          {therapist.name} · {therapist.type === "inhouse" ? "Inhouse" : "Freelance"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {!isFetching && selectableTherapists.length < (booking.modality === "double" ? 2 : 1) && (
              <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                No hay suficientes terapeutas disponibles para cambiar esta asignación.
              </div>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">
              Aparecen los terapeutas disponibles para la fecha y horario, además de quienes ya están asignados. La sala y los demás datos del programa no se modificarán.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={save}
            disabled={!selectionIsValid || !hasChanges || isFetching || updateMutation.isPending}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {updateMutation.isPending ? "Guardando…" : "Guardar asignación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
