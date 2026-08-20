import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CHILE_REGIONS,
  DISCOVERY_SOURCE_OPTIONS,
  type CustomerAcquisitionFormValue,
} from "@shared/customerAcquisition";

type Props = {
  value: CustomerAcquisitionFormValue;
  onChange: (value: CustomerAcquisitionFormValue) => void;
  idPrefix: string;
  compact?: boolean;
};

const selectClass = "mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

export function CustomerAcquisitionFields({ value, onChange, idPrefix, compact = false }: Props) {
  const patch = (next: Partial<CustomerAcquisitionFormValue>) => onChange({ ...value, ...next });
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <Label htmlFor={`${idPrefix}-discovery`} className="text-xs text-muted-foreground">¿Cómo nos encontraste? *</Label>
        <select id={`${idPrefix}-discovery`} required value={value.discoverySource} onChange={(event) => patch({ discoverySource: event.target.value as CustomerAcquisitionFormValue["discoverySource"], discoverySourceOther: "" })} className={selectClass}>
          <option value="" disabled>Selecciona una opción</option>
          {DISCOVERY_SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      {value.discoverySource === "other" && (
        <div>
          <Label htmlFor={`${idPrefix}-discovery-other`} className="text-xs text-muted-foreground">¿Cuál? *</Label>
          <Input id={`${idPrefix}-discovery-other`} required maxLength={160} value={value.discoverySourceOther ?? ""} onChange={(event) => patch({ discoverySourceOther: event.target.value })} placeholder="Cuéntanos cómo nos encontraste" className="mt-1 rounded-xl" />
        </div>
      )}
      <div>
        <Label htmlFor={`${idPrefix}-origin`} className="text-xs text-muted-foreground">¿De dónde vienes? *</Label>
        <select id={`${idPrefix}-origin`} required value={value.originType} onChange={(event) => patch({ originType: event.target.value as CustomerAcquisitionFormValue["originType"], country: "", region: "", city: "" })} className={selectClass}>
          <option value="" disabled>Selecciona una opción</option>
          <option value="chile">Chile</option>
          <option value="foreign">Extranjero</option>
        </select>
      </div>
      {value.originType === "foreign" && (
        <div>
          <Label htmlFor={`${idPrefix}-country`} className="text-xs text-muted-foreground">País *</Label>
          <Input id={`${idPrefix}-country`} required maxLength={120} value={value.country ?? ""} onChange={(event) => patch({ country: event.target.value })} placeholder="Escribe tu país" className="mt-1 rounded-xl" />
        </div>
      )}
      {value.originType === "chile" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${idPrefix}-region`} className="text-xs text-muted-foreground">Región *</Label>
            <select id={`${idPrefix}-region`} required value={value.region ?? ""} onChange={(event) => patch({ region: event.target.value, city: "" })} className={selectClass}>
              <option value="" disabled>Selecciona tu región</option>
              {CHILE_REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-city`} className="text-xs text-muted-foreground">Ciudad o comuna *</Label>
            <Input id={`${idPrefix}-city`} required maxLength={160} value={value.city ?? ""} onChange={(event) => patch({ city: event.target.value })} placeholder="Ej: Frutillar" className="mt-1 rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}
