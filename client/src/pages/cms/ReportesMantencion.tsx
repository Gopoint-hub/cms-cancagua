import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Loader2, Wrench, Plus, Search, RefreshCw, MoreHorizontal,
  Eye, Edit, Trash2, Camera, X, Download, Clock, CheckCircle2,
  AlertTriangle, AlertCircle, FileText, MapPin, Settings2, ImagePlus,
  ArrowLeft, Printer, FileDown, ChevronRight
} from "lucide-react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type ReportStatus = "pending" | "in_progress" | "completed" | "requires_follow_up";
type ReportPriority = "low" | "medium" | "high" | "critical";
type MaintenanceType = "preventive" | "corrective" | "emergency";
type PhotoType = "before" | "during" | "after" | "evidence";

interface Photo {
  id: number;
  url: string;
  description?: string | null;
  photoType: PhotoType;
  createdAt: string | Date;
}

interface PendingPhoto {
  id: string;
  file: File;
  preview: string;
  description: string;
  photoType: PhotoType;
}

interface Report {
  id: number;
  reportNumber: string;
  title: string;
  area?: string | null;
  equipment?: string | null;
  location?: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  maintenanceType: MaintenanceType;
  description?: string | null;
  resolution?: string | null;
  materialsUsed?: string | null;
  observations?: string | null;
  reportedById: number;
  reportedByName?: string | null;
  reportedByEmail?: string | null;
  assignedToId?: number | null;
  scheduledDate?: string | Date | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  nextMaintenanceDate?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  photos?: Photo[];
}

const statusLabels: Record<ReportStatus, string> = {
  pending: "Pendiente",
  in_progress: "En Progreso",
  completed: "Completado",
  requires_follow_up: "Requiere Seguimiento",
};

const priorityLabels: Record<ReportPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

const maintenanceTypeLabels: Record<MaintenanceType, string> = {
  preventive: "Preventiva",
  corrective: "Correctiva",
  emergency: "Emergencia",
};

const photoTypeLabels: Record<PhotoType, string> = {
  before: "Antes",
  during: "Durante",
  after: "Después",
  evidence: "Evidencia",
};

