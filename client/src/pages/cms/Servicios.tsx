import DashboardLayout from "@/components/DashboardLayout";
import ComingSoon from "@/components/ComingSoon";

export default function CMSServicios() {
  return (
    <DashboardLayout>
      <ComingSoon
        title="Gestión de Servicios"
        description="Módulo para crear, editar y administrar los servicios de Cancagua"
      />
    </DashboardLayout>
  );
}
