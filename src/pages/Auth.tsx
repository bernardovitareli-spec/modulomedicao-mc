import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { HardHat, Loader2, MailCheck } from "lucide-react";
import { validarSenha } from "@/lib/passwordPolicy";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";

const HCAPTCHA_SITEKEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;

const signInSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(1, "Informe sua senha"),
  remember: z.boolean().optional(),
});

const signUpSchema = z
  .object({
    email: z.string().trim().email("E-mail inválido").max(255),
    password: z.string().refine((v) => validarSenha(v).ok, {
      message: "A senha não atende à política mínima.",
    }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });

const forgotSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
});

type SignInData = z.infer<typeof signInSchema>;
type SignUpData = z.infer<typeof signUpSchema>;
type ForgotData = z.infer<typeof forgotSchema>;

export default function Auth() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup" | "forgot">("signin");
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [captchaSignup, setCaptchaSignup] = useState<string | null>(null);
  const [captchaForgot, setCaptchaForgot] = useState<string | null>(null);
  const capSignupRef = useRef<HCaptcha | null>(null);
  const capForgotRef = useRef<HCaptcha | null>(null);

  const signInForm = useForm<SignInData>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", remember: true },
  });
  const signUpForm = useForm<SignUpData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
    mode: "onChange",
  });
  const forgotForm = useForm<ForgotData>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const senha = signUpForm.watch("password");
  const confirm = signUpForm.watch("confirmPassword");
  const senhaOk = validarSenha(senha || "").ok && senha === confirm && !!confirm;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (!HCAPTCHA_SITEKEY) {
      // eslint-disable-next-line no-console
      console.warn("[Auth] VITE_HCAPTCHA_SITE_KEY não definido — captcha desativado (modo dev).");
    }
  }, []);

  const onSignIn = async (data: SignInData) => {
    setLoading(true);
    try {
      // Persistência condicional baseada em "lembrar-me"
      try {
        const storage = data.remember ? window.localStorage : window.sessionStorage;
        // Marca preferência para próxima recarga
        window.localStorage.setItem("auth:remember", data.remember ? "1" : "0");
        // Limpa storage alternativo
        if (data.remember) window.sessionStorage.removeItem("sb-session");
        else window.localStorage.removeItem("sb-session");
        void storage;
      } catch { /* ignore */ }

      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (error) {
        if (import.meta.env.DEV) console.error("[signIn]", error);
        toast.error("Credenciais inválidas ou conta ainda não confirmada/aprovada.");
        return;
      }
      toast.success("Bem-vindo!");
      navigate("/", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const onSignUp = async (data: SignUpData) => {
    if (HCAPTCHA_SITEKEY && !captchaSignup) {
      toast.error("Confirme o captcha antes de criar a conta.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/aguardando-aprovacao`,
          ...(captchaSignup ? { captchaToken: captchaSignup } : {}),
        },
      });
      if (error) {
        if (import.meta.env.DEV) console.error("[signUp]", error);
        toast.error("Não foi possível criar a conta. Verifique os dados e tente novamente.");
        capSignupRef.current?.resetCaptcha();
        setCaptchaSignup(null);
        return;
      }
      setSignupSuccess(data.email);
    } finally {
      setLoading(false);
    }
  };

  const onForgot = async (data: ForgotData) => {
    if (HCAPTCHA_SITEKEY && !captchaForgot) {
      toast.error("Confirme o captcha para continuar.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
        ...(captchaForgot ? { captchaToken: captchaForgot } : {}),
      });
      if (error && import.meta.env.DEV) console.error("[forgot]", error);
      // sempre genérico (anti-enumeration)
      setForgotSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/` });
    if (result.error) { toast.error("Erro ao entrar com Google"); setLoading(false); }
    else if (!result.redirected) { navigate("/", { replace: true }); }
  };

  // Tela pós-cadastro
  if (signupSuccess) {
    return (
      <AuthShell subtitle="Cadastro recebido">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <MailCheck className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold">Confirme seu e-mail</h2>
            <p className="text-sm text-muted-foreground">
              Enviamos um link de confirmação para <strong>{signupSuccess}</strong>.
              Confirme seu e-mail e aguarde a aprovação de um administrador antes de acessar.
            </p>
            <Button variant="outline" className="w-full" onClick={() => { setSignupSuccess(null); setTab("signin"); }}>
              Voltar para o login
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Gestão de medições mensais">
      <Card>
        <CardHeader>
          <CardTitle>Acessar sistema</CardTitle>
          <CardDescription>Entre ou crie sua conta para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              <TabsTrigger value="forgot">Recuperar</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-4 pt-4">
              <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-3" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" type="email" autoComplete="email" {...signInForm.register("email")} />
                  {signInForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{signInForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="si-pass">Senha</Label>
                  <Input id="si-pass" type="password" autoComplete="current-password" {...signInForm.register("password")} />
                  {signInForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{signInForm.formState.errors.password.message}</p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={signInForm.watch("remember")}
                    onCheckedChange={(v) => signInForm.setValue("remember", !!v)}
                  />
                  Lembrar-me neste dispositivo
                </label>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Entrar
                </Button>
                <button
                  type="button"
                  onClick={() => setTab("forgot")}
                  className="block w-full text-center text-sm text-primary hover:underline"
                >
                  Esqueci minha senha
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4 pt-4">
              <form onSubmit={signUpForm.handleSubmit(onSignUp)} className="space-y-3" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" autoComplete="email" {...signUpForm.register("email")} />
                  {signUpForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{signUpForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-pass">Senha</Label>
                  <Input id="su-pass" type="password" autoComplete="new-password" {...signUpForm.register("password")} />
                  <PasswordStrengthMeter senha={senha || ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-conf">Confirmar senha</Label>
                  <Input id="su-conf" type="password" autoComplete="new-password" {...signUpForm.register("confirmPassword")} />
                  {signUpForm.formState.errors.confirmPassword && (
                    <p className="text-xs text-destructive">{signUpForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>
                {HCAPTCHA_SITEKEY && (
                  <div className="flex justify-center">
                    <HCaptcha
                      ref={capSignupRef}
                      sitekey={HCAPTCHA_SITEKEY}
                      onVerify={(t) => setCaptchaSignup(t)}
                      onExpire={() => setCaptchaSignup(null)}
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !senhaOk || (!!HCAPTCHA_SITEKEY && !captchaSignup)}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar conta
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="forgot" className="space-y-4 pt-4">
              {forgotSuccess ? (
                <div className="space-y-3 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
                    <MailCheck className="h-6 w-6" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Se houver uma conta vinculada a este e-mail, enviaremos um link para redefinir a senha.
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => { setForgotSuccess(false); setTab("signin"); }}>
                    Voltar para o login
                  </Button>
                </div>
              ) : (
                <form onSubmit={forgotForm.handleSubmit(onForgot)} className="space-y-3" noValidate>
                  <p className="text-sm text-muted-foreground">
                    Informe seu e-mail para receber o link de recuperação.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="fg-email">Email</Label>
                    <Input id="fg-email" type="email" autoComplete="email" {...forgotForm.register("email")} />
                    {forgotForm.formState.errors.email && (
                      <p className="text-xs text-destructive">{forgotForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  {HCAPTCHA_SITEKEY && (
                    <div className="flex justify-center">
                      <HCaptcha
                        ref={capForgotRef}
                        sitekey={HCAPTCHA_SITEKEY}
                        onVerify={(t) => setCaptchaForgot(t)}
                        onExpire={() => setCaptchaForgot(null)}
                      />
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading || (!!HCAPTCHA_SITEKEY && !captchaForgot)}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar link
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>

          <div className="my-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={onGoogle} disabled={loading}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.617 0 3.077.557 4.227 1.642l3.146-3.146C17.46 1.703 14.918.5 12 .5 7.413.5 3.464 3.135 1.523 6.967l3.66 2.844C6.117 7.111 8.835 5 12 5z"/><path fill="#4285F4" d="M23.5 12.27c0-.86-.075-1.696-.215-2.5H12v4.715h6.453c-.281 1.51-1.13 2.79-2.41 3.652l3.566 2.77c2.083-1.93 3.291-4.768 3.291-8.637z"/><path fill="#FBBC05" d="M5.183 14.184a7.13 7.13 0 0 1-.378-2.184c0-.76.137-1.494.378-2.184l-3.66-2.844A11.484 11.484 0 0 0 .5 12c0 1.85.443 3.59 1.223 5.128l3.46-2.944z"/><path fill="#34A853" d="M12 23.5c3.24 0 5.96-1.07 7.946-2.91l-3.566-2.77c-1.066.715-2.422 1.13-4.38 1.13-3.165 0-5.883-2.111-6.817-4.96l-3.66 2.844C3.464 20.865 7.413 23.5 12 23.5z"/></svg>
            Entrar com Google
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function AuthShell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary to-primary-glow p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-primary-foreground">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent shadow-elevated">
            <HardHat className="h-7 w-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Módulo de Medição - MC Terraplenagem</h1>
            <p className="text-sm opacity-80">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
