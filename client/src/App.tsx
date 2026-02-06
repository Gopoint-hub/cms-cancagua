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
import CMSB2C from "./pages/cms/B2C";
import CMSB2B from "./pages/cms/B2B";
import CMSMarketing from "./pages/cms/Marketing";
import CMSMarketingROI from "./pages/cms/MarketingROI";
import CMSMetricas from "./pages/cms/Metricas";
import CMSAdmin from "./pages/cms/Admin";
import CMSTraducciones from "./pages/cms/Traducciones";
import CMSReportesMantencion from "./pages/cms/ReportesMantencion";
import CMSIntegraciones from "./pages/cms/Integraciones";
import CMSGiftCardsSales from "./pages/cms/GiftCardsSales";
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
      <Route path="/cms/suscriptores" component={CMSSuscriptores} />
      <Route path="/cms/listas" component={CMSListas} />
      <Route path="/cms/codigos-descuento" component={CMSCodigosDescuento} />
      <Route path="/cms/analytics" component={CMSAnalytics} />
      <Route path="/cms/configuracion" component={CMSConfiguracion} />
      <Route path="/cms/crm-pipeline" component={CMSCRMPipeline} />
      <Route path="/cms/b2c" component={CMSB2C} />
      <Route path="/cms/b2b" component={CMSB2B} />
      <Route path="/cms/marketing" component={CMSMarketing} />
      <Route path="/cms/marketing-roi" component={CMSMarketingROI} />
      <Route path="/cms/metricas" component={CMSMetricas} />
      <Route path="/cms/integraciones" component={CMSIntegraciones} />
      <Route path="/cms/admin" component={CMSAdmin} />
      <Route path="/cms/gift-cards-sales" component={CMSGiftCardsSales} />
      <Route path="/cms/traducciones" component={CMSTraducciones} />
      <Route path="/cms/reportes-mantencion" component={CMSReportesMantencion} />

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
