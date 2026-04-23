import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Trash2,
  Eye,
  Save,
  Send,
  GripVertical,
  Search,
  Building2,
  User,
  FileText,
  ShoppingCart,
  Settings,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
  Check,
  ChevronsUpDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { cn } from "@/lib/utils";

// Tipos
interface QuoteItem {
  id?: number;
  productId?: number;
  productName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  total: number;
  sortOrder: number;
  scheduleTime?: string;
}

interface DealData {
  id?: number;
  name: string;
  pipeline: string;
  stage: string;
  value?: number;
  closeDate?: string;
  notes?: string;
}

interface BuyerData {
  id?: number;
  name: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  position?: string;
  company?: string;
  rut?: string;
  address?: string;
  giro?: string;
}

interface QuoteDetails {
  name: string;
  validUntil: string;
  language: string;
  region: string;
  notes: string;
  termsOfPurchase: string;
}

// 5 pasos del wizard (se eliminó "Firma y pago")
const WIZARD_STEPS = [
  { id: 1, title: "Negocio", icon: Building2, description: "Asociar con un negocio" },
  { id: 2, title: "Información del comprador", icon: User, description: "Datos del contacto" },
  { id: 3, title: "Elementos de pedido", icon: ShoppingCart, description: "Productos y servicios" },
  { id: 4, title: "Plantilla y detalles", icon: Settings, description: "Nombre y términos" },
  { id: 5, title: "Revisión", icon: CheckCircle, description: "Vista previa final" },
];

// Pipelines disponibles
const PIPELINES = [
  { value: "jornada_autocuidado", label: "Jornada de autocuidado" },
  { value: "eventos_corporativos", label: "Eventos corporativos" },
  { value: "retiros", label: "Retiros" },
];

// Etapas del negocio
const DEAL_STAGES = [
  { value: "nuevo", label: "Nuevo" },
  { value: "reunion_programada", label: "Reunión programada" },
  { value: "cotizacion_enviada", label: "Cotización enviada" },
  { value: "negociacion", label: "Negociación" },
  { value: "ganado", label: "Ganado" },
  { value: "perdido", label: "Perdido" },
];

// Términos de compra por defecto
const DEFAULT_TERMS = `Cotización válida por 10 días
Para garantizar reserva se debe abonar el 50% del valor total
Valores IVA incluido`;

