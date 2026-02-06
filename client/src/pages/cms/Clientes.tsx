import DashboardLayout from "@/components/DashboardLayout";
import ComingSoon from "@/components/ComingSoon";

export default function CMSClientes() {
  return (
    <DashboardLayout>
      <ComingSoon
        title="Gestión de Clientes"
        description="Módulo para administrar la base de datos de clientes y su historial"
      />
    </DashboardLayout>
  );
}
