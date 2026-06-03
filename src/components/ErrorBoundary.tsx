import { Component, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Captured error:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <DefaultFallback error={error} reset={this.reset} />;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  const isDev = import.meta.env.DEV;
  const goHome = () => {
    reset();
    window.location.assign("/");
  };
  const retry = () => {
    reset();
    window.location.reload();
  };
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-destructive/10 p-2 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Algo deu errado</h2>
              <p className="text-xs text-muted-foreground">Não foi possível exibir esta tela.</p>
            </div>
          </div>
          <p className="rounded-md border bg-muted/40 p-3 text-sm break-words">
            {error.message || "Erro desconhecido"}
          </p>
          {isDev && error.stack && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Stack trace (dev)</summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[10px]">
                {error.stack}
              </pre>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={retry}><RefreshCw className="mr-1 h-4 w-4" />Tentar novamente</Button>
            <Button variant="outline" onClick={goHome}><Home className="mr-1 h-4 w-4" />Voltar ao início</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ErrorBoundary;
