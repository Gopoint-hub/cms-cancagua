import DashboardLayout from "@/components/DashboardLayout";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Brain, ExternalLink } from "lucide-react";

const GRAPH_URL = "/api/cerebro/graph";

export default function CMSCerebro() {
    return (
        <DashboardLayout>
            <SEOHead title="Cerebro | CMS Cancagua" description="Grafo de conocimiento del proyecto" noindex />
            <div className="flex flex-col gap-4 h-[calc(100vh-7rem)]">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Brain className="h-6 w-6 text-violet-500" />
                            Cerebro
                        </h1>
                        <p className="text-muted-foreground">
                            Grafo de conocimiento del proyecto: módulos, dependencias y comunidades del código.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <a href={GRAPH_URL} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Abrir en pestaña nueva
                        </a>
                    </Button>
                </div>

                <div className="flex-1 min-h-0 rounded-lg border overflow-hidden bg-background">
                    <iframe
                        src={GRAPH_URL}
                        title="Grafo de conocimiento (Cerebro)"
                        className="w-full h-full border-0"
                    />
                </div>
            </div>
        </DashboardLayout>
    );
}
