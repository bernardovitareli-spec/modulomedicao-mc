import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { HardHat, Loader2 } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    // Supabase coloca o token no hash da URL (#access_token=...&type=recovery)
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setReady(true);
    } else {
      // Se chegou aqui sem token de recovery, verifica se já há sessão recovery
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setReady(true);
        else {
          toast.error("Link de recuperação inválido ou expirado");
          navigate("/auth", { replace: true });
        }
      });
    }
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres");
    if (password !== confirm) return toast.error("As senhas não coincidem");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada! Faça login novamente.");
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary to-primary-glow p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-primary-foreground">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent shadow-elevated">
            <HardHat className="h-7 w-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Módulo de Medição - MC Terraplenagem</h1>
            <p className="text-sm opacity-80">Redefinir senha</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Nova senha</CardTitle>
            <CardDescription>Defina uma nova senha para sua conta</CardDescription>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nova senha</Label>
                  <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirmar senha</Label>
                  <Input type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Atualizar senha
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
