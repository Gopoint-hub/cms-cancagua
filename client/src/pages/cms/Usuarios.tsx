import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Crown,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Store,
  Trash2,
  User,
  UserCog,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserRole = "super_admin" | "admin" | "user" | "seller";
type UserStatus = "active" | "pending" | "inactive";

export default function CMSUsuarios() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Form state for invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("user");

  const utils = trpc.useUtils();
  const { data: users, isLoading: usersLoading } = trpc.users.list.useQuery(undefined, {
    enabled: !!user && (user.role === "admin" || user.role === "super_admin"),
  });

  const inviteMutation = trpc.users.invite.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.emailSent
          ? "Usuario invitado exitosamente. Se envió un email de invitación."
          : "Usuario creado, pero hubo un problema al enviar el email."
      );
      utils.users.list.invalidate();
      setIsInviteDialogOpen(false);
      resetInviteForm();
    },
    onError: (error) => {
      toast.error(error.message || "Error al invitar usuario");
    },
  });

  const resendInvitationMutation = trpc.users.resendInvitation.useMutation({
    onSuccess: () => {
      toast.success("Invitación reenviada exitosamente");
    },
    onError: (error) => {
      toast.error(error.message || "Error al reenviar invitación");
    },
  });

  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Rol actualizado exitosamente");
      utils.users.list.invalidate();
      setIsRoleDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Error al actualizar rol");
    },
  });

  const updateStatusMutation = trpc.users.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Estado actualizado exitosamente");
      utils.users.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Error al actualizar estado");
    },
  });

  const deleteUserMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success("Usuario eliminado exitosamente");
      utils.users.list.invalidate();
      setIsDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar usuario");
    },
  });

  const resetInviteForm = () => {
    setInviteEmail("");
    setInviteName("");
    setInviteRole("user");
  };

  if (loading || usersLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Cargando...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Acceso Denegado</CardTitle>
              <CardDescription>
                Solo administradores pueden gestionar usuarios.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setLocation("/cms")} className="w-full">
                Volver al Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const getRoleBadge = (role: string) => {
    const config: Record<string, { style: string; label: string; icon: any }> = {
      super_admin: {
        style: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
        label: "Super Admin",
        icon: Crown,
      },
      admin: {
        style: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        label: "Administrador",
        icon: ShieldCheck,
      },
      user: {
        style: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
        label: "Usuario",
        icon: User,
      },
      seller: {
        style: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        label: "Vendedor",
        icon: Store,
      },
    };

    const { style, label, icon: Icon } = config[role] || config.user;

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
        <Icon className="h-3 w-3" />
        {label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { style: string; label: string }> = {
      active: {
        style: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        label: "Activo",
      },
      pending: {
        style: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
        label: "Pendiente",
      },
      inactive: {
        style: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
        label: "Inactivo",
      },
    };

    const { style, label } = config[status] || config.inactive;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
        {label}
      </span>
    );
  };

  const canManageUser = (targetUser: any) => {
    if (user.id === targetUser.id) return false;
    if (user.role === "super_admin") return true;
    if (user.role === "admin" && targetUser.role !== "super_admin") return true;
    return false;
  };

  const canAssignRole = (role: UserRole) => {
    if (user.role === "super_admin") return true;
    if (user.role === "admin" && role !== "super_admin") return true;
    return false;
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) {
      toast.error("Por favor completa todos los campos");
      return;
    }
    inviteMutation.mutate({
      email: inviteEmail,
      name: inviteName,
      role: inviteRole,
    });
  };

  const handleChangeRole = (newRole: UserRole) => {
    if (!selectedUser) return;
    updateRoleMutation.mutate({
      userId: selectedUser.id,
      role: newRole,
    });
  };

  const handleToggleStatus = (targetUser: any) => {
    const newStatus = targetUser.status === "active" ? "inactive" : "active";
    updateStatusMutation.mutate({
      userId: targetUser.id,
      status: newStatus,
    });
  };

  const handleDeleteUser = () => {
    if (!selectedUser) return;
    deleteUserMutation.mutate({ userId: selectedUser.id });
  };

  const filteredUsers = (users || []).filter(
    (u) =>
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-muted/30">
        {/* Header */}
        <header className="border-b bg-background">
          <div className="container flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/cms")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
            </div>
            <Button onClick={() => setIsInviteDialogOpen(true)} className="bg-teal-600 hover:bg-teal-700">
              <UserPlus className="h-4 w-4 mr-2" />
              Invitar Usuario
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="container py-8">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <CardTitle>Usuarios del Sistema</CardTitle>
                  <CardDescription>
                    Gestiona los usuarios y sus roles de acceso al CMS
                  </CardDescription>
                </div>
                <div className="text-sm text-muted-foreground">
                  Total: {users?.length || 0} usuarios
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Búsqueda */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre o email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Tabla de usuarios */}
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Último acceso</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <p className="text-muted-foreground">No se encontraron usuarios</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {u.name || "Sin nombre"}
                              {u.id === user.id && (
                                <span className="text-xs text-muted-foreground">(Tú)</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{u.email || "Sin email"}</TableCell>
                          <TableCell>{getRoleBadge(u.role)}</TableCell>
                          <TableCell>{getStatusBadge(u.status)}</TableCell>
                          <TableCell>
                            {u.lastSignedIn
                              ? new Date(u.lastSignedIn).toLocaleDateString("es-CL")
                              : "Nunca"}
                          </TableCell>
                          <TableCell className="text-right">
                            {canManageUser(u) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUser(u);
                                      setIsRoleDialogOpen(true);
                                    }}
                                  >
                                    <UserCog className="h-4 w-4 mr-2" />
                                    Cambiar Rol
                                  </DropdownMenuItem>
                                  
                                  {u.status === "pending" && (
                                    <DropdownMenuItem
                                      onClick={() => resendInvitationMutation.mutate({ userId: u.id })}
                                    >
                                      <RefreshCw className="h-4 w-4 mr-2" />
                                      Reenviar Invitación
                                    </DropdownMenuItem>
                                  )}
                                  
                                  {u.status !== "pending" && (
                                    <DropdownMenuItem onClick={() => handleToggleStatus(u)}>
                                      <Shield className="h-4 w-4 mr-2" />
                                      {u.status === "active" ? "Desactivar" : "Activar"}
                                    </DropdownMenuItem>
                                  )}
                                  
                                  <DropdownMenuSeparator />
                                  
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => {
                                      setSelectedUser(u);
                                      setIsDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Eliminar
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Info de roles */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Crown className="h-4 w-4 text-purple-500" />
                      Super Admin
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Acceso total. No puede ser modificado por administradores.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-red-500" />
                      Administrador
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Acceso completo al CMS. Puede gestionar usuarios excepto super admins.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-500" />
                      Usuario
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Acceso a módulos específicos asignados.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Store className="h-4 w-4 text-green-500" />
                      Vendedor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      Acceso a módulos de ventas y cotizaciones.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dialog: Invitar Usuario */}
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invitar nuevo usuario</DialogTitle>
              <DialogDescription>
                Se enviará un email de invitación para que el usuario active su cuenta.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="inviteName">Nombre</Label>
                  <Input
                    id="inviteName"
                    placeholder="Nombre completo"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail">Email</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="email@ejemplo.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteRole">Rol</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {canAssignRole("super_admin") && (
                        <SelectItem value="super_admin">Super Administrador</SelectItem>
                      )}
                      {canAssignRole("admin") && (
                        <SelectItem value="admin">Administrador</SelectItem>
                      )}
                      <SelectItem value="user">Usuario</SelectItem>
                      <SelectItem value="seller">Vendedor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Enviar invitación
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog: Cambiar Rol */}
        <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cambiar rol de usuario</DialogTitle>
              <DialogDescription>
                Selecciona el nuevo rol para {selectedUser?.name || selectedUser?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Select
                value={selectedUser?.role}
                onValueChange={(v) => handleChangeRole(v as UserRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {canAssignRole("super_admin") && (
                    <SelectItem value="super_admin">Super Administrador</SelectItem>
                  )}
                  {canAssignRole("admin") && (
                    <SelectItem value="admin">Administrador</SelectItem>
                  )}
                  <SelectItem value="user">Usuario</SelectItem>
                  <SelectItem value="seller">Vendedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
                Cancelar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Eliminar Usuario */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar usuario</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que deseas eliminar a {selectedUser?.name || selectedUser?.email}?
                Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteUser}
                disabled={deleteUserMutation.isPending}
              >
                {deleteUserMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
