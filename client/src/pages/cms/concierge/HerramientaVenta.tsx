/**
 * Herramienta de Venta - Módulo Concierge
 * Interfaz mobile-first para que los vendedores realicen ventas
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ShoppingCart,
  User,
  Mail,
  Phone,
  ArrowLeft,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  DollarSign,
  Clock,
  Package,
} from "lucide-react";

// Tipos
interface ConciergeService {
  id: number;
  serviceId: number;
  price: number;
  availableQuantity: number;
  active: number;
  sellerNotes: string | null;
  serviceName: string | null;
  serviceDescription: string | null;
  serviceDuration: number | null;
  serviceImageUrl: string | null;
  serviceCategory: string | null;
  serviceSkeduId: string | null;
}

type ViewState = "services" | "form" | "success";

export default function HerramientaVenta() {
  const [view, setView] = useState<ViewState>("services");
  const [selectedService, setSelectedService] = useState<ConciergeService | null>(null);
  const [customerData, setCustomerData] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [saleResult, setSaleResult] = useState<{
    saleReference: string;
    paymentLink: string;
    amount: number;
    serviceName: string | null;
    commissionAmount: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Obtener servicios disponibles
  const { data: services, isLoading: loadingServices } = trpc.concierge.sales.getAvailableServices.useQuery();

  // Obtener información del vendedor
  const { data: sellerInfo } = trpc.concierge.sales.getMySellerInfo.useQuery();

  // Mutación para iniciar venta
  const initiateSaleMutation = trpc.concierge.sales.initiateSale.useMutation({
    onSuccess: (result) => {
      setSaleResult(result);
      setView("success");
      toast.success("¡Venta iniciada correctamente!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al iniciar la venta");
    },
  });

  // Formatear precio
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(price);
  };

  // Copiar enlace al portapapeles
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Enlace copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  // Seleccionar servicio
  const handleSelectService = (service: ConciergeService) => {
    setSelectedService(service);
    setView("form");
  };

  // Enviar formulario
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;

    initiateSaleMutation.mutate({
      conciergeServiceId: selectedService.id,
      customerName: customerData.name,
      customerEmail: customerData.email || undefined,
      customerPhone: customerData.phone || undefined,
      notes: customerData.notes || undefined,
    });
  };

  // Nueva venta
  const handleNewSale = () => {
    setView("services");
    setSelectedService(null);
    setCustomerData({ name: "", email: "", phone: "", notes: "" });
    setSaleResult(null);
  };

  // Vista de selección de servicios
  const renderServicesView = () => (
    <div className="space-y-4">
      {/* Header del vendedor */}
      {sellerInfo && (
        <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Vendedor</p>
                <p className="font-semibold">{sellerInfo.companyName || "Mi Tienda"}</p>
              </div>
              <Badge variant="secondary" className="bg-white/20 text-white">
                {sellerInfo.commissionRate}% comisión
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Título */}
      <div className="text-center py-2">
        <h1 className="text-xl font-bold text-gray-900">Selecciona un Servicio</h1>
        <p className="text-sm text-gray-500">Elige el servicio que deseas vender</p>
      </div>

      {/* Grid de servicios */}
      {loadingServices ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {services?.map((service: ConciergeService) => (
            <Card
              key={service.id}
              className="cursor-pointer hover:shadow-lg transition-all duration-200 active:scale-95 border-2 hover:border-blue-500"
              onClick={() => handleSelectService(service)}
            >
              <CardContent className="p-3">
                {/* Imagen del servicio */}
                {service.serviceImageUrl ? (
                  <div className="aspect-square rounded-lg overflow-hidden mb-2 bg-gray-100">
                    <img
                      src={service.serviceImageUrl}
                      alt={service.serviceName || "Servicio"}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-square rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center mb-2">
                    <Package className="w-8 h-8 text-blue-500" />
                  </div>
                )}

                {/* Info del servicio */}
                <h3 className="font-semibold text-sm line-clamp-2 mb-1">
                  {service.serviceName || "Servicio"}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-blue-600">
                    {formatPrice(service.price)}
                  </span>
                  {service.serviceDuration && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {service.serviceDuration}min
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {services?.length === 0 && (
        <Card className="text-center py-8">
          <CardContent>
            <Package className="w-12 h-12 mx-auto text-gray-400 mb-3" />
            <p className="text-gray-500">No hay servicios disponibles</p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Vista de formulario de cliente
  const renderFormView = () => (
    <div className="space-y-4">
      {/* Botón volver */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setView("services")}
        className="mb-2"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Volver
      </Button>

      {/* Servicio seleccionado */}
      {selectedService && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {selectedService.serviceImageUrl ? (
                <img
                  src={selectedService.serviceImageUrl}
                  alt={selectedService.serviceName || ""}
                  className="w-16 h-16 rounded-lg object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-blue-200 flex items-center justify-center">
                  <Package className="w-6 h-6 text-blue-600" />
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-semibold">{selectedService.serviceName}</h3>
                <p className="text-2xl font-bold text-blue-600">
                  {formatPrice(selectedService.price)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formulario */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Datos del Cliente
          </CardTitle>
          <CardDescription>
            Ingresa los datos del cliente para generar el enlace de pago
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del cliente *</Label>
              <Input
                id="name"
                placeholder="Nombre completo"
                value={customerData.name}
                onChange={(e) =>
                  setCustomerData({ ...customerData, name: e.target.value })
                }
                required
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email (opcional)</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="cliente@email.com"
                  value={customerData.email}
                  onChange={(e) =>
                    setCustomerData({ ...customerData, email: e.target.value })
                  }
                  className="h-12 text-base pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono (opcional)</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+56 9 1234 5678"
                  value={customerData.phone}
                  onChange={(e) =>
                    setCustomerData({ ...customerData, phone: e.target.value })
                  }
                  className="h-12 text-base pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Información adicional..."
                value={customerData.notes}
                onChange={(e) =>
                  setCustomerData({ ...customerData, notes: e.target.value })
                }
                className="min-h-[80px]"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-14 text-lg"
              disabled={!customerData.name || initiateSaleMutation.isPending}
            >
              {initiateSaleMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generando enlace...
                </>
              ) : (
                <>
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Generar Enlace de Pago
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );

  // Vista de éxito con enlace de pago
  const renderSuccessView = () => (
    <div className="space-y-4">
      {/* Mensaje de éxito */}
      <Card className="bg-green-50 border-green-200">
        <CardContent className="p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-green-800 mb-2">
            ¡Venta Iniciada!
          </h2>
          <p className="text-green-700">
            Comparte el enlace con el cliente para que complete el pago
          </p>
        </CardContent>
      </Card>

      {/* Detalles de la venta */}
      {saleResult && (
        <Card>
          <CardHeader>
            <CardTitle>Detalles de la Venta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Servicio</span>
              <span className="font-semibold">{saleResult.serviceName}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Monto</span>
              <span className="font-bold text-lg text-blue-600">
                {formatPrice(saleResult.amount)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Tu comisión</span>
              <span className="font-semibold text-green-600">
                {formatPrice(saleResult.commissionAmount)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Referencia</span>
              <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                {saleResult.saleReference}
              </code>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enlace de pago */}
      {saleResult && (
        <Card className="border-2 border-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Enlace de Pago
            </CardTitle>
            <CardDescription>
              El cliente debe usar este enlace para completar la reserva y pago
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* URL */}
            <div className="bg-gray-100 p-3 rounded-lg break-all text-sm">
              {saleResult.paymentLink}
            </div>

            {/* Botones de acción */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12"
                onClick={() => copyToClipboard(saleResult.paymentLink)}
              >
                {copied ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {copied ? "Copiado" : "Copiar"}
              </Button>
              <Button
                className="h-12"
                onClick={() => window.open(saleResult.paymentLink, "_blank")}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Abrir
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nueva venta */}
      <Button
        variant="outline"
        className="w-full h-14"
        onClick={handleNewSale}
      >
        <ShoppingCart className="w-5 h-5 mr-2" />
        Nueva Venta
      </Button>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 p-4 pb-20 max-w-lg mx-auto">
        {view === "services" && renderServicesView()}
        {view === "form" && renderFormView()}
        {view === "success" && renderSuccessView()}
      </div>
    </DashboardLayout>
  );
}
