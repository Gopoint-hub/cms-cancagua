import DashboardLayout from "@/components/DashboardLayout";
import ComingSoon from "@/components/ComingSoon";

export default function CMSConfiguracion() {
  return (
    <DashboardLayout>
      <ComingSoon
        title="Configuración"
        description="Módulo para administrar ajustes generales del sistema y preferencias"
      />
    </DashboardLayout>
  );
}
