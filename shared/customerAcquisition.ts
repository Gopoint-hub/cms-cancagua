import { z } from "zod";

export const DISCOVERY_SOURCE_OPTIONS = [
  { value: "advertising", label: "Publicidad" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "friends_family", label: "Amigos/Familia" },
  { value: "other", label: "Otro" },
] as const;

export const CHILE_REGIONS = [
  "Región de Arica y Parinacota",
  "Región de Tarapacá",
  "Región de Antofagasta",
  "Región de Atacama",
  "Región de Coquimbo",
  "Región de Valparaíso",
  "Región Metropolitana de Santiago",
  "Región del Libertador General Bernardo O'Higgins",
  "Región del Maule",
  "Región de Ñuble",
  "Región del Biobío",
  "Región de La Araucanía",
  "Región de Los Ríos",
  "Región de Los Lagos",
  "Región de Aysén del General Carlos Ibáñez del Campo",
  "Región de Magallanes y de la Antártica Chilena",
] as const;

export const customerAcquisitionSchema = z.object({
  discoverySource: z.enum(["advertising", "facebook", "instagram", "google", "friends_family", "other"]),
  discoverySourceOther: z.string().trim().max(160).optional(),
  originType: z.enum(["chile", "foreign"]),
  country: z.string().trim().max(120).optional(),
  region: z.string().trim().max(160).optional(),
  city: z.string().trim().max(160).optional(),
}).superRefine((value, ctx) => {
  if (value.discoverySource === "other" && !value.discoverySourceOther) {
    ctx.addIssue({ code: "custom", path: ["discoverySourceOther"], message: "Indica cómo nos encontraste." });
  }
  if (value.originType === "foreign" && !value.country) {
    ctx.addIssue({ code: "custom", path: ["country"], message: "Indica tu país." });
  }
  if (value.originType === "chile") {
    if (!value.region) ctx.addIssue({ code: "custom", path: ["region"], message: "Selecciona tu región." });
    if (!value.city) ctx.addIssue({ code: "custom", path: ["city"], message: "Indica tu ciudad o comuna." });
  }
});

export type CustomerAcquisition = z.infer<typeof customerAcquisitionSchema>;

export type CustomerAcquisitionFormValue = Omit<CustomerAcquisition, "discoverySource" | "originType"> & {
  discoverySource: CustomerAcquisition["discoverySource"] | "";
  originType: CustomerAcquisition["originType"] | "";
};

export const EMPTY_CUSTOMER_ACQUISITION: CustomerAcquisitionFormValue = {
  discoverySource: "",
  discoverySourceOther: "",
  originType: "",
  country: "",
  region: "",
  city: "",
};

export function validateCustomerAcquisitionForm(value: CustomerAcquisitionFormValue): CustomerAcquisition | null {
  const result = customerAcquisitionSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function normalizeCustomerAcquisition(value: CustomerAcquisition) {
  return {
    discoverySource: value.discoverySource,
    discoverySourceOther: value.discoverySource === "other" ? value.discoverySourceOther?.trim() || null : null,
    originType: value.originType,
    country: value.originType === "foreign" ? value.country?.trim() || null : "Chile",
    region: value.originType === "chile" ? value.region?.trim() || null : null,
    city: value.originType === "chile" ? value.city?.trim() || null : null,
  };
}
