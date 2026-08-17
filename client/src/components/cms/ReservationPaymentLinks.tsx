import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type ReservationPaymentLink = {
  token: string;
  url: string;
  provider: string;
  totalClp: number;
  reservationCount?: number;
};

function money(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function providerLabel(provider: string) {
  return provider.toLowerCase().includes("getnet") ? "Getnet" : "Webpay";
}

function customerPaymentUrl(link: ReservationPaymentLink) {
  const canonicalPath = `/pagar/${encodeURIComponent(link.token)}`;
  try {
    const candidate = new URL(link.url, window.location.origin);
    if (candidate.pathname === canonicalPath && candidate.protocol === "https:")
      return candidate.toString();
  } catch {
    // La URL canónica local de abajo evita exponer enlaces efímeros del proveedor.
  }
  return new URL(canonicalPath, window.location.origin).toString();
}

function normalizedWhatsappPhone(phone?: string | null) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("56")) return digits;
  if (digits.length === 9) return `56${digits}`;
  return digits;
}

function paymentMessage(links: ReservationPaymentLink[], clientName?: string) {
  const greeting = clientName?.trim() ? `Hola ${clientName.trim()},` : "Hola,";
  const lines = links.map(
    (link, index) =>
      `${links.length > 1 ? `${index + 1}. ` : ""}${providerLabel(link.provider)} · ${money(link.totalClp)}\n${customerPaymentUrl(link)}`
  );
  return `${greeting} te enviamos ${links.length === 1 ? "el enlace" : "los enlaces"} para pagar ${links.length === 1 ? "tu reserva" : "tus reservas"} en Cancagua:\n\n${lines.join("\n\n")}\n\nTu reserva se actualizará automáticamente al confirmar el pago.`;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function ReservationPaymentLinks({
  links,
  clientPhone,
  clientName,
}: {
  links: ReservationPaymentLink[];
  clientPhone?: string | null;
  clientName?: string;
}) {
  if (!links.length) return null;
  const message = paymentMessage(links, clientName);
  const customerLinks = links.map(link => ({
    ...link,
    url: customerPaymentUrl(link),
  }));
  const whatsappPhone = normalizedWhatsappPhone(clientPhone);

  const copy = async () => {
    try {
      await copyText(
        customerLinks.length === 1 ? customerLinks[0].url : message
      );
      toast.success(
        links.length === 1 ? "Link copiado" : "Links de pago copiados"
      );
    } catch {
      toast.error("No fue posible copiar. Abre el link para copiarlo.");
    }
  };

  const sendWhatsapp = () => {
    const destination = whatsappPhone
      ? `https://wa.me/${whatsappPhone}`
      : "https://wa.me/";
    window.open(
      `${destination}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div>
        <p className="font-semibold text-emerald-950">
          {links.length === 1 ? "Link de pago listo" : "Links de pago listos"}
        </p>
        <p className="text-xs text-emerald-800">
          Al pagarse, el estado de la reserva se actualizará automáticamente.
        </p>
      </div>
      <div className="space-y-2">
        {customerLinks.map((link, index) => (
          <div
            key={link.token}
            className="flex flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {links.length > 1 ? `Pago ${index + 1} · ` : ""}
                {providerLabel(link.provider)}
              </p>
              <p className="text-sm font-semibold text-emerald-700">
                {money(link.totalClp)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {link.url}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={link.url} target="_blank" rel="noreferrer">
                Abrir
                <ExternalLink className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={copy}>
          <Copy className="mr-2 h-4 w-4" />
          {links.length === 1 ? "Copiar link" : "Copiar todos"}
        </Button>
        <Button type="button" onClick={sendWhatsapp}>
          <MessageCircle className="mr-2 h-4 w-4" />
          Enviar por WhatsApp
        </Button>
      </div>
      {!whatsappPhone && (
        <p className="text-xs text-amber-700">
          El cliente no tiene un teléfono válido; WhatsApp se abrirá sin
          destinatario.
        </p>
      )}
    </div>
  );
}
