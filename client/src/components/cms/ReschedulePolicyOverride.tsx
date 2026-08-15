import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ReschedulePolicyOverrideProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  policySummary?: ReactNode;
  className?: string;
};

export function ReschedulePolicyOverride({
  checked,
  onCheckedChange,
  policySummary,
  className,
}: ReschedulePolicyOverrideProps) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border p-3 text-sm",
        checked
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-border bg-muted/30",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div>
          <p className="font-medium">Política de reagendamiento</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {policySummary ??
              "La reserva mantiene sus reglas normales de anticipación y cantidad máxima de cambios."}
          </p>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-background/80 p-3">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-amber-700"
          checked={checked}
          onChange={event => onCheckedChange(event.target.checked)}
        />
        <span>
          <span className="font-medium">
            Autorizar excepción administrativa
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Permite omitir únicamente el plazo mínimo o el máximo de cambios. La
            disponibilidad, el aforo y los recursos continúan siendo
            obligatorios.
          </span>
        </span>
      </label>

      {checked && (
        <p className="text-xs font-medium text-amber-900">
          El motivo debe tener al menos 10 caracteres y la persona responsable
          quedará registrada.
        </p>
      )}
    </div>
  );
}
