import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

export default function ActivarCuenta() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Verificar token
  const { data: verification, isLoading: verifying } = trpc.auth.verifyInvitation.useQuery(
    { token },
    { enabled: !!token }
  );

  const activateMutation = trpc.auth.activateAccount.useMutation({
    onSuccess: () => {
      toast.success("¡Cuenta activada exitosamente!");
      setLocation("/cms");
    },
    onError: (error) => {
      toast.error(error.message || "Error al activar la cuenta");
    },
  });

  useEffect(() => {
    if (verification?.valid && verification.user?.name) {
      setName(verification.user.name);
    }
  }, [verification]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    activateMutation.mutate({
      token,
      password,
      name: name || undefined,
    });
  };

  const getRoleBadge = (role: string) => {
    const labels: Record<string, string> = {
      super_admin: "Super Administrador",
      admin: "Administrador",
      user: "Usuario",
      seller: "Vendedor",
    };
    return labels[role] || role;
  };

  // Loading state
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-teal-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-teal-600" />
              <p className="text-muted-foreground">Verificando invitación...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid token
  if (!token || !verification?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-teal-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-2xl">Enlace inválido</CardTitle>
            <CardDescription>
              {verification?.error || "El enlace de invitación no es válido o ha expirado."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground mb-4">
              Si crees que esto es un error, contacta al administrador para que te envíe una nueva invitación.
            </p>
            <Button
              onClick={() => setLocation("/cms/login")}
              className="w-full"
              variant="outline"
            >
              Ir al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-teal-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-teal-100 dark:bg-teal-900 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-teal-600 dark:text-teal-400" />
          </div>
          <CardTitle className="text-2xl">Activa tu cuenta</CardTitle>
          <CardDescription>
            Has sido invitado como{" "}
            <span className="font-medium text-teal-600">
              {getRoleBadge(verification.user?.role || "user")}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={verification.user?.email || ""}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nombre completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Tu nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                  disabled={activateMutation.isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  disabled={activateMutation.isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Debe contener mayúscula, minúscula y número
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Repite la contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  disabled={activateMutation.isPending}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700"
              disabled={activateMutation.isPending}
            >
              {activateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Activando cuenta...
                </>
              ) : (
                "Activar mi cuenta"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
