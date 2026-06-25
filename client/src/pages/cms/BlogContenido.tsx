import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  BookOpen, Sparkles, Eye, Edit, Globe, Check, X,
  Clock, Tag, FileText, ChevronUp, Loader2,
} from "lucide-react";

interface BlogArticle {
  id: number;
  title: string;
  slug: string;
  content: string;
  metaDescription?: string | null;
  metaKeywords: string[];
  category?: string | null;
  estimatedReadingTime: number;
  status: "draft" | "approved" | "published";
  campaignSubject?: string | null;
  publishedAt?: Date | string | null;
  publishedUrl?: string | null;
}

function MarkdownPreview({ content }: { content: string }) {
  const html = content
    .replace(/^# (.+)$/gm, "<h1 style='font-size:1.5rem;font-weight:700;margin:1rem 0 0.5rem'>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2 style='font-size:1.25rem;font-weight:600;margin:0.75rem 0 0.5rem'>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3 style='font-size:1.1rem;font-weight:600;margin:0.5rem 0 0.25rem'>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li style='margin-left:1.5rem;list-style:disc'>$1</li>")
    .replace(/\n\n/g, "</p><p style='margin:0.5rem 0'>");

  return (
    <div
      className="text-sm p-4 rounded border bg-white overflow-auto"
      style={{ maxHeight: "60vh", lineHeight: "1.6" }}
      dangerouslySetInnerHTML={{ __html: `<p style='margin:0.5rem 0'>${html}</p>` }}
    />
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  published: "bg-green-100 text-green-800",
};

export default function BlogContenido() {
  const { data: articles = [], isLoading, refetch } = trpc.marketing.listBlogArticles.useQuery();
  const [generating, setGenerating] = useState(false);
  const [genForm, setGenForm] = useState({
    campaignSubject: "",
    campaignBody: "",
    targetAudience: "",
    additionalContext: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showGenForm, setShowGenForm] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editMeta, setEditMeta] = useState("");
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const createArticleMutation = trpc.marketing.createBlogArticle.useMutation({
    onSuccess: (article) => {
      refetch();
      setShowGenForm(false);
      setGenForm({ campaignSubject: "", campaignBody: "", targetAudience: "", additionalContext: "" });
      setExpandedId(String(article.id));
      toast.success("Artículo generado — pendiente de aprobación");
      setGenerating(false);
    },
    onError: (e) => {
      toast.error(`Error guardando artículo: ${e.message}`);
      setGenerating(false);
    },
  });

  const updateArticleMutation = trpc.marketing.updateBlogArticle.useMutation({
    onSuccess: () => {
      refetch();
      setEditingId(null);
      toast.success("Artículo actualizado");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteArticleMutation = trpc.marketing.deleteBlogArticle.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Artículo eliminado");
    },
    onError: (e) => toast.error(e.message),
  });

  const generateMutation = trpc.marketing.generateBlogArticle.useMutation({
    onSuccess: (data) => {
      createArticleMutation.mutate({
        ...data,
        status: "draft",
        campaignSubject: genForm.campaignSubject,
      });
    },
    onError: (e) => {
      toast.error(`Error generando: ${e.message}`);
      setGenerating(false);
    },
  });

  const publishMutation = trpc.marketing.publishBlogArticle.useMutation({
    onSuccess: (data) => {
      if (publishingId) {
        updateArticleMutation.mutate({
          id: Number(publishingId),
          status: "published",
          publishedAt: new Date(),
          publishedUrl: data.url,
        });
      }
      toast.success("Artículo publicado. El deploy puede tardar unos minutos.", {
        description: data.url,
      });
      setPublishingId(null);
    },
    onError: (e) => {
      toast.error(`Error publicando: ${e.message}`);
      setPublishingId(null);
    },
  });

  const handleGenerate = () => {
    if (!genForm.campaignSubject.trim()) {
      toast.error("Ingresa el asunto de la campaña");
      return;
    }
    setGenerating(true);
    generateMutation.mutate(genForm);
  };

  const approveArticle = (id: string) => {
    updateArticleMutation.mutate({ id: Number(id), status: "approved" });
  };

  const startEdit = (a: BlogArticle) => {
    setEditingId(String(a.id));
    setEditContent(a.content);
    setEditTitle(a.title);
    setEditMeta(a.metaDescription || "");
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateArticleMutation.mutate({
      id: Number(editingId),
      content: editContent,
      title: editTitle,
      metaDescription: editMeta,
    });
  };

  const publishArticle = (a: BlogArticle) => {
    setPublishingId(String(a.id));
    publishMutation.mutate({
      id: a.id,
      title: a.title,
      slug: a.slug,
      content: a.content,
      metaDescription: a.metaDescription || undefined,
      metaKeywords: a.metaKeywords,
      category: a.category || undefined,
      author: "Cancagua",
      status: "published",
    });
  };

  const deleteArticle = (id: string) => {
    deleteArticleMutation.mutate({ id: Number(id) });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BookOpen className="h-6 w-6" />
              Blog & Contenido
            </h1>
            <p className="text-muted-foreground">
              Generador SEO/AEO de artículos — conectado con cancagua.cl/blog
            </p>
          </div>
          <Button
            onClick={() => setShowGenForm(!showGenForm)}
            className="gap-2"
            variant={showGenForm ? "outline" : "default"}
          >
            <Sparkles className="h-4 w-4" />
            {showGenForm ? "Cancelar" : "Generar artículo con IA"}
          </Button>
        </div>

        {articles.filter((a) => a.status === "draft").length > 0 && (
          <Card className="border-amber-400 bg-amber-50">
            <CardContent className="pt-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800 font-medium">
                {articles.filter((a) => a.status === "draft").length} artículo(s) esperando aprobación
              </p>
            </CardContent>
          </Card>
        )}

        {showGenForm && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Nuevo artículo de blog
              </CardTitle>
              <CardDescription>
                La IA generará un artículo SEO/AEO basado en la campaña de email enviada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Asunto de la campaña *</Label>
                <Input
                  value={genForm.campaignSubject}
                  onChange={(e) => setGenForm((f) => ({ ...f, campaignSubject: e.target.value }))}
                  placeholder="Ej: Retiro de invierno en Cancagua — cupos limitados"
                />
              </div>
              <div>
                <Label>Contenido principal de la campaña (opcional)</Label>
                <Textarea
                  rows={3}
                  value={genForm.campaignBody}
                  onChange={(e) => setGenForm((f) => ({ ...f, campaignBody: e.target.value }))}
                  placeholder="Pega el texto del email enviado..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Audiencia objetivo</Label>
                  <Input
                    value={genForm.targetAudience}
                    onChange={(e) => setGenForm((f) => ({ ...f, targetAudience: e.target.value }))}
                    placeholder="Ej: Mujeres 30-50, clientes Justo"
                  />
                </div>
                <div>
                  <Label>Contexto adicional</Label>
                  <Input
                    value={genForm.additionalContext}
                    onChange={(e) => setGenForm((f) => ({ ...f, additionalContext: e.target.value }))}
                    placeholder="Ej: Enfocado en turismo invernal"
                  />
                </div>
              </div>
              <Button onClick={handleGenerate} disabled={generating} className="gap-2">
                {generating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generando con IA...</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Generar artículo</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {isLoading && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                Cargando artículos...
              </CardContent>
            </Card>
          )}

          {!isLoading && articles.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No hay artículos aún. Genera el primero cuando envíes una campaña.</p>
              </CardContent>
            </Card>
          )}

          {articles.map((article) => (
            <Card
              key={article.id}
              className={
                article.status === "draft" ? "border-amber-300" :
                article.status === "published" ? "border-green-300" : ""
              }
            >
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className={`text-xs ${STATUS_COLORS[article.status]}`}>
                        {article.status === "draft" ? "Borrador — pendiente aprobación" :
                         article.status === "approved" ? "Aprobado — listo para publicar" :
                         "Publicado"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />{article.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 inline mr-0.5" />
                        {article.estimatedReadingTime} min
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm leading-tight">{article.title}</h3>
                    {article.campaignSubject && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Campaña: {article.campaignSubject}
                      </p>
                    )}
                    {article.publishedUrl && (
                      <a
                        href={article.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {article.publishedUrl}
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {article.status === "draft" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-green-700 border-green-300 hover:bg-green-50 h-7 text-xs"
                        onClick={() => approveArticle(String(article.id))}
                      >
                        <Check className="h-3.5 w-3.5" /> Aprobar
                      </Button>
                    )}
                    {article.status === "approved" && (
                      <Button
                        size="sm"
                        className="gap-1 h-7 text-xs"
                        onClick={() => publishArticle(article)}
                        disabled={publishingId === String(article.id)}
                      >
                        {publishingId === String(article.id) ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Publicando...</>
                        ) : (
                          <><Globe className="h-3.5 w-3.5" /> Publicar en web</>
                        )}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(article as BlogArticle)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setExpandedId(expandedId === String(article.id) ? null : String(article.id))}
                    >
                      {expandedId === String(article.id) ? <ChevronUp className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                      onClick={() => deleteArticle(String(article.id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {expandedId === String(article.id) && (
                  <div className="mt-4">
                    <Separator className="mb-4" />
                    <Tabs defaultValue="preview">
                      <TabsList className="h-8">
                        <TabsTrigger value="preview" className="text-xs h-7">
                          <Eye className="h-3 w-3 mr-1" /> Preview
                        </TabsTrigger>
                        <TabsTrigger value="markdown" className="text-xs h-7">
                          <FileText className="h-3 w-3 mr-1" /> Markdown
                        </TabsTrigger>
                        <TabsTrigger value="seo" className="text-xs h-7">
                          <Tag className="h-3 w-3 mr-1" /> SEO
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="preview" className="mt-3">
                        <MarkdownPreview content={article.content} />
                      </TabsContent>
                      <TabsContent value="markdown" className="mt-3">
                        <pre className="text-xs font-mono bg-gray-50 p-4 rounded border overflow-auto max-h-80 whitespace-pre-wrap">
                          {article.content}
                        </pre>
                      </TabsContent>
                      <TabsContent value="seo" className="mt-3 space-y-3">
                        <div>
                          <Label className="text-xs">Meta descripción</Label>
                          <p className="text-sm mt-1 p-2 bg-gray-50 rounded border">{article.metaDescription || ""}</p>
                          <p className="text-xs text-muted-foreground">{(article.metaDescription || "").length}/160 chars</p>
                        </div>
                        <div>
                          <Label className="text-xs">Keywords</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {article.metaKeywords.map((k: string) => (
                              <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Slug (URL)</Label>
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded block mt-1">
                            /blog/{article.slug}
                          </code>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar artículo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <Label>Meta descripción</Label>
              <Input value={editMeta} onChange={(e) => setEditMeta(e.target.value)} maxLength={160} />
              <p className="text-xs text-muted-foreground">{editMeta.length}/160</p>
            </div>
            <div>
              <Label>Contenido (Markdown)</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={20}
                className="font-mono text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
            <Button onClick={saveEdit}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
