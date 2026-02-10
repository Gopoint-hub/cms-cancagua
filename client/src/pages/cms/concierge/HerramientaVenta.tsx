/**
 * Herramienta de Venta - Módulo Concierge
 * Interfaz mobile-first para que los vendedores realicen ventas.
 * Soporta múltiples líneas de precio (ej: 3 Adultos + 2 Niños) en una sola venta.
 * Diseño sin imágenes: usa iconos y colores por categoría para identificación rápida.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Clock,
  Package,
  Tag,
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react";
import { getCategoryInfo, inferCategoryFromName } from "@/lib/serviceCategories";

// Tipos
interface ServicePrice {
  id: number;
  serviceId: number;
  label: string;
  price: number;
  sortOrder: number;
  active: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ConciergeService {
  id: number;
  serviceId: number;
  availableQuantity: number;
  active: number;
  sellerNotes: string | null;
  serviceName: string | null;
  serviceDescription: string | null;
  serviceDuration: number | null;
  serviceImageUrl: string | null;
  serviceCategory: string | null;
  prices: ServicePrice[];
}

interface LineDetail {
  label: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

type ViewState = "services" | "form" | "success";

// Map de cantidades por priceId
type QuantityMap = Record<number, number>;

export default function HerramientaVenta() {
  const [view, setView] = useState<ViewState>("services");
  const [selectedService, setSelectedService] =
    useState<ConciergeService | null>(null);
  // Nuevo: mapa de cantidades por cada tipo de precio
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [customerData, setCustomerData] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [saleResult, setSaleResult] = useState<{
    success: boolean;
    saleId: number;
    saleReference: string;
    paymentUrl: string;
    amount: number;
    serviceName: string | null;
    priceLabel: string;
    lineDetails?: LineDetail[];
    commissionAmount: number;
    emailSent: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Obtener servicios disponibles con precios
  const { data: services, isLoading: loadingServices } =
    trpc.concierge.sales.getAvailableServices.useQuery();

  // Obtener información del vendedor
  const { data: sellerInfo } =
    trpc.concierge.sales.getMySellerInfo.useQuery();

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

  // Seleccionar servicio → ir al formulario con cantidades en 0
  const handleSelectService = (service: ConciergeService) => {
    setSelectedService(service);
    // Inicializar cantidades en 0 para cada precio activo
    const initialQuantities: QuantityMap = {};
    service.prices.filter((p) => p.active).forEach((p) => {
      initialQuantities[p.id] = 0;
    });
    setQuantities(initialQuantities);
    setView("form");
  };

  // Cambiar cantidad de un tipo de precio
  const updateQuantity = (priceId: number, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [priceId]: Math.max(0, (prev[priceId] || 0) + delta),
    }));
  };

  // Calcular items activos (cantidad > 0)
  const activeItems = useMemo(() => {
    if (!selectedService) return [];
    return selectedService.prices
      .filter((p) => p.active && (quantities[p.id] || 0) > 0)
      .map((p) => ({
        priceId: p.id,
        label: p.label,
        unitPrice: p.price,
        quantity: quantities[p.id] || 0,
        subtotal: p.price * (quantities[p.id] || 0),
      }));
  }, [selectedService, quantities]);

  // Total combinado
  const totalAmount = useMemo(() => {
    return activeItems.reduce((sum, item) => sum + item.subtotal, 0);
  }, [activeItems]);

  // Total personas
  const totalPersonas = useMemo(() => {
    return activeItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [activeItems]);

  // Enviar formulario
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || activeItems.length === 0) {
      toast.error("Agrega al menos una persona");
      return;
    }

    initiateSaleMutation.mutate({
      conciergeServiceId: selectedService.id,
      items: activeItems.map((item) => ({
        priceId: item.priceId,
        quantity: item.quantity,
      })),
      customerName: customerData.name,
      customerEmail: customerData.email,
      customerPhone: customerData.phone || undefined,
      notes: customerData.notes || undefined,
    });
  };

  // Nueva venta
  const handleNewSale = () => {
    setView("services");
    setSelectedService(null);
    setQuantities({});
    setCustomerData({ name: "", email: "", phone: "", notes: "" });
    setSaleResult(null);
  };

  // Get category info for a service
  const getServiceCategory = (service: ConciergeService) => {
    if (service.serviceCategory) {
      return getCategoryInfo(service.serviceCategory);
    }
    if (service.serviceName) {
      return inferCategoryFromName(service.serviceName);
    }
    return getCategoryInfo(null);
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
                <p className="font-semibold">
                  {sellerInfo.companyName || "Mi Tienda"}
                </p>
              </div>
              <Badge
                variant="secondary"
                className="bg-white/20 text-white"
              >
                {sellerInfo.commissionRate}% comisión
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Título */}
      <div className="text-center py-2">
        <h1 className="text-xl font-bold text-gray-900">
          Selecciona un Servicio
        </h1>
        <p className="text-sm text-gray-500">
          Elige el servicio que deseas vender
        </p>
      </div>

      {/* Lista de servicios */}
      {loadingServices ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {services?.map((service) => {
            const cat = getServiceCategory(service);
            const IconComponent = cat.icon;
            const activePrices = service.prices.filter((p) => p.active);

            return (
              <Card
                key={service.id}
                className={`cursor-pointer hover:shadow-lg transition-all duration-200 active:scale-[0.98] border-2 ${cat.borderColor} hover:border-blue-400`}
                onClick={() => handleSelectService(service)}
              >
                <CardContent className="p-0">
                  <div className="flex items-stretch">
                    {/* Left: Category icon block */}
                    <div
                      className={`w-20 ${cat.bgColor} flex flex-col items-center justify-center gap-1 rounded-l-xl shrink-0`}
                    >
                      <IconComponent className={`w-7 h-7 ${cat.iconColor}`} />
                      <span className={`text-[10px] font-semibold ${cat.iconColor} text-center leading-tight px-1`}>
                        {cat.name}
                      </span>
                    </div>

                    {/* Right: Service info */}
                    <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                      <h3 className="font-bold text-sm leading-tight mb-1.5 text-gray-900">
                        {service.serviceName || "Servicio"}
                      </h3>

                      {/* Prices - each on its own line for clarity */}
                      <div className="flex flex-col gap-0.5 mb-1">
                        {activePrices.length > 0 ? (
                          activePrices.map((p) => (
                            <span key={p.id} className="text-xs">
                              <span className="text-gray-500">{p.label}: </span>
                              <span className={`font-bold ${cat.accentColor}`}>
                                {formatPrice(p.price)}
                              </span>
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400 italic">
                            Sin precio
                          </span>
                        )}
                      </div>

                      {/* Duration if available and > 0 */}
                      {service.serviceDuration != null && service.serviceDuration > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {service.serviceDuration} min
                        </span>
                      )}
                    </div>

                    {/* Arrow indicator */}
                    <div className="flex items-center pr-3">
                      <ChevronRight className="w-5 h-5 text-gray-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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

  // Vista de formulario de cliente con múltiples líneas de precio
  const renderFormView = () => {
    const cat = selectedService ? getServiceCategory(selectedService) : getCategoryInfo(null);
    const IconComponent = cat.icon;
    const activePrices = selectedService?.prices.filter((p) => p.active) || [];

    return (
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
          <Card className={`border-2 ${cat.borderColor}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-14 h-14 rounded-xl ${cat.bgColor} flex items-center justify-center shrink-0`}
                >
                  <IconComponent className={`w-7 h-7 ${cat.iconColor}`} />
                </div>
                <div className="flex-1">
                  <p className={`text-xs font-medium ${cat.accentColor} mb-0.5`}>
                    {cat.name}
                  </p>
                  <h3 className="font-bold text-base text-gray-900">
                    {selectedService.serviceName}
                  </h3>
                  {selectedService.serviceDuration != null && selectedService.serviceDuration > 0 && (
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {selectedService.serviceDuration} min
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Selector de cantidades por tipo de precio */}
        {selectedService && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="w-4 h-4" />
                ¿Cuántas personas?
              </CardTitle>
              <CardDescription>
                Indica la cantidad para cada tipo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              {activePrices.map((p, idx) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between py-4 ${
                    idx < activePrices.length - 1 ? "border-b border-gray-100" : ""
                  }`}
                >
                  {/* Label y precio unitario */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-base">
                      {p.label}
                    </p>
                    <p className={`text-sm ${cat.accentColor} font-medium`}>
                      {formatPrice(p.price)} c/u
                    </p>
                  </div>

                  {/* Controles de cantidad */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      onClick={() => updateQuantity(p.id, -1)}
                      disabled={(quantities[p.id] || 0) <= 0}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className="text-xl font-bold w-10 text-center tabular-nums">
                      {quantities[p.id] || 0}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      onClick={() => updateQuantity(p.id, 1)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Resumen del desglose */}
              {activeItems.length > 0 && (
                <div className={`mt-4 pt-4 border-t-2 ${cat.borderColor}`}>
                  {/* Desglose por línea */}
                  <div className="space-y-1.5 mb-3">
                    {activeItems.map((item) => (
                      <div
                        key={item.priceId}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-600">
                          {item.label} x {item.quantity}
                        </span>
                        <span className="font-medium text-gray-800">
                          {formatPrice(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className={`${cat.bgColor} -mx-6 px-6 py-3 rounded-b-lg`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-gray-700 font-medium">Total a cobrar</span>
                        <p className="text-xs text-gray-500">
                          {totalPersonas} {totalPersonas === 1 ? "persona" : "personas"}
                        </p>
                      </div>
                      <span className={`text-2xl font-bold ${cat.accentColor}`}>
                        {formatPrice(totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Formulario de datos del cliente */}
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
                    setCustomerData({
                      ...customerData,
                      name: e.target.value,
                    })
                  }
                  required
                  className="h-12 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email del cliente *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="cliente@email.com"
                    value={customerData.email}
                    onChange={(e) =>
                      setCustomerData({
                        ...customerData,
                        email: e.target.value,
                      })
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
                      setCustomerData({
                        ...customerData,
                        phone: e.target.value,
                      })
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
                    setCustomerData({
                      ...customerData,
                      notes: e.target.value,
                    })
                  }
                  className="min-h-[80px]"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-14 text-lg"
                disabled={
                  !customerData.name ||
                  !customerData.email ||
                  activeItems.length === 0 ||
                  initiateSaleMutation.isPending
                }
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
                    {totalAmount > 0 && (
                      <span className="ml-2 opacity-90">
                        ({formatPrice(totalAmount)})
                      </span>
                    )}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  };

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
            {saleResult?.emailSent
              ? "Se envió un email al cliente con el enlace de pago"
              : "Comparte el enlace con el cliente para que complete el pago"}
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
              <span className="font-medium">{saleResult.serviceName}</span>
            </div>

            {/* Desglose por línea si hay múltiples */}
            {saleResult.lineDetails && saleResult.lineDetails.length > 0 ? (
              <div className="py-2 border-b">
                <span className="text-gray-600 text-sm">Detalle:</span>
                <div className="mt-1 space-y-1">
                  {saleResult.lineDetails.map((line, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {line.label} x {line.quantity}
                      </span>
                      <span className="font-medium">
                        {formatPrice(line.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : saleResult.priceLabel ? (
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Tipo</span>
                <span className="font-medium">{saleResult.priceLabel}</span>
              </div>
            ) : null}

            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Monto Total</span>
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
              El cliente debe usar este enlace para completar la reserva y
              pago
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* URL */}
            <div className="bg-gray-100 p-3 rounded-lg break-all text-sm">
              {saleResult.paymentUrl}
            </div>

            {/* Botones de acción */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12"
                onClick={() => copyToClipboard(saleResult.paymentUrl)}
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
                onClick={() =>
                  window.open(saleResult.paymentUrl, "_blank")
                }
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
