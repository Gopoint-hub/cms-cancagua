import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Construction, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

interface ComingSoonProps {
  title: string;
  description?: string;
}

export default function ComingSoon({ title, description }: ComingSoonProps) {
  const [, setLocation] = useLocation();

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center">
              <Construction className="h-10 w-10 text-yellow-600" />
            </div>
            <CardTitle className="text-3xl mb-2">{title}</CardTitle>
            <CardDescription className="text-lg">
              {description || "Esta funcionalidad estará disponible próximamente"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Estamos trabajando en esta sección para ofrecerte la mejor experiencia posible.
            </p>
            <div className="flex gap-3 justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => setLocation("/cms")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver al Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
