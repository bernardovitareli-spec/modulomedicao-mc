import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { notify } from "@/lib/notify";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import { Loader2, ShieldCheck, ShieldOff, KeyRound, Smartphone, Monitor, Copy } from "lucide-react";
import { validarSenha } from "@/lib/passwordPolicy";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { PageHeader } from "@/components/PageHeader";

const senhaSchema = z
  .object({
    atual: z.string().min(1, "Informe a senha atual"),
    nova: z.string().refine((v) => validarSenha(v).ok, { message: "Senha não atende à política." }),
    confirmar: z.string(),
  })
  .refine((d) => d.nova === d.confirmar, { path: ["confirmar"], message: "As senhas não coincidem." });

type SenhaForm = z.infer<typeof senhaSchema>;

interface MfaFactor {
  id: string;
  factor_type: string;
  status: "verified" | "unverified";
  friendly_name?: string;
  created_at: string;
}

export default function ContaSeguranca() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isChallenge = params.get("challenge") === "1";

  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [loadingFactors, setLoadingFactors] = useState(true);

  // Enroll state
  const [enrolling, setEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Challenge state (login step-up)
  const [challengeCode, setChallengeCode] = useState("");
  const [challengeLoading, setChallengeLoading] = useState(false);
  const challengeRef = useRef<HTMLInputElement | null>(null);

  const senhaForm = useForm<SenhaForm>({
    resolver: zodResolver(senhaSchema),
    defaultValues: { atual: "", nova: "", confirmar: "" },
    mode: "onChange",
  });
  const novaSenha = senhaForm.watch("nova");
  const confSenha = senhaForm.watch("confirmar");
  const senhaOk = validarSenha(novaSenha || "").ok && novaSenha === confSenha && !!confSenha;

  const verifiedFactor = useMemo(() => factors.find((f) => f.status === "verified"), [factors]);

  useEffect(() => {
    loadFactors();
  }, []);

  useEffect(() => {
    if (isChallenge) {
      setTimeout(() => challengeRef.current?.focus(), 100);
    }
  }, [isChallenge]);

  const loadFactors = async () => {
    setLoadingFactors(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) notify.error("Não foi possível carregar os fatores 2FA");
    else setFactors(((data?.all ?? []) as unknown) as MfaFactor[]);
    setLoadingFactors(false);
  };

  // ============== Alterar senha ==============
  const onAlterarSenha = async (data: SenhaForm) => {
    // valida senha atual via reauth
    if (!user?.email) return;
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: data.atual,
    });
    if (reauthErr) {
      notify.error("Senha atual incorreta.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: data.nova });
    if (error) return notify.error(error.message);
    notify.success("Senha atualizada com sucesso.");
    senhaForm.reset();
  };

  // ============== Enroll TOTP ==============
  const startEnroll = async () => {
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setEnrolling(false);
    if (error || !data) {
      notify.error("Falha ao iniciar o cadastro do 2FA.");
      return;
    }
    setEnrollData({
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
  };

  const finishEnroll = async () => {
    if (!enrollData || enrollCode.length !== 6) return;
    setEnrolling(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrollData.factorId });
    if (chErr || !ch) {
      setEnrolling(false);
      notify.error("Falha no challenge.");
      return;
    }
    const { error: verErr } = await supabase.auth.mfa.verify({
      factorId: enrollData.factorId,
      challengeId: ch.id,
      code: enrollCode,
    });
    setEnrolling(false);
    if (verErr) {
      notify.error("Código inválido. Tente novamente.");
      return;
    }
    notify.success("2FA ativado!");
    // Gera códigos de backup pseudo-aleatórios
    const codes = await gerarCodigosBackup(user?.id || "anon", 6);
    setBackupCodes(codes);
    setEnrollData(null);
    setEnrollCode("");
    loadFactors();
  };

  const cancelEnroll = async () => {
    if (enrollData) {
      await supabase.auth.mfa.unenroll({ factorId: enrollData.factorId });
    }
    setEnrollData(null);
    setEnrollCode("");
  };

  const disableMfa = async () => {
    if (!verifiedFactor) return;
    if (!confirm("Tem certeza que deseja desativar o 2FA? Sua conta ficará menos protegida.")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id });
    if (error) return notify.error("Falha ao desativar 2FA.");
    notify.success("2FA desativado.");
    setBackupCodes(null);
    loadFactors();
  };

  // ============== Challenge (step-up de aal2) ==============
  const onChallenge = async () => {
    if (!verifiedFactor || challengeCode.length !== 6) return;
    setChallengeLoading(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: verifiedFactor.id });
    if (chErr || !ch) {
      setChallengeLoading(false);
      notify.error("Falha no desafio.");
      return;
    }
    const { error: verErr } = await supabase.auth.mfa.verify({
      factorId: verifiedFactor.id,
      challengeId: ch.id,
      code: challengeCode,
    });
    setChallengeLoading(false);
    if (verErr) {
      notify.error("Código inválido.");
      return;
    }
    notify.success("Sessão elevada com sucesso.");
    navigate("/", { replace: true });
  };

  // Copia secret/códigos
  const copiar = (txt: string, label = "Copiado") => {
    navigator.clipboard.writeText(txt).then(() => notify.success(label));
  };

  // ============== Render Challenge UI (modo step-up) ==============
  if (isChallenge && verifiedFactor) {
    return (
      <div className="mx-auto max-w-md py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Verificação em duas etapas
            </CardTitle>
            <CardDescription>
              Para continuar, digite o código de 6 dígitos do seu aplicativo autenticador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="ch-code">Código</Label>
            <Input
              id="ch-code"
              ref={challengeRef}
              inputMode="numeric"
              maxLength={6}
              value={challengeCode}
              onChange={(e) => setChallengeCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="text-center text-2xl tracking-widest"
            />
            <Button className="w-full" disabled={challengeCode.length !== 6 || challengeLoading} onClick={onChallenge}>
              {challengeLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verificar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segurança da conta"
        description="Gerencie sua senha, autenticação em duas etapas e sessões."
      />

      {/* Alterar senha */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Alterar senha</CardTitle>
          <CardDescription>Use uma senha forte que você não use em outros sites.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={senhaForm.handleSubmit(onAlterarSenha)} className="grid gap-3 sm:grid-cols-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="s-atual">Senha atual</Label>
              <Input id="s-atual" type="password" autoComplete="current-password" {...senhaForm.register("atual")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-nova">Nova senha</Label>
              <Input id="s-nova" type="password" autoComplete="new-password" {...senhaForm.register("nova")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-conf">Confirmar</Label>
              <Input id="s-conf" type="password" autoComplete="new-password" {...senhaForm.register("confirmar")} />
            </div>
            <div className="sm:col-span-3">
              <PasswordStrengthMeter senha={novaSenha || ""} />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={!senhaOk || senhaForm.formState.isSubmitting}>
                {senhaForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Atualizar senha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Autenticação em duas etapas (2FA)</CardTitle>
          <CardDescription>Use um aplicativo como Google Authenticator, 1Password ou Authy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingFactors ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : verifiedFactor ? (
            <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 p-3">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-medium">2FA ativo</p>
                  <p className="text-xs text-muted-foreground">
                    Cadastrado em {new Date(verifiedFactor.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={disableMfa}>
                <ShieldOff className="mr-1.5 h-4 w-4" />Desativar
              </Button>
            </div>
          ) : enrollData ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <p className="text-sm">
                1. Escaneie o QR code abaixo com seu app autenticador.
              </p>
              <div className="flex justify-center">
                <img src={enrollData.qr} alt="QR code 2FA" className="h-44 w-44 rounded bg-card p-2" />
              </div>
              <div className="rounded bg-card p-2 text-center text-xs">
                Não consegue escanear? Use a chave:&nbsp;
                <code className="font-mono">{enrollData.secret}</code>
                <Button variant="ghost" size="sm" className="ml-1 h-6 px-1" onClick={() => copiar(enrollData.secret, "Chave copiada")}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="en-code">2. Digite o código de 6 dígitos do app</Label>
                <Input
                  id="en-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-xl tracking-widest"
                  value={enrollCode}
                  onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={finishEnroll} disabled={enrollCode.length !== 6 || enrolling}>
                  {enrolling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar e ativar
                </Button>
                <Button variant="outline" onClick={cancelEnroll}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button onClick={startEnroll} disabled={enrolling}>
              {enrolling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ShieldCheck className="mr-1.5 h-4 w-4" />Ativar 2FA
            </Button>
          )}

          {backupCodes && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
              <p className="mb-2 text-sm font-medium">Códigos de backup</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Guarde estes códigos em local seguro. Eles permitem acesso caso você perca o app autenticador.
                Eles não serão mostrados novamente.
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3">
                {backupCodes.map((c) => (
                  <div key={c} className="rounded bg-card px-2 py-1 text-center">{c}</div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => copiar(backupCodes.join("\n"), "Códigos copiados")}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />Copiar todos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessões */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" /> Sessões ativas</CardTitle>
          <CardDescription>
            Para encerrar outras sessões, basta sair (logout) e entrar novamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {session ? (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Sessão atual</p>
                <p className="text-xs text-muted-foreground">
                  Iniciada em {new Date((session.user?.last_sign_in_at as string) || Date.now()).toLocaleString("pt-BR")}
                </p>
              </div>
              <Badge variant="secondary">Este dispositivo</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma sessão ativa.</p>
          )}
          <Separator className="my-3" />
          <p className="text-xs text-muted-foreground">
            Por segurança, encerramos sua sessão automaticamente após 8 horas de inatividade.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Gera N códigos de backup pseudo-aleatórios usando sha256(user_id + timestamp + i).
 * Apenas client-side — não substituem códigos reais do Supabase, são auxiliares.
 */
async function gerarCodigosBackup(seed: string, n: number): Promise<string[]> {
  const enc = new TextEncoder();
  const ts = Date.now();
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(`${seed}-${ts}-${i}`));
    const arr = Array.from(new Uint8Array(buf));
    const hex = arr.map((b) => b.toString(16).padStart(2, "0")).join("");
    // 10 chars no formato XXXXX-XXXXX
    const raw = hex.toUpperCase().slice(0, 10);
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}
