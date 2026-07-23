import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, CalendarCheck, CalendarPlus, Users, Clock, TrendingUp, UserX, Send, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { CANCAGUA_STAFF_ROLE } from "@shared/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import SkeduProgramBookingDialog from "./SkeduProgramBookingDialog";

const STOCK_PAGE_SIZE = 5;

export default function MasajesDashboard() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const today = format(new Date(), "yyyy-MM-dd");
  const [stockPage, setStockPage] = useState(0);
  const [skeduDialogOpen, setSkeduDialogOpen] = useState(false);
  const { data: bookings, isLoading: loadingBookings } = trpc.masajes.agenda.getByDateRange.useQuery(
    { from: today, to: today }
  );
  const { data: lowStock, isLoading: loadingStock } = trpc.masajes.inventario.getLowStock.useQuery();
  const { data: therapists, isLoading: loadingTherapists } = trpc.masajes.terapeutas.getAll.useQuery();

  const { data: pendingAssignment, isLoading: loadingPending } = trpc.masajes.agenda.getPendingManualAssignment.useQuery();
  const notifyMut = trpc.masajes.agenda.notifyFreelanceTherapist.useMutation({
    onSuccess: () => {
      utils.masajes.agenda.getPendingManualAssignment.invalidate();
      toast.success("WhatsApp enviado al terapeuta");
    },
    onError: e => toast.error(e.message),
  });
  const dismissMut = trpc.masajes.agenda.dismissPendingManualAssignment.useMutation({
    onSuccess: () => {
      utils.masajes.agenda.getPendingManualAssignment.invalidate();
      toast.success("Reserva eliminada de asignaciones pendientes");
    },
    onError: e => toast.error(e.message),
  });

  const confirmed = bookings?.filter(b => b.status === "confirmed" || b.status === "pending") ?? [];
  const activeTherapists = therapists?.filter(t => t.active === 1) ?? [];
  const todayRevenue = bookings
    ?.filter(b => b.paymentStatus === "paid" && b.status === "completed")
    .reduce((sum, b) => sum + Number(b.amountPaid ?? 0), 0) ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Área de Masajes</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>
          <Button onClick={() => setSkeduDialogOpen(true)}>
            <CalendarPlus className="w-4 h-4 mr-2" /> Agregar programa Skedu
          </Button>
        </div>

        {/* KPIs del día */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CalendarCheck className="w-4 h-4" /> Reservas hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBookings ? <Skeleton className="h-8 w-12" /> : (
                <span className="text-3xl font-bold">{confirmed.length}</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Terapeutas activos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTherapists ? <Skeleton className="h-8 w-12" /> : (
                <span className="text-3xl font-bold">{activeTherapists.length}</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Ventas del día
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBookings ? <Skeleton className="h-8 w-24" /> : (
                <>
                  <span className="text-3xl font-bold text-green-600">
                    $ {todayRevenue.toLocaleString("es-CL")}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Masajes completados hoy</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" /> Próximo masaje
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBookings ? <Skeleton className="h-8 w-16" /> : (
                <span className="text-3xl font-bold">
                  {confirmed[0]?.startTime ?? "—"}
                </span>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Asignación manual pendiente — siempre visible */}
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex flex-wrap items-center gap-2 text-amber-800">
              <UserX className="w-5 h-5" />
              Asignación manual pendiente
              {!loadingPending && pendingAssignment && pendingAssignment.length > 0 && (
                <Badge variant="outline" className="ml-1 border-amber-400 text-amber-800 bg-amber-100">
                  {pendingAssignment.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPending ? (
              <div className="space-y-2">
                {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : !pendingAssignment || pendingAssignment.length === 0 ? (
              <p className="text-sm text-amber-700/60 text-center py-3">Sin reservas pendientes de asignación</p>
            ) : (
              <div className="space-y-2">
                {pendingAssignment.map(b => {
                  const reason =
                    b.freelanceApprovalStatus === "therapist_rejected" ? "Terapeuta rechazó — reasignar" :
                    b.freelanceApprovalStatus === "admin_approved" ? "⏳ Esperando respuesta del terapeuta" :
                    b.freelanceApprovalStatus === "admin_rejected" ? "Sin terapeuta disponible" :
                    "Sin terapeuta asignado";
                  return (
                    <div key={b.id} className="flex flex-col items-stretch gap-3 rounded-lg border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{b.clientName}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.techniqueName} · {b.duration} min · {b.bookingDate} {b.startTime}
                        </p>
                        <p className="text-xs text-amber-700 mt-0.5">{reason}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 sm:ml-3 sm:shrink-0 sm:flex-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs border-amber-400 hover:bg-amber-100 sm:flex-none"
                          onClick={() => notifyMut.mutate({ bookingId: b.id })}
                          disabled={notifyMut.isPending}
                          title="Enviar WhatsApp de confirmación al terapeuta asignado"
                        >
                          <Send className="w-3 h-3 mr-1" />
                          Notificar
                        </Button>
                        <Link href={`/cms/masajes/agenda?date=${b.bookingDate}`}>
                          <Button variant="outline" size="sm" className="w-full text-xs border-amber-400 hover:bg-amber-100 sm:w-auto">
                            Asignar
                          </Button>
                        </Link>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 sm:flex-none"
                              disabled={dismissMut.isPending}
                              title="Eliminar de asignaciones pendientes"
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Eliminar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar esta asignación pendiente?</AlertDialogTitle>
                              <AlertDialogDescription>
                                La reserva de {b.clientName} se quitará de este listado y quedará
                                registrada como cancelada en el historial. Esta acción no elimina
                                el registro del pago.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Volver</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 text-white hover:bg-red-700"
                                onClick={() => dismissMut.mutate({ bookingId: b.id })}
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agenda del día */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
                Reservas de hoy
                <Link href="/cms/masajes/agenda">
                  <span className="text-sm font-normal text-primary cursor-pointer hover:underline">Ver agenda completa →</span>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBookings ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : confirmed.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Sin reservas para hoy</p>
              ) : (
                <div className="space-y-3">
                  {confirmed.map(b => (
                    <div key={`${b.bookingKind}-${b.id}`} className="flex items-start justify-between border rounded-lg p-3">
                      <div>
                        <p className="font-medium text-sm flex items-center gap-2">
                          {b.clientName}
                          {b.bookingKind === "skedu_program" && <Badge variant="outline" className="text-[10px] border-violet-400 text-violet-700">Skedu</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {b.techniqueName} · {b.duration} min · {b.roomName}
                        </p>
                        {b.therapistName && (
                          <p className="text-xs text-muted-foreground">
                            Terapeuta{b.secondTherapistName ? "s" : ""}: {b.therapistName}{b.secondTherapistName ? ` + ${b.secondTherapistName}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{b.startTime}</p>
                        <Badge variant={b.status === "confirmed" ? "default" : "secondary"} className="text-xs mt-1">
                          {b.status === "confirmed" ? "Confirmada" : "Pendiente"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alertas de stock */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1">
                  {(lowStock?.length ?? 0) > 0 && <AlertTriangle className="w-4 h-4 text-destructive" />}
                  Stock bajo
                  {(lowStock?.length ?? 0) > 0 && (
                    <Badge variant="destructive" className="text-xs ml-1">{lowStock!.length}</Badge>
                  )}
                </span>
                <Link href="/cms/masajes/inventario">
                  <span className="text-sm font-normal text-primary cursor-pointer hover:underline">Ver inventario →</span>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingStock ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (lowStock?.length ?? 0) === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Todo el stock está en orden ✓</p>
              ) : (() => {
                const totalPages = Math.ceil(lowStock!.length / STOCK_PAGE_SIZE);
                const paginated = lowStock!.slice(stockPage * STOCK_PAGE_SIZE, (stockPage + 1) * STOCK_PAGE_SIZE);
                return (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {paginated.map(s => (
                        <div key={s.id} className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-sm font-medium">{s.name}</span>
                          <span className="text-sm text-destructive font-semibold whitespace-nowrap ml-2">
                            {s.currentStock} {s.unit} (mín: {s.minimumStock})
                          </span>
                        </div>
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" disabled={stockPage === 0} onClick={() => setStockPage(p => p - 1)}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {stockPage + 1} / {totalPages}
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 px-2" disabled={stockPage === totalPages - 1} onClick={() => setStockPage(p => p + 1)}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Links rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { href: "/cms/masajes/agenda", label: "Agenda" },
            { href: "/cms/masajes/terapeutas", label: "Terapeutas" },
            { href: "/cms/masajes/tecnicas", label: "Técnicas" },
            { href: "/cms/masajes/inventario", label: "Inventario" },
            { href: "/cms/masajes/clientes", label: "Clientes" },
            { href: "/cms/masajes/analytics", label: "Ventas" },
            { href: "/cms/masajes/rrhh", label: "RRHH" },
          ].filter(link => user?.role !== CANCAGUA_STAFF_ROLE || link.href === "/cms/masajes/agenda").map(link => (
            <Link key={link.href} href={link.href}>
              <Card className="cursor-pointer hover:border-primary transition-colors">
                <CardContent className="p-4 text-center">
                  <span className="text-sm font-medium">{link.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
      <SkeduProgramBookingDialog
        open={skeduDialogOpen}
        onOpenChange={setSkeduDialogOpen}
        initialDate={today}
        onCreated={() => utils.masajes.agenda.getByDateRange.invalidate()}
      />
    </DashboardLayout>
  );
}
