import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Loader2, Send, Upload, Sparkles, ArrowLeft, ArrowRight, Eye, Calendar, 
  Clock, X, Bot, User, RefreshCw, Check, FileText, Users, Mail, Pencil,
  Wand2, ChevronRight, CheckCircle2, Mic, MicOff, Square, Link2, ExternalLink
} from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Tipos de email predefinidos
const EMAIL_TYPES = [
  { 
    id: "promo", 
    icon: "🎁", 
    title: "Promoción", 
    description: "Descuentos y ofertas especiales",
    placeholder: "Ej: Necesito un mailing para promocionar un 20% de descuento en masajes durante febrero..."
  },
  { 
    id: "newsletter", 
    icon: "📰", 
    title: "Newsletter", 
    description: "Novedades y actualizaciones",
    placeholder: "Ej: Quiero informar sobre los nuevos servicios de spa que tenemos disponibles..."
  },
  { 
    id: "event", 
    icon: "🎉", 
    title: "Evento", 
    description: "Invitaciones y anuncios",
    placeholder: "Ej: Necesito una invitación para un evento especial de inauguración el próximo sábado..."
  },
  { 
    id: "welcome", 
    icon: "👋", 
    title: "Bienvenida", 
    description: "Para nuevos suscriptores",
    placeholder: "Ej: Quiero dar la bienvenida a nuevos suscriptores con un código de descuento del 15%..."
  },
  { 
    id: "custom", 
    icon: "✨", 
    title: "Personalizado", 
    description: "Describe tu idea",
    placeholder: "Describe libremente qué tipo de email necesitas crear..."
  },
];

