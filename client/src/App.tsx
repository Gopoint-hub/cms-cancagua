import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// CMS Pages
import CMSDashboard from "./pages/cms/Dashboard";
import CMSUsuarios from "./pages/cms/Usuarios";
import CMSCarta from "./pages/cms/Carta";
import CMSReservas from "./pages/cms/Reservas";
import CMSMensajes from "./pages/cms/Mensajes";
import CMSProductosCorporativos from "./pages/cms/ProductosCorporativos";
import CMSCotizaciones from "./pages/cms/Cotizaciones";
import CMSCotizacionWizard from "./pages/cms/CotizacionWizard";
import CMSNegocios from "./pages/cms/Negocios";
import CMSServicios from "./pages/cms/Servicios";
import CMSEventos from "./pages/cms/Eventos";
import CMSClientes from "./pages/cms/Clientes";
import CMSNewsletter from "./pages/cms/Newsletter";
import CMSCrearNewsletter from "./pages/cms/CrearNewsletter";
import CMSSuscriptores from "./pages/cms/Suscriptores";
import CMSListas from "./pages/cms/Listas";
import CMSCodigosDescuento from "./pages/cms/CodigosDescuento";
import CMSAnalytics from "./pages/cms/Analytics";
import CMSConfiguracion from "./pages/cms/Configuracion";
import CMSCRMPipeline from "./pages/cms/CRMPipeline";
import CMSMarketingROI from "./pages/cms/MarketingROI";
import CMSTraducciones from "./pages/cms/Traducciones";
import CMSReportesMantencion from "./pages/cms/ReportesMantencion";
import CMSConciergeVenta from "./pages/cms/concierge/HerramientaVenta";
import CMSConciergeServicios from "./pages/cms/concierge/ServiciosDisponibles";
import CMSConciergeVendedores from "./pages/cms/concierge/Vendedores";
import CMSMisComisiones from "./pages/cms/concierge/MisComisiones";
import CMSIntegraciones from "./pages/cms/Integraciones";
import CMSGiftCardsSales from "./pages/cms/GiftCardsSales";
import CMSAyuda from "./pages/cms/Ayuda";
import CMSLogin from "./pages/cms/Login";
import CMSActivarCuenta from "./pages/cms/ActivarCuenta";
import CMSRecuperarContrasena from "./pages/cms/RecuperarContrasena";
import CMSRestablecerContrasena from "./pages/cms/RestablecerContrasena";

function Router() {
  return (
    <Switch>
      {/* Auth pages (no dashboard layout) */}
      <Route path="/cms/login" component={CMSLogin} />
      <Route path="/cms/activar-cuenta" component={CMSActivarCuenta} />
      <Route path="/cms/recuperar-contrasena" component={CMSRecuperarContrasena} />
      <Route path="/cms/restablecer-contrasena" component={CMSRestablecerContrasena} />

      {/* CMS Dashboard pages */}
      <Route path="/" component={CMSDashboard} />
      <Route path="/cms" component={CMSDashboard} />
      <Route path="/cms/usuarios" component={CMSUsuarios} />
      <Route path="/cms/carta" component={CMSCarta} />
      <Route path="/cms/reservas" component={CMSReservas} />
      <Route path="/cms/mensajes" component={CMSMensajes} />
      <Route path="/cms/productos-corporativos" component={CMSProductosCorporativos} />
      <Route path="/cms/cotizaciones" component={CMSCotizaciones} />
      <Route path="/cms/cotizacion-wizard" component={CMSCotizacionWizard} />
      <Route path="/cms/cotizacion-wizard/:id" component={CMSCotizacionWizard} />
      <Route path="/cms/negocios" component={CMSNegocios} />
      <Route path="/cms/servicios" component={CMSServicios} />
      <Route path="/cms/eventos" component={CMSEventos} />
      <Route path="/cms/clientes" component={CMSClientes} />
      <Route path="/cms/newsletter" component={CMSNewsletter} />
      <Route path="/cms/crear-newsletter" component={CMSCrearNewsletter} />
      <Route path="/cms/crear-newsletter/:id" component={CMSCrearNewsletter} />
      <Route path="/cms/suscriptores" component={CMSSuscriptores} />
      <Route path="/cms/listas" component={CMSListas} />
      <Route path="/cms/codigos-descuento" component={CMSCodigosDescuento} />
      <Route path="/cms/analytics" component={CMSAnalytics} />
      <Route path="/cms/configuracion" component={CMSConfiguracion} />
      <Route path="/cms/crm-pipeline" component={CMSCRMPipeline} />
      <Route path="/cms/marketing-roi" component={CMSMarketingROI} />
      <Route path="/cms/integraciones" component={CMSIntegraciones} />
      <Route path="/cms/gift-cards-sales" component={CMSGiftCardsSales} />
      <Route path="/cms/traducciones" component={CMSTraducciones} />
      <Route path="/cms/reportes-mantencion" component={CMSReportesMantencion} />
      {/* Módulo Concierge */}
      <Route path="/cms/concierge" component={CMSConciergeVenta} />
      <Route path="/cms/concierge/venta" component={CMSConciergeVenta} />
      <Route path="/cms/concierge/servicios" component={CMSConciergeServicios} />
      <Route path="/cms/concierge/vendedores" component={CMSConciergeVendedores} />
      <Route path="/cms/concierge/mis-comisiones" component={CMSMisComisiones} />
      <Route path="/cms/ayuda" component={CMSAyuda} />

      {/* Fallback */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
