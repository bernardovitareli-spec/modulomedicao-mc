import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Download, Trash2, Upload, Paperclip, Loader2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import { fmtDate } from "@/lib/format";
import { usePermissions } from "@/lib/permissions";

const TIPO_LABEL: Record<string, string> = {
  comprovante_envio: "Comprovante de envio",
  boletim_assinado: "Boletim assinado",
  nf: "Nota fiscal",
  outro: "Outro",
};

const TIPO_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  comprovante_envio: "secondary",
  boletim_assinado: "default",
  nf: "default",
  outro: "outline",
};

interface Anexo {
  id: string;
  medicao_id: string;
  tipo: string;
  nome_arquivo: string;
  storage_path: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  observacoes: string | null;
  created_at: string;
  created_by: string | null;
  user_email: string | null;
}

const fmtSize = (b?: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

export function MedicaoAnexosTab({ medicaoId }: { medicaoId: string }) {
  const perms = usePermissions();
  const podeEnviar = perms.isAdmin || perms.isGestor || perms.isOperacional || perms.isFinanceiro;

  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [tipo, setTipo] = useState("comprovante_envio");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("medicao_anexos" as any)
      .select("*")
      .eq("medicao_id", medicaoId)
      .order("created_at", { ascending: false });
    if (error) { notify.error(error.message); return; }
    setAnexos((data ?? []) as any);
  };

  useEffect(() => { load(); }, [medicaoId]);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { notify.error("Selecione um arquivo."); return; }
    if (file.size > 20 * 1024 * 1024) { notify.error("Arquivo acima de 20MB."); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${medicaoId}/${tipo}/${Date.now()}-${safeName}`;
      const up = await supabase.storage.from("medicao-anexos").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (up.error) throw up.error;

      const u = await supabase.auth.getUser();
      const ins = await supabase.from("medicao_anexos" as any).insert({
        medicao_id: medicaoId,
        tipo,
        nome_arquivo: file.name,
        storage_path: path,
        mime_type: file.type || null,
        tamanho_bytes: file.size,
        observacoes: obs || null,
        created_by: u.data.user?.id ?? null,
        user_email: u.data.user?.email ?? null,
      });
      if (ins.error) throw ins.error;

      notify.success("Anexo enviado.");
      setObs("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e: any) {
      notify.error(e.message ?? "Falha ao enviar anexo.");
    } finally {
      setBusy(false);
    }
  };

  const baixar = async (a: Anexo) => {
    const { data, error } = await supabase.storage
      .from("medicao-anexos")
      .createSignedUrl(a.storage_path, 60);
    if (error) { notify.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const remover = async (a: Anexo) => {
    if (!confirm(`Remover "${a.nome_arquivo}"?`)) return;
    const r1 = await supabase.storage.from("medicao-anexos").remove([a.storage_path]);
    if (r1.error) { notify.error(r1.error.message); return; }
    const r2 = await supabase.from("medicao_anexos" as any).delete().eq("id", a.id);
    if (r2.error) { notify.error(r2.error.message); return; }
    notify.success("Anexo removido.");
    load();
  };

  return (
    <div className="space-y-4">
      {podeEnviar && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Upload className="h-4 w-4" />Enviar novo anexo
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Arquivo (máx. 20MB)</Label>
                <Input ref={fileRef} type="file" />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Observação (opcional)</Label>
                <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={upload} disabled={busy}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                <Upload className="mr-1 h-4 w-4" />Enviar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-3">
            <Paperclip className="h-4 w-4" />Anexos ({anexos.length})
          </div>
          {anexos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum anexo enviado.</p>
          ) : (
            <ul className="divide-y">
              {anexos.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  <Badge variant={TIPO_VARIANT[a.tipo] ?? "outline"} className="shrink-0">
                    {TIPO_LABEL[a.tipo] ?? a.tipo}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.nome_arquivo}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtSize(a.tamanho_bytes)} • {fmtDate(a.created_at)}
                      {a.user_email ? ` • ${a.user_email}` : ""}
                    </p>
                    {a.observacoes && <p className="text-xs mt-1">{a.observacoes}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => baixar(a)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    {(perms.isAdmin || a.created_by) && (
                      <Button size="sm" variant="ghost" onClick={() => remover(a)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
