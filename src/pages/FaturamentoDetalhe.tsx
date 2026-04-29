import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Save, Ban, DollarSign, Upload, Download, FileText } from "lucide-react";
import { fmtBRL, fmtDate, fmtCompetencia } from "@/lib/format";
import { FATURAMENTO_STATUS_LABELS, FATURAMENTO_STATUS_VARIANT, labelFatStatus, FaturamentoStatus } from "@/lib/faturamentoStatus";
import { usePermissions } from "@/lib/permissions";
import { toast } from "sonner";

export default function FaturamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const perms = usePermissions();
  const podeEditar = perms.isAdmin || perms.isFinanceiro;

  const [f, setF] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  // form NF
  const [form, setForm] = useState<any>({});
  const [motivo, setMotivo] = useState("");

  // pagamento
  const [pagOpen, setPagOpen] = useState(false);
  const [pagForm, setPagForm] = useState<any>({});
  const [pagMotivo, setPagMotivo] = useState("");

  // cancelar
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");

  const load = async () => {
    if (!id) return;
    const [r1, r2] = await Promise.all([
      supabase.from("faturas")
        .select("*, medicoes(competencia, periodo_inicio, periodo_fim, valor_final, contratos(numero_dj, fornecedor_nome, fornecedor_cnpj, clientes(razao_social, cnpj)))")
        .eq("id", id).single(),
      supabase.from("faturamento_historico").select("*").eq("fatura_id", id).order("created_at", { ascending: false }),
    ]);
    if (r1.data) {
      setF(r1.data);
      setForm({
        numero_nf: r1.data.numero_nf ?? "",
        serie_nf: r1.data.serie_nf ?? "",
        data_emissao: r1.data.data_emissao ?? "",
        valor_bruto: r1.data.valor_bruto ?? "",
        valor_liquido: r1.data.valor_liquido ?? "",
        data_vencimento: r1.data.data_vencimento ?? "",
        data_prevista_recebimento: r1.data.data_prevista_recebimento ?? "",
        observacoes_fiscais: r1.data.observacoes_fiscais ?? "",
        observacoes_financeiras: r1.data.observacoes_financeiras ?? "",
      });
      setPagForm({
        data_pagamento: r1.data.data_pagamento ?? "",
        valor_recebido: r1.data.valor_recebido ?? "",
        motivo_diferenca: r1.data.motivo_diferenca ?? "",
      });
    }
    setHist(r2.data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const salvar = async () => {
    if (!motivo || motivo.trim().length < 3) { toast.error("Informe o motivo da alteração"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("atualizar_faturamento", {
      _fatura_id: id!,
      _numero_nf: form.numero_nf || null,
      _serie_nf: form.serie_nf || null,
      _data_emissao: form.data_emissao || null,
      _valor_bruto: form.valor_bruto === "" ? null : Number(form.valor_bruto),
      _valor_liquido: form.valor_liquido === "" ? null : Number(form.valor_liquido),
      _data_vencimento: form.data_vencimento || null,
      _data_prevista_recebimento: form.data_prevista_recebimento || null,
      _observacoes_fiscais: form.observacoes_fiscais || null,
      _observacoes_financeiras: form.observacoes_financeiras || null,
      _anexo_nf_storage_path: f?.anexo_nf_storage_path ?? null,
      _anexo_nf_nome: f?.anexo_nf_nome ?? null,
      _motivo: motivo,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Faturamento atualizado");
    setMotivo(""); load();
  };

  const registrarPagamento = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("registrar_pagamento_faturamento", {
      _fatura_id: id!,
      _data_pagamento: pagForm.data_pagamento,
      _valor_recebido: Number(pagForm.valor_recebido),
      _motivo_diferenca: pagForm.motivo_diferenca || null,
      _motivo: pagMotivo || "Registro de pagamento",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pagamento registrado");
    setPagOpen(false); setPagMotivo(""); load();
  };

  const cancelar = async () => {
    if (cancelMotivo.trim().length < 5) { toast.error("Motivo (mínimo 5 caracteres)"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("cancelar_faturamento", { _fatura_id: id!, _motivo: cancelMotivo });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Faturamento cancelado");
    setCancelOpen(false); setCancelMotivo(""); load();
  };

  const uploadAnexo = async (file: File) => {
    if (!id) return;
    const path = `${id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("medicao-anexos").upload(path, file, { upsert: false });
    if (error) { toast.error(error.message); return; }
    const { error: e2 } = await supabase.from("faturas").update({
      anexo_nf_storage_path: path, anexo_nf_nome: file.name,
    } as any).eq("id", id);
    if (e2) { toast.error(e2.message); return; }
    toast.success("Anexo enviado");
    load();
  };

  const baixarAnexo = async () => {
    if (!f?.anexo_nf_storage_path) return;
    const { data, error } = await supabase.storage.from("medicao-anexos")
      .createSignedUrl(f.anexo_nf_storage_path, 60);
    if (error || !data) { toast.error("Falha ao baixar"); return; }
    window.open(data.signedUrl, "_blank");
  };

  if (!f) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  const status = f.status as FaturamentoStatus;
  const cancelled = status === "cancelado";
  const valorMed = Number(f.medicoes?.valor_final ?? 0);
  const valorNf = Number(f.valor_liquido ?? f.valor ?? 0);
  const recebido = Number(f.valor_recebido ?? 0);
  const saldo = Math.max(0, valorNf - recebido);
  const difer = recebido - valorNf;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" />Voltar
      </Button>
      <PageHeader
        title={`Faturamento ${f.numero_nf ? `NF ${f.numero_nf}` : "(sem NF)"}`}
        description={`${f.medicoes?.contratos?.numero_dj ?? "-"} — ${f.medicoes?.contratos?.clientes?.razao_social ?? "-"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={FATURAMENTO_STATUS_VARIANT[status]}>{labelFatStatus(status)}</Badge>
            {podeEditar && !cancelled && (
              <Button size="sm" variant="default" onClick={() => navigate(`/faturamento/${id}/nota-locacao`)}>
                <FileText className="mr-1 h-4 w-4" />Gerar Nota de Locação
              </Button>
            )}
            {podeEditar && !cancelled && status !== "pago" && (
              <Button size="sm" variant="outline" onClick={() => setPagOpen(true)}>
                <DollarSign className="mr-1 h-4 w-4" />Registrar pagamento
              </Button>
            )}
            {podeEditar && !cancelled && status !== "pago" && (
              <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
                <Ban className="mr-1 h-4 w-4" />Cancelar
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Kpi l="Valor da medição" v={fmtBRL(valorMed)} />
        <Kpi l="Valor NF" v={fmtBRL(valorNf)} />
        <Kpi l="Recebido" v={fmtBRL(recebido)} accent="success" />
        <Kpi l="Saldo" v={fmtBRL(saldo)} accent={saldo > 0 ? "primary" : undefined} />
      </div>

      <Tabs defaultValue="medicao">
        <TabsList>
          <TabsTrigger value="medicao">Dados da medição</TabsTrigger>
          <TabsTrigger value="nf">Nota fiscal</TabsTrigger>
          <TabsTrigger value="recebimento">Recebimento</TabsTrigger>
          <TabsTrigger value="anexos">Anexos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="medicao" className="mt-4">
          <Card><CardContent className="p-4 grid gap-3 md:grid-cols-3 text-sm">
            <Info l="Cliente / Contratante" v={f.medicoes?.contratos?.clientes?.razao_social ?? "-"} />
            <Info l="Fornecedor / Locadora" v={f.medicoes?.contratos?.fornecedor_nome ?? "-"} />
            <Info l="Contrato / Nº DJ" v={f.medicoes?.contratos?.numero_dj ?? "-"} />
            <Info l="Competência" v={fmtCompetencia(f.medicoes?.competencia)} />
            <Info l="Período início" v={fmtDate(f.medicoes?.periodo_inicio)} />
            <Info l="Período fim" v={fmtDate(f.medicoes?.periodo_fim)} />
            <Info l="Valor aprovado da medição" v={fmtBRL(f.medicoes?.valor_final)} />
            <div className="md:col-span-3">
              <Button variant="link" className="px-0" onClick={() => navigate(`/medicoes/${f.medicao_id}`)}>
                Ver medição original
              </Button>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="nf" className="mt-4">
          <Card><CardContent className="p-4 grid gap-3 md:grid-cols-3">
            <Field l="Número NF" v={form.numero_nf} on={(v) => setForm({ ...form, numero_nf: v })} disabled={!podeEditar || cancelled} />
            <Field l="Série NF" v={form.serie_nf} on={(v) => setForm({ ...form, serie_nf: v })} disabled={!podeEditar || cancelled} />
            <Field l="Data emissão" type="date" v={form.data_emissao} on={(v) => setForm({ ...form, data_emissao: v })} disabled={!podeEditar || cancelled} />
            <Field l="Valor bruto" type="number" v={form.valor_bruto} on={(v) => setForm({ ...form, valor_bruto: v })} disabled={!podeEditar || cancelled} />
            <Field l="Valor líquido" type="number" v={form.valor_liquido} on={(v) => setForm({ ...form, valor_liquido: v })} disabled={!podeEditar || cancelled} />
            <Field l="Data vencimento" type="date" v={form.data_vencimento} on={(v) => setForm({ ...form, data_vencimento: v })} disabled={!podeEditar || cancelled} />
            <div className="md:col-span-3">
              <Label className="text-xs">Observações fiscais</Label>
              <Textarea rows={2} value={form.observacoes_fiscais} disabled={!podeEditar || cancelled}
                onChange={(e) => setForm({ ...form, observacoes_fiscais: e.target.value })} />
            </div>
            {podeEditar && !cancelled && (
              <div className="md:col-span-3 grid gap-2 border-t pt-3">
                <Label className="text-xs">Motivo da alteração *</Label>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: emissão da NF, correção de valor..." />
                <div className="flex justify-end">
                  <Button onClick={salvar} disabled={busy}><Save className="mr-1 h-4 w-4" />Salvar alterações</Button>
                </div>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="recebimento" className="mt-4">
          <Card><CardContent className="p-4 grid gap-3 md:grid-cols-3">
            <Field l="Data prevista de recebimento" type="date" v={form.data_prevista_recebimento}
              on={(v) => setForm({ ...form, data_prevista_recebimento: v })} disabled={!podeEditar || cancelled} />
            <Info l="Data do pagamento" v={fmtDate(f.data_pagamento)} />
            <Info l="Valor recebido" v={fmtBRL(recebido)} />
            <Info l="Diferença (recebido − líquido)" v={fmtBRL(difer)} />
            <div className="md:col-span-3">
              <Info l="Motivo da diferença" v={f.motivo_diferenca ?? "-"} />
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs">Observações financeiras</Label>
              <Textarea rows={2} value={form.observacoes_financeiras} disabled={!podeEditar || cancelled}
                onChange={(e) => setForm({ ...form, observacoes_financeiras: e.target.value })} />
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="anexos" className="mt-4">
          <Card><CardContent className="p-4 space-y-3">
            {f.anexo_nf_storage_path ? (
              <div className="flex items-center justify-between border rounded-md p-3">
                <span className="text-sm">{f.anexo_nf_nome ?? "Anexo NF"}</span>
                <Button size="sm" variant="outline" onClick={baixarAnexo}><Download className="mr-1 h-4 w-4" />Baixar</Button>
              </div>
            ) : <p className="text-sm text-muted-foreground">Sem anexo da NF.</p>}
            {podeEditar && !cancelled && (
              <div>
                <Label className="text-xs">Anexar PDF/XML da NF</Label>
                <Input type="file" accept=".pdf,.xml,application/pdf,text/xml"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadAnexo(file); }} />
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Usuário</TableHead><TableHead>Ação</TableHead>
                <TableHead>Campo</TableHead><TableHead>Anterior</TableHead><TableHead>Novo</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {hist.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">Sem histórico.</TableCell></TableRow>}
                {hist.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs num">{new Date(h.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-xs">{h.user_email ?? "-"}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline">{h.acao}</Badge></TableCell>
                    <TableCell className="text-xs">{h.campo ?? "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.valor_anterior ?? "-"}</TableCell>
                    <TableCell className="text-xs">{h.valor_novo ?? "-"}</TableCell>
                    <TableCell className="text-xs">{h.motivo ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Registrar pagamento */}
      <Dialog open={pagOpen} onOpenChange={setPagOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pagamento</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Data do pagamento *</Label>
              <Input type="date" value={pagForm.data_pagamento ?? ""} onChange={(e) => setPagForm({ ...pagForm, data_pagamento: e.target.value })} /></div>
            <div><Label>Valor recebido *</Label>
              <Input type="number" step="0.01" value={pagForm.valor_recebido ?? ""} onChange={(e) => setPagForm({ ...pagForm, valor_recebido: e.target.value })} /></div>
            <div><Label>Motivo da diferença (se houver)</Label>
              <Textarea rows={2} value={pagForm.motivo_diferenca ?? ""} onChange={(e) => setPagForm({ ...pagForm, motivo_diferenca: e.target.value })} /></div>
            <div><Label>Motivo / observação</Label>
              <Input value={pagMotivo} onChange={(e) => setPagMotivo(e.target.value)} placeholder="Ex: pagamento via PIX..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagOpen(false)}>Cancelar</Button>
            <Button onClick={registrarPagamento} disabled={busy}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cancelar */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar faturamento</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">A medição voltará para "Aprovada pelo cliente". Informe o motivo (mínimo 5 caracteres).</p>
          <Textarea rows={3} value={cancelMotivo} onChange={(e) => setCancelMotivo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button variant="destructive" onClick={cancelar} disabled={busy}>Confirmar cancelamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ l, v }: { l: string; v: string }) {
  return <div><p className="text-xs text-muted-foreground">{l}</p><p className="mt-0.5 font-medium">{v}</p></div>;
}
function Kpi({ l, v, accent }: { l: string; v: string; accent?: "primary" | "success" }) {
  const color = accent === "success" ? "text-success" : accent === "primary" ? "text-primary" : "";
  return <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{l}</p><p className={`mt-1 text-lg font-bold num ${color}`}>{v}</p></CardContent></Card>;
}
function Field({ l, v, on, disabled, type = "text" }: { l: string; v: any; on: (v: string) => void; disabled?: boolean; type?: string }) {
  return (
    <div>
      <Label className="text-xs">{l}</Label>
      <Input type={type} value={v ?? ""} onChange={(e) => on(e.target.value)} disabled={disabled} />
    </div>
  );
}
