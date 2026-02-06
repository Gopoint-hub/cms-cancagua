import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Plus, Pencil, Trash2, Copy, Tag, TrendingUp, Users, Calendar,
  Percent, DollarSign, Check, X, Eye, EyeOff
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

export default function CMSCodigosDescuento() {
  const { user, loading: authLoading } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [editingCode, setEditingCode] = useState<any>(null);
  
  // Form state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [minPurchase, setMinPurchase] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [maxUsesPerUser, setMaxUsesPerUser] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [applicableServices, setApplicableServices] = useState("all");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [active, setActive] = useState(true);

  // Queries
  const { data: codes = [], refetch } = trpc.discountCodes.getAll.useQuery();
  
  // Mutations
  const createMutation = trpc.discountCodes.create.useMutation({
    onSuccess: () => {
      toast.success("Código de descuento creado exitosamente");
      refetch();
      closeDialog();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const updateMutation = trpc.discountCodes.update.useMutation({
    onSuccess: () => {
      toast.success("Código actualizado exitosamente");
      refetch();
      closeDialog();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const deleteMutation = trpc.discountCodes.delete.useMutation({
    onSuccess: () => {
      toast.success("Código eliminado exitosamente");
      refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      code: code.toUpperCase(),
      name,
      description,
      discountType,
      discountValue: parseInt(discountValue),
      minPurchase: minPurchase ? parseInt(minPurchase) : 0,
      maxDiscount: maxDiscount ? parseInt(maxDiscount) : undefined,
      maxUses: maxUses ? parseInt(maxUses) : undefined,
      maxUsesPerUser: parseInt(maxUsesPerUser),
      startsAt: startsAt ? new Date(startsAt) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      applicableServices: [applicableServices],
      assignedUserId: assignedUserId ? parseInt(assignedUserId) : undefined,
      active: active ? 1 : 0,
    };

    if (editingCode) {
      updateMutation.mutate({ id: editingCode.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openDialog = (codeToEdit?: any) => {
    if (codeToEdit) {
      setEditingCode(codeToEdit);
      setCode(codeToEdit.code);
      setName(codeToEdit.name);
      setDescription(codeToEdit.description || "");
      setDiscountType(codeToEdit.discountType);
      setDiscountValue(codeToEdit.discountValue.toString());
      setMinPurchase(codeToEdit.minPurchase?.toString() || "");
      setMaxDiscount(codeToEdit.maxDiscount?.toString() || "");
      setMaxUses(codeToEdit.maxUses?.toString() || "");
      setMaxUsesPerUser(codeToEdit.maxUsesPerUser.toString());
      setStartsAt(codeToEdit.startsAt ? new Date(codeToEdit.startsAt).toISOString().slice(0, 16) : "");
      setExpiresAt(codeToEdit.expiresAt ? new Date(codeToEdit.expiresAt).toISOString().slice(0, 16) : "");
      setApplicableServices(codeToEdit.applicableServices || "all");
      setAssignedUserId(codeToEdit.assignedUserId?.toString() || "");
      setActive(codeToEdit.active === 1);
    }
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingCode(null);
    setCode("");
    setName("");
    setDescription("");
    setDiscountType("percentage");
    setDiscountValue("");
    setMinPurchase("");
    setMaxDiscount("");
    setMaxUses("");
    setMaxUsesPerUser("1");
    setStartsAt("");
    setExpiresAt("");
    setApplicableServices("all");
    setAssignedUserId("");
    setActive(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro de eliminar este código de descuento?")) {
      deleteMutation.mutate({ id });
    }
  };

  const copyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    toast.success("Código copiado al portapapeles");
  };

  const getStatusBadge = (codeItem: any) => {
    const now = new Date();
    const startsAt = codeItem.startsAt ? new Date(codeItem.startsAt) : null;
    const expiresAt = codeItem.expiresAt ? new Date(codeItem.expiresAt) : null;

    if (codeItem.active !== 1) {
      return <Badge variant="secondary" className="flex items-center gap-1"><EyeOff className="w-3 h-3" /> Inactivo</Badge>;
    }

    if (startsAt && startsAt > now) {
      return <Badge variant="outline" className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Programado</Badge>;
    }

    if (expiresAt && expiresAt < now) {
      return <Badge variant="destructive" className="flex items-center gap-1"><X className="w-3 h-3" /> Expirado</Badge>;
    }

    if (codeItem.maxUses && codeItem.currentUses >= codeItem.maxUses) {
      return <Badge variant="destructive" className="flex items-center gap-1"><X className="w-3 h-3" /> Agotado</Badge>;
    }

    return <Badge variant="default" className="bg-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> Activo</Badge>;
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p>Cargando...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!user || (user.role !== "super_admin" && user.role !== "admin" && user.role !== "editor")) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p>No tienes permisos para acceder a esta sección</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Códigos Dcto.</h1>
            <p className="text-muted-foreground mt-1">
              Administra códigos promocionales y descuentos
            </p>
          </div>
          <Button onClick={() => openDialog()} className="bg-[#44580E] hover:bg-[#3a4c0c]">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Código
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Códigos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{codes.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Activos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {codes.filter(c => c.active === 1 && (!c.expiresAt || new Date(c.expiresAt) > new Date())).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Usos Totales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {codes.reduce((sum, c) => sum + (c.currentUses || 0), 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expirados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {codes.filter(c => c.expiresAt && new Date(c.expiresAt) < new Date()).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Codes List */}
        <Card>
          <CardHeader>
            <CardTitle>Códigos de Descuento</CardTitle>
            <CardDescription>
              Lista de todos los códigos promocionales creados
            </CardDescription>
          </CardHeader>
          <CardContent>
            {codes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No hay códigos de descuento creados</p>
                <Button 
                  onClick={() => openDialog()} 
                  variant="outline" 
                  className="mt-4"
                >
                  Crear primer código
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {codes.map((codeItem) => (
                  <div
                    key={codeItem.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <code className="text-lg font-mono font-bold bg-gray-100 px-3 py-1 rounded">
                            {codeItem.code}
                          </code>
                          {getStatusBadge(codeItem)}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyCode(codeItem.code)}
                            className="h-7"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <h3 className="font-semibold">{codeItem.name}</h3>
                        {codeItem.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {codeItem.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 mt-3 text-sm">
                          <div className="flex items-center gap-1">
                            {codeItem.discountType === "percentage" ? (
                              <>
                                <Percent className="w-4 h-4 text-[#44580E]" />
                                <span>{codeItem.discountValue}% de descuento</span>
                              </>
                            ) : (
                              <>
                                <DollarSign className="w-4 h-4 text-[#44580E]" />
                                <span>${codeItem.discountValue.toLocaleString()} CLP</span>
                              </>
                            )}
                          </div>
                          {codeItem.maxUses && (
                            <div className="flex items-center gap-1">
                              <TrendingUp className="w-4 h-4 text-blue-600" />
                              <span>{codeItem.currentUses || 0} / {codeItem.maxUses} usos</span>
                            </div>
                          )}
                          {codeItem.assignedUserId && (
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4 text-purple-600" />
                              <span>Usuario específico</span>
                            </div>
                          )}
                          {codeItem.expiresAt && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4 text-orange-600" />
                              <span>Expira: {new Date(codeItem.expiresAt).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDialog(codeItem)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(codeItem.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCode ? "Editar Código de Descuento" : "Nuevo Código de Descuento"}
            </DialogTitle>
            <DialogDescription>
              Configura los parámetros del código promocional
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="BIENVENIDO_CANCAGUA"
                  required
                  className="font-mono"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Descuento de bienvenida"
                  required
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="15% de descuento en primera reserva"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="discountType">Tipo de Descuento *</Label>
                <Select value={discountType} onValueChange={(value: "percentage" | "fixed") => setDiscountType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                    <SelectItem value="fixed">Monto Fijo (CLP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="discountValue">
                  {discountType === "percentage" ? "Porcentaje *" : "Monto *"}
                </Label>
                <Input
                  id="discountValue"
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === "percentage" ? "15" : "5000"}
                  required
                  min="0"
                  max={discountType === "percentage" ? "100" : undefined}
                />
              </div>

              <div>
                <Label htmlFor="minPurchase">Compra Mínima (CLP)</Label>
                <Input
                  id="minPurchase"
                  type="number"
                  value={minPurchase}
                  onChange={(e) => setMinPurchase(e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>

              {discountType === "percentage" && (
                <div>
                  <Label htmlFor="maxDiscount">Descuento Máximo (CLP)</Label>
                  <Input
                    id="maxDiscount"
                    type="number"
                    value={maxDiscount}
                    onChange={(e) => setMaxDiscount(e.target.value)}
                    placeholder="Sin límite"
                    min="0"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="maxUses">Usos Totales Máximos</Label>
                <Input
                  id="maxUses"
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Ilimitado"
                  min="1"
                />
              </div>

              <div>
                <Label htmlFor="maxUsesPerUser">Usos por Usuario *</Label>
                <Input
                  id="maxUsesPerUser"
                  type="number"
                  value={maxUsesPerUser}
                  onChange={(e) => setMaxUsesPerUser(e.target.value)}
                  required
                  min="1"
                />
              </div>

              <div>
                <Label htmlFor="startsAt">Fecha de Inicio</Label>
                <Input
                  id="startsAt"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="expiresAt">Fecha de Expiración</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="applicableServices">Servicios Aplicables</Label>
                <Select value={applicableServices} onValueChange={setApplicableServices}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los servicios</SelectItem>
                    <SelectItem value="biopiscinas">Solo Biopiscinas</SelectItem>
                    <SelectItem value="masajes">Solo Masajes</SelectItem>
                    <SelectItem value="clases">Solo Clases</SelectItem>
                    <SelectItem value="giftcards">Solo Gift Cards</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <Label htmlFor="assignedUserId">ID Usuario Específico (opcional)</Label>
                <Input
                  id="assignedUserId"
                  type="number"
                  value={assignedUserId}
                  onChange={(e) => setAssignedUserId(e.target.value)}
                  placeholder="Dejar vacío para uso general"
                  min="1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Si se especifica, solo ese usuario podrá usar el código
                </p>
              </div>

              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="active" className="cursor-pointer">
                  Código activo
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-[#44580E] hover:bg-[#3a4c0c]"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingCode ? "Actualizar" : "Crear"} Código
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
