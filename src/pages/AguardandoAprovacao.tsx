import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Clock, Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

export default function AguardandoAprovacao() {
  const { user, loading, roles, signOut } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (roles.length > 0) return <Navigate to="/" replace />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary to-primary-glow p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent/20">
            <Clock className="h-7 w-7 text-accent-foreground" />
          </div>
          <CardTitle>Cadastro em análise</CardTitle>
          <CardDescription>
            Seu cadastro ({user?.email}) foi recebido e está aguardando aprovação de um administrador.
            Você receberá acesso assim que seu perfil for definido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-center text-sm text-muted-foreground">
            Se já faz algum tempo, entre em contato com o administrador do sistema.
          </p>
          <Button variant="outline" className="w-full" onClick={signOut}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
