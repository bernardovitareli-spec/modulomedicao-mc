import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ErrorBoundary } from "./ErrorBoundary";

// Versão mais leve do ErrorBoundary, para uso em rotas/Outlets,
// preservando sidebar/layout quando uma página interna quebra.
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div className="p-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-semibold">Erro ao carregar esta página</h3>
              </div>
              <p className="text-sm text-muted-foreground break-words">{error.message}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { reset(); window.location.reload(); }}>
                  <RefreshCw className="mr-1 h-4 w-4" />Tentar novamente
                </Button>
                <Button size="sm" variant="outline" onClick={() => { reset(); window.history.back(); }}>
                  Voltar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

export default RouteErrorBoundary;
