export type MassageAnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category: "Masajes";
  item_variant: string;
  price: number;
  quantity: number;
};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const GTM_ID = "GTM-NNGGT92W";
const PUBLIC_ANALYTICS_PATHS = ["/reservar/masajes", "/masajes/reserva/confirmacion"];

export function initializePublicAnalytics(): void {
  if (!PUBLIC_ANALYTICS_PATHS.some((path) => window.location.pathname.startsWith(path))) return;

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  script.dataset.cancaguaAnalytics = "gtm";
  document.head.appendChild(script);

  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
  if (endpoint && websiteId) {
    const umami = document.createElement("script");
    umami.defer = true;
    umami.src = `${endpoint.replace(/\/$/, "")}/umami`;
    umami.dataset.websiteId = websiteId;
    umami.dataset.cancaguaAnalytics = "umami";
    document.head.appendChild(umami);
  }
}

export function getCheckoutId(): string {
  const linkedCheckoutId = new URLSearchParams(window.location.search).get("checkout_id");
  if (linkedCheckoutId) return linkedCheckoutId;
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getGaClientId(): string | undefined {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("_ga="))
    ?.split("=")
    .slice(1)
    .join("=");
  const match = cookie && decodeURIComponent(cookie).match(/^GA\d+\.\d+\.(.+)$/);
  return match?.[1];
}

export function getGaSessionId(): string | undefined {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("_ga_Z39NWW3H26="))
    ?.split("=")
    .slice(1)
    .join("=");
  if (!cookie) return undefined;
  const decoded = decodeURIComponent(cookie);
  return decoded.match(/(?:^|[.$])s(\d+)/)?.[1]
    ?? decoded.match(/^GS\d+\.\d+\.(\d+)/)?.[1];
}

export function pushMassageEvent(
  event: string,
  ecommerce?: Record<string, unknown>,
  parameters: Record<string, unknown> = {},
): void {
  window.dataLayer = window.dataLayer ?? [];
  if (ecommerce) window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({
    event,
    ...parameters,
    ...(ecommerce ? { ecommerce } : {}),
  });
}

export function toAnalyticsItem(item: {
  techniqueId: number;
  techniqueName: string;
  duration: number;
  price: number;
  quantity?: number;
}): MassageAnalyticsItem {
  return {
    item_id: String(item.techniqueId),
    item_name: item.techniqueName,
    item_category: "Masajes",
    item_variant: `${item.duration} min`,
    price: item.price,
    quantity: item.quantity ?? 1,
  };
}

export function updateCheckoutProgress(input: {
  checkoutId: string;
  step: "scheduling" | "schedule_selected" | "details_completed";
  items?: MassageAnalyticsItem[];
}): void {
  if (!input.checkoutId) return;
  void fetch("/api/public/masajes/checkout/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      ...input,
      gaClientId: getGaClientId(),
      gaSessionId: getGaSessionId(),
    }),
  }).catch((error) => console.warn("[Masajes Analytics] No se pudo actualizar el checkout:", error));
}
