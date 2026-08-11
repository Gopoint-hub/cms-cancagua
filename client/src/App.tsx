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
import DiscountCodes360 from "./pages/cms/DiscountCodes360";
import CMSAnalytics from "./pages/cms/Analytics";
import CMSConfiguracion from "./pages/cms/Configuracion";
import CMSCRMPipeline from "./pages/cms/CRMPipeline";
import CMSMarketing from "./pages/cms/Marketing";
import CMSMarketingROI from "./pages/cms/MarketingROI";
import CMSTraducciones from "./pages/cms/Traducciones";
import CMSReportesMantencion from "./pages/cms/ReportesMantencion";
import CMSMantencionTurnos from "./pages/cms/MantencionTurnos";
import CMSMantencionDashboard from "./pages/cms/MantencionDashboard";
import CMSConciergeVenta from "./pages/cms/concierge/HerramientaVenta";
import CMSConciergeServicios from "./pages/cms/concierge/ServiciosDisponibles";
import CMSConciergeVendedores from "./pages/cms/concierge/Vendedores";
import CMSMisComisiones from "./pages/cms/concierge/MisComisiones";
import CMSIntegraciones from "./pages/cms/Integraciones";
import CMSCerebro from "./pages/cms/Cerebro";
import CMSGiftCardsSales from "./pages/cms/GiftCardsSales";
import CMSAyudaNewsletters from "./pages/cms/AyudaNewsletters";
import CMSLogin from "./pages/cms/Login";
import CMSActivarCuenta from "./pages/cms/ActivarCuenta";
import CMSRecuperarContrasena from "./pages/cms/RecuperarContrasena";
import CMSRestablecerContrasena from "./pages/cms/RestablecerContrasena";
import CMSCalendario360 from "./pages/cms/Calendario360";
import CMSClientes360 from "./pages/cms/Clientes360";
// Marketing modules
import CMSEnvioPersonal from "./pages/cms/EnvioPersonal";
import CMSCalendarioMarketing from "./pages/cms/CalendarioMarketing";
import CMSBlogContenido from "./pages/cms/BlogContenido";
// Módulo Masajes
import MasajesDashboard from "./pages/cms/masajes/Dashboard";
import MasajesAgenda from "./pages/cms/masajes/Agenda";
import MasajesTerapeutas from "./pages/cms/masajes/Terapeutas";
import MasajesTecnicas from "./pages/cms/masajes/Tecnicas";
import MasajesInventario from "./pages/cms/masajes/Inventario";
import MasajesClientes from "./pages/cms/masajes/Clientes";
import MasajesAnalytics from "./pages/cms/masajes/Analytics";
import MasajesRRHH from "./pages/cms/masajes/RRHH";
import MasajesConfiguracion from "./pages/cms/masajes/Configuracion";
import MasajesAdminArea from "./pages/cms/masajes/AdminArea";
import ReservarMasaje from "./pages/masajes/ReservarMasaje";
import ConfirmacionPago from "./pages/masajes/ConfirmacionPago";
import NpsMasaje from "./pages/masajes/NpsMasaje";
// Módulo Biopiscinas
import BiopiscinasDashboard from "./pages/cms/biopiscinas/Dashboard";
import BiopiscinasAgenda from "./pages/cms/biopiscinas/Agenda";
import BiopiscinasBlocks from "./pages/cms/biopiscinas/Blocks";
import BiopiscinasServices from "./pages/cms/biopiscinas/Services";
import BiopiscinasConfiguration from "./pages/cms/biopiscinas/Configuration";
import BiopiscinasSales from "./pages/cms/biopiscinas/Sales";
import ConfirmBiopoolAttendance from "./pages/biopiscinas/ConfirmAttendance";
import BiopoolCheckout from "./pages/biopiscinas/Checkout";
import BiopoolPaymentResult from "./pages/biopiscinas/PaymentResult";
// Módulo Sauna
import SaunaDashboard from "./pages/cms/sauna/Dashboard";
import SaunaAgenda from "./pages/cms/sauna/Agenda";
import SaunaBlocks from "./pages/cms/sauna/Blocks";
import SaunaPrograms from "./pages/cms/sauna/Programs";
import SaunaServices from "./pages/cms/sauna/Services";
import SaunaConfiguration from "./pages/cms/sauna/Configuration";
import SaunaCheckout from "./pages/sauna/Checkout";
import SaunaPaymentResult from "./pages/sauna/PaymentResult";
// Módulo Clases Regulares
import RegularClassesDashboard from "./pages/cms/clases-regulares/Dashboard";
import RegularClassesAttendance from "./pages/cms/clases-regulares/Attendance";
import RegularClassesStudents from "./pages/cms/clases-regulares/Students";
import RegularClassesClasses from "./pages/cms/clases-regulares/Classes";
import RegularClassesTeachers from "./pages/cms/clases-regulares/Teachers";
import RegularClassesSettlements from "./pages/cms/clases-regulares/Settlements";
import RegularClassesConfiguration from "./pages/cms/clases-regulares/Configuration";
import RegularClassesCommunications from "./pages/cms/clases-regulares/Communications";
import RegularClassesMySettlements from "./pages/cms/clases-regulares/MySettlements";