// Vista tipo documento para el reporte
function ReportDocumentView({ 
  report, 
  onBack, 
  onEdit,
  onExportPDF 
}: { 
  report: Report & { photos?: Photo[] }; 
  onBack: () => void;
  onEdit: () => void;
  onExportPDF: () => void;
}) {
  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "in_progress": return "bg-blue-100 text-blue-800 border-blue-300";
      case "completed": return "bg-green-100 text-green-800 border-green-300";
      case "requires_follow_up": return "bg-orange-100 text-orange-800 border-orange-300";
    }
  };

  const getPriorityColor = (priority: ReportPriority) => {
    switch (priority) {
      case "low": return "bg-gray-100 text-gray-800";
      case "medium": return "bg-blue-100 text-blue-800";
      case "high": return "bg-orange-100 text-orange-800";
      case "critical": return "bg-red-100 text-red-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header con acciones */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Volver a la lista
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onExportPDF}>
            <FileDown className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
          <Button onClick={onEdit}>
            <Edit className="w-4 h-4 mr-2" />
            Editar
          </Button>
        </div>
      </div>

      {/* Documento estilo PDF */}
      <div id="report-document" className="bg-white rounded-lg shadow-lg border max-w-4xl mx-auto">
        {/* Encabezado del documento */}
        <div className="border-b p-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="https://res.cloudinary.com/dhuln9b1n/image/upload/v1770308861/cancagua/images/01_logo-cancagua.png" 
                alt="Cancagua" 
                className="h-16 w-auto"
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Reporte de Mantención</h1>
                <p className="text-gray-500">Cancagua Spa & Retreat Center</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-mono font-bold text-primary">{report.reportNumber}</p>
              <p className="text-sm text-gray-500">
                {format(new Date(report.createdAt), "dd 'de' MMMM, yyyy", { locale: es })}
              </p>
              <p className="text-sm text-gray-500">
                {format(new Date(report.createdAt), "HH:mm", { locale: es })} hrs
              </p>
            </div>
          </div>
        </div>

        {/* Badges de estado */}
        <div className="px-8 py-4 bg-gray-50 border-b flex gap-4">
          <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(report.status)}`}>
            {statusLabels[report.status]}
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(report.priority)}`}>
            Prioridad: {priorityLabels[report.priority]}
          </div>
          <div className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
            {maintenanceTypeLabels[report.maintenanceType]}
          </div>
        </div>

        {/* Contenido principal */}
        <div className="p-8 space-y-6">
          {/* Título */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{report.title}</h2>
          </div>

          {/* Información general */}
          <div className="grid grid-cols-3 gap-6">
            {report.area && (
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Área</p>
                <p className="mt-1 text-gray-900">{report.area}</p>
              </div>
            )}
            {report.equipment && (
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Equipo</p>
                <p className="mt-1 text-gray-900">{report.equipment}</p>
              </div>
            )}
            {report.location && (
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Ubicación</p>
                <p className="mt-1 text-gray-900 flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  {report.location}
                </p>
              </div>
            )}
          </div>

          {/* Descripción del problema */}
          {report.description && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Descripción del Problema
              </h3>
              <p className="text-gray-900 whitespace-pre-wrap leading-relaxed">
                {report.description}
              </p>
            </div>
          )}

          {/* Resolución */}
          {report.resolution && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Resolución / Trabajo Realizado
              </h3>
              <p className="text-gray-900 whitespace-pre-wrap leading-relaxed">
                {report.resolution}
              </p>
            </div>
          )}

          {/* Materiales */}
          {report.materialsUsed && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Materiales Utilizados
              </h3>
              <p className="text-gray-900 whitespace-pre-wrap leading-relaxed">
                {report.materialsUsed}
              </p>
            </div>
          )}

          {/* Observaciones */}
          {report.observations && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
                Observaciones
              </h3>
              <p className="text-gray-900 whitespace-pre-wrap leading-relaxed">
                {report.observations}
              </p>
            </div>
          )}

          {/* Galería de fotos */}
          {report.photos && report.photos.length > 0 && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
                Evidencia Fotográfica ({report.photos.length} {report.photos.length === 1 ? 'foto' : 'fotos'})
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {report.photos.map((photo) => (
                  <div key={photo.id} className="border rounded-lg overflow-hidden">
                    <div className="aspect-video relative">
                      <img
                        src={photo.url}
                        alt={photo.description || "Foto de mantención"}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
                          {photoTypeLabels[photo.photoType]}
                        </span>
                      </div>
                    </div>
                    {photo.description && (
                      <div className="p-3 bg-gray-50">
                        <p className="text-sm text-gray-600">{photo.description}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pie del documento */}
        <div className="border-t p-8 bg-gray-50">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <div>
              <p>Reportado por: <span className="text-gray-900">{report.reportedByName || report.reportedByEmail || "Usuario"}</span></p>
            </div>
            <div className="text-right">
              <p>Última actualización: {format(new Date(report.updatedAt), "dd/MM/yyyy HH:mm", { locale: es })}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CMSReportesMantencion() {
  const { user, loading: authLoading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createFileInputRef = useRef<HTMLInputElement>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    area: "",
    equipment: "",
    location: "",
    status: "pending" as ReportStatus,
    priority: "medium" as ReportPriority,
    maintenanceType: "corrective" as MaintenanceType,
    description: "",
    resolution: "",
    materialsUsed: "",
    observations: "",
  });

  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [newPhotoType, setNewPhotoType] = useState<PhotoType>("evidence");
  const [photoDescription, setPhotoDescription] = useState("");
  const [photoType, setPhotoType] = useState<PhotoType>("evidence");

  // Queries
  const { data: reports, isLoading, refetch } = trpc.maintenance.list.useQuery();
  const { data: stats } = trpc.maintenance.stats.useQuery();
  
  const { data: reportWithPhotos, refetch: refetchReportWithPhotos } = trpc.maintenance.getById.useQuery(
    { id: viewingReport?.id ?? 0 },
    { enabled: !!viewingReport?.id }
  );

  // Mutations
  const createMutation = trpc.maintenance.create.useMutation();

  const updateMutation = trpc.maintenance.update.useMutation({
    onSuccess: () => {
      toast.success("Reporte actualizado");
      setIsEditOpen(false);
      refetch();
      if (viewingReport) {
        refetchReportWithPhotos();
      }
    },
    onError: (error) => {
      toast.error(error.message || "Error al actualizar reporte");
    },
  });

  const deleteMutation = trpc.maintenance.delete.useMutation({
    onSuccess: () => {
      toast.success("Reporte eliminado");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar reporte");
    },
  });

  const addPhotoMutation = trpc.maintenance.addPhoto.useMutation({
    onSuccess: () => {
      toast.success("Foto agregada");
      setUploadingPhoto(false);
      setPhotoDescription("");
      refetchReportWithPhotos();
    },
    onError: (error) => {
      toast.error(error.message || "Error al subir foto");
      setUploadingPhoto(false);
    },
  });

  const deletePhotoMutation = trpc.maintenance.deletePhoto.useMutation({
    onSuccess: () => {
      toast.success("Foto eliminada");
      refetchReportWithPhotos();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar foto");
    },
  });

  // Filtrar reportes
  const filteredReports = (reports || []).filter((report: Report) => {
    const matchesStatus = statusFilter === "all" || report.status === statusFilter;
    const matchesSearch = !searchTerm || 
      report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reportNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.area?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.equipment?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Bulk selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredReports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredReports.map((r: Report) => r.id)));
    }
  };

  const handleSelectOne = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    if (!confirm(`¿Eliminar ${selectedIds.size} reporte(s) seleccionado(s)?`)) return;
    
    setIsDeleting(true);
    try {
      for (const id of Array.from(selectedIds)) {
        await deleteMutation.mutateAsync({ id });
      }
      toast.success(`${selectedIds.size} reporte(s) eliminado(s)`);
      setSelectedIds(new Set());
      refetch();
    } catch (error) {
      toast.error("Error al eliminar algunos reportes");
    } finally {
      setIsDeleting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      area: "",
      equipment: "",
      location: "",
      status: "pending",
      priority: "medium",
      maintenanceType: "corrective",
      description: "",
      resolution: "",
      materialsUsed: "",
      observations: "",
    });
    pendingPhotos.forEach(photo => URL.revokeObjectURL(photo.preview));
    setPendingPhotos([]);
  };

  const handleAddPendingPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newPhotos: PendingPhoto[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file),
      description: "",
      photoType: newPhotoType,
    }));

    setPendingPhotos(prev => [...prev, ...newPhotos]);
    
    if (createFileInputRef.current) {
      createFileInputRef.current.value = "";
    }
  };

  const handleRemovePendingPhoto = (photoId: string) => {
    setPendingPhotos(prev => {
      const photo = prev.find(p => p.id === photoId);
      if (photo) {
        URL.revokeObjectURL(photo.preview);
      }
      return prev.filter(p => p.id !== photoId);
    });
  };

  const handleUpdatePendingPhotoDescription = (photoId: string, description: string) => {
    setPendingPhotos(prev => prev.map(p => 
      p.id === photoId ? { ...p, description } : p
    ));
  };

  const handleCreate = async () => {
    if (!formData.title) {
      toast.error("El título es requerido");
      return;
    }

    setIsCreating(true);

    try {
      const report = await createMutation.mutateAsync(formData);
      
      if (!report?.id) {
        throw new Error("No se pudo crear el reporte");
      }

      if (pendingPhotos.length > 0) {
        toast.info(`Subiendo ${pendingPhotos.length} foto(s)...`);
        
        for (const photo of pendingPhotos) {
          const base64 = await fileToBase64(photo.file);
          await addPhotoMutation.mutateAsync({
            reportId: report.id,
            imageData: base64,
            description: photo.description,
            photoType: photo.photoType,
          });
        }
      }

      toast.success("Reporte creado exitosamente");
      setIsCreateOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Error al crear reporte");
    } finally {
      setIsCreating(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleViewReport = (report: Report) => {
    setViewingReport(report);
  };

  const handleEditReport = (report: Report) => {
    setSelectedReport(report);
    setFormData({
      title: report.title,
      area: report.area || "",
      equipment: report.equipment || "",
      location: report.location || "",
      status: report.status,
      priority: report.priority,
      maintenanceType: report.maintenanceType,
      description: report.description || "",
      resolution: report.resolution || "",
      materialsUsed: report.materialsUsed || "",
      observations: report.observations || "",
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedReport) return;
    updateMutation.mutate({
      id: selectedReport.id,
      ...formData,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro de eliminar este reporte?")) {
      deleteMutation.mutate({ id });
    }
  };

  // Exportar a PDF
  const handleExportPDF = async (reportToExport?: Report) => {
    const report = reportToExport || (reportWithPhotos as Report);
    if (!report) return;

    setIsExporting(true);
    toast.info("Generando PDF...");

    try {
      // Crear contenido HTML para el PDF
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica', 'Arial', sans-serif; color: #1a1a1a; line-height: 1.6; }
    .page { padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e5e5e5; padding-bottom: 20px; margin-bottom: 20px; }
    .logo { height: 60px; }
    .header-left h1 { font-size: 24px; color: #1a1a1a; margin-bottom: 4px; }
    .header-left p { color: #666; font-size: 14px; }
    .header-right { text-align: right; }
    .report-number { font-size: 18px; font-weight: bold; color: #2563eb; font-family: monospace; }
    .date { color: #666; font-size: 14px; }
    .badges { display: flex; gap: 10px; margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 8px; }
    .badge { padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .badge-in_progress { background: #dbeafe; color: #1e40af; }
    .badge-completed { background: #d1fae5; color: #065f46; }
    .badge-requires_follow_up { background: #ffedd5; color: #9a3412; }
    .badge-priority { background: #f3f4f6; color: #374151; }
    .title { font-size: 20px; font-weight: 600; margin-bottom: 20px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 600; margin-bottom: 8px; }
    .section-content { color: #1a1a1a; white-space: pre-wrap; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 24px; }
    .photos { margin-top: 30px; }
    .photos-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .photo-item { border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; }
    .photo-item img { width: 100%; height: 200px; object-fit: cover; }
    .photo-caption { padding: 12px; background: #f9fafb; }
    .photo-type { font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600; }
    .photo-desc { font-size: 13px; color: #374151; margin-top: 4px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-left">
        <img src="https://res.cloudinary.com/dhuln9b1n/image/upload/v1770308861/cancagua/images/01_logo-cancagua.png" alt="Cancagua" class="logo" />
        <h1>Reporte de Mantención</h1>
        <p>Cancagua Spa & Retreat Center</p>
      </div>
      <div class="header-right">
        <div class="report-number">${report.reportNumber}</div>
        <div class="date">${format(new Date(report.createdAt), "dd 'de' MMMM, yyyy", { locale: es })}</div>
        <div class="date">${format(new Date(report.createdAt), "HH:mm", { locale: es })} hrs</div>
      </div>
    </div>

    <div class="badges">
      <span class="badge badge-${report.status}">${statusLabels[report.status]}</span>
      <span class="badge badge-priority">Prioridad: ${priorityLabels[report.priority]}</span>
      <span class="badge badge-priority">${maintenanceTypeLabels[report.maintenanceType]}</span>
    </div>

    <div class="title">${report.title}</div>

    <div class="grid">
      ${report.area ? `<div class="section"><div class="section-title">Área</div><div class="section-content">${report.area}</div></div>` : ''}
      ${report.equipment ? `<div class="section"><div class="section-title">Equipo</div><div class="section-content">${report.equipment}</div></div>` : ''}
      ${report.location ? `<div class="section"><div class="section-title">Ubicación</div><div class="section-content">${report.location}</div></div>` : ''}
    </div>

    ${report.description ? `
    <div class="section">
      <div class="section-title">Descripción del Problema</div>
      <div class="section-content">${report.description}</div>
    </div>
    ` : ''}

    ${report.resolution ? `
    <div class="section">
      <div class="section-title">Resolución / Trabajo Realizado</div>
      <div class="section-content">${report.resolution}</div>
    </div>
    ` : ''}

    ${report.materialsUsed ? `
    <div class="section">
      <div class="section-title">Materiales Utilizados</div>
      <div class="section-content">${report.materialsUsed}</div>
    </div>
    ` : ''}

    ${report.observations ? `
    <div class="section">
      <div class="section-title">Observaciones</div>
      <div class="section-content">${report.observations}</div>
    </div>
    ` : ''}

    ${report.photos && report.photos.length > 0 ? `
    <div class="photos">
      <div class="section-title">Evidencia Fotográfica (${report.photos.length} ${report.photos.length === 1 ? 'foto' : 'fotos'})</div>
      <div class="photos-grid">
        ${report.photos.map(photo => `
          <div class="photo-item">
            <img src="${photo.url}" alt="${photo.description || 'Foto'}" />
            <div class="photo-caption">
              <div class="photo-type">${photoTypeLabels[photo.photoType]}</div>
              ${photo.description ? `<div class="photo-desc">${photo.description}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="footer">
      <div>Reportado por: ${report.reportedByName || report.reportedByEmail || 'Usuario'}</div>
      <div>Última actualización: ${format(new Date(report.updatedAt), "dd/MM/yyyy HH:mm", { locale: es })}</div>
    </div>
  </div>
</body>
</html>
      `;

      // Crear blob y descargar
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      // Abrir en nueva ventana para imprimir como PDF
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }

      toast.success("PDF generado - usa Ctrl+P o Cmd+P para guardar como PDF");
    } catch (error) {
      toast.error("Error al generar PDF");
    } finally {
      setIsExporting(false);
    }
  };

  // Exportar múltiples a CSV
  const handleExportCSV = () => {
    const reportsToExport = selectedIds.size > 0 
      ? filteredReports.filter((r: Report) => selectedIds.has(r.id))
      : filteredReports;

    if (reportsToExport.length === 0) {
      toast.error("No hay reportes para exportar");
      return;
    }

    const headers = ["N° Reporte", "Título", "Área", "Equipo", "Estado", "Prioridad", "Tipo", "Descripción", "Resolución", "Fecha"];
    const rows = reportsToExport.map((r: Report) => [
      r.reportNumber,
      r.title,
      r.area || "",
      r.equipment || "",
      statusLabels[r.status],
      priorityLabels[r.priority],
      maintenanceTypeLabels[r.maintenanceType],
      r.description || "",
      r.resolution || "",
      format(new Date(r.createdAt), "dd/MM/yyyy HH:mm"),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reportes-mantencion-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();

    toast.success(`${reportsToExport.length} reportes exportados`);
  };

  const getStatusBadge = (status: ReportStatus) => {
    const variants: Record<ReportStatus, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      in_progress: "default",
      completed: "default",
      requires_follow_up: "destructive",
    };
    const colors: Record<ReportStatus, string> = {
      pending: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
      in_progress: "bg-blue-100 text-blue-800 hover:bg-blue-100",
      completed: "bg-green-100 text-green-800 hover:bg-green-100",
      requires_follow_up: "bg-orange-100 text-orange-800 hover:bg-orange-100",
    };
    return <Badge className={colors[status]}>{statusLabels[status]}</Badge>;
  };

  const getPriorityBadge = (priority: ReportPriority) => {
    const colors: Record<ReportPriority, string> = {
      low: "bg-gray-100 text-gray-800",
      medium: "bg-blue-100 text-blue-800",
      high: "bg-orange-100 text-orange-800",
      critical: "bg-red-100 text-red-800",
    };
    return <Badge className={colors[priority]}>{priorityLabels[priority]}</Badge>;
  };

  // Verificar permisos
  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user || (user.role !== "super_admin" && user.role !== "admin" && user.role !== "editor")) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold">Acceso Denegado</h2>
          <p className="text-muted-foreground">No tienes permisos para acceder a esta sección</p>
        </div>
      </DashboardLayout>
    );
  }

  // Vista de documento individual
  if (viewingReport && reportWithPhotos) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <ReportDocumentView
            report={reportWithPhotos as Report & { photos?: Photo[] }}
            onBack={() => setViewingReport(null)}
            onEdit={() => {
              handleEditReport(reportWithPhotos as Report);
              setViewingReport(null);
            }}
            onExportPDF={() => handleExportPDF(reportWithPhotos as Report)}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reportes de Mantención</h1>
            <p className="text-muted-foreground">
              Gestiona los reportes de mantención diarios
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Actualizar
            </Button>
            <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Reporte
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("all")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total || 0}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("pending")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats?.pending || 0}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("in_progress")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">En Progreso</CardTitle>
              <Settings2 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats?.inProgress || 0}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("completed")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completados</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.completed || 0}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("requires_follow_up")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Seguimiento</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats?.requiresFollowUp || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Bulk Actions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por título, número, área o equipo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="in_progress">En Progreso</SelectItem>
                  <SelectItem value="completed">Completado</SelectItem>
                  <SelectItem value="requires_follow_up">Requiere Seguimiento</SelectItem>
                </SelectContent>
              </Select>
              
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 border-l pl-4">
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size} seleccionado(s)
                  </span>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No hay reportes</h3>
                <p className="text-muted-foreground">
                  {searchTerm || statusFilter !== "all" 
                    ? "No se encontraron reportes con los filtros aplicados" 
                    : "Crea tu primer reporte de mantención"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size === filteredReports.length && filteredReports.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>N° Reporte</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report: Report) => (
                    <TableRow 
                      key={report.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleViewReport(report)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(report.id)}
                          onCheckedChange={() => {
                            const newSelected = new Set(selectedIds);
                            if (newSelected.has(report.id)) {
                              newSelected.delete(report.id);
                            } else {
                              newSelected.add(report.id);
                            }
                            setSelectedIds(newSelected);
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{report.reportNumber}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {report.title}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </TableCell>
                      <TableCell>{report.area || "-"}</TableCell>
                      <TableCell>{getStatusBadge(report.status)}</TableCell>
                      <TableCell>{getPriorityBadge(report.priority)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{maintenanceTypeLabels[report.maintenanceType]}</Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(report.createdAt), "dd/MM/yyyy", { locale: es })}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewReport(report)}>
                              <Eye className="w-4 h-4 mr-2" />
                              Ver Reporte
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditReport(report)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(report.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          if (!open && !isCreating) {
            resetForm();
          }
          if (!isCreating) {
            setIsCreateOpen(open);
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nuevo Reporte de Mantención</DialogTitle>
              <DialogDescription>
                Completa la información del reporte y adjunta fotos si es necesario
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="info">Información</TabsTrigger>
                <TabsTrigger value="photos" className="flex items-center gap-2">
                  Fotos
                  {pendingPhotos.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{pendingPhotos.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Título *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Ej: Reparación de bomba de agua"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="area">Área</Label>
                      <Input
                        id="area"
                        value={formData.area}
                        onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                        placeholder="Ej: Piscina"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="equipment">Equipo</Label>
                      <Input
                        id="equipment"
                        value={formData.equipment}
                        onChange={(e) => setFormData({ ...formData, equipment: e.target.value })}
                        placeholder="Ej: Bomba principal"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="location">Ubicación</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="Ej: Sala de máquinas"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label>Estado</Label>
                      <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as ReportStatus })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendiente</SelectItem>
                          <SelectItem value="in_progress">En Progreso</SelectItem>
                          <SelectItem value="completed">Completado</SelectItem>
                          <SelectItem value="requires_follow_up">Requiere Seguimiento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Prioridad</Label>
                      <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as ReportPriority })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Baja</SelectItem>
                          <SelectItem value="medium">Media</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="critical">Crítica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Tipo de Mantención</Label>
                      <Select value={formData.maintenanceType} onValueChange={(v) => setFormData({ ...formData, maintenanceType: v as MaintenanceType })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="preventive">Preventiva</SelectItem>
                          <SelectItem value="corrective">Correctiva</SelectItem>
                          <SelectItem value="emergency">Emergencia</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Descripción del Problema</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Describe el problema encontrado..."
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="resolution">Resolución / Trabajo Realizado</Label>
                    <Textarea
                      id="resolution"
                      value={formData.resolution}
                      onChange={(e) => setFormData({ ...formData, resolution: e.target.value })}
                      placeholder="Describe el trabajo realizado..."
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="materialsUsed">Materiales Utilizados</Label>
                    <Textarea
                      id="materialsUsed"
                      value={formData.materialsUsed}
                      onChange={(e) => setFormData({ ...formData, materialsUsed: e.target.value })}
                      placeholder="Lista de materiales..."
                      rows={2}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="observations">Observaciones</Label>
                    <Textarea
                      id="observations"
                      value={formData.observations}
                      onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                      placeholder="Observaciones adicionales..."
                      rows={2}
                    />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="photos" className="space-y-4 mt-4">
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <Label>Tipo de foto</Label>
                    <Select value={newPhotoType} onValueChange={(v) => setNewPhotoType(v as PhotoType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="before">Antes</SelectItem>
                        <SelectItem value="during">Durante</SelectItem>
                        <SelectItem value="after">Después</SelectItem>
                        <SelectItem value="evidence">Evidencia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <input
                      type="file"
                      ref={createFileInputRef}
                      onChange={handleAddPendingPhoto}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => createFileInputRef.current?.click()}
                    >
                      <ImagePlus className="w-4 h-4 mr-2" />
                      Agregar Fotos
                    </Button>
                  </div>
                </div>
                
                {pendingPhotos.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {pendingPhotos.map((photo) => (
                      <Card key={photo.id} className="overflow-hidden">
                        <div className="relative aspect-square">
                          <img
                            src={photo.preview}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8"
                            onClick={() => handleRemovePendingPhoto(photo.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                          <Badge className="absolute bottom-2 left-2">
                            {photoTypeLabels[photo.photoType]}
                          </Badge>
                        </div>
                        <CardContent className="p-3">
                          <Input
                            placeholder="Descripción de la foto..."
                            value={photo.description}
                            onChange={(e) => handleUpdatePendingPhotoDescription(photo.id, e.target.value)}
                            className="text-sm"
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                    <Camera className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">Sin fotos</h3>
                    <p className="text-muted-foreground">
                      Agrega fotos para documentar el trabajo
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={isCreating || !formData.title}>
                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isCreating ? "Creando..." : `Crear Reporte${pendingPhotos.length > 0 ? ` (${pendingPhotos.length} fotos)` : ""}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Reporte</DialogTitle>
              <DialogDescription>
                {selectedReport?.reportNumber}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-title">Título *</Label>
                <Input
                  id="edit-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-area">Área</Label>
                  <Input
                    id="edit-area"
                    value={formData.area}
                    onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-equipment">Equipo</Label>
                  <Input
                    id="edit-equipment"
                    value={formData.equipment}
                    onChange={(e) => setFormData({ ...formData, equipment: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-location">Ubicación</Label>
                <Input
                  id="edit-location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label>Estado</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as ReportStatus })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="in_progress">En Progreso</SelectItem>
                      <SelectItem value="completed">Completado</SelectItem>
                      <SelectItem value="requires_follow_up">Requiere Seguimiento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Prioridad</Label>
                  <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as ReportPriority })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baja</SelectItem>
                      <SelectItem value="medium">Media</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="critical">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <Select value={formData.maintenanceType} onValueChange={(v) => setFormData({ ...formData, maintenanceType: v as MaintenanceType })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preventive">Preventiva</SelectItem>
                      <SelectItem value="corrective">Correctiva</SelectItem>
                      <SelectItem value="emergency">Emergencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Descripción del Problema</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-resolution">Resolución / Trabajo Realizado</Label>
                <Textarea
                  id="edit-resolution"
                  value={formData.resolution}
                  onChange={(e) => setFormData({ ...formData, resolution: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-materialsUsed">Materiales Utilizados</Label>
                <Textarea
                  id="edit-materialsUsed"
                  value={formData.materialsUsed}
                  onChange={(e) => setFormData({ ...formData, materialsUsed: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-observations">Observaciones</Label>
                <Textarea
                  id="edit-observations"
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar Cambios
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
