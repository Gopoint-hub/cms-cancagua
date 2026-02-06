import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, DollarSign, Upload, Copy, X } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "biopiscina", label: "Biopiscina" },
  { value: "hot_tub", label: "Hot Tub" },
  { value: "masaje", label: "Masaje" },
  { value: "taller", label: "Taller" },
  { value: "alimentos", label: "Alimentos" },
  { value: "arriendo", label: "Arriendo Espacio" },
  { value: "programa", label: "Programa" },
  { value: "otros", label: "Otros" },
];

export default function ProductosCorporativos() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    priceType: "per_person" as "per_person" | "flat",
    unitPrice: 0,
    duration: undefined as number | undefined,
    maxCapacity: undefined as number | undefined,
    includes: "",
    active: 1,
  });

  const { data: products, isLoading, refetch } = trpc.corporateProducts.getAll.useQuery();
  const createMutation = trpc.corporateProducts.create.useMutation();
  const updateMutation = trpc.corporateProducts.update.useMutation();
  const deleteMutation = trpc.corporateProducts.delete.useMutation();
  const bulkDeleteMutation = trpc.corporateProducts.bulkDelete.useMutation();
  const bulkDuplicateMutation = trpc.corporateProducts.bulkDuplicate.useMutation();
  const importMutation = trpc.corporateProducts.importFromCSV.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingProduct) {
        await updateMutation.mutateAsync({
          id: editingProduct.id,
          ...formData,
        });
        toast.success("Producto actualizado exitosamente");
      } else {
        await createMutation.mutateAsync(formData);
        toast.success("Producto creado exitosamente");
      }
      
      setIsDialogOpen(false);
      resetForm();
      refetch();
    } catch (error) {
      toast.error("Error al guardar el producto");
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      category: product.category,
      priceType: product.priceType,
      unitPrice: product.unitPrice,
      duration: product.duration || undefined,
      maxCapacity: product.maxCapacity || undefined,
      includes: product.includes || "",
      active: product.active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este producto?")) return;
    
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Producto eliminado exitosamente");
      refetch();
    } catch (error) {
      toast.error("Error al eliminar el producto");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.length === 0) {
      toast.error("Selecciona al menos un producto");
      return;
    }
    
    if (!confirm(`¿Estás seguro de que deseas eliminar ${selectedProducts.length} producto(s)?`)) return;
    
    try {
      const result = await bulkDeleteMutation.mutateAsync({ ids: selectedProducts });
      toast.success(`${result.deleted} producto(s) eliminado(s) exitosamente`);
      setSelectedProducts([]);
      refetch();
    } catch (error) {
      toast.error("Error al eliminar productos");
    }
  };

  const handleBulkDuplicate = async () => {
    if (selectedProducts.length === 0) {
      toast.error("Selecciona al menos un producto");
      return;
    }
    
    try {
      const result = await bulkDuplicateMutation.mutateAsync({ ids: selectedProducts });
      toast.success(`${result.duplicated} producto(s) duplicado(s) exitosamente`);
      setSelectedProducts([]);
      refetch();
    } catch (error) {
      toast.error("Error al duplicar productos");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result as ArrayBuffer;
        parseExcel(data);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        parseCSV(text);
      };
      reader.readAsText(file);
    }
  };

  const parseExcel = (data: ArrayBuffer) => {
    try {
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        toast.error("El archivo Excel está vacío");
        return;
      }

      const parsedData = rows.map((row: any) => {
        const normalized: any = {};
        
        for (const key in row) {
          const lowerKey = key.toLowerCase().trim();
          const value = row[key];
          
          if (lowerKey === "producto" || lowerKey === "name" || lowerKey === "nombre") {
            normalized.name = String(value || "");
          } else if (lowerKey.includes("descripción") || lowerKey.includes("descripcion") || lowerKey === "description") {
            normalized.description = String(value || "");
          } else if (lowerKey.includes("duración") || lowerKey.includes("duracion") || lowerKey === "duration") {
            normalized.duration = value ? parseInt(String(value)) : undefined;
          } else if (lowerKey.includes("precio unitario") || lowerKey === "precio" || lowerKey === "unitprice") {
            normalized.unitPrice = parseFloat(String(value || 0));
          } else if (lowerKey.includes("capacidad máxima") || lowerKey.includes("capacidad maxima") || lowerKey === "maxcapacity") {
            normalized.maxCapacity = value ? parseInt(String(value)) : undefined;
          }
        }
        
        if (!normalized.category) {
          normalized.category = "otros";
        }
        
        return normalized;
      }).filter(row => row.name && row.unitPrice);

      if (parsedData.length === 0) {
        toast.error("No se encontraron productos válidos en el archivo Excel");
        return;
      }

      setCsvData(parsedData);
      setIsImportDialogOpen(true);
    } catch (error) {
      toast.error("Error al parsear el archivo Excel");
      console.error(error);
    }
  };

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter(line => line.trim());
    if (lines.length < 2) {
      toast.error("El archivo CSV debe tener al menos una fila de encabezados y una fila de datos");
      return;
    }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const data = lines.slice(1).map(line => {
      const values = line.split(",").map(v => v.trim());
      const row: any = {};
      
      headers.forEach((header, index) => {
        const value = values[index] || "";
        
        if (header === "producto" || header === "name" || header === "nombre") row.name = value;
        else if (header.includes("descripcion") || header.includes("description")) row.description = value;
        else if (header === "category" || header === "categoria") row.category = value;
        else if (header === "pricetype" || header === "tipo_precio") row.priceType = value === "flat" ? "flat" : "per_person";
        else if (header.includes("precio unitario") || header === "unitprice" || header === "precio") row.unitPrice = parseFloat(value) || 0;
        else if (header.includes("duracion") || header === "duration") row.duration = value ? parseInt(value) : undefined;
        else if (header.includes("capacidad maxima") || header === "maxcapacity") row.maxCapacity = value ? parseInt(value) : undefined;
        else if (header === "includes" || header === "incluye") row.includes = value;
        else if (header === "active" || header === "activo") row.active = value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "si" ? 1 : 0;
      });
      
      if (!row.category) row.category = "otros";
      return row;
    }).filter(row => row.name && row.unitPrice);

    if (data.length === 0) {
      toast.error("No se encontraron productos válidos en el archivo CSV");
      return;
    }

    setCsvData(data);
    setIsImportDialogOpen(true);
  };

  const handleImport = async () => {
    try {
      const result = await importMutation.mutateAsync({ products: csvData });
      toast.success(`${result.imported} producto(s) importado(s) exitosamente`);
      setIsImportDialogOpen(false);
      setCsvData([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      refetch();
    } catch (error) {
      toast.error("Error al importar productos");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "",
      priceType: "per_person",
      unitPrice: 0,
      duration: undefined,
      maxCapacity: undefined,
      includes: "",
      active: 1,
    });
    setEditingProduct(null);
  };

  const toggleSelectAll = () => {
    if (selectedProducts.length === products?.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(products?.map(p => p.id) || []);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedProducts(prev =>
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6">Cargando...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Catálogo de Productos Corporativos</h1>
            <p className="text-muted-foreground mt-1">
              Gestiona los productos y servicios para eventos corporativos
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar Archivo
            </Button>
            <Button onClick={() => {
              resetForm();
              setIsDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Producto
            </Button>
          </div>
        </div>

        {selectedProducts.length > 0 && (
          <Card className="bg-muted/50 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {selectedProducts.length} producto(s) seleccionado(s)
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedProducts([])}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDuplicate}
                    disabled={bulkDuplicateMutation.isPending}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={bulkDeleteMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Productos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedProducts.length === products?.length && products?.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Capacidad</TableHead>
                  <TableHead className="w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products?.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedProducts.includes(product.id)}
                        onCheckedChange={() => toggleSelect(product.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CATEGORIES.find(c => c.value === product.category)?.label || product.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        {product.unitPrice}
                      </div>
                    </TableCell>
                    <TableCell>{product.duration ? `${product.duration} min` : "-"}</TableCell>
                    <TableCell>{product.maxCapacity ? `Máx: ${product.maxCapacity}` : "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(product)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(product.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Dialog para crear/editar producto */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Editar Producto" : "Nuevo Producto"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Precio Unitario</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.unitPrice}
                onChange={(e) => setFormData({...formData, unitPrice: parseFloat(e.target.value)})}
                required
              />
            </div>
            <div>
              <Label>Duración (minutos)</Label>
              <Input
                type="number"
                value={formData.duration || ""}
                onChange={(e) => setFormData({...formData, duration: e.target.value ? parseInt(e.target.value) : undefined})}
              />
            </div>
            <div>
              <Label>Capacidad Máxima</Label>
              <Input
                type="number"
                value={formData.maxCapacity || ""}
                onChange={(e) => setFormData({...formData, maxCapacity: e.target.value ? parseInt(e.target.value) : undefined})}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingProduct ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog para importar */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Productos</DialogTitle>
            <DialogDescription>
              Se importarán {csvData.length} producto(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {csvData.map((product, index) => (
              <Card key={index} className="p-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Nombre:</span> {product.name}</div>
                  <div><span className="font-medium">Precio:</span> ${product.unitPrice}</div>
                  <div><span className="font-medium">Duración:</span> {product.duration || "-"} min</div>
                  <div><span className="font-medium">Capacidad:</span> {product.maxCapacity || "-"}</div>
                </div>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={importMutation.isPending}>
              {importMutation.isPending ? "Importando..." : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
