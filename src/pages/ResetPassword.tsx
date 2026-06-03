import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { HardHat, Loader2 } from "lucide-react";
import { validarSenha } from "@/lib/passwordPolicy";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";

const schema = z
  .object({
    password: z.string().refine((v) => validarSenha(v).ok, {
      message: "A senha não atende à política mínima.",
    }),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem.",
  });

type FormData = z.infer<typeof schema>;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
    mode: "onChange",
  });

  const senha = form.watch("password");
  const confirm = form.watch("confirm");
  const ok = validarSenha(senha || "").ok && senha === confirm && !!confirm;

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setReady(true);
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setReady(true);
        else {
          toast.error("Link de recuperação inválido ou expirado");
          navigate("/auth", { replace: true });
        }
      });
    }
  }, [navigate]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: data.password });
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
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="rp-pass">Nova senha</Label>
                  <Input id="rp-pass" type="password" autoComplete="new-password" {...form.register("password")} />
                  <PasswordStrengthMeter senha={senha || ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rp-conf">Confirmar senha</Label>
                  <Input id="rp-conf" type="password" autoComplete="new-password" {...form.register("confirm")} />
                  {form.formState.errors.confirm && (
                    <p className="text-xs text-destructive">{form.formState.errors.confirm.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={loading || !ok}>
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
