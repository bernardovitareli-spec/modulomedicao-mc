import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { HardHat, Loader2 } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("Bem-vindo!"); navigate("/", { replace: true }); }
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success("Conta criada! Você já pode entrar."); }
  };

  const onForgot = async () => {
    if (!email) return toast.error("Informe seu e-mail acima para receber o link de recuperação");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Enviamos um link de recuperação para seu e-mail");
  };

  const onGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/` });
    if (result.error) { toast.error("Erro ao entrar com Google"); setLoading(false); }
    else if (!result.redirected) { navigate("/", { replace: true }); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary to-primary-glow p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-primary-foreground">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent shadow-elevated">
            <HardHat className="h-7 w-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">MedControl</h1>
            <p className="text-sm opacity-80">Gestão de medições mensais</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Acessar sistema</CardTitle>
            <CardDescription>Entre ou crie sua conta para continuar</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="space-y-4 pt-4">
                <form onSubmit={onSignIn} className="space-y-3">
                  <div className="space-y-1.5"><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Senha</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Entrar</Button>
                  <button type="button" onClick={onForgot} className="block w-full text-center text-sm text-primary hover:underline" disabled={loading}>
                    Esqueci minha senha
                  </button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="space-y-4 pt-4">
                <form onSubmit={onSignUp} className="space-y-3">
                  <div className="space-y-1.5"><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Senha</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar conta</Button>
                </form>
              </TabsContent>
            </Tabs>
            <div className="my-4 flex items-center gap-2"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">ou</span><div className="h-px flex-1 bg-border" /></div>
            <Button variant="outline" className="w-full" onClick={onGoogle} disabled={loading}>
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.617 0 3.077.557 4.227 1.642l3.146-3.146C17.46 1.703 14.918.5 12 .5 7.413.5 3.464 3.135 1.523 6.967l3.66 2.844C6.117 7.111 8.835 5 12 5z"/><path fill="#4285F4" d="M23.5 12.27c0-.86-.075-1.696-.215-2.5H12v4.715h6.453c-.281 1.51-1.13 2.79-2.41 3.652l3.566 2.77c2.083-1.93 3.291-4.768 3.291-8.637z"/><path fill="#FBBC05" d="M5.183 14.184a7.13 7.13 0 0 1-.378-2.184c0-.76.137-1.494.378-2.184l-3.66-2.844A11.484 11.484 0 0 0 .5 12c0 1.85.443 3.59 1.223 5.128l3.46-2.944z"/><path fill="#34A853" d="M12 23.5c3.24 0 5.96-1.07 7.946-2.91l-3.566-2.77c-1.066.715-2.422 1.13-4.38 1.13-3.165 0-5.883-2.111-6.817-4.96l-3.66 2.844C3.464 20.865 7.413 23.5 12 23.5z"/></svg>
              Entrar com Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
