import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Download, RefreshCw } from "lucide-react";

const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
const monthStart = () => `${today().slice(0, 7)}-01`;
const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const labels: Record<string, string> = {
  initiating: "Iniciando",
  payment_pending: "Pago pendiente",
  paid: "Pagada",
  rejected: "Rechazada",
  aborted: "Abortada",
  timeout: "Expirada",
  expired: "Expirada",
  failed: "Error",
};

export default function BiopiscinasSales() {
  const pageSize = 15;
  const [from, setFrom] = React.useState(monthStart());
  const [to, setTo] = React.useState(today());
  const [page, setPage] = React.useState(1);
  const query = trpc.biopools.sales.list.useQuery({ from, to });
  const rows = query.data ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  React.useEffect(() => setPage(1), [from, to]);
  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const paid = rows.filter(row => row.order.status === "paid");
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const data = rows.map(({ order, bookingCode, serviceName }) => ({
      "Fecha venta": new Date(order.createdAt).toLocaleString("es-CL"),
      "Código reserva": bookingCode ?? "",
      Servicio: serviceName,
      Estado: labels[order.status] ?? order.status,
      Cliente: order.clientName,
      Email: order.clientEmail,
      Teléfono: order.clientPhone,
      "Fecha visita": String(order.bookingDate).slice(0, 10),
      "Hora ingreso": order.startTime,
      Adultos: order.adultQuantity,
      Niños: order.childQuantity,
      "Total personas": order.totalGuests,
      Subtotal: order.subtotalClp,
      Descuento: order.discountClp,
      "Código de descuento": order.discountCode ?? "",
      "Total pagado": order.status === "paid" ? order.totalClp : 0,
      "Medio de pago": "Webpay Plus",
      "Orden Transbank": order.buyOrder ?? "",
      Autorización: order.authorizationCode ?? "",
      "Últimos 4 tarjeta": order.cardNumber ?? "",
      "UTM source": order.utmSource ?? "",
      "UTM medium": order.utmMedium ?? "",
      "UTM campaign": order.utmCampaign ?? "",
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(data),
      "Ventas Biopiscinas"
    );
    XLSX.writeFile(book, `ventas-biopiscinas-${from}-${to}.xlsx`);
  };
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              Ventas Biopiscinas
            </h1>
            <p className="text-muted-foreground">
              Pagos Webpay Plus y reservas generadas desde el carrito.
            </p>
          </div>
          <Button
            className="h-11 w-full sm:h-9 sm:w-auto"
            onClick={exportExcel}
            disabled={!rows.length}
          >
            <Download className="mr-2 h-4 w-4" />
            Descargar Excel
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Input
            type="date"
            aria-label="Fecha inicial"
            className="h-11 w-full sm:h-9 sm:w-44"
            value={from}
            onChange={event => setFrom(event.target.value)}
          />
          <Input
            type="date"
            aria-label="Fecha final"
            className="h-11 w-full sm:h-9 sm:w-44"
            value={to}
            onChange={event => setTo(event.target.value)}
          />
          <Button
            variant="outline"
            className="h-11 w-full sm:h-9 sm:w-auto"
            onClick={() => query.refetch()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ventas aprobadas</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">
              {paid.length}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ingresos</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold text-emerald-700">
              {clp.format(
                paid.reduce((sum, row) => sum + row.order.totalClp, 0)
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Personas reservadas</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">
              {paid.reduce((sum, row) => sum + row.order.totalGuests, 0)}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3 md:hidden">
          {visibleRows.map(({ order, bookingCode, serviceName }) => (
            <Card key={order.id}>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Fecha de venta
                    </p>
                    <p className="text-sm font-medium">
                      {new Date(order.createdAt).toLocaleString("es-CL")}
                    </p>
                  </div>
                  <Badge
                    variant={order.status === "paid" ? "default" : "secondary"}
                  >
                    {labels[order.status] ?? order.status}
                  </Badge>
                </div>

                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Servicio</p>
                  <p className="font-semibold">{serviceName}</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    Reserva: {bookingCode ?? order.buyOrder ?? "—"}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-semibold">{order.clientName}</p>
                  <p className="break-all text-sm text-muted-foreground">
                    {order.clientEmail}
                  </p>
                </div>

                <div className="grid gap-3 border-y py-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Visita</p>
                    <p className="text-sm font-medium">
                      {String(order.bookingDate).slice(0, 10)} ·{" "}
                      {order.startTime}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Personas</p>
                    <p className="text-sm font-medium">{order.totalGuests}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-xl font-semibold">
                      {clp.format(order.totalClp)}
                    </p>
                  </div>
                  {order.discountCode && (
                    <p className="text-sm text-emerald-700">
                      Código: {order.discountCode}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {!rows.length && (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                No hay transacciones en el período.
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="hidden md:block">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-3 text-left">Fecha</th>
                  <th className="p-3 text-left">Reserva</th>
                  <th className="p-3 text-left">Servicio</th>
                  <th className="p-3 text-left">Cliente</th>
                  <th className="p-3 text-left">Visita</th>
                  <th className="p-3 text-right">Personas</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ order, bookingCode, serviceName }) => (
                  <tr key={order.id} className="border-b">
                    <td className="p-3">
                      {new Date(order.createdAt).toLocaleString("es-CL")}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {bookingCode ?? order.buyOrder ?? "—"}
                    </td>
                    <td className="p-3">{serviceName}</td>
                    <td className="p-3">
                      <strong>{order.clientName}</strong>
                      <br />
                      <span className="text-muted-foreground">
                        {order.clientEmail}
                      </span>
                    </td>
                    <td className="p-3">
                      {String(order.bookingDate).slice(0, 10)} ·{" "}
                      {order.startTime}
                    </td>
                    <td className="p-3 text-right">{order.totalGuests}</td>
                    <td className="p-3 text-right font-semibold">
                      {clp.format(order.totalClp)}
                      {order.discountCode && (
                        <span className="block text-xs font-normal text-emerald-700">
                          Código: {order.discountCode}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          order.status === "paid" ? "default" : "secondary"
                        }
                      >
                        {labels[order.status] ?? order.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-10 text-center text-muted-foreground"
                    >
                      No hay transacciones en el período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {rows.length > pageSize && (
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-center text-sm text-muted-foreground sm:text-left">
              Mostrando {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, rows.length)} de {rows.length}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                className="order-2 h-11 w-full sm:order-none sm:h-9 sm:w-auto"
                disabled={page === 1}
                onClick={() => setPage(value => value - 1)}
              >
                Anterior
              </Button>
              <span className="order-1 text-center text-sm sm:order-none">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                className="order-3 h-11 w-full sm:order-none sm:h-9 sm:w-auto"
                disabled={page === totalPages}
                onClick={() => setPage(value => value + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
