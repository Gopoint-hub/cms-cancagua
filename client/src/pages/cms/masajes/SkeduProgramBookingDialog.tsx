import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  isPendingMassagePaymentMethod,
  MANUAL_MASSAGE_PAYMENT_METHODS,
  MASSAGE_PAYMENT_METHOD_LABELS,
  type ManualMassagePaymentMethod,
} from "@shared/massagePayments";
import { hasMassagePaymentAccess } from "@shared/permissions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  onCreated?: () => void;
};

type SkeduProgramPaymentMethod = Exclude<
  ManualMassagePaymentMethod,
  "gift_card" | "getnet_link"
>;

type ProgramPartySize = 1 | 2 | 3 | 4;
type ProgramScheduleMode = "simultaneous" | "two_by_two";

const todayChile = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
const programModality = (partySize: ProgramPartySize) =>
  partySize === 1 ? ("simple" as const) : ("double" as const);
const programPrice = (duration: 30 | 50, partySize: ProgramPartySize) =>
  (duration === 30 ? 35_000 : 45_000) * partySize;
const requiredProgramTherapists = (
  partySize: ProgramPartySize,
  scheduleMode: ProgramScheduleMode
) => (partySize === 4 && scheduleMode === "two_by_two" ? 2 : partySize);
const requiredProgramRooms = (
  partySize: ProgramPartySize,
  scheduleMode: ProgramScheduleMode
) =>
  partySize <= 2 || (partySize === 4 && scheduleMode === "two_by_two") ? 1 : 2;
const money = (amount: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);

