import { Route, Router } from "wouter";
import { useEffect } from "react";
import CMSDashboard from "./Dashboard";
import CMSUsuarios from "./Usuarios";
import CMSCarta from "./Carta";
import CMSReservas from "./Reservas";
import CMSMensajes from "./Mensajes";
import CMSProductosCorporativos from "./ProductosCorporativos";
import CMSCotizaciones from "./Cotizaciones";
import CMSCotizacionWizard from "./CotizacionWizard";
import CMSNegocios from "./Negocios";
import CMSServicios from "./Servicios";
import CMSEventos from "./Eventos";
import CMSClientes from "./Clientes";
import CMSNewsletter from "./Newsletter";
import CMSCrearNewsletter from "./CrearNewsletter";
import CMSSuscriptores from "./Suscriptores";
import CMSListas from "./Listas";
import CMSCodigosDescuento from "./CodigosDescuento";
import CMSAnalytics from "./Analytics";
import CMSConfiguracion from "./Configuracion";
import CMSCRMPipeline from "./CRMPipeline";
import CMSB2C from "./B2C";
import CMSB2B from "./B2B";
import CMSMarketing from "./Marketing";
import CMSMarketingROI from "./MarketingROI";
import CMSMetricas from "./Metricas";
import CMSAdmin from "./Admin";
import CMSTraducciones from "./Traducciones";
import CMSReportesMantencion from "./ReportesMantencion";
import CMSIntegraciones from "./Integraciones";
import CMSGiftCardsSales from "./GiftCardsSales";
import CMSLogin from "./Login";
import CMSActivarCuenta from "./ActivarCuenta";
import CMSRecuperarContrasena from "./RecuperarContrasena";
import CMSRestablecerContrasena from "./RestablecerContrasena";

export default function CMSPage() {
  console.log("[CMS] 🚀 CMSPage renderizando");

  useEffect(() => {
    console.log("[CMS] ✅ CMSPage montado correctamente");
  }, []);

  return (
    <Router>
      <Route path="/cms/login" component={CMSLogin} />
      <Route path="/cms/activar-cuenta" component={CMSActivarCuenta} />
      <Route path="/cms/recuperar-contrasena" component={CMSRecuperarContrasena} />
      <Route path="/cms/restablecer-contrasena" component={CMSRestablecerContrasena} />
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
    </Router>
  );
}
