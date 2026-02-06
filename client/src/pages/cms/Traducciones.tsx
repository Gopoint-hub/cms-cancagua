import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Languages, Search, Edit, Trash2, RefreshCw, Check, X, Globe, Clock, User } from "lucide-react";

const LANGUAGE_NAMES: Record<string, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
};

const LANGUAGE_FLAGS: Record<string, string> = {
  es: "🇨🇱",
  en: "🇺🇸",
  pt: "🇧🇷",
  fr: "🇫🇷",
  de: "🇩🇪",
};

export default function CMSTraducciones() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLanguage, setFilterLanguage] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  const { data: translations, isLoading, refetch } = trpc.translations.list.useQuery();
  const updateMutation = trpc.translations.update.useMutation({
    onSuccess: () => {
      toast.success("Traducción actualizada");
      setEditingId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });
  
  const deleteMutation = trpc.translations.delete.useMutation({
    onSuccess: () => {
      toast.success("Traducción eliminada");
      setDeleteId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });
  
  const regenerateMutation = trpc.translations.regenerate.useMutation({
    onSuccess: () => {
      toast.success("Traducción marcada para regeneración");
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });
  
  // Filtrar traducciones
  const filteredTranslations = translations?.filter((t) => {
    const matchesSearch = 
      t.contentKey.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.originalContent.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.translatedContent.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLanguage = filterLanguage === "all" || t.language === filterLanguage;
    return matchesSearch && matchesLanguage;
  }) || [];
  
  // Estadísticas por idioma
  const stats = translations?.reduce((acc, t) => {
    acc[t.language] = (acc[t.language] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};
  
  const handleEdit = (id: number, content: string) => {
    setEditingId(id);
    setEditContent(content);
  };
  
  const handleSaveEdit = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, translatedContent: editContent });
    }
  };
  
  const handleDelete = () => {
    if (deleteId) {
      deleteMutation.mutate({ id: deleteId });
    }
  };
  
  const handleRegenerate = (id: number) => {
    regenerateMutation.mutate({ id });
  };
  
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Languages className="h-8 w-8" />
              Traducciones
            </h1>
            <p className="text-muted-foreground">
              Gestiona las traducciones automáticas del sitio web
            </p>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>
        
        {/* Estadísticas */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(LANGUAGE_NAMES).filter(([code]) => code !== 'es').map(([code, name]) => (
            <Card key={code}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{name}</p>
                    <p className="text-2xl font-bold">{stats[code] || 0}</p>
                  </div>
                  <span className="text-3xl">{LANGUAGE_FLAGS[code]}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por clave, contenido original o traducción..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filterLanguage} onValueChange={setFilterLanguage}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Idioma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los idiomas</SelectItem>
                  {Object.entries(LANGUAGE_NAMES).filter(([code]) => code !== 'es').map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {LANGUAGE_FLAGS[code]} {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        
        {/* Tabla de traducciones */}
        <Card>
          <CardHeader>
            <CardTitle>Traducciones ({filteredTranslations.length})</CardTitle>
            <CardDescription>
              Las traducciones se generan automáticamente con IA cuando un usuario visita una página en otro idioma
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTranslations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hay traducciones registradas</p>
                <p className="text-sm">Las traducciones se crearán automáticamente cuando los usuarios visiten el sitio en otros idiomas</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Idioma</TableHead>
                      <TableHead>Clave</TableHead>
                      <TableHead>Original (ES)</TableHead>
                      <TableHead>Traducción</TableHead>
                      <TableHead className="w-[120px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTranslations.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {LANGUAGE_FLAGS[t.language]} {t.language.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[150px] truncate">
                          {t.contentKey}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="truncate text-sm text-muted-foreground">
                            {t.originalContent.substring(0, 100)}
                            {t.originalContent.length > 100 && "..."}
                          </p>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {editingId === t.id ? (
                            <div className="flex items-center gap-2">
                              <Textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="min-h-[60px] text-sm"
                              />
                              <div className="flex flex-col gap-1">
                                <Button size="icon" variant="ghost" onClick={handleSaveEdit}>
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                                  <X className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="truncate text-sm">
                              {t.translatedContent.substring(0, 100)}
                              {t.translatedContent.length > 100 && "..."}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEdit(t.id, t.translatedContent)}
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRegenerate(t.id)}
                              title="Regenerar con IA"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteId(t.id)}
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Información del sistema */}
        <Card>
          <CardHeader>
            <CardTitle>Cómo funciona</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Detección automática</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  El sistema detecta el idioma del navegador del visitante y muestra el contenido en su idioma preferido.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Languages className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Traducción con IA</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  La primera vez que alguien visita una página en otro idioma, la IA traduce el contenido y lo guarda.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Caché inteligente</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Las traducciones se guardan en la base de datos para cargas instantáneas en visitas futuras.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Dialog de confirmación de eliminación */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar traducción?</DialogTitle>
            <DialogDescription>
              Esta acción eliminará la traducción. Se regenerará automáticamente la próxima vez que un usuario visite la página en ese idioma.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
