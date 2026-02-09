import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Mail, AlertCircle, CheckCircle2,
  ListChecks, Send, Shield
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";

export default function AyudaNewsletters() {
  return (
    <DashboardLayout>
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span>Ayuda</span>
          <span>/</span>
          <span className="text-foreground">Newsletters</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Mail className="h-6 w-6 text-primary" />
          Newsletters y Envío de Mailings
        </h1>
        <p className="text-muted-foreground">
          Cómo funciona el sistema de listas, envío de emails y deduplicación
        </p>
      </div>

      {/* Resumen */}
      <div className="bg-muted/50 rounded-lg p-4 border">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground mb-1">Resumen rápido</p>
            <p className="text-sm text-muted-foreground">
              El sistema de newsletters permite enviar emails masivos a suscriptores organizados en listas.
              Al enviar, el sistema <strong>deduplica automáticamente</strong>: aunque selecciones todas las listas,
              cada persona recibe <strong>solo 1 email</strong>, nunca duplicados.
            </p>
          </div>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["listas", "envio", "deduplicacion", "unsubscribe"]} className="space-y-2">
        {/* Estructura de Listas */}
        <AccordionItem value="listas" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <span className="font-medium">Estructura actual de listas</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Las listas se organizan en 3 categorías. Cada suscriptor puede estar en múltiples listas
                simultáneamente según sus intereses y ubicación.
              </p>

              {/* Listas por Servicio */}
              <div>
                <h4 className="font-medium text-foreground flex items-center gap-2 mb-2">
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Servicios</Badge>
                  6 listas
                </h4>
                <p className="text-muted-foreground mb-2">
                  Segmentan a los suscriptores según el servicio de Cancagua que les interesa.
                  Son las listas principales para la estrategia de marketing centrada en servicios y upselling.
                </p>
                <div className="bg-background rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-2 font-medium">Lista</th>
                        <th className="text-left p-2 font-medium">Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b"><td className="p-2 font-medium">Hot Tubs</td><td className="p-2 text-muted-foreground">Interesados en tinas calientes</td></tr>
                      <tr className="border-b"><td className="p-2 font-medium">Biopiscinas</td><td className="p-2 text-muted-foreground">Interesados en biopiscinas</td></tr>
                      <tr className="border-b"><td className="p-2 font-medium">Masajes</td><td className="p-2 text-muted-foreground">Interesados en masajes</td></tr>
                      <tr className="border-b"><td className="p-2 font-medium">Sauna Nativo</td><td className="p-2 text-muted-foreground">Interesados en sauna</td></tr>
                      <tr className="border-b"><td className="p-2 font-medium">Tablas SUP</td><td className="p-2 text-muted-foreground">Interesados en stand up paddle</td></tr>
                      <tr><td className="p-2 font-medium">Clases Regulares</td><td className="p-2 text-muted-foreground">Interesados en clases y talleres regulares</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Listas por Zona */}
              <div>
                <h4 className="font-medium text-foreground flex items-center gap-2 mb-2">
                  <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Zonas Geográficas</Badge>
                  4 listas
                </h4>
                <p className="text-muted-foreground mb-2">
                  Segmentan por ubicación geográfica del suscriptor. Útiles para campañas localizadas
                  o eventos en zonas específicas.
                </p>
                <div className="bg-background rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-2 font-medium">Lista</th>
                        <th className="text-left p-2 font-medium">Cobertura</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b"><td className="p-2 font-medium">Zona Norte</td><td className="p-2 text-muted-foreground">Arica a Coquimbo</td></tr>
                      <tr className="border-b"><td className="p-2 font-medium">Zona Central</td><td className="p-2 text-muted-foreground">Santiago, Valparaíso, O'Higgins, Maule</td></tr>
                      <tr className="border-b"><td className="p-2 font-medium">Zona Sur</td><td className="p-2 text-muted-foreground">Biobío, Araucanía, Los Ríos, Los Lagos, Aysén, Magallanes</td></tr>
                      <tr><td className="p-2 font-medium">Internacional</td><td className="p-2 text-muted-foreground">Todos los países fuera de Chile</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Lista de Eventos */}
              <div>
                <h4 className="font-medium text-foreground flex items-center gap-2 mb-2">
                  <Badge className="bg-purple-500/10 text-purple-600 border-purple-200">Eventos</Badge>
                  1 lista
                </h4>
                <p className="text-muted-foreground">
                  Agrupa a todos los suscriptores que han mostrado interés en eventos de Cancagua
                  (conciertos, talleres, encuentros de inmersión, sonoterapia, etc.).
                  Ideal para promocionar nuevos eventos.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Deduplicación */}
        <AccordionItem value="deduplicacion" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="font-medium">Deduplicación de envíos</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-3 text-sm">
              <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <p className="font-medium text-green-700 dark:text-green-400 mb-1">
                  No hay riesgo de envíos duplicados
                </p>
                <p className="text-green-600 dark:text-green-500 text-sm">
                  El sistema verifica automáticamente cada email antes de enviarlo.
                  Si un suscriptor está en múltiples listas, solo recibe 1 email.
                </p>
              </div>

              <p className="text-muted-foreground">
                <strong>¿Cómo funciona?</strong> Al momento de enviar un newsletter, el sistema:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
                <li>Recopila todos los suscriptores de las listas seleccionadas</li>
                <li>Crea un registro de emails ya procesados</li>
                <li>Por cada suscriptor, verifica si su email ya fue incluido</li>
                <li>Solo agrega al envío los emails que no se han visto antes</li>
                <li>Resultado: cada persona recibe exactamente 1 email</li>
              </ol>

              <p className="text-muted-foreground">
                <strong>Ejemplo práctico:</strong> Si un suscriptor está en "Hot Tubs", "Masajes" y "Zona Sur",
                y seleccionas las 3 listas para enviar, esa persona recibirá solo 1 email, no 3.
              </p>

              <p className="text-muted-foreground">
                <strong>Dato:</strong> Actualmente hay ~1.232 suscriptores que están en 2 o más listas de servicio.
                De un total de ~4.597 suscriptores únicos en listas de servicio, la deduplicación evita
                envíos innecesarios en cada campaña.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Proceso de Envío */}
        <AccordionItem value="envio" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              <span className="font-medium">Proceso de envío</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                El envío de newsletters funciona de forma <strong>asíncrona</strong> para manejar
                grandes volúmenes sin errores de timeout:
              </p>

              <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
                <li><strong>Crear newsletter:</strong> Escribe tu solicitud y la IA genera el diseño del email</li>
                <li><strong>Revisar y editar:</strong> Puedes refinar el diseño con la IA o editarlo manualmente</li>
                <li><strong>Seleccionar listas:</strong> Elige las listas de destinatarios (puedes seleccionar todas sin riesgo de duplicados)</li>
                <li><strong>Enviar:</strong> El sistema confirma inmediatamente que el envío se inició</li>
                <li><strong>Envío en segundo plano:</strong> Los emails se envían en lotes de 50, con pausas entre lotes para evitar bloqueos</li>
                <li><strong>Estado:</strong> En la lista de newsletters verás el estado "Enviando" mientras se procesan, y cambiará a "Enviado" al completarse</li>
              </ol>

              <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                  Importante
                </p>
                <p className="text-amber-600 dark:text-amber-500 text-sm">
                  No cierres la pestaña durante el envío. Si el envío falla, el newsletter quedará en estado
                  "Fallido" y podrás cambiarlo a "Borrador" para reintentarlo.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Unsubscribe */}
        <AccordionItem value="unsubscribe" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline py-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-orange-500" />
              <span className="font-medium">Darse de baja (Unsubscribe)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Todos los emails enviados incluyen automáticamente un enlace de "Darse de baja" en el pie del email.
                Esto es obligatorio por ley y buenas prácticas de email marketing.
              </p>

              <p className="text-muted-foreground">
                <strong>¿Qué pasa cuando alguien se da de baja?</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>El suscriptor ve una página de confirmación con el branding de Cancagua</li>
                <li>Su estado cambia a "unsubscribed" en la base de datos</li>
                <li>No recibirá más newsletters en futuros envíos</li>
                <li>El enlace es personalizado por cada suscriptor (codificado en base64)</li>
              </ul>

              <p className="text-muted-foreground">
                <strong>¿Cómo se agrega el enlace?</strong> El sistema tiene 3 capas de protección:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
                <li>La IA incluye un placeholder <code className="bg-muted px-1 rounded">{"{{unsubscribe_url}}"}</code> al generar el diseño</li>
                <li>Al enviar, el backend reemplaza el placeholder con la URL personalizada de cada suscriptor</li>
                <li>Si el HTML no tiene el placeholder, el sistema inyecta el enlace automáticamente al pie</li>
              </ol>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
    </DashboardLayout>
  );
}
