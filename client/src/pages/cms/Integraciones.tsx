import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SEOHead } from "@/components/SEOHead";
import { RefreshCw, Cloud, Mail, Database } from "lucide-react";

export default function CMSIntegraciones() {
    return (
        <DashboardLayout>
            <SEOHead title="Integraciones | CMS Cancagua" description="Gestión de integraciones del CMS" noindex />
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold">Integraciones</h1>
                    <p className="text-muted-foreground">Estado de las integraciones del sistema</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Cloud className="h-5 w-5 text-blue-500" />
                                Cloudinary
                            </CardTitle>
                            <CardDescription>Almacenamiento de imágenes</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2 text-sm">
                                <div className="h-2 w-2 rounded-full bg-green-500" />
                                <span className="text-green-600">Conectado</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Mail className="h-5 w-5 text-purple-500" />
                                Resend
                            </CardTitle>
                            <CardDescription>Envío de emails y newsletters</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2 text-sm">
                                <div className="h-2 w-2 rounded-full bg-green-500" />
                                <span className="text-green-600">Conectado</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="h-5 w-5 text-amber-500" />
                                Base de Datos
                            </CardTitle>
                            <CardDescription>MySQL (TiDB)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2 text-sm">
                                <div className="h-2 w-2 rounded-full bg-green-500" />
                                <span className="text-green-600">Conectado</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    );
}
