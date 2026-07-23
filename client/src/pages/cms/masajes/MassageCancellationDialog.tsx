import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";

export const MASSAGE_CANCELLATION_OPTIONS = [
  { value: "client_cancelled", label: "Canceló el cliente" },
  { value: "business_issue", label: "Problema interno de Cancagua" },
  { value: "therapist_unavailable", label: "Terapeuta no disponible" },
  { value: "scheduling_error", label: "Error de agendamiento" },
  { value: "duplicate_booking", label: "Reserva duplicada" },
  { value: "other", label: "Otro motivo" },
] as const;

export type MassageCancellationCategory = typeof MASSAGE_CANCELLATION_OPTIONS[number]["value"];

export function getMassageCancellationLabel(category: string | null | undefined): string {
  if (category === "system") return "Cancelación automática del sistema";
  return MASSAGE_CANCELLATION_OPTIONS.find((option) => option.value === category)?.label ?? "Otro motivo";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingLabel?: string;
  isPending?: boolean;
  onConfirm: (category: MassageCancellationCategory, reason: string) => void;
};

export default function MassageCancellationDialog({
  open,
  onOpenChange,
  bookingLabel,
  isPending = false,
  onConfirm,
}: Props) {
  const [category, setCategory] = useState<MassageCancellationCategory | "">("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      setCategory("");
      setReason("");
    }
  }, [open]);

  const trimmedReason = reason.trim();
  const canConfirm = !!category && trimmedReason.length >= 5;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isPending) onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            Cancelar masaje
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            {bookingLabel
              ? <>Vas a cancelar <strong className="text-foreground">{bookingLabel}</strong>. La reserva quedará en el historial.</>
              : "La reserva quedará registrada como cancelada en el historial."}
          </p>

          <div>
            <Label>¿Quién o qué originó la cancelación? *</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as MassageCancellationCategory)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecciona un motivo" />
              </SelectTrigger>
              <SelectContent>
                {MASSAGE_CANCELLATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="massage-cancellation-reason">Explica por qué se cancela *</Label>
            <Textarea
              id="massage-cancellation-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ej.: El cliente llamó para cancelar porque no podrá viajar…"
              rows={4}
              maxLength={1000}
              className="mt-1 resize-none"
            />
            <div className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground">
              <span>Debes escribir al menos 5 caracteres.</span>
              <span>{reason.length}/1000</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Volver</Button>
          <Button
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={!canConfirm || isPending}
            onClick={() => onConfirm(category as MassageCancellationCategory, trimmedReason)}
          >
            {isPending ? "Cancelando…" : "Confirmar cancelación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
