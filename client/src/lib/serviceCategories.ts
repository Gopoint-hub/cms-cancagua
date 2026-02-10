/**
 * Mapeo de categorías de servicios Cancagua
 * Cada categoría tiene un nombre legible, icono y colores para UI
 * Las categorías vienen como UUIDs de Skedu
 */
import {
  Waves,
  Droplets,
  Flame,
  TreePine,
  Sailboat,
  Dumbbell,
  Music,
  Sparkles,
  Crown,
  Star,
  Sun,
  Timer,
  Package,
  type LucideIcon,
} from "lucide-react";

export interface CategoryInfo {
  name: string;
  icon: LucideIcon;
  /** Tailwind bg color for the icon container */
  bgColor: string;
  /** Tailwind text color for the icon */
  iconColor: string;
  /** Tailwind border color for the card */
  borderColor: string;
  /** Tailwind accent color for prices */
  accentColor: string;
  /** Short emoji for quick visual identification */
  emoji: string;
}

const CATEGORY_MAP: Record<string, CategoryInfo> = {
  // Masajes
  "1f2ee9c9-f6e7-4e6d-97a8-51ba5271960d": {
    name: "Masajes",
    icon: Sparkles,
    bgColor: "bg-purple-100",
    iconColor: "text-purple-600",
    borderColor: "border-purple-200",
    accentColor: "text-purple-700",
    emoji: "💆",
  },
  // Extras (Extender estadía)
  "2199fb15-4404-4f63-a574-d3f400159350": {
    name: "Extras",
    icon: Timer,
    bgColor: "bg-gray-100",
    iconColor: "text-gray-600",
    borderColor: "border-gray-200",
    accentColor: "text-gray-700",
    emoji: "⏱️",
  },
  // Pases Reconecta
  "2640c097-3623-4e2b-bf20-5eb9b1d5d5d9": {
    name: "Pases Reconecta",
    icon: Sun,
    bgColor: "bg-amber-100",
    iconColor: "text-amber-600",
    borderColor: "border-amber-200",
    accentColor: "text-amber-700",
    emoji: "☀️",
  },
  // Eventos & Talleres
  "2de9bc07-ba51-4c9a-82c5-90db71718e2c": {
    name: "Eventos & Talleres",
    icon: Music,
    bgColor: "bg-pink-100",
    iconColor: "text-pink-600",
    borderColor: "border-pink-200",
    accentColor: "text-pink-700",
    emoji: "🎵",
  },
  // Hot Tubs
  "42390ed0-0266-4719-9eaf-14f1f43d7f3d": {
    name: "Hot Tubs",
    icon: Flame,
    bgColor: "bg-orange-100",
    iconColor: "text-orange-600",
    borderColor: "border-orange-200",
    accentColor: "text-orange-700",
    emoji: "🔥",
  },
  // Biopiscinas
  "497f79e9-50f9-484a-a1e9-dab5f5d67d2d": {
    name: "Biopiscinas",
    icon: Waves,
    bgColor: "bg-cyan-100",
    iconColor: "text-cyan-600",
    borderColor: "border-cyan-200",
    accentColor: "text-cyan-700",
    emoji: "🌊",
  },
  // Full Day
  "56351692-0c41-455e-bd95-fc4434fa40ec": {
    name: "Full Day",
    icon: Star,
    bgColor: "bg-yellow-100",
    iconColor: "text-yellow-600",
    borderColor: "border-yellow-200",
    accentColor: "text-yellow-700",
    emoji: "⭐",
  },
  // Tablas SUP
  "56354667-cf85-4381-a0f8-b4101ebce142": {
    name: "Tablas SUP",
    icon: Sailboat,
    bgColor: "bg-sky-100",
    iconColor: "text-sky-600",
    borderColor: "border-sky-200",
    accentColor: "text-sky-700",
    emoji: "🏄",
  },
  // Sauna Nativo
  "88a5c6bb-22a7-45e4-8ac8-446f2422a2d3": {
    name: "Sauna Nativo",
    icon: TreePine,
    bgColor: "bg-emerald-100",
    iconColor: "text-emerald-600",
    borderColor: "border-emerald-200",
    accentColor: "text-emerald-700",
    emoji: "🌲",
  },
  // Membresías
  "9685f233-3bcd-451d-9c4b-1c8563295942": {
    name: "Membresías",
    icon: Crown,
    bgColor: "bg-indigo-100",
    iconColor: "text-indigo-600",
    borderColor: "border-indigo-200",
    accentColor: "text-indigo-700",
    emoji: "👑",
  },
  // Biopiscinas Frutillar
  "a6dd5651-38be-4145-9e04-5ff12bb43417": {
    name: "Biopiscinas Frutillar",
    icon: Droplets,
    bgColor: "bg-teal-100",
    iconColor: "text-teal-600",
    borderColor: "border-teal-200",
    accentColor: "text-teal-700",
    emoji: "💧",
  },
  // Clases & Yoga
  "c98cf093-2ba5-494d-a1e4-5a0bb360c387": {
    name: "Clases & Yoga",
    icon: Dumbbell,
    bgColor: "bg-rose-100",
    iconColor: "text-rose-600",
    borderColor: "border-rose-200",
    accentColor: "text-rose-700",
    emoji: "🧘",
  },
  // Promociones
  "e93b850b-6fda-4fae-9fed-df5591c251c5": {
    name: "Promociones",
    icon: Sparkles,
    bgColor: "bg-violet-100",
    iconColor: "text-violet-600",
    borderColor: "border-violet-200",
    accentColor: "text-violet-700",
    emoji: "✨",
  },
};

