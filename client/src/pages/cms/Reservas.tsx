import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Calendar, Users, Mail, Phone, MessageSquare, Check, X, Trash2, Download } from "lucide-react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

export default function CMSReservas() {
  const { user, loading: authLoading } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed" | "cancelled">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Queries
  const { data: bookings, isLoading, refetch } = trpc.bookings.list.useQuery();

  // Mutations
  const updateStatusMutation = trpc.bookings.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Estado actualizado");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al actualizar estado");
    },
  });

  const deleteMutation = trpc.bookings.delete.useMutation({
    onSuccess: () => {
      toast.success("Reserva eliminada");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar reserva");
    },
  });

  const bulkDeleteMutation = trpc.bookings.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} reservas eliminadas`);
      setSelectedIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar reservas");
    },
  });

  const bulkUpdateStatusMutation = trpc.bookings.bulkUpdateStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} reservas actualizadas`);
      setSelectedIds([]);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Error al actualizar reservas");
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
              No tienes permisos para ver las reservas.
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

  const filteredBookings = bookings?.filter((booking: any) => {
    if (statusFilter === "all") return true;
    return booking.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pendiente</Badge>;
      case "confirmed":
        return <Badge className="bg-green-600">Confirmada</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelada</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("es-CL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredBookings?.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredBookings?.map((b: any) => b.id) || []);
    }
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`¿Eliminar ${selectedIds.length} reservas seleccionadas?`)) {
      bulkDeleteMutation.mutate({ ids: selectedIds });
    }
  };

  const handleBulkUpdateStatus = (status: "pending" | "confirmed" | "cancelled") => {
    if (selectedIds.length === 0) return;
    bulkUpdateStatusMutation.mutate({ ids: selectedIds, status });
  };

  const handleExportCSV = () => {
    if (!filteredBookings || filteredBookings.length === 0) {
      toast.error("No hay reservas para exportar");
      return;
    }

    const selectedBookings = selectedIds.length > 0
      ? filteredBookings.filter((b: any) => selectedIds.includes(b.id))
      : filteredBookings;

    const headers = ["ID", "Nombre", "Email", "Teléfono", "Servicio", "Fecha Preferida", "Personas", "Mensaje", "Estado", "Fecha Creación"];
    const rows = selectedBookings.map((b: any) => [
      b.id,
      b.name,
      b.email,
      b.phone,
      b.serviceType,
      formatDate(b.preferredDate),
      b.numberOfPeople,
      b.message || "",
      b.status,
      new Date(b.createdAt).toLocaleString("es-CL"),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `reservas_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast.success(`${selectedBookings.length} reservas exportadas`);
  };

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reservas</h1>
            <p className="text-gray-600 mt-1">
              Gestiona las solicitudes de reserva recibidas
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/cms">Volver al Dashboard</Link>
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 mb-6">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
          >
            Todas
          </Button>
          <Button
            variant={statusFilter === "pending" ? "default" : "outline"}
            onClick={() => setStatusFilter("pending")}
          >
            Pendientes
          </Button>
          <Button
            variant={statusFilter === "confirmed" ? "default" : "outline"}
            onClick={() => setStatusFilter("confirmed")}
          >
            Confirmadas
          </Button>
          <Button
            variant={statusFilter === "cancelled" ? "default" : "outline"}
            onClick={() => setStatusFilter("cancelled")}
          >
            Canceladas
          </Button>
        </div>

        {/* Barra de acciones masivas */}
        {filteredBookings && filteredBookings.length > 0 && (
          <div className="bg-white border rounded-lg p-4 mb-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedIds.length === filteredBookings.length && filteredBookings.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm font-medium">
                {selectedIds.length > 0 ? `${selectedIds.length} seleccionadas` : "Seleccionar todas"}
              </span>
            </div>

            {selectedIds.length > 0 && (
              <>
                <div className="h-6 w-px bg-gray-300" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkUpdateStatus("confirmed")}
                  disabled={bulkUpdateStatusMutation.isPending}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Confirmar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkUpdateStatus("cancelled")}
                  disabled={bulkUpdateStatusMutation.isPending}
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancelar
                </Button>
                {user.role === "admin" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBulkDelete}
                    disabled={bulkDeleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Eliminar
                  </Button>
                )}
              </>
            )}

            <div className="ml-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportCSV}
              >
                <Download className="w-4 h-4 mr-1" />
                Exportar CSV
              </Button>
            </div>
          </div>
        )}

        {/* Lista de Reservas */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#44580E]" />
          </div>
        )}

        {!isLoading && (!filteredBookings || filteredBookings.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-600">No hay reservas {statusFilter !== "all" ? statusFilter + "s" : ""} aún.</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && filteredBookings && filteredBookings.length > 0 && (
          <div className="space-y-4">
            {filteredBookings.map((booking: any) => (
              <Card key={booking.id}>
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedIds.includes(booking.id)}
                      onCheckedChange={() => handleSelectOne(booking.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <CardTitle className="text-lg">{booking.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {booking.serviceType}
                      </CardDescription>
                    </div>
                    {getStatusBadge(booking.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span>{formatDate(booking.preferredDate)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4 text-gray-500" />
                        <span>{booking.numberOfPeople} persona{booking.numberOfPeople > 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-4 h-4 text-gray-500" />
                        <a href={`mailto:${booking.email}`} className="hover:underline">
                          {booking.email}
                        </a>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-gray-500" />
                        <a href={`tel:${booking.phone}`} className="hover:underline">
                          {booking.phone}
                        </a>
                      </div>
                    </div>
                  </div>

                  {booking.message && (
                    <div className="bg-gray-50 p-3 rounded-lg mb-4">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-500 mt-0.5" />
                        <p className="text-sm text-gray-700">{booking.message}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {booking.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ id: booking.id, status: "confirmed" })}
                          disabled={updateStatusMutation.isPending}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ id: booking.id, status: "cancelled" })}
                          disabled={updateStatusMutation.isPending}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancelar
                        </Button>
                      </>
                    )}
                    {user.role === "admin" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm("¿Eliminar esta reserva?")) {
                            deleteMutation.mutate({ id: booking.id });
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-3">
                    Recibida el {new Date(booking.createdAt).toLocaleString("es-CL")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
    </DashboardLayout>
  );
}
