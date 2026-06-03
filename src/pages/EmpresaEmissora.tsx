import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Plus, Star } from "lucide-react";
import { notify } from "@/lib/notify";
import { usePermissions } from "@/lib/permissions";

export default function EmpresaEmissora() {
  const { isAdmin } = usePermissions();
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("empresa_emissora").select("*").order("padrao", { ascending: false }).order("razao_social");
    setList(data ?? []);
    if (!sel && data?.length) setSel(data[0]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const novo = () => setSel({
    razao_social: "", cnpj: "", inscricao_estadual: "", inscricao_municipal: "",
    endereco: "", numero: "", complemento: "", bairro: "", cep: "",
    municipio: "", uf: "", telefone: "", email: "",
    banco: "", agencia: "", conta_corrente: "", chave_pix: "",
    numero_nota_digitos: 1, prazo_recebimento_padrao_dias: 30,
    ativa: true, padrao: false,
  });

  const salvar = async () => {
    if (!sel?.razao_social || !sel?.cnpj) { notify.error("Razão social e CNPJ são obrigatórios"); return; }
    setBusy(true);
    if (sel.padrao && sel.id) {
      // limpa outros padrões
      await supabase.from("empresa_emissora").update({ padrao: false } as any).neq("id", sel.id);
    }
    const payload = { ...sel };
    delete payload.created_at; delete payload.updated_at;
    const { error } = sel.id
      ? await supabase.from("empresa_emissora").update(payload).eq("id", sel.id)
      : await supabase.from("empresa_emissora").insert(payload).select().single();
    setBusy(false);
    if (error) { notify.error(error.message); return; }
    notify.success("Empresa salva");
    load();
  };

  const tornarPadrao = async (id: string) => {
    await supabase.from("empresa_emissora").update({ padrao: false } as any).neq("id", id);
    await supabase.from("empresa_emissora").update({ padrao: true } as any).eq("id", id);
    notify.success("Empresa padrão atualizada");
    load();
  };

  return (
    <div>
      <PageHeader
        title="Empresa Emissora / Locadora"
        description="Dados que alimentam o cabeçalho da Nota de Locação"
        actions={isAdmin && <Button onClick={novo} size="sm"><Plus className="mr-1 h-4 w-4" />Nova empresa</Button>}
      />
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card><CardContent className="p-2 space-y-1">
          {list.map((e) => (
            <button key={e.id} onClick={() => setSel(e)}
              className={`w-full text-left p-2 rounded-md text-sm hover:bg-muted ${sel?.id === e.id ? "bg-muted" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium truncate">{e.razao_social}</span>
                {e.padrao && <Star className="h-3 w-3 fill-current text-primary" />}
              </div>
              <span className="text-xs text-muted-foreground">{e.cnpj}</span>
            </button>
          ))}
          {list.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhuma empresa cadastrada.</p>}
        </CardContent></Card>

        {sel && (
          <Card><CardContent className="p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <F l="Razão social *" v={sel.razao_social} on={(v) => setSel({ ...sel, razao_social: v })} disabled={!isAdmin} />
              <F l="Nome fantasia" v={sel.nome_fantasia} on={(v) => setSel({ ...sel, nome_fantasia: v })} disabled={!isAdmin} />
              <F l="CNPJ *" v={sel.cnpj} on={(v) => setSel({ ...sel, cnpj: v })} disabled={!isAdmin} />
              <F l="Inscrição Estadual" v={sel.inscricao_estadual} on={(v) => setSel({ ...sel, inscricao_estadual: v })} disabled={!isAdmin} />
              <F l="Inscrição Municipal" v={sel.inscricao_municipal} on={(v) => setSel({ ...sel, inscricao_municipal: v })} disabled={!isAdmin} />
              <F l="Telefone" v={sel.telefone} on={(v) => setSel({ ...sel, telefone: v })} disabled={!isAdmin} />
              <F l="E-mail" v={sel.email} on={(v) => setSel({ ...sel, email: v })} disabled={!isAdmin} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2"><F l="Endereço" v={sel.endereco} on={(v) => setSel({ ...sel, endereco: v })} disabled={!isAdmin} /></div>
              <F l="Número" v={sel.numero} on={(v) => setSel({ ...sel, numero: v })} disabled={!isAdmin} />
              <F l="Complemento" v={sel.complemento} on={(v) => setSel({ ...sel, complemento: v })} disabled={!isAdmin} />
              <F l="Bairro" v={sel.bairro} on={(v) => setSel({ ...sel, bairro: v })} disabled={!isAdmin} />
              <F l="CEP" v={sel.cep} on={(v) => setSel({ ...sel, cep: v })} disabled={!isAdmin} />
              <F l="Município" v={sel.municipio} on={(v) => setSel({ ...sel, municipio: v })} disabled={!isAdmin} />
              <F l="UF" v={sel.uf} on={(v) => setSel({ ...sel, uf: v })} disabled={!isAdmin} />
            </div>
            <div className="border-t pt-3">
              <h3 className="text-sm font-semibold mb-2">Dados bancários</h3>
              <div className="grid gap-3 md:grid-cols-4">
                <F l="Banco" v={sel.banco} on={(v) => setSel({ ...sel, banco: v })} disabled={!isAdmin} />
                <F l="Agência" v={sel.agencia} on={(v) => setSel({ ...sel, agencia: v })} disabled={!isAdmin} />
                <F l="Conta corrente" v={sel.conta_corrente} on={(v) => setSel({ ...sel, conta_corrente: v })} disabled={!isAdmin} />
                <F l="Chave PIX" v={sel.chave_pix} on={(v) => setSel({ ...sel, chave_pix: v })} disabled={!isAdmin} />
              </div>
            </div>
            <div className="border-t pt-3">
              <h3 className="text-sm font-semibold mb-2">Configuração da Nota de Locação</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Formato do número da nota (dígitos)</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={sel.numero_nota_digitos ?? 1}
                    disabled={!isAdmin}
                    onChange={(e) => setSel({ ...sel, numero_nota_digitos: Number(e.target.value) })}
                  >
                    <option value={1}>Simples (ex: 1)</option>
                    <option value={6}>6 dígitos (ex: 000001)</option>
                    <option value={8}>8 dígitos (ex: 00000001)</option>
                    <option value={11}>11 dígitos (ex: 00000000001)</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Prazo padrão de recebimento (dias)</Label>
                  <Input type="number" min={0} value={sel.prazo_recebimento_padrao_dias ?? 30}
                    disabled={!isAdmin}
                    onChange={(e) => setSel({ ...sel, prazo_recebimento_padrao_dias: Number(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center justify-between border-t pt-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!sel.padrao} onChange={(e) => setSel({ ...sel, padrao: e.target.checked })} />
                  Empresa padrão (usada por novas notas)
                </label>
                <div className="flex gap-2">
                  {sel.id && !sel.padrao && (
                    <Button variant="outline" size="sm" onClick={() => tornarPadrao(sel.id)}>
                      <Star className="mr-1 h-4 w-4" />Tornar padrão
                    </Button>
                  )}
                  <Button onClick={salvar} disabled={busy}><Save className="mr-1 h-4 w-4" />Salvar</Button>
                </div>
              </div>
            )}
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function F({ l, v, on, disabled }: { l: string; v: any; on: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs">{l}</Label>
      <Input value={v ?? ""} onChange={(e) => on(e.target.value)} disabled={disabled} />
    </div>
  );
}