function Router() {
  return (
    <Switch>
      {/* Auth pages (no dashboard layout) */}
      <Route path="/cms/login" component={CMSLogin} />
      <Route path="/cms/activar-cuenta" component={CMSActivarCuenta} />
      <Route path="/cms/recuperar-contrasena" component={CMSRecuperarContrasena} />
      <Route path="/cms/restablecer-contrasena" component={CMSRestablecerContrasena} />
      <Route path="/biopiscinas/confirmar/:token" component={ConfirmBiopoolAttendance} />
      <Route path="/reservar/biopiscinas" component={BiopoolCheckout} />
      <Route path="/biopiscinas/pago/resultado" component={BiopoolPaymentResult} />
      <Route path="/reservar/sauna" component={SaunaCheckout} />
      <Route path="/sauna/pago/resultado" component={SaunaPaymentResult} />

      {/* CMS Dashboard pages */}
      <Route path="/" component={CMSDashboard} />
      <Route path="/cms" component={CMSDashboard} />
      <Route path="/cms/calendario" component={CMSCalendario360} />
      <Route path="/cms/clientes-360" component={CMSClientes360} />
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
      <Route path="/cms/codigos-descuento" component={DiscountCodes360} />
      <Route path="/cms/analytics" component={CMSAnalytics} />
      <Route path="/cms/configuracion" component={CMSConfiguracion} />
      <Route path="/cms/crm-pipeline" component={CMSCRMPipeline} />
      <Route path="/cms/marketing" component={CMSMarketing} />
      <Route path="/cms/marketing-roi" component={CMSMarketingROI} />
      <Route path="/cms/integraciones" component={CMSIntegraciones} />
      <Route path="/cms/cerebro" component={CMSCerebro} />
      <Route path="/cms/gift-cards-sales" component={CMSGiftCardsSales} />
      <Route path="/cms/traducciones" component={CMSTraducciones} />
      <Route path="/cms/reportes-mantencion" component={CMSReportesMantencion} />
      <Route path="/cms/mantencion-turnos" component={CMSMantencionTurnos} />
      <Route path="/cms/mantencion-dashboard" component={CMSMantencionDashboard} />
      {/* Marketing modules */}
      <Route path="/cms/envio-personal" component={CMSEnvioPersonal} />
      <Route path="/cms/calendario-marketing" component={CMSCalendarioMarketing} />
      <Route path="/cms/blog-contenido" component={CMSBlogContenido} />
      {/* Módulo Concierge */}
      <Route path="/cms/concierge" component={CMSConciergeVenta} />
      <Route path="/cms/concierge/venta" component={CMSConciergeVenta} />
      <Route path="/cms/concierge/servicios" component={CMSConciergeServicios} />
      <Route path="/cms/concierge/vendedores" component={CMSConciergeVendedores} />
      <Route path="/cms/concierge/mis-comisiones" component={CMSMisComisiones} />
      <Route path="/cms/ayuda/newsletters" component={CMSAyudaNewsletters} />
      {/* Módulo Masajes */}
      <Route path="/cms/masajes" component={MasajesDashboard} />
      <Route path="/cms/masajes/agenda" component={MasajesAgenda} />
      <Route path="/cms/masajes/terapeutas" component={MasajesTerapeutas} />
      <Route path="/cms/masajes/tecnicas" component={MasajesTecnicas} />
      <Route path="/cms/masajes/inventario" component={MasajesInventario} />
      <Route path="/cms/masajes/clientes" component={MasajesClientes} />
      <Route path="/cms/masajes/analytics" component={MasajesAnalytics} />
      <Route path="/cms/masajes/descuentos" component={DiscountCodes360} />
      <Route path="/cms/masajes/admin" component={MasajesAdminArea} />
      <Route path="/cms/masajes/rrhh" component={MasajesRRHH} />
      <Route path="/cms/masajes/configuracion" component={MasajesConfiguracion} />

      {/* Módulo Biopiscinas */}
      <Route path="/cms/biopiscinas" component={BiopiscinasDashboard} />
      <Route path="/cms/biopiscinas/agenda" component={BiopiscinasAgenda} />
      <Route path="/cms/biopiscinas/bloqueos" component={BiopiscinasBlocks} />
      <Route path="/cms/biopiscinas/servicios" component={BiopiscinasServices} />
      <Route path="/cms/biopiscinas/configuracion" component={BiopiscinasConfiguration} />
      <Route path="/cms/biopiscinas/ventas" component={BiopiscinasSales} />

      {/* Módulo Sauna */}
      <Route path="/cms/sauna" component={SaunaDashboard} />
      <Route path="/cms/sauna/agenda" component={SaunaAgenda} />
      <Route path="/cms/sauna/programas" component={SaunaPrograms} />
      <Route path="/cms/sauna/bloqueos" component={SaunaBlocks} />
      <Route path="/cms/sauna/servicios" component={SaunaServices} />
      <Route path="/cms/sauna/configuracion" component={SaunaConfiguration} />

      {/* Módulo Clases Regulares */}
      <Route path="/cms/clases-regulares" component={RegularClassesDashboard} />
      <Route path="/cms/clases-regulares/asistencia" component={RegularClassesAttendance} />
      <Route path="/cms/clases-regulares/mis-liquidaciones" component={RegularClassesMySettlements} />
      <Route path="/cms/clases-regulares/alumnos" component={RegularClassesStudents} />
      <Route path="/cms/clases-regulares/clases" component={RegularClassesClasses} />
      <Route path="/cms/clases-regulares/profesores" component={RegularClassesTeachers} />
      <Route path="/cms/clases-regulares/liquidaciones" component={RegularClassesSettlements} />
      <Route path="/cms/clases-regulares/comunicaciones" component={RegularClassesCommunications} />
      <Route path="/cms/clases-regulares/configuracion" component={RegularClassesConfiguration} />

      {/* Reserva pública de masajes (sin auth) */}
      <Route path="/reservar/masajes" component={ReservarMasaje} />
      <Route path="/reservar/masaje/:id" component={ReservarMasaje} />
      <Route path="/masajes/reserva/confirmacion" component={ConfirmacionPago} />
      <Route path="/nps/masajes/:token" component={NpsMasaje} />

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
