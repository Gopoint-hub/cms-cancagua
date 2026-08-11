import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { hasB2CAccess } from "@shared/permissions";
import { Loader2, Plus, Pencil, Trash2, Leaf, Wheat, Flame, Eye, Upload, X, Clock3, Coffee, Radio, PackageCheck } from "lucide-react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

export default function CMSCarta() {
  const { user, loading: authLoading } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Queries
  const { data: categories, isLoading: categoriesLoading, refetch: refetchCategories } = 
    trpc.menuAdmin.getAllCategories.useQuery();
  const { data: items, isLoading: itemsLoading, refetch: refetchItems } = 
    trpc.menuAdmin.getAllItems.useQuery();
  const { data: hotTubOrders, isLoading: ordersLoading, refetch: refetchOrders } =
    trpc.menuAdmin.getHotTubOrders.useQuery(undefined, { refetchInterval: 30000 });

  // Mutations
  const uploadImageMutation = trpc.upload.menuItemImage.useMutation({
    onSuccess: () => {
      toast.success("Imagen subida exitosamente");
      refetchItems();
    },
    onError: (error) => {
      toast.error(error.message || "Error al subir imagen");
    },
  });

  const createCategoryMutation = trpc.menuAdmin.createCategory.useMutation({
    onSuccess: () => {
      toast.success("Categoría creada exitosamente");
      refetchCategories();
      setIsAddCategoryOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Error al crear categoría");
    },
  });

  const createItemMutation = trpc.menuAdmin.createItem.useMutation({
    onSuccess: () => {
      toast.success("Item creado exitosamente");
      refetchItems();
      setIsAddItemOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Error al crear item");
    },
  });

  const updateCategoryMutation = trpc.menuAdmin.updateCategory.useMutation({
    onSuccess: () => {
      toast.success("Categoría actualizada");
      refetchCategories();
    },
  });

  const deleteCategoryMutation = trpc.menuAdmin.deleteCategory.useMutation({
    onSuccess: () => {
      toast.success("Categoría eliminada");
      refetchCategories();
    },
  });

  const deleteItemMutation = trpc.menuAdmin.deleteItem.useMutation({
    onSuccess: () => {
      toast.success("Item eliminado");
      refetchItems();
    },
  });

  const updateItemMutation = trpc.menuAdmin.updateItem.useMutation({
    onSuccess: () => {
      toast.success("Producto actualizado");
      refetchItems();
      setEditingItem(null);
    },
    onError: (error) => toast.error(error.message || "No fue posible actualizar el producto"),
  });

  const updateOrderStatusMutation = trpc.menuAdmin.updateHotTubOrderStatus.useMutation({
    onSuccess: () => refetchOrders(),
    onError: (error) => toast.error(error.message || "No fue posible actualizar la comanda"),
  });

  // Verificar permisos
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#44580E]" />
      </div>
    );
  }

  if (!user || !hasB2CAccess(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Acceso Denegado</CardTitle>
            <CardDescription>
              No tienes permisos para gestionar la carta.
            </CardDescription>
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

  const handleCreateCategory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string;
    const description = formData.get("description") as string;

    createCategoryMutation.mutate({
      name,
      slug,
      description: description || undefined,
      displayOrder: categories?.length || 0,
    });
  };

  const handleCreateItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (!selectedCategory) {
      toast.error("Selecciona una categoría primero");
      return;
    }

    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const priceType = formData.get("priceType") as string;
    
    let prices: any = {};
    if (priceType === "single") {
      prices = { default: parseInt(formData.get("priceDefault") as string) };
    } else {
      prices = {
        for_2: parseInt(formData.get("price2") as string),
        for_4: parseInt(formData.get("price4") as string),
        for_6: parseInt(formData.get("price6") as string),
      };
    }

    const dietaryTags: string[] = [];
    if (formData.get("vegan")) dietaryTags.push("vegan");
    if (formData.get("gluten_free")) dietaryTags.push("gluten_free");
    if (formData.get("keto")) dietaryTags.push("keto");

    const specialNotes = formData.get("specialNotes") as string;
    const preparationArea = formData.get("preparationArea") as "cafe" | "reception";

    createItemMutation.mutate({
      categoryId: selectedCategory,
      name,
      description: description || undefined,
      prices: JSON.stringify(prices),
      dietaryTags: JSON.stringify(dietaryTags),
      specialNotes: specialNotes || undefined,
      preparationArea,
      displayOrder: items?.filter((i: any) => i.categoryId === selectedCategory).length || 0,
    }, {
      onSuccess: async (data, variables) => {
        // Si hay imagen, subirla después de crear el item
        if (imageFile) {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            // Obtener el ID del item recién creado
            const allItems = await refetchItems();
            const newItem = allItems.data?.find((i: any) => 
              i.name === variables.name && i.categoryId === variables.categoryId
            );
            if (newItem) {
              uploadImageMutation.mutate({
                itemId: newItem.id,
                imageData: base64,
                mimeType: imageFile.type,
              });
            }
          };
          reader.readAsDataURL(imageFile);
        }
        setImagePreview(null);
        setImageFile(null);
      },
    });
  };

  const handleUpdateItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingItem) return;
    const formData = new FormData(e.currentTarget);
    const priceType = formData.get("editPriceType") as string;
    const prices = priceType === "single"
      ? { default: Number(formData.get("editPriceDefault")) }
      : {
          for_2: Number(formData.get("editPrice2")) || undefined,
          for_4: Number(formData.get("editPrice4")) || undefined,
          for_6: Number(formData.get("editPrice6")) || undefined,
        };
    if (!Object.values(prices).some(value => typeof value === "number" && value >= 0)) {
      toast.error("Ingresa al menos un precio válido");
      return;
    }
    const dietaryTags = ["vegan", "gluten_free", "keto"].filter(tag => formData.get(`edit_${tag}`));
    updateItemMutation.mutate({
      id: editingItem.id,
      categoryId: Number(formData.get("editCategoryId")),
      name: String(formData.get("editName") || "").trim(),
      description: String(formData.get("editDescription") || "").trim(),
      prices: JSON.stringify(prices),
      dietaryTags: JSON.stringify(dietaryTags),
      specialNotes: String(formData.get("editSpecialNotes") || "").trim(),
      preparationArea: formData.get("editPreparationArea") as "cafe" | "reception",
    });
  };

  const toggleItemStock = (item: any) => {
    updateItemMutation.mutate({ id: item.id, inStock: item.inStock === 1 ? 0 : 1 });
  };

  const formatMoney = (amount: number) => `$${amount.toLocaleString("es-CL")}`;
  const formatDateTime = (value: string | Date | null) => value
    ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "—";
  const elapsedMinutes = (from: string | Date, to?: string | Date | null) =>
    Math.max(0, Math.round((new Date(to || Date.now()).getTime() - new Date(from).getTime()) / 60000));

  const toggleCategoryActive = (id: number, currentActive: number) => {
    updateCategoryMutation.mutate({
      id,
      active: currentActive === 1 ? 0 : 1,
    });
  };

  const getItemsByCategory = (categoryId: number) => {
    return items?.filter((item: any) => item.categoryId === categoryId) || [];
  };

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestión de Carta</h1>
            <p className="text-gray-600 mt-1">
              Administra las categorías e items del menú del restaurant
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <a href="https://cancagua.cl/cartahottubs" target="_blank" rel="noreferrer">
                <Eye className="w-4 h-4 mr-2" />
                Ver Carta Hot Tub
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cms">Volver al Dashboard</Link>
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="categories" className="space-y-6">
          <TabsList>
            <TabsTrigger value="categories">Categorías</TabsTrigger>
            <TabsTrigger value="items">Items de Menú</TabsTrigger>
            <TabsTrigger value="orders" className="relative">
              Comandas Hot Tub
              {hotTubOrders?.some((order: any) => order.status === "submitted") && (
                <span className="ml-2 h-2 w-2 rounded-full bg-red-500" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* Categorías */}
          <TabsContent value="categories" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Categorías de Menú</h2>
              <Dialog open={isAddCategoryOpen} onOpenChange={setIsAddCategoryOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Categoría
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreateCategory}>
                    <DialogHeader>
                      <DialogTitle>Crear Nueva Categoría</DialogTitle>
                      <DialogDescription>
                        Agrega una nueva categoría al menú (ej: Tablas, Bebestibles, Postres)
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="name">Nombre *</Label>
                        <Input id="name" name="name" placeholder="Ej: Tablas de Otoño" required />
                      </div>
                      <div>
                        <Label htmlFor="slug">Slug (URL) *</Label>
                        <Input id="slug" name="slug" placeholder="ej: tablas-otono" required />
                      </div>
                      <div>
                        <Label htmlFor="description">Descripción</Label>
                        <Textarea
                          id="description"
                          name="description"
                          placeholder="Descripción de la categoría"
                          rows={3}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsAddCategoryOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createCategoryMutation.isPending}>
                        {createCategoryMutation.isPending && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        Crear
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {categoriesLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#44580E]" />
              </div>
            )}

            {!categoriesLoading && categories && categories.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-600">No hay categorías creadas aún.</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Crea tu primera categoría para comenzar a armar el menú.
                  </p>
                </CardContent>
              </Card>
            )}

            {!categoriesLoading && categories && categories.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {categories.map((category: any) => (
                  <Card key={category.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{category.name}</CardTitle>
                          <CardDescription className="mt-1">
                            {category.description || "Sin descripción"}
                          </CardDescription>
                        </div>
                        <Badge variant={category.active === 1 ? "default" : "secondary"}>
                          {category.active === 1 ? "Activa" : "Inactiva"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleCategoryActive(category.id, category.active)}
                        >
                          {category.active === 1 ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedCategory(category.id);
                            setIsAddItemOpen(true);
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Item
                        </Button>
                        {hasB2CAccess(user.role) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (confirm("¿Eliminar esta categoría y todos sus items?")) {
                                deleteCategoryMutation.mutate({ id: category.id });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-3">
                        {getItemsByCategory(category.id).length} items
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Items */}
          <TabsContent value="items" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Items de Menú</h2>
              <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
                <DialogTrigger asChild>
                  <Button disabled={!categories || categories.length === 0}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Item
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <form onSubmit={handleCreateItem}>
                    <DialogHeader>
                      <DialogTitle>Crear Nuevo Item</DialogTitle>
                      <DialogDescription>
                        Agrega un nuevo plato o producto al menú
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="category">Categoría *</Label>
                        <select
                          id="category"
                          className="w-full border rounded-md px-3 py-2"
                          value={selectedCategory || ""}
                          onChange={(e) => setSelectedCategory(parseInt(e.target.value))}
                          required
                        >
                          <option value="">Selecciona una categoría</option>
                          {categories?.map((cat: any) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="name">Nombre *</Label>
                        <Input id="name" name="name" placeholder="Ej: Tabla de Otoño" required />
                      </div>
                      <div>
                        <Label htmlFor="description">Descripción</Label>
                        <Textarea
                          id="description"
                          name="description"
                          placeholder="Descripción del plato o producto"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label htmlFor="image">Imagen del Producto</Label>
                        <div className="mt-2">
                          {imagePreview ? (
                            <div className="relative inline-block">
                              <img
                                src={imagePreview}
                                alt="Preview"
                                className="w-32 h-32 object-cover rounded-lg border"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="absolute -top-2 -right-2"
                                onClick={() => {
                                  setImagePreview(null);
                                  setImageFile(null);
                                }}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <Upload className="w-8 h-8 mb-2 text-gray-400" />
                                <p className="text-sm text-gray-500">Click para subir imagen</p>
                                <p className="text-xs text-gray-400">PNG, JPG, WEBP (max 5MB)</p>
                              </div>
                              <input
                                id="image"
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    if (file.size > 5 * 1024 * 1024) {
                                      toast.error("La imagen no debe superar 5MB");
                                      return;
                                    }
                                    setImageFile(file);
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setImagePreview(reader.result as string);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label>Tipo de Precio *</Label>
                        <div className="space-y-3 mt-2">
                          <div>
                            <input type="radio" id="single" name="priceType" value="single" defaultChecked />
                            <label htmlFor="single" className="ml-2">Precio único</label>
                            <Input
                              type="number"
                              name="priceDefault"
                              placeholder="Precio en CLP"
                              className="mt-2"
                            />
                          </div>
                          <div>
                            <input type="radio" id="multiple" name="priceType" value="multiple" />
                            <label htmlFor="multiple" className="ml-2">Precios por cantidad</label>
                            <div className="grid grid-cols-3 gap-2 mt-2">
                              <div>
                                <Label className="text-xs">Para 2</Label>
                                <Input type="number" name="price2" placeholder="CLP" />
                              </div>
                              <div>
                                <Label className="text-xs">Para 4</Label>
                                <Input type="number" name="price4" placeholder="CLP" />
                              </div>
                              <div>
                                <Label className="text-xs">Para 6</Label>
                                <Input type="number" name="price6" placeholder="CLP" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label>Etiquetas Dietéticas</Label>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" name="vegan" />
                            <Leaf className="w-4 h-4" />
                            Vegano
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" name="gluten_free" />
                            <Wheat className="w-4 h-4" />
                            Sin Gluten
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" name="keto" />
                            <Flame className="w-4 h-4" />
                            Keto
                          </label>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="specialNotes">Notas Especiales</Label>
                        <Input
                          id="specialNotes"
                          name="specialNotes"
                          placeholder="Ej: Solicitar con 48 hrs de anticipación"
                        />
                      </div>
                      <div>
                        <Label htmlFor="preparationArea">Área responsable *</Label>
                        <select id="preparationArea" name="preparationArea" defaultValue="cafe" className="w-full border rounded-md px-3 py-2 mt-1">
                          <option value="cafe">Cafetería (avisar por walkie-talkie)</option>
                          <option value="reception">Recepción (bebestibles disponibles en recepción)</option>
                        </select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsAddItemOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createItemMutation.isPending}>
                        {createItemMutation.isPending && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        Crear
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {itemsLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#44580E]" />
              </div>
            )}

            {!itemsLoading && items && items.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-600">No hay items creados aún.</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Crea categorías primero, luego agrega items a cada una.
                  </p>
                </CardContent>
              </Card>
            )}

            {!itemsLoading && items && items.length > 0 && categories && (
              <div className="space-y-6">
                {categories.map((category: any) => {
                  const categoryItems = getItemsByCategory(category.id);
                  if (categoryItems.length === 0) return null;

                  return (
                    <div key={category.id}>
                      <h3 className="text-lg font-semibold mb-3">{category.name}</h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        {categoryItems.map((item: any) => {
                          const prices = item.prices ? JSON.parse(item.prices) : {};
                          const dietaryTags = item.dietaryTags ? JSON.parse(item.dietaryTags) : [];

                          return (
                            <Card key={item.id}>
                              <CardHeader>
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <CardTitle className="text-base">{item.name}</CardTitle>
                                    {item.description && (
                                      <CardDescription className="mt-1 line-clamp-2">
                                        {item.description}
                                      </CardDescription>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <Badge variant={item.inStock === 1 ? "default" : "destructive"}>
                                      {item.inStock === 1 ? "Con stock" : "Agotado"}
                                    </Badge>
                                    <span className="text-[11px] text-gray-500">
                                      {item.preparationArea === "reception" ? "Recepción" : "Cafetería"}
                                    </span>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-2">
                                  {item.imageUrl && (
                                    <div className="mb-3">
                                      <img
                                        src={item.imageUrl}
                                        alt={item.name}
                                        className="w-full h-32 object-cover rounded-lg"
                                      />
                                    </div>
                                  )}
                                  {prices.default && (
                                    <p className="text-sm font-semibold text-[#44580E]">
                                      ${prices.default.toLocaleString()}
                                    </p>
                                  )}
                                  {(prices.for_2 || prices.for_4 || prices.for_6) && (
                                    <div className="text-sm space-y-1">
                                      {prices.for_2 && <p>Para 2: ${prices.for_2.toLocaleString()}</p>}
                                      {prices.for_4 && <p>Para 4: ${prices.for_4.toLocaleString()}</p>}
                                      {prices.for_6 && <p>Para 6: ${prices.for_6.toLocaleString()}</p>}
                                    </div>
                                  )}
                                  {dietaryTags.length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                      {dietaryTags.map((tag: string) => (
                                        <Badge key={tag} variant="outline" className="text-xs">
                                          {tag === "vegan" && "🌱 Vegano"}
                                          {tag === "gluten_free" && "🌾 Sin Gluten"}
                                          {tag === "keto" && "🔥 Keto"}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  {item.specialNotes && (
                                    <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                                      {item.specialNotes}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap gap-2 pt-2">
                                    <Button
                                      size="sm"
                                      variant={item.inStock === 1 ? "outline" : "default"}
                                      onClick={() => toggleItemStock(item)}
                                      disabled={updateItemMutation.isPending}
                                    >
                                      {item.inStock === 1 ? "Marcar sin stock" : "Reponer stock"}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingItem(item)}>
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <label className="cursor-pointer">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        type="button"
                                        asChild
                                      >
                                        <span>
                                          <Upload className="w-4 h-4 mr-1" />
                                          {item.imageUrl ? "Cambiar" : "Subir"}
                                        </span>
                                      </Button>
                                      <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            if (file.size > 5 * 1024 * 1024) {
                                              toast.error("La imagen no debe superar 5MB");
                                              return;
                                            }
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                              const base64 = (reader.result as string).split(',')[1];
                                              uploadImageMutation.mutate({
                                                itemId: item.id,
                                                imageData: base64,
                                                mimeType: file.type,
                                              });
                                            };
                                            reader.readAsDataURL(file);
                                          }
                                        }}
                                      />
                                    </label>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => {
                                        if (confirm("¿Eliminar este item?")) {
                                          deleteItemMutation.mutate({ id: item.id });
                                        }
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Comandas Hot Tub</h2>
                <p className="text-sm text-gray-500">Actualización automática cada 30 segundos.</p>
              </div>
              <Button variant="outline" onClick={() => refetchOrders()} disabled={ordersLoading}>
                {ordersLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Actualizar
              </Button>
            </div>

            {hotTubOrders && hotTubOrders.length > 0 && (() => {
              const completed = hotTubOrders.filter((order: any) => order.deliveredAt);
              const ready = hotTubOrders.filter((order: any) => order.readyAt);
              const avgReady = ready.length
                ? Math.round(ready.reduce((sum: number, order: any) => sum + elapsedMinutes(order.requestedAt, order.readyAt), 0) / ready.length)
                : null;
              const avgDelivered = completed.length
                ? Math.round(completed.reduce((sum: number, order: any) => sum + elapsedMinutes(order.requestedAt, order.deliveredAt), 0) / completed.length)
                : null;
              return (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-gray-500">Pendientes</p><p className="text-2xl font-semibold">{hotTubOrders.filter((order: any) => !["delivered", "cancelled"].includes(order.status)).length}</p></CardContent></Card>
                  <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-gray-500">Promedio hasta lista</p><p className="text-2xl font-semibold">{avgReady === null ? "—" : `${avgReady} min`}</p></CardContent></Card>
                  <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-gray-500">Promedio hasta entrega</p><p className="text-2xl font-semibold">{avgDelivered === null ? "—" : `${avgDelivered} min`}</p></CardContent></Card>
                </div>
              );
            })()}

            {ordersLoading && !hotTubOrders && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#44580E]" /></div>}
            {!ordersLoading && hotTubOrders?.length === 0 && (
              <Card><CardContent className="py-12 text-center text-gray-500">Todavía no hay pedidos de Hot Tub.</CardContent></Card>
            )}

            <div className="space-y-4">
              {hotTubOrders?.map((order: any) => {
                const statusInfo: Record<string, { label: string; className: string }> = {
                  submitted: { label: "Nuevo", className: "bg-red-100 text-red-800" },
                  acknowledged: { label: "Recibido", className: "bg-blue-100 text-blue-800" },
                  preparing: { label: "En preparación", className: "bg-amber-100 text-amber-800" },
                  ready: { label: "Listo para retirar", className: "bg-emerald-100 text-emerald-800" },
                  delivered: { label: "Entregado", className: "bg-gray-100 text-gray-700" },
                  cancelled: { label: "Cancelado", className: "bg-gray-100 text-gray-500" },
                };
                const nextStatus: Record<string, { status: any; label: string }> = {
                  submitted: { status: "acknowledged", label: "Acusar recibo" },
                  acknowledged: { status: "preparing", label: "Iniciar preparación" },
                  preparing: { status: "ready", label: "Marcar listo" },
                  ready: { status: "delivered", label: "Marcar entregado" },
                };
                const next = nextStatus[order.status];
                return (
                  <Card key={order.id} className={order.status === "submitted" ? "border-red-300 shadow-sm" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg">{order.orderNumber}</CardTitle>
                            <Badge className={statusInfo[order.status]?.className}>{statusInfo[order.status]?.label || order.status}</Badge>
                          </div>
                          <CardDescription className="mt-1">
                            {order.customerName} · {order.customerPhone} · Hot Tub {order.hotTubCode} — {order.hotTubName}
                          </CardDescription>
                        </div>
                        <div className="text-sm sm:text-right">
                          <p className="font-medium">{order.serviceDate || "Fecha por coordinar"}{order.desiredTime ? ` · ${order.desiredTime}` : ""}</p>
                          <p className="text-gray-500">Pedido {formatDateTime(order.requestedAt)} · hace {elapsedMinutes(order.requestedAt)} min</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {order.items.map((item: any) => (
                          <div key={item.id} className="flex items-start justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                            <span><strong>{item.quantity}×</strong> {item.itemName}{item.priceLabel ? ` (${item.priceLabel})` : ""}<br /><span className="text-xs text-gray-500">{item.preparationArea === "reception" ? "Recepción" : "Cafetería"}</span></span>
                            <span>{formatMoney(item.lineTotal)}</span>
                          </div>
                        ))}
                      </div>
                      {order.notes && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>Notas:</strong> {order.notes}</p>}
                      <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1"><Radio className="w-3.5 h-3.5" /> Recepción: {order.receptionNotificationStatus === "sent" ? "WhatsApp generado" : order.receptionNotificationStatus}</span>
                        <span className="inline-flex items-center gap-1"><Coffee className="w-3.5 h-3.5" /> Café: {order.cafeNotificationStatus === "sent" ? "WhatsApp enviado" : order.cafeNotificationStatus === "not_configured" ? "grupo no configurado; usar walkie" : order.cafeNotificationStatus === "not_required" ? "no requerido" : order.cafeNotificationStatus}</span>
                        {order.readyAt && <span className="inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> Lista en {elapsedMinutes(order.requestedAt, order.readyAt)} min</span>}
                        {order.deliveredAt && <span className="inline-flex items-center gap-1"><PackageCheck className="w-3.5 h-3.5" /> Entregada en {elapsedMinutes(order.requestedAt, order.deliveredAt)} min</span>}
                        <strong className="ml-auto text-sm text-gray-900">Total {formatMoney(order.subtotal)} · pago en recepción</strong>
                      </div>
                      {!["delivered", "cancelled"].includes(order.status) && (
                        <div className="flex flex-wrap gap-2">
                          {next && <Button onClick={() => updateOrderStatusMutation.mutate({ id: order.id, status: next.status })} disabled={updateOrderStatusMutation.isPending}>{next.label}</Button>}
                          <Button variant="ghost" className="text-red-700" onClick={() => confirm("¿Cancelar esta comanda?") && updateOrderStatusMutation.mutate({ id: order.id, status: "cancelled" })}>Cancelar</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {editingItem && (() => {
              const prices = editingItem.prices ? JSON.parse(editingItem.prices) : {};
              const tags: string[] = editingItem.dietaryTags ? JSON.parse(editingItem.dietaryTags) : [];
              const multiple = Boolean(prices.for_2 || prices.for_4 || prices.for_6);
              return (
                <form onSubmit={handleUpdateItem}>
                  <DialogHeader><DialogTitle>Editar producto</DialogTitle><DialogDescription>Los cambios se reflejan en la carta pública.</DialogDescription></DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div><Label>Categoría</Label><select name="editCategoryId" defaultValue={editingItem.categoryId} className="w-full border rounded-md px-3 py-2 mt-1">{categories?.map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></div>
                    <div><Label>Nombre</Label><Input name="editName" defaultValue={editingItem.name} required /></div>
                    <div><Label>Descripción</Label><Textarea name="editDescription" defaultValue={editingItem.description || ""} rows={3} /></div>
                    <div>
                      <Label>Tipo de precio</Label>
                      <div className="flex gap-5 mt-2"><label><input type="radio" name="editPriceType" value="single" defaultChecked={!multiple} /> Único</label><label><input type="radio" name="editPriceType" value="multiple" defaultChecked={multiple} /> Por tamaño</label></div>
                      <Input type="number" name="editPriceDefault" defaultValue={prices.default} placeholder="Precio único" className="mt-2" />
                      <div className="grid grid-cols-3 gap-2 mt-2"><Input type="number" name="editPrice2" defaultValue={prices.for_2} placeholder="Para 2" /><Input type="number" name="editPrice4" defaultValue={prices.for_4} placeholder="Para 4" /><Input type="number" name="editPrice6" defaultValue={prices.for_6} placeholder="Para 6" /></div>
                    </div>
                    <div><Label>Etiquetas</Label><div className="flex flex-wrap gap-4 mt-2"><label><input type="checkbox" name="edit_vegan" defaultChecked={tags.includes("vegan")} /> Vegano</label><label><input type="checkbox" name="edit_gluten_free" defaultChecked={tags.includes("gluten_free")} /> Sin gluten</label><label><input type="checkbox" name="edit_keto" defaultChecked={tags.includes("keto")} /> Keto</label></div></div>
                    <div><Label>Notas especiales</Label><Input name="editSpecialNotes" defaultValue={editingItem.specialNotes || ""} /></div>
                    <div><Label>Área responsable</Label><select name="editPreparationArea" defaultValue={editingItem.preparationArea || "cafe"} className="w-full border rounded-md px-3 py-2 mt-1"><option value="cafe">Cafetería</option><option value="reception">Recepción</option></select></div>
                  </div>
                  <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingItem(null)}>Cancelar</Button><Button type="submit" disabled={updateItemMutation.isPending}>{updateItemMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar cambios</Button></DialogFooter>
                </form>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </div>
    </DashboardLayout>
  );
}
