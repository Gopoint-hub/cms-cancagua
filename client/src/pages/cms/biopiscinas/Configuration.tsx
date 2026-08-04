import { ChangeEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Bell,
  Camera,
  Clock3,
  FileText,
  Save,
  Ticket,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useSearch } from "wouter";

const days = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
type MainForm = {
  name: string;
  description: string;
  capacity: number;
  openingTime: string;
  waterCloseTime: string;
  facilityCloseTime: string;
  firstEntryTime: string;
  lastEntryTime: string;
  slotIntervalMinutes: number;
  standardDurationMinutes: number;
  finalEntryDurationMinutes: number;
  maxStaffReschedules: number;
  refundNoticeHours: number;
  rescheduleNoticeHours: number;
  refundFeePercent: string;
  childMinAge: number;
  childMaxAge: number;
  reminderHoursBefore: number;
  notificationEmail: string;
  mapsUrl: string;
  rulesUrl: string;
  reminderEmailEnabled: number;
  reminderWhatsappEnabled: number;
  confirmationEmailSubject: string;
  confirmationEmailBody: string;
  reminderEmailSubject: string;
  reminderEmailBody: string;
  reminderWhatsappBody: string;
};

const emptyForm: MainForm = {
  name: "",
  description: "",
  capacity: 40,
  openingTime: "10:00",
  waterCloseTime: "21:30",
  facilityCloseTime: "22:00",
  firstEntryTime: "10:00",
  lastEntryTime: "18:00",
  slotIntervalMinutes: 60,
  standardDurationMinutes: 240,
  finalEntryDurationMinutes: 210,
  maxStaffReschedules: 2,
  refundNoticeHours: 72,
  rescheduleNoticeHours: 48,
  refundFeePercent: "0.25",
  childMinAge: 5,
  childMaxAge: 12,
  reminderHoursBefore: 24,
  notificationEmail: "contacto@cancagua.cl",
  mapsUrl: "",
  rulesUrl: "",
  reminderEmailEnabled: 1,
  reminderWhatsappEnabled: 1,
  confirmationEmailSubject: "",
  confirmationEmailBody: "",
  reminderEmailSubject: "",
  reminderEmailBody: "",
  reminderWhatsappBody: "",
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BiopiscinasConfiguration() {
  const search = useSearch();
  const requestedId = Number(new URLSearchParams(search).get("service"));
  const utils = trpc.useUtils();
  const { data: services } = trpc.biopools.services.list.useQuery();
  const serviceId =
    Number.isFinite(requestedId) && requestedId > 0
      ? requestedId
      : (services?.find(item => item.status !== "archived")?.id ??
        services?.[0]?.id ??
        0);
  const { data: detail } = trpc.biopools.services.get.useQuery(
    { id: serviceId },
    { enabled: serviceId > 0 }
  );
  const [form, setForm] = useState<MainForm>(emptyForm);
  useEffect(() => {
    if (!detail) return;
    const service = detail.service;
    setForm({
      name: service.name,
      description: service.description ?? "",
      capacity: service.capacity,
      openingTime: service.openingTime,
      waterCloseTime: service.waterCloseTime,
      facilityCloseTime: service.facilityCloseTime,
      firstEntryTime: service.firstEntryTime,
      lastEntryTime: service.lastEntryTime,
      slotIntervalMinutes: service.slotIntervalMinutes,
      standardDurationMinutes: service.standardDurationMinutes,
      finalEntryDurationMinutes: service.finalEntryDurationMinutes,
      maxStaffReschedules: service.maxStaffReschedules,
      refundNoticeHours: service.refundNoticeHours,
      rescheduleNoticeHours: service.rescheduleNoticeHours,
      refundFeePercent: String(service.refundFeePercent),
      childMinAge: service.childMinAge,
      childMaxAge: service.childMaxAge,
      reminderHoursBefore: service.reminderHoursBefore,
      notificationEmail: service.notificationEmail,
      mapsUrl: service.mapsUrl ?? "",
      rulesUrl: service.rulesUrl ?? "",
      reminderEmailEnabled: service.reminderEmailEnabled,
      reminderWhatsappEnabled: service.reminderWhatsappEnabled,
      confirmationEmailSubject: service.confirmationEmailSubject ?? "",
      confirmationEmailBody: service.confirmationEmailBody ?? "",
      reminderEmailSubject: service.reminderEmailSubject ?? "",
      reminderEmailBody: service.reminderEmailBody ?? "",
      reminderWhatsappBody: service.reminderWhatsappBody ?? "",
    });
  }, [detail]);
  const update = trpc.biopools.services.update.useMutation({
    onSuccess: () => {
      toast.success("Configuración guardada");
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateTicket = trpc.biopools.tickets.update.useMutation({
    onSuccess: () => {
      toast.success("Ticket actualizado");
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateSchedule = trpc.biopools.schedules.update.useMutation({
    onSuccess: () => utils.biopools.invalidate(),
    onError: error => toast.error(error.message),
  });
  const upload = trpc.biopools.services.uploadImage.useMutation({
    onSuccess: () => {
      toast.success("Fotografía agregada");
      utils.biopools.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const deleteImage = trpc.biopools.services.deleteImage.useMutation({
    onSuccess: () => utils.biopools.invalidate(),
    onError: error => toast.error(error.message),
  });
  const save = () => update.mutate({ id: serviceId, ...form });
  const onImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024)
      return toast.error("La imagen no puede superar 8 MB");
    upload.mutate({
      serviceId,
      imageData: await fileToDataUrl(file),
      mimeType: file.type,
    });
    event.target.value = "";
  };

  if (!detail)
    return (
      <DashboardLayout>
        <div className="p-6">Cargando configuración…</div>
      </DashboardLayout>
    );
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-700">
              Fuente única de información
            </p>
            <h1 className="text-3xl font-semibold">
              Configuración de Biopiscinas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Los textos, precios, horarios y fotografías quedarán disponibles
              para la futura compra web.
            </p>
          </div>
          <Button onClick={save} disabled={update.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {update.isPending ? "Guardando…" : "Guardar todo"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-700" />
              Información pública
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción del servicio</Label>
              <Textarea
                rows={14}
                value={form.description}
                onChange={e =>
                  setForm({ ...form, description: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Este contenido no queda fijo en la web: se leerá desde el CMS.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Enlace Google Maps</Label>
                <Input
                  value={form.mapsUrl}
                  onChange={e => setForm({ ...form, mapsUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Enlace al reglamento</Label>
                <Input
                  value={form.rulesUrl}
                  onChange={e => setForm({ ...form, rulesUrl: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-cyan-700" />
              Tickets por cantidad
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {detail.tickets.map(ticket => (
              <div key={ticket.id} className="rounded-xl border p-4 space-y-3">
                <div className="flex justify-between">
                  <strong>{ticket.name}</strong>
                  <Badge variant="outline">
                    {ticket.code === "adult" ? "13+ años" : "5–12 años"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <Label>Precio unitario</Label>
                  <Input
                    type="number"
                    defaultValue={ticket.priceClp}
                    onBlur={e => {
                      const priceClp = Number(e.target.value);
                      if (priceClp !== ticket.priceClp)
                        updateTicket.mutate({
                          id: ticket.id,
                          name: ticket.name,
                          priceClp,
                          active: ticket.active,
                        });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Actual: {clp.format(ticket.priceClp)}. La cantidad se elige
                    en la reserva.
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-cyan-700" />
              Aforo y duración
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField
              label="Aforo simultáneo"
              value={form.capacity}
              set={capacity => setForm({ ...form, capacity })}
            />
            <NumberField
              label="Intervalo entradas (min)"
              value={form.slotIntervalMinutes}
              set={slotIntervalMinutes =>
                setForm({ ...form, slotIntervalMinutes })
              }
            />
            <NumberField
              label="Duración normal (min)"
              value={form.standardDurationMinutes}
              set={standardDurationMinutes =>
                setForm({ ...form, standardDurationMinutes })
              }
            />
            <NumberField
              label="Duración último ingreso"
              value={form.finalEntryDurationMinutes}
              set={finalEntryDurationMinutes =>
                setForm({ ...form, finalEntryDurationMinutes })
              }
            />
            <TimeField
              label="Primera entrada"
              value={form.firstEntryTime}
              set={firstEntryTime => setForm({ ...form, firstEntryTime })}
            />
            <TimeField
              label="Última entrada"
              value={form.lastEntryTime}
              set={lastEntryTime => setForm({ ...form, lastEntryTime })}
            />
            <TimeField
              label="Cierre del agua"
              value={form.waterCloseTime}
              set={waterCloseTime => setForm({ ...form, waterCloseTime })}
            />
            <TimeField
              label="Cierre del recinto"
              value={form.facilityCloseTime}
              set={facilityCloseTime => setForm({ ...form, facilityCloseTime })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Semana de funcionamiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.schedules.map(schedule => (
              <div
                key={schedule.id}
                className="grid items-center gap-3 rounded-xl border p-3 sm:grid-cols-[130px_70px_repeat(4,1fr)]"
              >
                <strong>{days[schedule.dayOfWeek]}</strong>
                <Switch
                  checked={Boolean(schedule.enabled)}
                  onCheckedChange={checked =>
                    updateSchedule.mutate({
                      id: schedule.id,
                      enabled: checked ? 1 : 0,
                      openingTime: schedule.openingTime,
                      firstEntryTime: schedule.firstEntryTime,
                      lastEntryTime: schedule.lastEntryTime,
                      waterCloseTime: schedule.waterCloseTime,
                      facilityCloseTime: schedule.facilityCloseTime,
                    })
                  }
                />
                <small>Abre {schedule.openingTime}</small>
                <small>
                  Entradas {schedule.firstEntryTime}–{schedule.lastEntryTime}
                </small>
                <small>Agua {schedule.waterCloseTime}</small>
                <small>Recinto {schedule.facilityCloseTime}</small>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Políticas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField
              label="Aviso reembolso (horas)"
              value={form.refundNoticeHours}
              set={refundNoticeHours => setForm({ ...form, refundNoticeHours })}
            />
            <NumberField
              label="Aviso reagenda (horas)"
              value={form.rescheduleNoticeHours}
              set={rescheduleNoticeHours =>
                setForm({ ...form, rescheduleNoticeHours })
              }
            />
            <NumberField
              label="Máximo reagendas recepción"
              value={form.maxStaffReschedules}
              set={maxStaffReschedules =>
                setForm({ ...form, maxStaffReschedules })
              }
            />
            <div className="space-y-2">
              <Label>Descuento reembolso (%)</Label>
              <Input
                value={form.refundFeePercent}
                onChange={e =>
                  setForm({ ...form, refundFeePercent: e.target.value })
                }
              />
            </div>
            <NumberField
              label="Edad mínima niño"
              value={form.childMinAge}
              set={childMinAge => setForm({ ...form, childMinAge })}
            />
            <NumberField
              label="Edad máxima niño"
              value={form.childMaxAge}
              set={childMaxAge => setForm({ ...form, childMaxAge })}
            />
            <div className="sm:col-span-2 rounded-xl bg-amber-50 p-4 text-sm">
              <strong>Regla fija:</strong> un niño nunca puede reservar ni
              asistir sin al menos un adulto.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-cyan-700" />
              Fotografías
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {detail.images.map(image => (
                <div
                  key={image.id}
                  className="relative h-36 w-44 overflow-hidden rounded-xl border"
                >
                  <img
                    src={image.url}
                    alt={image.altText ?? "Biopiscinas"}
                    className="h-full w-full object-cover"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute right-2 top-2 h-8 w-8"
                    onClick={() => deleteImage.mutate({ id: image.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Label className="h-36 w-44 cursor-pointer rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Camera className="h-6 w-6" />
                <span>
                  {upload.isPending ? "Subiendo…" : "Agregar fotografía"}
                </span>
                <Input
                  className="hidden"
                  type="file"
                  accept="image/*"
                  disabled={upload.isPending}
                  onChange={onImage}
                />
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-cyan-700" />
              Correos y recordatorios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Correo remitente</Label>
                <Input
                  type="email"
                  value={form.notificationEmail}
                  onChange={e =>
                    setForm({ ...form, notificationEmail: e.target.value })
                  }
                />
              </div>
              <NumberField
                label="Enviar antes (horas)"
                value={form.reminderHoursBefore}
                set={reminderHoursBefore =>
                  setForm({ ...form, reminderHoursBefore })
                }
              />
              <div className="space-y-2">
                <Label>Canales</Label>
                <div className="flex gap-4 pt-2 text-sm">
                  <label className="flex gap-2">
                    <Switch
                      checked={Boolean(form.reminderEmailEnabled)}
                      onCheckedChange={checked =>
                        setForm({
                          ...form,
                          reminderEmailEnabled: checked ? 1 : 0,
                        })
                      }
                    />
                    Email
                  </label>
                  <label className="flex gap-2">
                    <Switch
                      checked={Boolean(form.reminderWhatsappEnabled)}
                      onCheckedChange={checked =>
                        setForm({
                          ...form,
                          reminderWhatsappEnabled: checked ? 1 : 0,
                        })
                      }
                    />
                    WhatsApp
                  </label>
                </div>
              </div>
            </div>
            <Template
              label="Asunto de confirmación"
              value={form.confirmationEmailSubject}
              set={confirmationEmailSubject =>
                setForm({ ...form, confirmationEmailSubject })
              }
            />
            <TemplateArea
              label="Correo después de reservar"
              value={form.confirmationEmailBody}
              set={confirmationEmailBody =>
                setForm({ ...form, confirmationEmailBody })
              }
            />
            <Template
              label="Asunto del recordatorio"
              value={form.reminderEmailSubject}
              set={reminderEmailSubject =>
                setForm({ ...form, reminderEmailSubject })
              }
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <TemplateArea
                label="Recordatorio por email"
                value={form.reminderEmailBody}
                set={reminderEmailBody =>
                  setForm({ ...form, reminderEmailBody })
                }
              />
              <TemplateArea
                label="Recordatorio por WhatsApp"
                value={form.reminderWhatsappBody}
                set={reminderWhatsappBody =>
                  setForm({ ...form, reminderWhatsappBody })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Variables:{" "}
              {
                "{{firstName}}, {{serviceName}}, {{date}}, {{startTime}}, {{bookingCode}}, {{mapsUrl}}, {{rulesUrl}}, {{confirmUrl}}"
              }
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function NumberField({
  label,
  value,
  set,
}: {
  label: string;
  value: number;
  set: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={e => set(Number(e.target.value))}
      />
    </div>
  );
}
function TimeField({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="time" value={value} onChange={e => set(e.target.value)} />
    </div>
  );
}
function Template({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={e => set(e.target.value)} />
    </div>
  );
}
function TemplateArea({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea rows={12} value={value} onChange={e => set(e.target.value)} />
    </div>
  );
}