export default function CMSCrearNewsletter() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  
  // Check if we're editing an existing newsletter
  const [, params] = useRoute("/cms/crear-newsletter/:id");
  const editId = params?.id ? parseInt(params.id) : null;
  const isEditing = editId !== null && !isNaN(editId);
  
  // Step state - Ahora son 5 pasos
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;
  
  // Step 1: Tipo de email
  const [selectedType, setSelectedType] = useState<string | null>(null);
  
  // Step 2: Solicitud (NUEVO)
  const [requestText, setRequestText] = useState("");
  // Imagen de header (1 sola)
  const [headerImage, setHeaderImage] = useState<string | null>(null); // URL de S3
  const [headerImagePreview, setHeaderImagePreview] = useState<string | null>(null); // Base64 para preview
  const [isUploadingHeaderImage, setIsUploadingHeaderImage] = useState(false);
  // Imágenes dentro del emailing (múltiples)
  const [bodyImages, setBodyImages] = useState<string[]>([]); // URLs de S3
  const [bodyImagesPreview, setBodyImagesPreview] = useState<string[]>([]); // Base64 para preview
  const [isUploadingBodyImage, setIsUploadingBodyImage] = useState(false);
  // Legacy compatibility
  const [uploadedImages, setUploadedImages] = useState<string[]>([]); // URLs de S3
  const [uploadedImagesPreview, setUploadedImagesPreview] = useState<string[]>([]); // Base64 para preview
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  
  // URL extraction
  const [sourceUrl, setSourceUrl] = useState("");
  const [isExtractingUrl, setIsExtractingUrl] = useState(false);
  const [extractedData, setExtractedData] = useState<{
    title: string;
    description: string;
    images: string[];
    content: string;
    eventDate: string;
    price: string;
    duration?: string;
    url: string;
  } | null>(null);
  
  // Step 3: Diseño generado (modificado)
  const [htmlContent, setHtmlContent] = useState("");
  const [generatedSubject, setGeneratedSubject] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [refinementInput, setRefinementInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  
  // Step 4: Destinatarios
  const [selectedLists, setSelectedLists] = useState<number[]>([]);
  
  // Step 5: Enviar
  const [subject, setSubject] = useState("");
  const [senderName, setSenderName] = useState("Newsletter Cancagua");
  const [sendOption, setSendOption] = useState<"now" | "schedule" | "draft">("draft");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [isSending, setIsSending] = useState(false);
  
  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerFileInputRef = useRef<HTMLInputElement>(null);
  const bodyFileInputRef = useRef<HTMLInputElement>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Edit mode state
  const [editDataLoaded, setEditDataLoaded] = useState(false);
  
  // Queries
  const { data: lists, isLoading: listsLoading } = trpc.lists.getAll.useQuery();
  const { data: totalActiveData } = trpc.lists.totalActiveSubscribers.useQuery();
  const { data: uniqueCountData } = trpc.lists.uniqueSubscriberCount.useQuery(
    { listIds: selectedLists },
    { enabled: selectedLists.length > 0 }
  );
  const { data: existingNewsletter, isLoading: isLoadingNewsletter } = trpc.newsletters.getById.useQuery(
    { id: editId! },
    { enabled: isEditing }
  );

  // Load existing newsletter data when editing
  useEffect(() => {
    if (!isEditing || !existingNewsletter || editDataLoaded) return;
    
    // Set the HTML content and subject - skip to step 3 (design)
    setHtmlContent(existingNewsletter.htmlContent || "");
    setSubject(existingNewsletter.subject || "");
    setGeneratedSubject(existingNewsletter.subject || "");
    setSenderName(existingNewsletter.senderName || "Newsletter Cancagua");
    
    // Set the design prompt if available
    if (existingNewsletter.designPrompt) {
      setRequestText(existingNewsletter.designPrompt);
    }
    
    // Set type to custom since we're editing
    setSelectedType("custom");
    
    // Jump directly to step 3 (design) since we already have the HTML
    setCurrentStep(3);
    
    setEditDataLoaded(true);
  }, [isEditing, existingNewsletter, editDataLoaded]);

  // Mutations
  const generateDesignMutation = trpc.newsletters.generateDesign.useMutation({
    onSuccess: (data) => {
      setHtmlContent(data.htmlContent);
      const suggestedSubject = data.suggestedSubject || generateSubjectFromType();
      setGeneratedSubject(suggestedSubject);
      setSubject(suggestedSubject);
      setIsGenerating(false);
    },
    onError: (error) => {
      toast.error(error.message || "Error al generar diseño");
      setIsGenerating(false);
    },
  });

  const refineDesignMutation = trpc.newsletters.refineDesign.useMutation({
    onSuccess: (data) => {
      setHtmlContent(data.htmlContent);
      setRefinementInput("");
      toast.success("Cambios aplicados correctamente");
      setIsRefining(false);
    },
    onError: (error) => {
      toast.error(error.message || "Error al aplicar cambios");
      setIsRefining(false);
    },
  });

  const createNewsletterMutation = trpc.newsletters.create.useMutation({
    onSuccess: (data) => {
      if (isSending && data.id) {
        sendNewsletterMutation.mutate({
          newsletterId: data.id,
          listIds: selectedLists,
        });
      } else {
        toast.success("Newsletter guardado como borrador");
        navigate("/cms/newsletter");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Error al guardar newsletter");
      setIsSending(false);
    },
  });

  const updateNewsletterMutation = trpc.newsletters.update.useMutation({
    onSuccess: () => {
      if (isSending) {
        sendNewsletterMutation.mutate({
          newsletterId: editId!,
          listIds: selectedLists,
        });
      } else {
        toast.success("Newsletter actualizado correctamente");
        navigate("/cms/newsletter");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Error al actualizar newsletter");
      setIsSending(false);
    },
  });

  const sendNewsletterMutation = trpc.newsletters.send.useMutation({
    onSuccess: (data) => {
      if (data.message) {
        toast.success(data.message);
      } else {
        toast.success(`Newsletter enviado a ${data.total} destinatarios`);
      }
      setIsSending(false);
      navigate("/cms/newsletter");
    },
    onError: (error) => {
      toast.error(error.message || "Error al enviar newsletter");
      setIsSending(false);
    },
  });

  // Transcription mutation
  const transcribeMutation = trpc.newsletters.transcribeAudio.useMutation({
    onSuccess: (data) => {
      setRequestText((prev) => prev + (prev ? " " : "") + data.text);
      setIsTranscribing(false);
      toast.success("Audio transcrito correctamente");
    },
    onError: (error) => {
      toast.error(error.message || "Error al transcribir audio");
      setIsTranscribing(false);
    },
  });

  // Upload image mutation (legacy)
  const uploadImageMutation = trpc.newsletters.uploadImage.useMutation({
    onSuccess: (data) => {
      setUploadedImages((prev) => [...prev, data.url]);
      toast.success("Imagen subida correctamente");
      setIsUploadingImage(false);
    },
    onError: (error) => {
      toast.error(error.message || "Error al subir imagen");
      setIsUploadingImage(false);
    },
  });

  // Upload header image mutation
  const uploadHeaderImageMutation = trpc.newsletters.uploadImage.useMutation({
    onSuccess: (data) => {
      setHeaderImage(data.url);
      toast.success("Imagen de header subida correctamente");
      setIsUploadingHeaderImage(false);
    },
    onError: (error) => {
      toast.error(error.message || "Error al subir imagen de header");
      setIsUploadingHeaderImage(false);
    },
  });

  // Upload body image mutation
  const uploadBodyImageMutation = trpc.newsletters.uploadImage.useMutation({
    onSuccess: (data) => {
      setBodyImages((prev) => [...prev, data.url]);
      toast.success("Imagen subida correctamente");
      setIsUploadingBodyImage(false);
    },
    onError: (error) => {
      toast.error(error.message || "Error al subir imagen");
      setIsUploadingBodyImage(false);
    },
  });

  // Extract URL mutation
  const extractUrlMutation = trpc.newsletters.extractFromUrl.useMutation({
    onSuccess: (data) => {
      setExtractedData(data);
      // Auto-completar el texto de solicitud con la información extraída
      const autoText = `Crear un email sobre: ${data.title}\n\n${data.description}\n\n${data.content ? data.content.substring(0, 500) + '...' : ''}`;
      setRequestText((prev) => prev || autoText);
      // Agregar imágenes extraídas
      if (data.images.length > 0) {
        setUploadedImages((prev) => [...prev, ...data.images]);
      }
      setIsExtractingUrl(false);
      toast.success(`Contenido extraído: ${data.title}`);
    },
    onError: (error) => {
      toast.error(error.message || "Error al extraer contenido de la URL");
      setIsExtractingUrl(false);
    },
  });

  // Helper functions
  const generateSubjectFromType = (): string => {
    switch (selectedType) {
      case "promo":
        return "🎁 Oferta especial para ti - Cancagua Spa";
      case "newsletter":
        return "📰 Novedades de Cancagua - " + new Date().toLocaleDateString("es-CL", { month: "long", year: "numeric" });
      case "event":
        return "🎉 Estás invitado/a - Evento especial en Cancagua";
      case "welcome":
        return "👋 ¡Bienvenido/a a Cancagua!";
      default:
        return "Newsletter de Cancagua Spa";
    }
  };

  const handleListToggle = (listId: number) => {
    if (selectedLists.includes(listId)) {
      setSelectedLists(selectedLists.filter((id) => id !== listId));
    } else {
      setSelectedLists([...selectedLists, listId]);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        // Guardar preview local
        setUploadedImagesPreview((prev) => [...prev, dataUrl]);
        // Subir a S3
        setIsUploadingImage(true);
        uploadImageMutation.mutate({ 
          imageData: dataUrl,
          fileName: `newsletter-${Date.now()}-${file.name}`,
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleHeaderImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0]; // Solo 1 imagen de header
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setHeaderImagePreview(dataUrl);
      setIsUploadingHeaderImage(true);
      uploadHeaderImageMutation.mutate({
        imageData: dataUrl,
        fileName: `newsletter-header-${Date.now()}-${file.name}`,
      });
    };
    reader.readAsDataURL(file);
  };

  const removeHeaderImage = () => {
    setHeaderImage(null);
    setHeaderImagePreview(null);
  };

  const handleBodyImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setBodyImagesPreview((prev) => [...prev, dataUrl]);
        setIsUploadingBodyImage(true);
        uploadBodyImageMutation.mutate({
          imageData: dataUrl,
          fileName: `newsletter-body-${Date.now()}-${file.name}`,
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const removeBodyImage = (index: number) => {
    setBodyImages((prev) => prev.filter((_, i) => i !== index));
    setBodyImagesPreview((prev) => prev.filter((_, i) => i !== index));
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
    setUploadedImagesPreview((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExtractUrl = () => {
    if (!sourceUrl.trim()) {
      toast.error("Por favor ingresa una URL");
      return;
    }
    setIsExtractingUrl(true);
    extractUrlMutation.mutate({ url: sourceUrl });
  };

  // Voice recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        // Convert to base64 and send for transcription
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          setIsTranscribing(true);
          transcribeMutation.mutate({ audioData: base64Audio });
        };
        reader.readAsDataURL(audioBlob);
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      toast.info("Grabando... Habla ahora");
    } catch (error) {
      toast.error("No se pudo acceder al micrófono");
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const handleGenerateDesign = () => {
    if (!requestText.trim()) {
      toast.error("Por favor describe qué tipo de email necesitas");
      return;
    }

    setIsGenerating(true);
    
    // Construir el prompt con el tipo seleccionado y la solicitud del usuario
    const typeInfo = EMAIL_TYPES.find(t => t.id === selectedType);
    const fullPrompt = `Tipo de email: ${typeInfo?.title || 'Personalizado'}\n\nSolicitud del usuario: ${requestText}`;

    generateDesignMutation.mutate({
      prompt: fullPrompt,
      headerImage: headerImage || undefined,
      bodyImages: bodyImages.length > 0 ? bodyImages : undefined,
      // Legacy: pass all images too for backwards compat
      images: [...(headerImage ? [headerImage] : []), ...bodyImages],
      generateImages: true,
    });
  };

  const handleRefineDesign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refinementInput.trim() || isRefining) return;

    setIsRefining(true);
    refineDesignMutation.mutate({
      currentHtml: htmlContent,
      refinementRequest: refinementInput,
    });
  };

  const handleAction = () => {
    if (!subject.trim()) {
      toast.error("Por favor ingresa un asunto");
      return;
    }

    if (!htmlContent) {
      toast.error("Por favor genera un diseño primero");
      return;
    }

    if (sendOption !== "draft" && selectedLists.length === 0) {
      toast.error("Por favor selecciona al menos una lista de destinatarios");
      return;
    }

    if (sendOption === "schedule" && (!scheduledDate || !scheduledTime)) {
      toast.error("Por favor selecciona fecha y hora para programar el envío");
      return;
    }

    if (sendOption === "now") {
      setIsSending(true);
    }

    const scheduledAt = sendOption === "schedule" 
      ? new Date(`${scheduledDate}T${scheduledTime}`) 
      : undefined;

    if (isEditing && editId) {
      // Update existing newsletter
      updateNewsletterMutation.mutate({
        id: editId,
        subject,
        htmlContent,
        designPrompt: requestText,
        scheduledAt,
      });
    } else {
      // Create new newsletter
      createNewsletterMutation.mutate({
        subject,
        htmlContent,
        designPrompt: requestText,
        listIds: selectedLists.length > 0 ? selectedLists : [],
        scheduledAt,
      });
    }

    if (sendOption === "schedule") {
      toast.success(`Newsletter programado para ${scheduledAt?.toLocaleString("es-CL")}`);
    }
  };

  const totalRecipients = uniqueCountData?.count || 0;

  const canProceedToStep = (step: number): boolean => {
    switch (step) {
      case 2: return selectedType !== null;
      case 3: return requestText.trim().length > 0;
      case 4: return htmlContent.length > 0;
      case 5: return true;
      default: return true;
    }
  };

  const goToNextStep = () => {
    if (currentStep === 2 && canProceedToStep(3)) {
      // Al pasar del paso 2 al 3, generar el diseño
      handleGenerateDesign();
      setCurrentStep(3);
    } else if (currentStep < totalSteps && canProceedToStep(currentStep + 1)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Verificar permisos
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#44580E]" />
      </div>
    );
  }

  if (!user || (user.role !== "super_admin" && user.role !== "admin" && user.role !== "editor")) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Acceso Denegado</CardTitle>
            <CardDescription>No tienes permisos para crear newsletters.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/cms">Volver al Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step indicators - Ahora son 5 pasos
  const steps = [
    { number: 1, title: "Tipo", icon: FileText },
    { number: 2, title: "Solicitud", icon: Pencil },
    { number: 3, title: "Diseño", icon: Wand2 },
    { number: 4, title: "Destinatarios", icon: Users },
    { number: 5, title: "Enviar", icon: Send },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/cms/newsletter">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isEditing ? "Editar Newsletter" : "Crear Newsletter"}</h1>
            <p className="text-gray-500">{isEditing ? "Modifica y envía tu newsletter" : "Crea tu email en 5 simples pasos"}</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div 
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${
                      currentStep > step.number 
                        ? "bg-green-500 text-white" 
                        : currentStep === step.number 
                          ? "bg-[#44580E] text-white shadow-lg scale-110" 
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {currentStep > step.number ? (
                      <Check className="w-4 h-4 md:w-5 md:h-5" />
                    ) : (
                      <step.icon className="w-4 h-4 md:w-5 md:h-5" />
                    )}
                  </div>
                  <span className={`mt-2 text-xs md:text-sm font-medium ${
                    currentStep >= step.number ? "text-gray-900" : "text-gray-400"
                  }`}>
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-1 mx-2 md:mx-4 rounded ${
                    currentStep > step.number ? "bg-green-500" : "bg-gray-200"
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[500px]">
          {/* Loading state for edit mode */}
          {isEditing && isLoadingNewsletter && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-[#44580E] mb-4" />
              <p className="text-gray-500">Cargando newsletter...</p>
            </div>
          )}

          {/* Step 1: Tipo de Email */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">¿Qué tipo de email quieres crear?</h2>
                <p className="text-gray-500">Selecciona el tipo de mailing que necesitas</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {EMAIL_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`p-6 rounded-xl border-2 text-center transition-all hover:shadow-md ${
                      selectedType === type.id 
                        ? "border-[#44580E] bg-[#44580E]/5 shadow-md" 
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="text-4xl mb-3 block">{type.icon}</span>
                    <h3 className="font-semibold text-gray-900 mb-1">{type.title}</h3>
                    <p className="text-xs text-gray-500">{type.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Solicitud (NUEVO) */}
          {currentStep === 2 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 bg-[#44580E]/10 text-[#44580E] px-4 py-2 rounded-full text-sm font-medium mb-4">
                  {EMAIL_TYPES.find(t => t.id === selectedType)?.icon}
                  {EMAIL_TYPES.find(t => t.id === selectedType)?.title}
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Describe tu solicitud</h2>
                <p className="text-gray-500">Escribe o dicta qué necesitas para tu email</p>
              </div>

              {/* 
                OCULTO TEMPORALMENTE - Importar desde URL
                Pendiente: Implementar SSR en cancagua.cl para que el scraping funcione correctamente.
                La funcionalidad está lista en el backend (extractFromUrl, uploadImage).
                Restaurar este bloque cuando SSR esté implementado.
                Fecha: 24 Enero 2026
              */}
              {/* <Card className="border-[#44580E]/20 bg-[#44580E]/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-[#44580E]" />
                    Importar desde URL (opcional)
                  </CardTitle>
                  <CardDescription>
                    Pega un link de Cancagua y extraeremos automáticamente el contenido e imágenes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://cancagua.cl/eventos/taller-wim-hof"
                      disabled={isExtractingUrl}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleExtractUrl}
                      disabled={isExtractingUrl || !sourceUrl.trim()}
                      className="bg-[#44580E] hover:bg-[#3a4c0c]"
                    >
                      {isExtractingUrl ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Extraer
                        </>
                      )}
                    </Button>
                  </div>
                  
                  {extractedData && (
                    <div className="mt-4 p-4 bg-white rounded-lg border border-[#44580E]/20">
                      <div className="flex items-start gap-4">
                        {extractedData.images[0] && (
                          <img 
                            src={extractedData.images[0]} 
                            alt="Preview" 
                            className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 truncate">{extractedData.title}</h4>
                          <p className="text-sm text-gray-500 line-clamp-2 mt-1">{extractedData.description}</p>
                          <div className="flex gap-3 mt-2 text-xs text-gray-400">
                            {extractedData.eventDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {extractedData.eventDate}
                              </span>
                            )}
                            {extractedData.duration && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {extractedData.duration}
                              </span>
                            )}
                            {extractedData.price && (
                              <span className="font-medium text-[#44580E]">{extractedData.price}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {extractedData.images.length} imágenes
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setExtractedData(null);
                            setSourceUrl("");
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card> */}

              <Card>
                <CardContent className="pt-6 space-y-4">
                  {/* Textarea con botón de micrófono */}
                  <div className="relative">
                    <Textarea
                      value={requestText}
                      onChange={(e) => setRequestText(e.target.value)}
                      placeholder={EMAIL_TYPES.find(t => t.id === selectedType)?.placeholder || "Describe qué necesitas..."}
                      className="min-h-[180px] pr-14 text-base resize-none"
                      disabled={isRecording || isTranscribing}
                    />
                    <div className="absolute right-3 bottom-3">
                      {isTranscribing ? (
                        <div className="p-2 bg-gray-100 rounded-full">
                          <Loader2 className="w-5 h-5 animate-spin text-[#44580E]" />
                        </div>
                      ) : isRecording ? (
                        <button
                          onClick={stopRecording}
                          className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors animate-pulse"
                          title="Detener grabación"
                        >
                          <Square className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={startRecording}
                          className="p-2 bg-[#44580E] text-white rounded-full hover:bg-[#3a4c0c] transition-colors"
                          title="Dictar con voz"
                        >
                          <Mic className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {isRecording && (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      Grabando... Haz clic en el botón para detener
                    </div>
                  )}
                  
                  {isTranscribing && (
                    <div className="flex items-center gap-2 text-[#44580E] text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Transcribiendo audio...
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    💡 Tip: Puedes usar el botón de micrófono para dictar tu solicitud en lugar de escribir
                  </p>
                </CardContent>
              </Card>

              {/* Imagen para header */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Imagen para header (opcional)</CardTitle>
                  <CardDescription>Sube una imagen que se usará como banner principal del email. Si no subes una, la IA generará una automáticamente.</CardDescription>
                </CardHeader>
                <CardContent>
                  <input
                    type="file"
                    ref={headerFileInputRef}
                    onChange={handleHeaderImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {isUploadingHeaderImage && (
                    <div className="flex items-center gap-2 text-[#44580E] text-sm mb-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Subiendo imagen de header...
                    </div>
                  )}
                  
                  {(headerImage || headerImagePreview) ? (
                    <div className="relative group inline-block mb-4">
                      <img
                        src={headerImagePreview || headerImage || ''}
                        alt="Header"
                        className="max-h-40 rounded-lg object-cover"
                      />
                      {headerImage && (
                        <div className="absolute bottom-1 left-1 bg-green-500 text-white text-xs px-1 rounded">
                          ✓ S3
                        </div>
                      )}
                      <button
                        onClick={removeHeaderImage}
                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => headerFileInputRef.current?.click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Subir imagen de header
                      </Button>
                      <span className="text-xs text-gray-400">Si no subes una, la IA creará una</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Imágenes dentro del emailing */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Imágenes dentro del emailing (opcional)</CardTitle>
                  <CardDescription>Sube imágenes que se incluirán en el cuerpo del email. Si no subes ninguna, la IA seleccionará imágenes de la marca.</CardDescription>
                </CardHeader>
                <CardContent>
                  <input
                    type="file"
                    ref={bodyFileInputRef}
                    onChange={handleBodyImageUpload}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                  
                  {isUploadingBodyImage && (
                    <div className="flex items-center gap-2 text-[#44580E] text-sm mb-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Subiendo imagen...
                    </div>
                  )}
                  
                  {(bodyImages.length > 0 || bodyImagesPreview.length > 0) && (
                    <div className="flex gap-2 mb-4 flex-wrap">
                      {(bodyImagesPreview.length > 0 ? bodyImagesPreview : bodyImages).map((img, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={img}
                            alt={`Imagen ${index + 1}`}
                            className="w-20 h-20 object-cover rounded-lg"
                          />
                          {bodyImages[index] && (
                            <div className="absolute bottom-1 left-1 bg-green-500 text-white text-xs px-1 rounded">
                              ✓ S3
                            </div>
                          )}
                          <button
                            onClick={() => removeBodyImage(index)}
                            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bodyFileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Subir imágenes
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 3: Diseño (modificado) */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Vista previa del resultado */}
              <Card className="overflow-hidden">
                <CardHeader className="border-b pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#44580E]/10 rounded-lg">
                        <Sparkles className="w-5 h-5 text-[#44580E]" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">Resultado Generado</CardTitle>
                        <CardDescription>Vista previa de tu email</CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setHtmlContent("");
                        handleGenerateDesign();
                      }}
                      disabled={isGenerating}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
                      Regenerar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
                      <Loader2 className="w-10 h-10 animate-spin mb-4 text-[#44580E]" />
                      <p className="text-lg font-medium text-gray-600">Generando tu diseño...</p>
                      <p className="text-sm text-gray-500 mt-2">Esto puede tomar unos segundos</p>
                    </div>
                  ) : htmlContent ? (
                    <iframe
                      srcDoc={htmlContent}
                      className="w-full h-[400px] border-0"
                      title="Vista previa del newsletter"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
                      <FileText className="w-12 h-12 mb-4" />
                      <p>No hay contenido generado</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Campo para pedir cambios */}
              {htmlContent && !isGenerating && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Pencil className="w-4 h-4" />
                      ¿Necesitas cambios?
                    </CardTitle>
                    <CardDescription>
                      Describe los ajustes que quieres hacer al diseño
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleRefineDesign} className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          value={refinementInput}
                          onChange={(e) => setRefinementInput(e.target.value)}
                          placeholder="Ej: Cambia el color del botón a verde, agranda el título..."
                          disabled={isRefining}
                          className="pr-12"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (isRecording) {
                              stopRecording();
                            } else {
                              // Grabar para refinamiento
                              try {
                                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                                const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                                audioChunksRef.current = [];
                                
                                recorder.ondataavailable = (e) => {
                                  if (e.data.size > 0) {
                                    audioChunksRef.current.push(e.data);
                                  }
                                };
                                
                                recorder.onstop = async () => {
                                  const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                                  stream.getTracks().forEach(track => track.stop());
                                  
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    const base64Audio = reader.result as string;
                                    setIsTranscribing(true);
                                    // Transcribir y poner en refinementInput
                                    transcribeMutation.mutate({ audioData: base64Audio }, {
                                      onSuccess: (data) => {
                                        setRefinementInput((prev) => prev + (prev ? " " : "") + data.text);
                                        setIsTranscribing(false);
                                      }
                                    });
                                  };
                                  reader.readAsDataURL(audioBlob);
                                };
                                
                                recorder.start();
                                setMediaRecorder(recorder);
                                setIsRecording(true);
                                toast.info("Grabando... Habla ahora");
                              } catch (error) {
                                toast.error("No se pudo acceder al micrófono");
                              }
                            }
                          }}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-colors ${
                            isRecording 
                              ? "bg-red-500 text-white animate-pulse" 
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                          disabled={isRefining || isTranscribing}
                        >
                          {isTranscribing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isRecording ? (
                            <Square className="w-4 h-4" />
                          ) : (
                            <Mic className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <Button
                        type="submit"
                        disabled={isRefining || !refinementInput.trim()}
                        className="bg-[#44580E] hover:bg-[#3a4c0c]"
                      >
                        {isRefining ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            Aplicar
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 4: Destinatarios */}
          {currentStep === 4 && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">¿A quién quieres enviar?</h2>
                <p className="text-gray-500">Selecciona las listas de destinatarios</p>
              </div>

              {listsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#44580E]" />
                </div>
              ) : !lists || lists.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="font-medium text-gray-900 mb-2">No hay listas creadas</h3>
                    <p className="text-gray-500 mb-4">Crea una lista de suscriptores primero</p>
                    <Button asChild>
                      <Link href="/cms/listas">Crear Lista</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {/* Enviar a todos */}
                  <div
                    onClick={() => {
                      if (selectedLists.length === lists.length) {
                        setSelectedLists([]);
                      } else {
                        setSelectedLists(lists.map((l: any) => l.id));
                      }
                    }}
                    className={`flex items-center justify-between p-5 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedLists.length === lists.length
                        ? "border-[#44580E] bg-[#44580E]/10"
                        : "border-dashed border-gray-300 hover:border-[#44580E]/50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        selectedLists.length === lists.length ? "bg-[#44580E] text-white" : "bg-gray-100"
                      }`}>
                        {selectedLists.length === lists.length ? (
                          <Check className="w-5 h-5" />
                        ) : (
                          <Users className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">Enviar a todos</h3>
                        <p className="text-sm text-gray-500">Seleccionar todas las listas de suscriptores</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-base px-3 py-1">
                      {totalActiveData?.count?.toLocaleString() || '...'} suscriptores únicos
                    </Badge>
                  </div>

                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">o selecciona listas específicas</span></div>
                  </div>

                  {lists.map((list: any) => (
                    <div
                      key={list.id}
                      onClick={() => handleListToggle(list.id)}
                      className={`flex items-center justify-between p-5 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedLists.includes(list.id)
                          ? "border-[#44580E] bg-[#44580E]/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          selectedLists.includes(list.id) ? "bg-[#44580E] text-white" : "bg-gray-100"
                        }`}>
                          {selectedLists.includes(list.id) ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <Users className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{list.name}</h3>
                          {list.description && (
                            <p className="text-sm text-gray-500">{list.description}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-base px-3 py-1">
                        {list.subscriberCount || 0} suscriptores
                      </Badge>
                    </div>
                  ))}

                  {selectedLists.length > 0 && (
                    <div className="bg-[#44580E]/10 rounded-xl p-4 mt-6">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#44580E]">Total de destinatarios</span>
                        <span className="text-2xl font-bold text-[#44580E]">{totalRecipients > 0 ? totalRecipients.toLocaleString() : '...'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Enviar */}
          {currentStep === 5 && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Últimos detalles</h2>
                <p className="text-gray-500">Revisa y envía tu newsletter</p>
              </div>

              {/* Subject */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Asunto del Email
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Asunto del email"
                      className="pr-10 text-lg"
                    />
                    <Pencil className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                  {generatedSubject && subject !== generatedSubject && (
                    <p className="text-xs text-gray-500 mt-2">
                      Sugerido por IA: "{generatedSubject}"
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Sender Name */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Nombre del Remitente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Ej: Newsletter Cancagua"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Este nombre aparecerá como remitente del email
                  </p>
                </CardContent>
              </Card>

              {/* Send Options */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">¿Qué quieres hacer?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label 
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      sendOption === "draft" ? "border-[#44580E] bg-[#44580E]/5" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="sendOption"
                      value="draft"
                      checked={sendOption === "draft"}
                      onChange={() => setSendOption("draft")}
                      className="sr-only"
                    />
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      sendOption === "draft" ? "bg-[#44580E] text-white" : "bg-gray-100"
                    }`}>
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">Guardar como borrador</p>
                      <p className="text-sm text-gray-500">Guarda para editar más tarde</p>
                    </div>
                  </label>

                  <label 
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      sendOption === "now" ? "border-[#44580E] bg-[#44580E]/5" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="sendOption"
                      value="now"
                      checked={sendOption === "now"}
                      onChange={() => setSendOption("now")}
                      className="sr-only"
                    />
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      sendOption === "now" ? "bg-[#44580E] text-white" : "bg-gray-100"
                    }`}>
                      <Send className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">Enviar ahora</p>
                      <p className="text-sm text-gray-500">
                        Enviar inmediatamente a {totalRecipients} destinatarios
                      </p>
                    </div>
                  </label>

                  <label 
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      sendOption === "schedule" ? "border-[#44580E] bg-[#44580E]/5" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="sendOption"
                      value="schedule"
                      checked={sendOption === "schedule"}
                      onChange={() => setSendOption("schedule")}
                      className="sr-only"
                    />
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      sendOption === "schedule" ? "bg-[#44580E] text-white" : "bg-gray-100"
                    }`}>
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">Programar envío</p>
                      <p className="text-sm text-gray-500">Elige fecha y hora</p>
                    </div>
                  </label>

                  {sendOption === "schedule" && (
                    <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl ml-14">
                      <div>
                        <Label htmlFor="scheduledDate">Fecha</Label>
                        <Input
                          id="scheduledDate"
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="scheduledTime">Hora</Label>
                        <Input
                          id="scheduledTime"
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Preview Button */}
              <Button
                variant="outline"
                onClick={() => setShowPreview(true)}
                className="w-full"
              >
                <Eye className="w-4 h-4 mr-2" />
                Ver Vista Previa del Email
              </Button>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={goToPrevStep}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>

          {currentStep < totalSteps ? (
            <Button
              onClick={goToNextStep}
              disabled={!canProceedToStep(currentStep + 1) || isGenerating || isRecording || isTranscribing}
              className="bg-[#44580E] hover:bg-[#3a4c0c]"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  Siguiente
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleAction}
              disabled={createNewsletterMutation.isPending || isSending}
              className="bg-[#44580E] hover:bg-[#3a4c0c] px-8"
            >
              {isSending || createNewsletterMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {sendOption === "now" ? "Enviando..." : "Guardando..."}
                </>
              ) : (
                <>
                  {sendOption === "now" && <Send className="w-4 h-4 mr-2" />}
                  {sendOption === "schedule" && <Calendar className="w-4 h-4 mr-2" />}
                  {sendOption === "draft" && <Clock className="w-4 h-4 mr-2" />}
                  {sendOption === "now" ? "Enviar Ahora" : sendOption === "schedule" ? "Programar Envío" : "Guardar Borrador"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Vista Previa del Email</DialogTitle>
            <DialogDescription>
              Asunto: {subject || "(sin asunto)"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-lg bg-white">
            {htmlContent ? (
              <iframe
                srcDoc={htmlContent}
                className="w-full h-[500px] border-0"
                title="Vista previa del newsletter"
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                No hay contenido para mostrar
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