export default function CotizacionWizard() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const isEditing = !!params.id;

  // Estado del wizard
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  // Estado del negocio (Deal)
  const [dealData, setDealData] = useState<DealData>({
    name: "",
    pipeline: "jornada_autocuidado",
    stage: "nuevo",
  });
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [isCreatingDeal, setIsCreatingDeal] = useState(false);
  const [dealSearchOpen, setDealSearchOpen] = useState(false);
  const [dealSearchQuery, setDealSearchQuery] = useState("");

  // Estado del comprador
  const [buyerData, setBuyerData] = useState<BuyerData>({
    name: "",
    email: "",
  });
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  // Estado del vendedor (auto-completado)
  const [sellerInfo, setSellerInfo] = useState({
    name: "Cancagua Spa & Retreat Center",
    email: "contacto@cancagua.cl",
    phone: "+56 9 8224 3411",
  });

  // Estado de los items
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);

  // Estado de detalles de la cotización
  const [quoteDetails, setQuoteDetails] = useState<QuoteDetails>({
    name: "",
    validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    language: "es",
    region: "america_del_sur",
    notes: "",
    termsOfPurchase: DEFAULT_TERMS,
  });

  // Número de personas para el evento
  const [numberOfPeople, setNumberOfPeople] = useState(10);
  const [eventDate, setEventDate] = useState("");

  // Queries
  const { data: deals = [] } = trpc.deals.getAll.useQuery();
  const { data: corporateClients = [] } = trpc.corporateClients.getAll.useQuery();
  const { data: products = [] } = trpc.corporateProducts.getActive.useQuery();
  const { data: currentUser } = trpc.auth.me.useQuery();

  // Query for loading existing quote when editing
  const { data: existingQuote } = trpc.quotes.getById.useQuery(
    { id: parseInt(params.id || "0") },
    { enabled: isEditing && !!params.id }
  );
  const { data: existingItems = [] } = trpc.quotes.getItems.useQuery(
    { quoteId: parseInt(params.id || "0") },
    { enabled: isEditing && !!params.id }
  );

  // Mutations
  const createDealMutation = trpc.deals.create.useMutation();
  const updateDealMutation = trpc.deals.update.useMutation();
  const createClientMutation = trpc.corporateClients.create.useMutation();
  const createQuoteMutation = trpc.quotes.create.useMutation();
  const updateQuoteMutation = trpc.quotes.update.useMutation();

  // Track if we've already loaded the quote data to avoid re-running
  const [quoteDataLoaded, setQuoteDataLoaded] = useState(false);

  // Load existing quote data when editing
  useEffect(() => {
    if (!isEditing || !existingQuote || quoteDataLoaded) return;

    setIsLoadingQuote(true);

    // Load deal data
    if (existingQuote.dealId) {
      setSelectedDealId(existingQuote.dealId);
      // Try to find the deal in the loaded deals list
      const deal = deals.find((d: any) => d.id === existingQuote.dealId);
      if (deal) {
        setDealData({
          id: deal.id,
          name: deal.name,
          pipeline: deal.pipeline || "jornada_autocuidado",
          stage: deal.stage || "nuevo",
          value: deal.value,
          closeDate: deal.closeDate ? String(deal.closeDate) : undefined,
          notes: deal.notes ?? undefined,
        });
      } else {
        // Deal not loaded yet, set basic data from quote
        setDealData(prev => ({
          ...prev,
          id: existingQuote.dealId!,
          name: existingQuote.name || "",
        }));
      }
      setIsCreatingDeal(false);
    } else {
      // No deal associated - show as creating new deal
      setIsCreatingDeal(true);
    }

    // Load buyer data - always show the form by setting isCreatingClient or selectedClientId
    setBuyerData({
      id: existingQuote.clientId || undefined,
      name: existingQuote.clientName || "",
      email: existingQuote.clientEmail || "",
      phone: existingQuote.clientPhone || "",
      whatsapp: existingQuote.clientWhatsapp || "",
      position: existingQuote.clientPosition || "",
      company: existingQuote.clientCompany || "",
      rut: existingQuote.clientRut || "",
      address: existingQuote.clientAddress || "",
      giro: existingQuote.clientGiro || "",
    });
    if (existingQuote.clientId) {
      setSelectedClientId(existingQuote.clientId);
    } else {
      // No client ID but we have client data - show as creating client
      setIsCreatingClient(true);
    }

    // Load items from existing quote items
    if (existingItems && existingItems.length > 0) {
      setItems(existingItems.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        description: item.description || "",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: item.discountType || "percentage",
        discountValue: item.discountValue || 0,
        total: item.total,
        sortOrder: item.sortOrder || 0,
        scheduleTime: item.scheduleTime || "",
      })));
    }

    // Load quote details
    setQuoteDetails({
      name: existingQuote.name || "",
      validUntil: existingQuote.validUntil
        ? new Date(existingQuote.validUntil).toISOString().split("T")[0]
        : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      language: "es",
      region: "america_del_sur",
      notes: existingQuote.notes || "",
      termsOfPurchase: existingQuote.termsOfPurchase || DEFAULT_TERMS,
    });

    // Load event data
    setNumberOfPeople(existingQuote.numberOfPeople || 10);
    if (existingQuote.eventDate) {
      setEventDate(new Date(existingQuote.eventDate).toISOString().split("T")[0]);
    }

    setIsLoadingQuote(false);
    setQuoteDataLoaded(true);
  }, [isEditing, existingQuote, existingItems, deals, quoteDataLoaded]);

  // Secondary effect: update deal data when deals list loads (may arrive after quote)
  useEffect(() => {
    if (!isEditing || !existingQuote?.dealId || !quoteDataLoaded || deals.length === 0) return;
    const deal = deals.find((d: any) => d.id === existingQuote.dealId);
    if (deal && dealData.name !== deal.name) {
      setDealData({
        id: deal.id,
        name: deal.name,
        pipeline: deal.pipeline || "jornada_autocuidado",
        stage: deal.stage || "nuevo",
        value: deal.value,
        closeDate: deal.closeDate ? String(deal.closeDate) : undefined,
        notes: deal.notes ?? undefined,
      });
    }
  }, [isEditing, existingQuote, deals, quoteDataLoaded]);

  // Filtrar negocios por búsqueda
  const filteredDeals = useMemo(() => {
    if (!dealSearchQuery) return deals;
    return deals.filter((deal: any) =>
      deal.name.toLowerCase().includes(dealSearchQuery.toLowerCase())
    );
  }, [deals, dealSearchQuery]);

  // Filtrar clientes por búsqueda
  const filteredClients = useMemo(() => {
    if (!clientSearchQuery) return corporateClients;
    return corporateClients.filter((client: any) =>
      client.companyName?.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
      client.contactName?.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
      client.contactEmail?.toLowerCase().includes(clientSearchQuery.toLowerCase())
    );
  }, [corporateClients, clientSearchQuery]);

  // Filtrar productos por búsqueda
  const filteredProducts = useMemo(() => {
    if (!productSearchQuery) return products;
    return products.filter((product: any) =>
      product.name.toLowerCase().includes(productSearchQuery.toLowerCase())
    );
  }, [products, productSearchQuery]);

  // Calcular totales
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal;

  // Formatear precio
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(price);
  };

  // Validar paso actual (5 pasos)
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!selectedDealId || (!!dealData.name && isCreatingDeal);
      case 2:
        return !!buyerData.name && !!buyerData.email;
      case 3:
        return items.length > 0;
      case 4:
        return !!quoteDetails.name && !!quoteDetails.validUntil;
      case 5:
        return true; // Revisión
      default:
        return false;
    }
  };

  // Navegar al siguiente paso
  const handleNext = async () => {
    if (!validateStep(currentStep)) {
      toast.error("Por favor completa todos los campos requeridos");
      return;
    }

    // Si estamos creando un nuevo negocio, guardarlo primero
    if (currentStep === 1 && isCreatingDeal && !selectedDealId) {
      try {
        const newDeal = await createDealMutation.mutateAsync({
          name: dealData.name,
          pipeline: dealData.pipeline,
          stage: dealData.stage,
          closeDate: dealData.closeDate,
          notes: dealData.notes,
        });
        if (newDeal?.id) {
          setSelectedDealId(newDeal.id);
          toast.success("Negocio creado exitosamente");
        }
      } catch (error: any) {
        toast.error(error.message || "Error al crear negocio");
        return;
      }
    }

    // Si seleccionamos un negocio existente, actualizarlo con los cambios
    if (currentStep === 1 && selectedDealId && !isCreatingDeal) {
      try {
        await updateDealMutation.mutateAsync({
          id: selectedDealId,
          name: dealData.name,
          pipeline: dealData.pipeline,
          stage: dealData.stage,
          closeDate: dealData.closeDate,
          notes: dealData.notes,
        });
        toast.success("Negocio actualizado");
      } catch (error: any) {
        console.error("Error al actualizar negocio:", error);
      }
    }

    // Si estamos creando un nuevo cliente, guardarlo
    if (currentStep === 2 && isCreatingClient && !selectedClientId) {
      try {
        await createClientMutation.mutateAsync({
          companyName: buyerData.company || buyerData.name,
          contactName: buyerData.name,
          contactEmail: buyerData.email,
          contactPhone: buyerData.phone,
          contactWhatsapp: buyerData.whatsapp,
          rut: buyerData.rut,
          address: buyerData.address,
          giro: buyerData.giro,
        });
        toast.success("Cliente creado exitosamente");
      } catch (error: any) {
        console.log("Cliente posiblemente ya existe");
      }
    }

    // Marcar paso como completado
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps([...completedSteps, currentStep]);
    }

    // Avanzar al siguiente paso
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  // Navegar al paso anterior
  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Seleccionar un negocio existente
  const handleSelectDeal = (deal: any) => {
    setSelectedDealId(deal.id);
    setDealData({
      id: deal.id,
      name: deal.name,
      pipeline: deal.pipeline || "jornada_autocuidado",
      stage: deal.stage || "nuevo",
      value: deal.value,
      closeDate: deal.closeDate,
      notes: deal.notes,
    });
    setIsCreatingDeal(false);
    setDealSearchOpen(false);

    // Auto-completar nombre de cotización
    if (!quoteDetails.name) {
      setQuoteDetails({ ...quoteDetails, name: deal.name });
    }
  };

  // Seleccionar un cliente existente
  const handleSelectClient = (client: any) => {
    setSelectedClientId(client.id);
    setBuyerData({
      id: client.id,
      name: client.contactName || "",
      email: client.contactEmail || "",
      phone: client.contactPhone || "",
      whatsapp: client.contactWhatsapp || "",
      position: client.contactPosition || "",
      company: client.companyName || "",
      rut: client.rut || "",
      address: client.address || "",
      giro: client.giro || "",
    });
    setIsCreatingClient(false);
    setClientSearchOpen(false);
  };

  // Agregar producto a la cotización
  const handleAddProduct = (product: any) => {
    // Check if product is already in items
    const exists = items.some(item => item.productId === product.id);
    if (exists) {
      toast.info(`"${product.name}" ya está en la cotización`);
      return;
    }

    const newItem: QuoteItem = {
      productId: product.id,
      productName: product.name,
      description: product.description,
      quantity: 1,
      unitPrice: product.unitPrice,
      discountType: "percentage",
      discountValue: 0,
      total: product.priceType === "per_person"
        ? product.unitPrice * numberOfPeople
        : product.unitPrice,
      sortOrder: items.length,
      scheduleTime: "",
    };

    setItems([...items, newItem]);
    toast.success("Producto agregado");
  };

  // Agregar múltiples productos seleccionados
  const handleAddSelectedProducts = () => {
    const newItems: QuoteItem[] = [];
    for (const productId of selectedProductIds) {
      const product = products.find((p: any) => p.id === productId);
      if (!product) continue;

      // Skip if already in items
      const exists = items.some(item => item.productId === product.id);
      if (exists) continue;

      newItems.push({
        productId: product.id,
        productName: product.name,
        description: product.description ?? undefined,
        quantity: 1,
        unitPrice: product.unitPrice,
        discountType: "percentage",
        discountValue: 0,
        total: product.priceType === "per_person"
          ? product.unitPrice * numberOfPeople
          : product.unitPrice,
        sortOrder: items.length + newItems.length,
        scheduleTime: "",
      });
    }

    if (newItems.length > 0) {
      setItems([...items, ...newItems]);
      toast.success(`${newItems.length} producto(s) agregado(s)`);
    } else {
      toast.info("Los productos seleccionados ya están en la cotización");
    }

    setSelectedProductIds([]);
    setIsAddProductOpen(false);
    setProductSearchQuery("");
  };

  // Toggle product selection
  const toggleProductSelection = (productId: number) => {
    setSelectedProductIds(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Actualizar item
  const handleUpdateItem = (index: number, field: keyof QuoteItem, value: any) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };

    // Recalcular total si cambia cantidad, precio o descuento
    if (field === "quantity" || field === "unitPrice" || field === "discountValue" || field === "discountType") {
      const baseTotal = item.unitPrice * item.quantity;
      if (item.discountType === "percentage") {
        item.total = baseTotal - (baseTotal * item.discountValue / 100);
      } else {
        item.total = baseTotal - item.discountValue;
      }
    }

    newItems[index] = item;
    setItems(newItems);
  };

  // Eliminar item
  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
    toast.success("Producto eliminado");
  };

  // Drag and drop para reordenar
  const handleDragStart = (index: number) => {
    setDraggedItem(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;

    const newItems = [...items];
    const draggedItemData = newItems[draggedItem];
    newItems.splice(draggedItem, 1);
    newItems.splice(index, 0, draggedItemData);

    // Actualizar sortOrder
    newItems.forEach((item, i) => {
      item.sortOrder = i;
    });

    setItems(newItems);
    setDraggedItem(index);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  // Guardar cotización
  const handleSave = async (status: "draft" | "sent" = "draft") => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) {
      toast.error("Por favor completa todos los pasos requeridos");
      return;
    }

    try {
      const quotePayload = {
        dealId: selectedDealId || undefined,
        name: quoteDetails.name,
        clientId: selectedClientId || undefined,
        clientName: buyerData.name,
        clientEmail: buyerData.email,
        clientCompany: buyerData.company,
        clientPosition: buyerData.position,
        clientPhone: buyerData.phone,
        clientWhatsapp: buyerData.whatsapp,
        clientRut: buyerData.rut,
        clientAddress: buyerData.address,
        clientGiro: buyerData.giro,
        numberOfPeople,
        eventDate: eventDate || undefined,
        subtotal,
        total,
        validUntil: quoteDetails.validUntil,
        status,
        notes: quoteDetails.notes || undefined,
        termsOfPurchase: quoteDetails.termsOfPurchase || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountType: item.discountType,
          discountValue: item.discountValue,
          total: item.total,
          sortOrder: item.sortOrder,
          scheduleTime: item.scheduleTime,
        })),
      };

      if (isEditing && params.id) {
        await updateQuoteMutation.mutateAsync({
          id: parseInt(params.id),
          ...quotePayload,
        });
        toast.success("Cotización actualizada");
      } else {
        await createQuoteMutation.mutateAsync(quotePayload);
        toast.success(
          status === "draft"
            ? "Cotización guardada como borrador"
            : "Cotización creada y lista para enviar"
        );
      }

      setLocation("/cms/cotizaciones");
    } catch (error: any) {
      toast.error(error.message || "Error al guardar cotización");
    }
  };

  // Auto-completar info del vendedor
  useEffect(() => {
    if (currentUser) {
      setSellerInfo({
        name: currentUser.name || "Cancagua Spa & Retreat Center",
        email: currentUser.email || "contacto@cancagua.cl",
        phone: "+56 9 8224 3411",
      });
    }
  }, [currentUser]);

  // Renderizar indicador de pasos
  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
      {WIZARD_STEPS.map((step, index) => {
        const isActive = currentStep === step.id;
        const isCompleted = completedSteps.includes(step.id) || currentStep > step.id;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => {
                if (isCompleted || step.id <= currentStep) {
                  setCurrentStep(step.id);
                }
              }}
              className={cn(
                "flex flex-col items-center min-w-[100px] p-2 rounded-lg transition-all",
                isActive && "bg-primary/10",
                (isCompleted || step.id <= currentStep) && "cursor-pointer hover:bg-muted"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                  isCompleted && !isActive && "bg-green-500 text-white",
                  !isActive && !isCompleted && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted && !isActive ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium text-center",
                  isActive && "text-primary",
                  !isActive && "text-muted-foreground"
                )}
              >
                {step.title}
              </span>
            </button>
            {index < WIZARD_STEPS.length - 1 && (
              <div
                className={cn(
                  "w-8 h-0.5 mx-1",
                  isCompleted ? "bg-green-500" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  // Paso 1: Negocio
  const renderStep1 = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Negocio</CardTitle>
          <CardDescription>
            Asociar con un negocio existente o crear uno nuevo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Elige o crea un negocio</Label>
            <Popover open={dealSearchOpen} onOpenChange={setDealSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={dealSearchOpen}
                  className="w-full justify-between mt-2"
                >
                  {selectedDealId
                    ? deals.find((d: any) => d.id === selectedDealId)?.name || dealData.name
                    : isCreatingDeal
                    ? dealData.name || "Nuevo negocio"
                    : "Seleccionar negocio..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar negocio..."
                    value={dealSearchQuery}
                    onValueChange={setDealSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>No se encontraron negocios</CommandEmpty>
                    <CommandGroup>
                      {filteredDeals.map((deal: any) => (
                        <CommandItem
                          key={deal.id}
                          value={deal.name}
                          onSelect={() => handleSelectDeal(deal)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedDealId === deal.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {deal.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          setIsCreatingDeal(true);
                          setSelectedDealId(null);
                          setDealSearchOpen(false);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Crear nuevo negocio
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {(selectedDealId || isCreatingDeal) && (
            <>
              <div>
                <Label htmlFor="dealName">Nombre del negocio *</Label>
                <Input
                  id="dealName"
                  value={dealData.name}
                  onChange={(e) => setDealData({ ...dealData, name: e.target.value })}
                  placeholder="Ej: Jornada Empresa ABC"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Pipeline</Label>
                  <Select
                    value={dealData.pipeline}
                    onValueChange={(value) => setDealData({ ...dealData, pipeline: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIPELINES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Etapa</Label>
                  <Select
                    value={dealData.stage}
                    onValueChange={(value) => setDealData({ ...dealData, stage: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_STAGES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="dealCloseDate">Fecha de cierre estimada</Label>
                <Input
                  id="dealCloseDate"
                  type="date"
                  value={dealData.closeDate || ""}
                  onChange={(e) => setDealData({ ...dealData, closeDate: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="dealNotes">Notas del negocio</Label>
                <Textarea
                  id="dealNotes"
                  value={dealData.notes || ""}
                  onChange={(e) => setDealData({ ...dealData, notes: e.target.value })}
                  placeholder="Notas adicionales sobre el negocio"
                  rows={3}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Vista previa */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Vista previa de cotización</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="text-center mb-4">
              <h3 className="font-semibold text-lg">Cancagua Spa & Retreat Center</h3>
            </div>
            <div className="bg-amber-50 p-4 rounded">
              <p className="font-medium">{dealData.name || "Nombre del negocio"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Paso 2: Información del comprador
  const renderStep2 = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Información del comprador</CardTitle>
          <CardDescription>
            Selecciona un cliente existente o ingresa los datos manualmente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Elige o crea un contacto</Label>
            <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={clientSearchOpen}
                  className="w-full justify-between mt-2"
                >
                  {selectedClientId
                    ? buyerData.name || "Cliente seleccionado"
                    : isCreatingClient
                    ? "Nuevo contacto"
                    : "Seleccionar contacto..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar cliente..."
                    value={clientSearchQuery}
                    onValueChange={setClientSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>No se encontraron clientes</CommandEmpty>
                    <CommandGroup>
                      {filteredClients.map((client: any) => (
                        <CommandItem
                          key={client.id}
                          value={`${client.contactName} ${client.companyName}`}
                          onSelect={() => handleSelectClient(client)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedClientId === client.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div>
                            <p className="font-medium">{client.contactName}</p>
                            <p className="text-xs text-muted-foreground">{client.companyName}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          setIsCreatingClient(true);
                          setSelectedClientId(null);
                          setBuyerData({ name: "", email: "" });
                          setClientSearchOpen(false);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Crear nuevo contacto
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {(selectedClientId || isCreatingClient) && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="buyerName">Nombre del contacto *</Label>
                  <Input
                    id="buyerName"
                    value={buyerData.name}
                    onChange={(e) => setBuyerData({ ...buyerData, name: e.target.value })}
                    placeholder="Nombre completo"
                  />
                </div>

                <div>
                  <Label htmlFor="buyerEmail">Email *</Label>
                  <Input
                    id="buyerEmail"
                    type="email"
                    value={buyerData.email}
                    onChange={(e) => setBuyerData({ ...buyerData, email: e.target.value })}
                    placeholder="email@empresa.cl"
                  />
                </div>

                <div>
                  <Label htmlFor="buyerPhone">Teléfono</Label>
                  <Input
                    id="buyerPhone"
                    value={buyerData.phone || ""}
                    onChange={(e) => setBuyerData({ ...buyerData, phone: e.target.value })}
                    placeholder="+56 9 1234 5678"
                  />
                </div>

                <div>
                  <Label htmlFor="buyerWhatsapp">WhatsApp</Label>
                  <Input
                    id="buyerWhatsapp"
                    value={buyerData.whatsapp || ""}
                    onChange={(e) => setBuyerData({ ...buyerData, whatsapp: e.target.value })}
                    placeholder="+56 9 1234 5678"
                  />
                </div>

                <div>
                  <Label htmlFor="buyerPosition">Cargo</Label>
                  <Input
                    id="buyerPosition"
                    value={buyerData.position || ""}
                    onChange={(e) => setBuyerData({ ...buyerData, position: e.target.value })}
                    placeholder="Gerente de RRHH"
                  />
                </div>

                <div>
                  <Label htmlFor="buyerRut">RUT</Label>
                  <Input
                    id="buyerRut"
                    value={buyerData.rut || ""}
                    onChange={(e) => setBuyerData({ ...buyerData, rut: e.target.value })}
                    placeholder="12.345.678-9"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="buyerCompany">Empresa</Label>
                  <Input
                    id="buyerCompany"
                    value={buyerData.company || ""}
                    onChange={(e) => setBuyerData({ ...buyerData, company: e.target.value })}
                    placeholder="Nombre de la empresa"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="buyerAddress">Dirección</Label>
                  <Input
                    id="buyerAddress"
                    value={buyerData.address || ""}
                    onChange={(e) => setBuyerData({ ...buyerData, address: e.target.value })}
                    placeholder="Dirección de la empresa"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="buyerGiro">Giro</Label>
                  <Input
                    id="buyerGiro"
                    value={buyerData.giro || ""}
                    onChange={(e) => setBuyerData({ ...buyerData, giro: e.target.value })}
                    placeholder="Giro de la empresa"
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="numberOfPeople">Número de personas</Label>
                  <Input
                    id="numberOfPeople"
                    type="number"
                    min={1}
                    value={numberOfPeople}
                    onChange={(e) => setNumberOfPeople(parseInt(e.target.value) || 1)}
                  />
                </div>

                <div>
                  <Label htmlFor="eventDate">Fecha del evento</Label>
                  <Input
                    id="eventDate"
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Vista previa */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Vista previa de cotización</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="text-center mb-4">
              <h3 className="font-semibold text-lg">Cancagua Spa & Retreat Center</h3>
            </div>
            <div className="bg-amber-50 p-4 rounded">
              <p className="font-medium">{dealData.name || "Nombre del negocio"}</p>
              <div className="mt-2 text-sm">
                <p>{buyerData.name}</p>
                <p className="text-muted-foreground">{buyerData.email}</p>
                <p className="text-muted-foreground">{buyerData.phone}</p>
              </div>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              <p>Personas: {numberOfPeople}</p>
              {eventDate && <p>Fecha: {new Date(eventDate).toLocaleDateString("es-CL")}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Paso 3: Elementos de pedido
  const renderStep3 = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Revisar elementos de pedido</CardTitle>
              <CardDescription>
                Revisa los elementos de pedido que quieres que aparezcan en la cotización
              </CardDescription>
            </div>
            <Button onClick={() => { setIsAddProductOpen(true); setSelectedProductIds([]); }}>
              <Plus className="w-4 h-4 mr-2" />
              Añadir elemento de pedido
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Agrega elementos de pedido a tu cotización</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Seleccionar de la biblioteca de productos
              </p>
              <Button onClick={() => { setIsAddProductOpen(true); setSelectedProductIds([]); }}>
                Seleccionar de la biblioteca de productos
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Precio unitario</TableHead>
                  <TableHead>Ref.</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Descuento unitario</TableHead>
                  <TableHead>Precio N.</TableHead>
                  <TableHead>TCV</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow
                    key={index}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "cursor-move",
                      draggedItem === index && "opacity-50"
                    )}
                  >
                    <TableCell>
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <span className="text-primary font-medium">{item.productName}</span>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => handleUpdateItem(index, "unitPrice", parseInt(e.target.value) || 0)}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell>--</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => handleUpdateItem(index, "quantity", parseInt(e.target.value) || 1)}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Select
                          value={item.discountType}
                          onValueChange={(value) => handleUpdateItem(index, "discountType", value)}
                        >
                          <SelectTrigger className="w-16">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">%</SelectItem>
                            <SelectItem value="fixed">$</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={0}
                          value={item.discountValue}
                          onChange={(e) => handleUpdateItem(index, "discountValue", parseInt(e.target.value) || 0)}
                          className="w-20"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatPrice(item.unitPrice * item.quantity)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatPrice(item.total)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={item.scheduleTime || ""}
                        onChange={(e) => handleUpdateItem(index, "scheduleTime", e.target.value)}
                        placeholder="10:00"
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveItem(index)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {items.length > 0 && (
            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para agregar productos - con multi-select */}
      <Dialog open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Añadir elementos de pedido</DialogTitle>
            <DialogDescription>
              Selecciona uno o más productos de la biblioteca
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              placeholder="Buscar producto..."
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
            />

            <ScrollArea className="h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Ref.</TableHead>
                    <TableHead>Precio unitario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product: any) => {
                    const isAlreadyAdded = false; // Modificado para permitir duplicados
                    const isSelected = selectedProductIds.includes(product.id);
                    return (
                      <TableRow
                        key={product.id}
                        className={cn(
                          "cursor-pointer",
                          isAlreadyAdded && "opacity-50",
                          isSelected && "bg-primary/5"
                        )}
                        onClick={() => {
                          if (!isAlreadyAdded) {
                            toggleProductSelection(product.id);
                          }
                        }}
                      >
                        <TableCell>
                          <Checkbox
                            checked={isSelected || isAlreadyAdded}
                            disabled={isAlreadyAdded}
                            onCheckedChange={() => {
                              if (!isAlreadyAdded) {
                                toggleProductSelection(product.id);
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <span className={cn("text-primary", isAlreadyAdded && "line-through")}>
                            {product.name}
                          </span>
                          {isAlreadyAdded && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Ya agregado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>--</TableCell>
                        <TableCell>{formatPrice(product.unitPrice)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>

            {selectedProductIds.length > 0 && (
              <div className="bg-primary/5 p-3 rounded-lg text-sm">
                <strong>{selectedProductIds.length}</strong> producto(s) seleccionado(s)
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAddProductOpen(false); setSelectedProductIds([]); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddSelectedProducts}
              disabled={selectedProductIds.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar {selectedProductIds.length > 0 ? `(${selectedProductIds.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // Paso 4: Plantilla y detalles
  const renderStep4 = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Plantilla y detalles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Plantilla</Label>
            <Select defaultValue="default_modern">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default_modern">Default Modern</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="quoteName">Nombre de la cotización *</Label>
            <Input
              id="quoteName"
              value={quoteDetails.name}
              onChange={(e) => setQuoteDetails({ ...quoteDetails, name: e.target.value })}
              placeholder="Nombre identificador de la cotización"
            />
          </div>

          <div>
            <Label htmlFor="validUntil">Fecha de vencimiento *</Label>
            <Input
              id="validUntil"
              type="date"
              value={quoteDetails.validUntil}
              onChange={(e) => setQuoteDetails({ ...quoteDetails, validUntil: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Idioma de la cotización</Label>
              <Select
                value={quoteDetails.language}
                onValueChange={(value) => setQuoteDetails({ ...quoteDetails, language: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="pt">Português</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Lugar</Label>
              <Select
                value={quoteDetails.region}
                onValueChange={(value) => setQuoteDetails({ ...quoteDetails, region: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="america_del_sur">América del Sur</SelectItem>
                  <SelectItem value="america_del_norte">América del Norte</SelectItem>
                  <SelectItem value="europa">Europa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Comentarios para el comprador</Label>
            <Textarea
              id="notes"
              value={quoteDetails.notes}
              onChange={(e) => setQuoteDetails({ ...quoteDetails, notes: e.target.value })}
              placeholder="Escribe notas adicionales que te gustaría que aparecieran en esta cotización."
              rows={4}
            />
          </div>

          <div>
            <Label htmlFor="terms">Términos de la compra</Label>
            <Textarea
              id="terms"
              value={quoteDetails.termsOfPurchase}
              onChange={(e) => setQuoteDetails({ ...quoteDetails, termsOfPurchase: e.target.value })}
              rows={4}
              className="border-primary"
            />
          </div>
        </CardContent>
      </Card>

      {/* Vista previa */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Vista previa de cotización</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="text-center mb-4">
              <h3 className="font-semibold">Cancagua Spa & Retreat Center</h3>
            </div>
            <div className="bg-amber-50 p-4 rounded">
              <p className="font-medium">{quoteDetails.name || dealData.name}</p>
              <div className="mt-2 text-sm">
                <p>{buyerData.name}</p>
                <p className="text-muted-foreground">{buyerData.email}</p>
              </div>
            </div>
            <div className="mt-4 text-sm">
              <p className="font-medium">Productos y servicios</p>
              <div className="mt-2 space-y-1">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{item.productName}</span>
                    <span>{formatPrice(item.total)}</span>
                  </div>
                ))}
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>

            {/* Datos bancarios */}
            <div className="mt-4 p-3 bg-amber-50 rounded text-xs text-muted-foreground">
              <p className="font-medium mb-1 text-foreground">Datos bancarios</p>
              <p>Banco: Santander | Cuenta Corriente: 9569934-0</p>
              <p>Cancagua Spa y Centro de Bienestar Limitada</p>
              <p>RUT: 77.926.863-2 | eventos@cancagua.cl</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Paso 5: Revisión
  const renderStep5 = () => (
    <Card>
      <CardHeader>
        <CardTitle>Revisión</CardTitle>
        <CardDescription>
          Revisa la cotización antes de guardar o enviar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-white rounded-lg p-8 shadow-lg border max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-amber-800">Cancagua Spa & Retreat Center</h2>
          </div>

          {/* Info del negocio */}
          <div className="bg-amber-50 p-6 rounded-lg mb-6">
            <h3 className="text-lg font-bold">{quoteDetails.name || dealData.name}</h3>
            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <p className="font-medium">{buyerData.name}</p>
                <p className="text-muted-foreground">{buyerData.email}</p>
                <p className="text-muted-foreground">{buyerData.phone}</p>
                {buyerData.company && <p className="text-muted-foreground">{buyerData.company}</p>}
              </div>
              <div className="text-right">
                <p>Creación: {new Date().toLocaleDateString("es-CL")}</p>
                <p>Caducidad: {new Date(quoteDetails.validUntil).toLocaleDateString("es-CL")}</p>
                <p>Personas: {numberOfPeople}</p>
                {eventDate && <p>Evento: {new Date(eventDate).toLocaleDateString("es-CL")}</p>}
                <p className="mt-1 text-muted-foreground">Presupuesto creado por: Cancagua Spa & Retreat Center</p>
              </div>
            </div>
          </div>

          {/* Comentarios */}
          {quoteDetails.notes && (
            <div className="border rounded-lg p-4 mb-6">
              <p className="font-medium mb-2">Comentarios de Cancagua Spa & Retreat Center</p>
              <p className="text-sm whitespace-pre-line">{quoteDetails.notes}</p>
            </div>
          )}

          {/* Datos bancarios */}
          <div className="border rounded-lg p-4 mb-6">
            <p className="font-medium mb-2">Datos bancarios</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Banco: Santander</p>
              <p>Cuenta: Corriente</p>
              <p>No de Cuenta: 9569934-0</p>
              <p>Nombre: Cancagua Spa y Centro de Bienestar Limitada</p>
              <p>RUT: 77.926.863-2</p>
              <p>Correo: eventos@cancagua.cl</p>
            </div>
          </div>

          {/* Productos */}
          <div className="mb-6">
            <h4 className="font-medium mb-4">Productos y servicios</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artículo y descripción</TableHead>
                  <TableHead className="text-center">Cantidad</TableHead>
                  <TableHead className="text-right">Precio unitario</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <p className="font-medium">{item.productName}</p>
                      {item.description && (
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      )}
                      {item.scheduleTime && (
                        <p className="text-sm text-muted-foreground">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {item.scheduleTime}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatPrice(item.unitPrice)}</TableCell>
                    <TableCell className="text-right">{formatPrice(item.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex justify-end mt-4">
              <div className="w-64 space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Términos */}
          {quoteDetails.termsOfPurchase && (
            <div className="border-t pt-4">
              <p className="font-medium mb-2">Términos de la compra</p>
              <p className="text-sm whitespace-pre-line text-muted-foreground">
                {quoteDetails.termsOfPurchase}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t mt-6 pt-4 text-center text-xs text-muted-foreground">
            <p>Cancagua Spa & Retreat Center | Frutillar, Chile | contacto@cancagua.cl | +56 9 8224 3411</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Renderizar paso actual (5 pasos)
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderStep1(); // Negocio
      case 2:
        return renderStep2(); // Información del comprador
      case 3:
        return renderStep3(); // Elementos de pedido
      case 4:
        return renderStep4(); // Plantilla y detalles
      case 5:
        return renderStep5(); // Revisión
      default:
        return null;
    }
  };

  if (isEditing && !existingQuote) {
    return (
      <DashboardLayout>
        <div className="container mx-auto py-8 max-w-7xl flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-muted-foreground">Cargando cotización...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">
              {isEditing ? "Editar cotización" : "Nueva cotización"}
            </h1>
            <p className="text-muted-foreground mt-1">
              Paso {currentStep} de 5
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/cms/cotizaciones")}>
            Salir
          </Button>
        </div>

        {/* Indicador de pasos */}
        {renderStepIndicator()}

        {/* Contenido del paso */}
        {renderCurrentStep()}

        {/* Navegación */}
        <div className="flex justify-between items-center mt-8 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>

          <div className="flex gap-2">
            {currentStep === 5 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSave("draft")}
                  disabled={createQuoteMutation.isPending || updateQuoteMutation.isPending}
                >
                  {(createQuoteMutation.isPending || updateQuoteMutation.isPending) ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Guardar
                </Button>
                <Button
                  onClick={() => handleSave("sent")}
                  disabled={createQuoteMutation.isPending || updateQuoteMutation.isPending}
                >
                  {(createQuoteMutation.isPending || updateQuoteMutation.isPending) ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Publicar
                </Button>
              </>
            ) : (
              <Button onClick={handleNext}>
                Siguiente
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
