import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Send, Eye, EyeOff, Info, Mail, User, FileText } from "lucide-react";

const MERGE_TAGS = [
  { tag: "{{primer_nombre}}", desc: "Primer nombre del destinatario" },
];

const TEMPLATE_EXAMPLES = [
  {
    label: "Bienvenida VIP",
    subject: "Un regalo especial para ti, {{primer_nombre}}",
    body: `Hola {{primer_nombre}},

Queríamos escribirte personalmente porque eres una de nuestras clientas más especiales.

Como muestra de aprecio, te tenemos preparada una experiencia exclusiva en Cancagua este invierno.

¿Cuándo te vendría bien que conversemos?

Un abrazo,
Equipo Cancagua
eventos@cancagua.cl`,
  },
  {
    label: "Seguimiento B2B",
    subject: "Cancagua para tu equipo, {{primer_nombre}}",
    body: `Hola {{primer_nombre}},

Hace un tiempo tuvimos la oportunidad de conocerte a través de Justo y me quedé pensando en lo bien que le vendría a tu equipo una experiencia de bienestar en Cancagua.

Tenemos paquetes corporativos especialmente diseñados para grupos.

¿Tienes 15 minutos para contarte más esta semana?

Saludos,
Equipo Eventos Cancagua
eventos@cancagua.cl`,
  },
];

export default function EnvioPersonal() {
  const [form, setForm] = useState({
    to: "",
    primerNombre: "",
    subject: "",
    bodyText: "",
    replyTo: "eventos@cancagua.cl",
  });
  const [preview, setPreview] = useState(false);
  const [sent, setSent] = useState(false);

  const sendMutation = trpc.marketing.sendPersonalEmail.useMutation({
    onSuccess: () => {
      toast.success("Email enviado correctamente desde eventos@cancagua.cl");
      setSent(true);
    },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  const previewBody = form.primerNombre
    ? form.bodyText.replace(/\{\{primer_nombre\}\}/gi, form.primerNombre)
    : form.bodyText.replace(/\{\{primer_nombre\}\}/gi, "[nombre]");

  const previewSubject = form.primerNombre
    ? form.subject.replace(/\{\{primer_nombre\}\}/gi, form.primerNombre)
    : form.subject.replace(/\{\{primer_nombre\}\}/gi, "[nombre]");

  const handleSend = () => {
    if (!form.to || !form.subject || !form.bodyText) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    setSent(false);
    sendMutation.mutate(form);
  };

  const applyTemplate = (t: typeof TEMPLATE_EXAMPLES[0]) => {
    setForm((f) => ({ ...f, subject: t.subject, bodyText: t.body }));
  };

  const insertTag = (tag: string) => {
    setForm((f) => ({ ...f, bodyText: f.bodyText + tag }));
  };

  const reset = () => {
    setForm({ to: "", primerNombre: "", subject: "", bodyText: "", replyTo: "eventos@cancagua.cl" });
    setSent(false);
    setPreview(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Envío Personal</h1>
          <p className="text-muted-foreground">
            Email uno a uno desde <span className="font-mono text-sm">eventos@cancagua.cl</span>
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Destinatario
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="to">Email *</Label>
                    <Input
                      id="to"
                      type="email"
                      placeholder="nombre@ejemplo.com"
                      value={form.to}
                      onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="primerNombre">Primer nombre</Label>
                    <Input
                      id="primerNombre"
                      placeholder="Camila"
                      value={form.primerNombre}
                      onChange={(e) => setForm((f) => ({ ...f, primerNombre: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Reemplaza <code>{"{{primer_nombre}}"}</code>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Mensaje
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="subject">Asunto *</Label>
                  <Input
                    id="subject"
                    placeholder="Asunto del email"
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="body">Cuerpo del email *</Label>
                    <div className="flex gap-1">
                      {MERGE_TAGS.map((t) => (
                        <Button
                          key={t.tag}
                          variant="outline"
                          size="sm"
                          className="text-xs h-6 px-2"
                          onClick={() => insertTag(t.tag)}
                          title={t.desc}
                        >
                          {t.tag}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    id="body"
                    rows={12}
                    placeholder="Hola {{primer_nombre}},\n\nEscribe tu mensaje aquí..."
                    value={form.bodyText}
                    onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
                    className="font-mono text-sm resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Texto plano — sin HTML. El email se envía sin formato para mayor apertura.
                  </p>
                </div>

                <div>
                  <Label htmlFor="replyTo">Reply-To</Label>
                  <Input
                    id="replyTo"
                    value={form.replyTo}
                    onChange={(e) => setForm((f) => ({ ...f, replyTo: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            {preview && (
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-blue-800">Vista previa del email</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs text-blue-600">
                    <strong>De:</strong> Cancagua Eventos &lt;eventos@cancagua.cl&gt;
                  </div>
                  <div className="text-xs text-blue-600">
                    <strong>Para:</strong> {form.to || "(sin destinatario)"}
                  </div>
                  <div className="text-xs text-blue-600">
                    <strong>Asunto:</strong> {previewSubject || "(sin asunto)"}
                  </div>
                  <Separator />
                  <pre className="text-sm whitespace-pre-wrap font-sans text-gray-800 bg-white rounded p-3 border">
                    {previewBody || "(sin cuerpo)"}
                  </pre>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setPreview(!preview)}
                className="gap-2"
              >
                {preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {preview ? "Ocultar" : "Ver"} preview
              </Button>
              <Button
                onClick={handleSend}
                disabled={sendMutation.isPending || sent}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {sendMutation.isPending ? "Enviando..." : sent ? "¡Enviado!" : "Enviar email"}
              </Button>
              {sent && (
                <Button variant="ghost" onClick={reset}>
                  Nuevo email
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Plantillas rápidas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {TEMPLATE_EXAMPLES.map((t) => (
                  <Button
                    key={t.label}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => applyTemplate(t)}
                  >
                    {t.label}
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1">
                  <Info className="h-3.5 w-3.5" /> Merge tags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {MERGE_TAGS.map((t) => (
                  <div key={t.tag}>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{t.tag}</code>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Remitente</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary" className="text-xs">
                  eventos@cancagua.cl
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  Los emails salen como "Cancagua Eventos" para mayor personalización y apertura.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
