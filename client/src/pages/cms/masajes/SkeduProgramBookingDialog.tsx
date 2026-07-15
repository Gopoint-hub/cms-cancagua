import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  onCreated?: () => void;
};

const todayChile = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

export default function SkeduProgramBookingDialog({ open, onOpenChange, initialDate, onCreated }: Props) {
  const [program, setProgram] = useState("reconecta");
  const [duration, setDuration] = useState<30 | 50>(30);
  const [modality, setModality] = useState<"simple" | "double">("simple");
  const [clientName, setClientName] = useState("");
  const [secondClientName, setSecondClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [bookingDate, setBookingDate] = useState(initialDate || todayChile());
  const [startTime, setStartTime] = useState("10:00");
  const [therapistId, setTherapistId] = useState("");
  const [secondTherapistId, setSecondTherapistId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [notes, setNotes] = useState("");
  const [notifyTherapists, setNotifyTherapists] = useState(true);

  const { data: programs } = trpc.masajes.agenda.getSkeduPrograms.useQuery(undefined, { enabled: open });
  const selectedProgram = programs?.find((option) => option.value === program);
  const { data: resources, isFetching: loadingResources } = trpc.masajes.agenda.getSkeduProgramResources.useQuery(
    { bookingDate, startTime, duration, modality },
    { enabled: open && !!bookingDate && /^\d{2}:\d{2}$/.test(startTime) }
  );

  const availableSecondTherapists = useMemo(
    () => resources?.therapists.filter((therapist) => String(therapist.id) !== therapistId) ?? [],
    [resources, therapistId]
  );

  useEffect(() => {
    if (open && initialDate) setBookingDate(initialDate);
  }, [open, initialDate]);

  useEffect(() => {
    if (!open || !resources) return;
    const therapistIds = new Set(resources.therapists.map((therapist) => String(therapist.id)));
    const roomIds = new Set(resources.rooms.map((room) => String(room.id)));
    const first = therapistIds.has(therapistId) ? therapistId : String(resources.therapists[0]?.id ?? "");
    setTherapistId(first);
    if (modality === "double") {
      const secondAvailable = resources.therapists.find((therapist) => String(therapist.id) !== first);
      setSecondTherapistId(
        therapistIds.has(secondTherapistId) && secondTherapistId !== first
          ? secondTherapistId
          : String(secondAvailable?.id ?? "")
      );
    } else {
      setSecondTherapistId("");
    }
    if (!roomIds.has(roomId)) setRoomId(String(resources.rooms[0]?.id ?? ""));
  }, [open, resources, modality]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedProgram && !selectedProgram.durations.includes(duration as never)) {
      setDuration(selectedProgram.durations[0]);
    }
  }, [selectedProgram, duration]);

  const reset = () => {
    setProgram("reconecta");
    setDuration(30);
    setModality("simple");
    setClientName("");
    setSecondClientName("");
    setClientPhone("");
    setClientEmail("");
    setBookingDate(initialDate || todayChile());
    setStartTime("10:00");
    setTherapistId("");
    setSecondTherapistId("");
    setRoomId("");
    setExternalReference("");
    setNotes("");
    setNotifyTherapists(true);
  };

  const createMutation = trpc.masajes.agenda.createSkeduProgramBooking.useMutation({
    onSuccess: () => {
      toast.success("Masaje de programa registrado y agenda bloqueada");
      onCreated?.();
      onOpenChange(false);
      reset();
    },
    onError: (error) => toast.error(error.message),
  });

  const canSubmit = !!clientName.trim() && !!bookingDate && !!startTime && !!therapistId && !!roomId &&
    (modality === "simple" || (!!secondClientName.trim() && !!secondTherapistId));

  const submit = () => {
    if (!canSubmit) return toast.error("Completa los datos y recursos requeridos");
    createMutation.mutate({
      program: program as "reconecta" | "reconecta_detox" | "bio_reconecta" | "bio_reconecta_detox" | "reset",
      duration,
      modality,
      clientName: clientName.trim(),
      secondClientName: modality === "double" ? secondClientName.trim() : undefined,
      clientPhone: clientPhone.trim() || undefined,
      clientEmail: clientEmail.trim() || undefined,
      bookingDate,
      startTime,
      therapistId: Number(therapistId),
      secondTherapistId: modality === "double" ? Number(secondTherapistId) : undefined,
      roomId: Number(roomId),
      externalReference: externalReference.trim() || undefined,
      notes: notes.trim() || undefined,
      notifyTherapists,
    });
  };

  const hasEnoughTherapists = (resources?.therapists.length ?? 0) >= (modality === "double" ? 2 : 1);
  const hasRoom = (resources?.rooms.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5" /> Registrar masaje de programa (Skedu)
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div>
            <Label>Programa *</Label>
            <Select value={program} onValueChange={setProgram}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {programs?.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Duración *</Label>
            <Select value={String(duration)} onValueChange={(value) => setDuration(Number(value) as 30 | 50)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {selectedProgram?.durations.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutos</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Modalidad *</Label>
            <Select value={modality} onValueChange={(value) => setModality(value as "simple" | "double")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple — 1 terapeuta y 1 sala</SelectItem>
                <SelectItem value="double">Doble — 2 terapeutas y 1 sala doble</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Cliente 1 *</Label>
            <Input value={clientName} onChange={(event) => setClientName(event.target.value)} />
          </div>
          {modality === "double" && (
            <div>
              <Label>Cliente 2 *</Label>
              <Input value={secondClientName} onChange={(event) => setSecondClientName(event.target.value)} />
            </div>
          )}
          <div>
            <Label>Teléfono</Label>
            <Input value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} />
          </div>
          <div>
            <Label>Fecha *</Label>
            <Input type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} />
          </div>
          <div>
            <Label>Hora de inicio *</Label>
            <Input type="time" step={1800} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </div>

          <div>
            <Label>Terapeuta 1 *</Label>
            <Select value={therapistId} onValueChange={setTherapistId} disabled={loadingResources}>
              <SelectTrigger><SelectValue placeholder="Sin disponibilidad" /></SelectTrigger>
              <SelectContent>
                {resources?.therapists.map((therapist) => (
                  <SelectItem key={therapist.id} value={String(therapist.id)}>
                    {therapist.name} · {therapist.type === "inhouse" ? "Inhouse" : "Freelance"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {modality === "double" && (
            <div>
              <Label>Terapeuta 2 *</Label>
              <Select value={secondTherapistId} onValueChange={setSecondTherapistId} disabled={loadingResources}>
                <SelectTrigger><SelectValue placeholder="Sin disponibilidad" /></SelectTrigger>
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
          <div className="sm:col-span-2">
            <Label>Sala *</Label>
            <Select value={roomId} onValueChange={setRoomId} disabled={loadingResources}>
              <SelectTrigger><SelectValue placeholder="Sin salas disponibles" /></SelectTrigger>
              <SelectContent>
                {resources?.rooms.map((room) => <SelectItem key={room.id} value={String(room.id)}>{room.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {resources?.endTime && <p className="text-xs text-muted-foreground mt-1">Finaliza a las {resources.endTime}; se reservan 10 minutos de preparación.</p>}
          </div>

          {!loadingResources && (!hasEnoughTherapists || !hasRoom) && (
            <div className="sm:col-span-2 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>No hay suficientes terapeutas o una sala compatible disponibles. Revisa la fecha, hora o modalidad.</span>
            </div>
          )}

          <div>
            <Label>Referencia Skedu</Label>
            <Input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="ID o código de la reserva" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={notifyTherapists} onCheckedChange={(checked) => setNotifyTherapists(checked === true)} />
              Notificar a terapeutas
            </label>
          </div>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!canSubmit || !hasEnoughTherapists || !hasRoom || createMutation.isPending}>
            Registrar y bloquear agenda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
