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
import { Loader2, Plus, Pencil, Trash2, Leaf, Wheat, Flame, Eye, Upload, X } from "lucide-react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

export default function CMSCarta() {
  const { user, loading: authLoading } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Queries
  const { data: categories, isLoading: categoriesLoading, refetch: refetchCategories } = 
    trpc.menuAdmin.getAllCategories.useQuery();
  const { data: items, isLoading: itemsLoading, refetch: refetchItems } = 
    trpc.menuAdmin.getAllItems.useQuery();

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

    createItemMutation.mutate({
      categoryId: selectedCategory,
      name,
      description: description || undefined,
      prices: JSON.stringify(prices),
      dietaryTags: JSON.stringify(dietaryTags),
      specialNotes: specialNotes || undefined,
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
              <Link href="/carta">
                <Eye className="w-4 h-4 mr-2" />
                Ver Carta Pública
              </Link>
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
                        {user.role === "admin" && (
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
                                  <Badge variant={item.active === 1 ? "default" : "secondary"}>
                                    {item.active === 1 ? "Activo" : "Inactivo"}
                                  </Badge>
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
                                  <div className="flex gap-2 pt-2">
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
        </Tabs>
      </div>
    </div>
    </DashboardLayout>
  );
}