const DEFAULT_CATEGORY: CategoryInfo = {
  name: "Servicio",
  icon: Package,
  bgColor: "bg-blue-100",
  iconColor: "text-blue-600",
  borderColor: "border-blue-200",
  accentColor: "text-blue-700",
  emoji: "📦",
};

/**
 * Get category info by UUID. Falls back to a default if unknown.
 */
export function getCategoryInfo(categoryId: string | null | undefined): CategoryInfo {
  if (!categoryId) return DEFAULT_CATEGORY;
  return CATEGORY_MAP[categoryId] || DEFAULT_CATEGORY;
}

/**
 * Get a readable category name from UUID
 */
export function getCategoryName(categoryId: string | null | undefined): string {
  return getCategoryInfo(categoryId).name;
}

/**
 * Try to infer category from service name when category UUID is not available
 */
export function inferCategoryFromName(name: string): CategoryInfo {
  const lower = name.toLowerCase();
  if (lower.includes("full day"))
    return CATEGORY_MAP["56351692-0c41-455e-bd95-fc4434fa40ec"];
  if (lower.includes("biopiscina") && lower.includes("frutillar"))
    return CATEGORY_MAP["a6dd5651-38be-4145-9e04-5ff12bb43417"];
  if (lower.includes("biopiscina"))
    return CATEGORY_MAP["497f79e9-50f9-484a-a1e9-dab5f5d67d2d"];
  if (lower.includes("hot tub") || lower.includes("hot-tub"))
    return CATEGORY_MAP["42390ed0-0266-4719-9eaf-14f1f43d7f3d"];
  if (lower.includes("masaje"))
    return CATEGORY_MAP["1f2ee9c9-f6e7-4e6d-97a8-51ba5271960d"];
  if (lower.includes("sauna"))
    return CATEGORY_MAP["88a5c6bb-22a7-45e4-8ac8-446f2422a2d3"];
  if (lower.includes("tabla") || lower.includes("sup"))
    return CATEGORY_MAP["56354667-cf85-4381-a0f8-b4101ebce142"];
  if (lower.includes("yoga") || lower.includes("danza") || lower.includes("entrenamiento"))
    return CATEGORY_MAP["c98cf093-2ba5-494d-a1e4-5a0bb360c387"];
  if (lower.includes("reconecta") || lower.includes("pase"))
    return CATEGORY_MAP["2640c097-3623-4e2b-bf20-5eb9b1d5d5d9"];
  if (lower.includes("promo"))
    return CATEGORY_MAP["e93b850b-6fda-4fae-9fed-df5591c251c5"];
  if (lower.includes("membresía") || lower.includes("membresia"))
    return CATEGORY_MAP["9685f233-3bcd-451d-9c4b-1c8563295942"];
  return DEFAULT_CATEGORY;
}