export default function SkeduProgramBookingDialog({
  open,
  onOpenChange,
  initialDate,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const canManagePayments = hasMassagePaymentAccess(user ?? {});
  const [program, setProgram] = useState("reconecta");
  const [duration, setDuration] = useState<30 | 50>(30);
  const [partySize, setPartySize] = useState<ProgramPartySize>(1);
  const [scheduleMode, setScheduleMode] =
    useState<ProgramScheduleMode>("simultaneous");
  const [clientName, setClientName] = useState("");
  const [secondClientName, setSecondClientName] = useState("");
  const [thirdClientName, setThirdClientName] = useState("");
  const [fourthClientName, setFourthClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [bookingDate, setBookingDate] = useState(initialDate || todayChile());
  const [startTime, setStartTime] = useState("10:00");
  const [roomId, setRoomId] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<SkeduProgramPaymentMethod>("pending_payment");
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");

  const { data: programs } = trpc.masajes.agenda.getSkeduPrograms.useQuery(
    undefined,
    { enabled: open }
  );
  const selectedProgram = programs?.find(option => option.value === program);
  const { data: resources, isFetching: loadingResources } =
    trpc.masajes.agenda.getSkeduProgramResources.useQuery(
      {
        bookingDate,
        startTime,
        duration,
        modality: programModality(partySize),
        partySize,
        scheduleMode,
        preferredRoomId: roomId ? Number(roomId) : undefined,
      },
      { enabled: open && !!bookingDate && /^\d{2}:\d{2}$/.test(startTime) }
    );

  useEffect(() => {
    if (open && initialDate) setBookingDate(initialDate);
  }, [open, initialDate]);

  useEffect(() => {
    if (!open || canManagePayments) return;
    setPaymentMethod("pending_payment");
    setPaymentReference("");
  }, [open, canManagePayments]);

  useEffect(() => {
    if (!open || !resources) return;
    const roomIds = new Set(resources.rooms.map(room => String(room.id)));
    if (!roomIds.has(roomId)) setRoomId(String(resources.rooms[0]?.id ?? ""));
  }, [open, resources, partySize, scheduleMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      selectedProgram &&
      !selectedProgram.durations.includes(duration as never)
    ) {
      setDuration(selectedProgram.durations[0]);
    }
  }, [selectedProgram, duration]);

  const reset = () => {
    setProgram("reconecta");
    setDuration(30);
    setPartySize(1);
    setScheduleMode("simultaneous");
    setClientName("");
    setSecondClientName("");
    setThirdClientName("");
    setFourthClientName("");
    setClientPhone("");
    setClientEmail("");
    setBookingDate(initialDate || todayChile());
    setStartTime("10:00");
    setRoomId("");
    setExternalReference("");
    setPaymentMethod("pending_payment");
    setPaymentReference("");
    setNotes("");
  };

  const createMutation =
    trpc.masajes.agenda.createSkeduProgramBooking.useMutation({
      onSuccess: () => {
        toast.success("Masaje de programa registrado y agenda bloqueada");
        onCreated?.();
        onOpenChange(false);
        reset();
      },
      onError: error => toast.error(error.message),
    });

  const paymentComplete =
    !canManagePayments ||
    isPendingMassagePaymentMethod(paymentMethod) ||
    paymentMethod === "cash" ||
    Boolean(paymentReference.trim());
  const resourcesAvailable = resources?.available === true;
  const hasRoom = resourcesAvailable && (resources?.rooms.length ?? 0) > 0;
  const participantNamesComplete = [
    clientName,
    secondClientName,
    thirdClientName,
    fourthClientName,
  ]
    .slice(0, partySize)
    .every(name => name.trim().length >= 2);
  const canSubmit =
    !!clientName.trim() &&
    !!bookingDate &&
    !!startTime &&
    !!roomId &&
    participantNamesComplete &&
    paymentComplete &&
    !loadingResources &&
    resourcesAvailable &&
    hasRoom;

  const submit = () => {
    if (loadingResources)
      return toast.info("Revisando disponibilidad de terapeutas y salas");
    if (!resourcesAvailable || !hasRoom)
      return toast.error(
        "No hay suficientes terapeutas o salas para esa distribución"
      );
    if (!canSubmit)
      return toast.error("Completa los datos y recursos requeridos");
    createMutation.mutate({
      program: program as
        | "reconecta"
        | "reconecta_detox"
        | "bio_reconecta"
        | "bio_reconecta_detox"
        | "reset",
      duration,
      modality: programModality(partySize),
      partySize,
      scheduleMode,
      clientName: clientName.trim(),
      secondClientName: partySize >= 2 ? secondClientName.trim() : undefined,
      thirdClientName: partySize >= 3 ? thirdClientName.trim() : undefined,
      fourthClientName: partySize >= 4 ? fourthClientName.trim() : undefined,
      clientPhone: clientPhone.trim() || undefined,
      clientEmail: clientEmail.trim() || undefined,
      bookingDate,
      startTime,
      roomId: Number(roomId),
      externalReference: externalReference.trim() || undefined,
      paymentMethod: canManagePayments ? paymentMethod : "pending_payment",
      paymentReference: canManagePayments
        ? paymentReference.trim() || undefined
        : undefined,
      notes: notes.trim() || undefined,
    });
  };

  const totalClp = programPrice(duration, partySize);
  const requiredTherapists =
    resources?.requiredTherapists ??
    requiredProgramTherapists(partySize, scheduleMode);
  const requiredRooms =
    resources?.requiredRooms ?? requiredProgramRooms(partySize, scheduleMode);

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5" /> Registrar masaje de programa
            (Skedu)
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div>
            <Label>Programa *</Label>
            <Select value={program} onValueChange={setProgram}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {programs?.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Duración *</Label>
            <Select
              value={String(duration)}
              onValueChange={value => setDuration(Number(value) as 30 | 50)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectedProgram?.durations.map(minutes => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} minutos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cantidad de personas *</Label>
            <Select
              value={String(partySize)}
              onValueChange={value => {
                const nextPartySize = Number(value) as ProgramPartySize;
                setPartySize(nextPartySize);
                if (nextPartySize < 4) setScheduleMode("simultaneous");
                if (nextPartySize < 4) setFourthClientName("");
                if (nextPartySize < 3) setThirdClientName("");
                if (nextPartySize < 2) setSecondClientName("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 persona</SelectItem>
                <SelectItem value="2">2 personas</SelectItem>
                <SelectItem value="3">3 personas</SelectItem>
                <SelectItem value="4">4 personas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {partySize === 4 && (
            <div>
              <Label>Distribución *</Label>
              <Select
                value={scheduleMode}
                onValueChange={value =>
                  setScheduleMode(value as ProgramScheduleMode)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simultaneous">
                    4 al mismo tiempo
                  </SelectItem>
                  <SelectItem value="two_by_two">
                    2 primero y 2 después
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Cliente 1 *</Label>
            <Input
              value={clientName}
              onChange={event => setClientName(event.target.value)}
            />
          </div>
          {partySize >= 2 && (
            <div>
              <Label>Cliente 2 *</Label>
              <Input
                value={secondClientName}
                onChange={event => setSecondClientName(event.target.value)}
              />
            </div>
          )}
          {partySize >= 3 && (
            <div>
              <Label>Cliente 3 *</Label>
              <Input
                value={thirdClientName}
                onChange={event => setThirdClientName(event.target.value)}
              />
            </div>
          )}
          {partySize >= 4 && (
            <div>
              <Label>Cliente 4 *</Label>
              <Input
                value={fourthClientName}
                onChange={event => setFourthClientName(event.target.value)}
              />
            </div>
          )}
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg bg-stone-100 px-4 py-3 text-sm">
            <span>
              Valor total · {partySize}{" "}
              {partySize === 1 ? "persona" : "personas"}
            </span>
            <strong>{money(totalClp)}</strong>
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input
              value={clientPhone}
              onChange={event => setClientPhone(event.target.value)}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={clientEmail}
              onChange={event => setClientEmail(event.target.value)}
            />
          </div>
          <div>
            <Label>Fecha *</Label>
            <Input
              type="date"
              value={bookingDate}
              onChange={event => setBookingDate(event.target.value)}
            />
          </div>
          <div>
            <Label>Hora de inicio *</Label>
            <Input
              type="time"
              step={1800}
              value={startTime}
              onChange={event => setStartTime(event.target.value)}
            />
          </div>

          <div className="sm:col-span-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
            <p className="font-medium">Asignación automática de terapeutas</p>
            <p className="mt-1 text-xs leading-relaxed">
              Si corresponde a una terapeuta inhouse, quedará asignada
              automáticamente y recibirá un aviso. Solo las terapeutas freelance
              tendrán 60 minutos para confirmar antes de avisar a la siguiente.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label>Sala principal *</Label>
            <Select
              value={roomId}
              onValueChange={setRoomId}
              disabled={loadingResources}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin salas disponibles" />
              </SelectTrigger>
              <SelectContent>
                {resources?.rooms.map(room => (
                  <SelectItem key={room.id} value={String(room.id)}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {resources?.endTime && (
              <p className="text-xs text-muted-foreground mt-1">
                Finaliza a las {resources.endTime}; se reservan 10 minutos de
                preparación.
              </p>
            )}
          </div>

          {loadingResources && (
            <div
              role="status"
              aria-live="polite"
              className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-medium text-sky-900"
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              Revisando disponibilidad de terapeutas y salas…
            </div>
          )}
          {!loadingResources && !resourcesAvailable && (
            <div className="sm:col-span-2 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                No hay suficientes recursos para {partySize} personas. Se
                necesitan {requiredTherapists} terapeutas y {requiredRooms}{" "}
                {requiredRooms === 1 ? "sala" : "salas"}. Revisa la fecha, hora
                o distribución.
              </span>
            </div>
          )}
          {!loadingResources &&
            resourcesAvailable &&
            (resources?.sessions.length ?? 0) > 0 && (
              <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                <p className="font-medium">
                  Plan disponible · {requiredTherapists} terapeutas ·{" "}
                  {requiredRooms} {requiredRooms === 1 ? "sala" : "salas"}
                </p>
                <div className="mt-2 space-y-1 text-xs">
                  {resources?.sessions.map((session, index) => (
                    <p key={`${session.startTime}-${session.roomId}-${index}`}>
                      Bloque {index + 1}: {session.people} personas ·{" "}
                      {session.startTime}–{session.endTime} · {session.roomName}
                    </p>
                  ))}
                </div>
              </div>
            )}

          <div>
            <Label>Referencia Skedu</Label>
            <Input
              value={externalReference}
              onChange={event => setExternalReference(event.target.value)}
              placeholder="ID o código de la reserva"
            />
          </div>
          {canManagePayments ? (
            <>
              <div>
                <Label>Medio de pago *</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={value =>
                    setPaymentMethod(value as SkeduProgramPaymentMethod)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_MASSAGE_PAYMENT_METHODS.filter(
                      method =>
                        method !== "gift_card" && method !== "getnet_link"
                    ).map(method => (
                      <SelectItem key={method} value={method}>
                        {MASSAGE_PAYMENT_METHOD_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!isPendingMassagePaymentMethod(paymentMethod) &&
                paymentMethod !== "cash" && (
                  <div className="sm:col-span-2">
                    <Label>Referencia de pago *</Label>
                    <Input
                      value={paymentReference}
                      onChange={event =>
                        setPaymentReference(event.target.value)
                      }
                      placeholder="Código Getnet, Gift Card o comprobante"
                    />
                  </div>
                )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              La reserva se creará pendiente de pago.
            </p>
          )}
          {(!canManagePayments ||
            isPendingMassagePaymentMethod(paymentMethod)) && (
            <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
              La reserva quedará en rojo hasta registrar el medio real durante
              el check-in.
            </div>
          )}
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={
              !canSubmit ||
              loadingResources ||
              !resourcesAvailable ||
              !hasRoom ||
              createMutation.isPending
            }
          >
            Registrar y bloquear agenda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
