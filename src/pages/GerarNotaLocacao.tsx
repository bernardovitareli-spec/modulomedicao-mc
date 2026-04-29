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
import { ArrowLeft, FileText, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { fmtBRL, fmtDate, fmtCompetencia } from "@/lib/format";
import { gerarNotaLocacaoPDF, getLogoDataUrl } from "@/lib/notaLocacaoPdf";
import { usePermissions } from "@/lib/permissions";

export default function GerarNotaLocacao() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const perms = usePermissions();
  const podeGerar = perms.isAdmin || perms.isFinanceiro;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);
  const [emissora, setEmissora] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [motivoDif, setMotivoDif] = useState("");

  useEffect(() => { (async () => {
    if (!id) return;
    setLoading(true);
    const [r1, r2] = await Promise.all([
      supabase.from("faturas")
        .select("*, medicoes(*, contratos(*, clientes(*)))")
        .eq("id", id).single(),
      supabase.from("empresa_emissora").select("*").order("padrao", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (r1.error || !r1.data) { toast.error("Faturamento não encontrado"); setLoading(false); return; }
    const f = r1.data;
    const med = f.medicoes;
    const ctr = med?.contratos;
    const cli = ctr?.clientes;
    setData({ fatura: f, medicao: med, contrato: ctr, cliente: cli });
    setEmissora(r2.data ?? null);

    const valorMed = Number(med?.valor_final ?? 0);
    const descricaoPadrao = `Locação de equipamentos referente à medição do período de ${fmtDate(med?.periodo_inicio)} a ${fmtDate(med?.periodo_fim)}, contrato ${ctr?.numero_dj ?? "-"}, competência ${fmtCompetencia(med?.competencia)}.`;

    setForm({
      numero_nf: f.numero_nf ?? "",
      serie_nf: f.serie_nf ?? "",
      data_emissao: f.data_emissao ?? new Date().toISOString().slice(0, 10),
      data_vencimento: f.data_vencimento ?? "",
      natureza_operacao: f.natureza_operacao ?? "3.01 LOCAÇÃO EQUIPAMENTO",
      codigo_item: f.codigo_item ?? "",
      descricao_item: f.descricao_item ?? descricaoPadrao,
      quantidade: f.quantidade ?? 1,
      valor_unitario: f.valor_unitario ?? valorMed,
      valor_bruto: f.valor_bruto ?? valorMed,
      valor_liquido: f.valor_liquido ?? valorMed,
      local_servico: f.local_servico ?? "",
      numero_rf: f.numero_rf ?? "",
      numero_contrato_cliente: f.numero_contrato_cliente ?? "",
      numero_pedido_item: f.numero_pedido_item ?? "",
      numero_frs: f.numero_frs ?? "",
      numero_bm: f.numero_bm ?? "",
      observacoes_nota: f.observacoes_nota ?? "Locação de bens móveis. Não incidência de ISSQN conforme Lei Complementar 116/03.",
      dados_bancarios: f.dados_bancarios ?? "",
    });
    setLoading(false);
  })(); }, [id]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!data) return null;

  const valorMed = Number(data.medicao?.valor_final ?? 0);
  const valorNota = Number(form.valor_liquido ?? 0);
  const valorDifere = Math.abs(valorNota - valorMed) > 0.01;

  const pendentes: string[] = [];
  if (!emissora) pendentes.push("Empresa emissora não cadastrada");
  if (!emissora?.cnpj) pendentes.push("CNPJ da empresa emissora");
  if (!data.cliente?.razao_social) pendentes.push("Cliente");
  if (!data.cliente?.cnpj) pendentes.push("CNPJ do cliente");
  if (!data.contrato) pendentes.push("Contrato");
  if (!data.medicao?.valor_final) pendentes.push("Valor aprovado da medição");
  if (!form.numero_nf) pendentes.push("Número da nota");
  if (!form.data_emissao) pendentes.push("Data de emissão");
  if (!form.data_vencimento) pendentes.push("Data de vencimento");
  if (!form.descricao_item) pendentes.push("Descrição do item");
  if (!form.valor_liquido) pendentes.push("Valor total da nota");
  if (data.medicao?.status !== "aprovada_cliente" && data.fatura?.status === "a_faturar") {
    // ok — fatura criada a partir de aprovada_cliente
  }

  const buildPDF = async () => {
    const logoDataUrl = await getLogoDataUrl();
    return gerarNotaLocacaoPDF({
      emissora,
      cliente: data.cliente,
      contrato: data.contrato,
      medicao: data.medicao,
      logoDataUrl,
      fatura: { ...data.fatura, ...form },
    });
  };

  const previewPDF = async () => {
    const doc = await buildPDF();
    window.open(doc.output("bloburl"), "_blank");
  };

  const salvarRascunho = async () => {
    setBusy(true);
    const { error } = await supabase.from("faturas").update({
      ...form,
      empresa_emissora_id: emissora?.id ?? null,
    } as any).eq("id", id!);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await supabase.from("faturamento_historico").insert({
      fatura_id: id!,
      medicao_id: data.fatura.medicao_id,
      acao: "rascunho_nota_salvo",
      motivo: "Rascunho da Nota de Locação",
    } as any);
    toast.success("Rascunho da nota salvo");
  };

  const confirmarEmissao = async () => {
    if (pendentes.length) { toast.error("Preencha os campos pendentes"); return; }
    if (valorDifere && motivoDif.trim().length < 5) {
      toast.error("Informe o motivo da diferença de valor (mín. 5 caracteres)");
      return;
    }
    setBusy(true);
    try {
      const doc = buildPDF();
      const blob = doc.output("blob");
      const path = `${id}/nota-${form.numero_nf || Date.now()}.pdf`;
      const up = await supabase.storage.from("medicao-anexos").upload(path, blob, {
        upsert: true, contentType: "application/pdf",
      });
      if (up.error) throw up.error;

      const { data: userData } = await supabase.auth.getUser();
      const upd = await supabase.from("faturas").update({
        ...form,
        empresa_emissora_id: emissora?.id ?? null,
        anexo_nota_storage_path: path,
        anexo_nota_nome: `nota-${form.numero_nf}.pdf`,
        nota_emitida_em: new Date().toISOString(),
        nota_emitida_por: userData.user?.id ?? null,
        status: "nf_emitida",
        motivo_valor_diferente: valorDifere ? motivoDif : null,
      } as any).eq("id", id!);
      if (upd.error) throw upd.error;

      await supabase.from("faturamento_historico").insert({
        fatura_id: id!,
        medicao_id: data.fatura.medicao_id,
        acao: "nota_locacao_emitida",
        campo: "numero_nf",
        valor_novo: form.numero_nf,
        motivo: valorDifere
          ? `Nota emitida (valor difere da medição: ${motivoDif})`
          : "Nota de Locação emitida",
        contexto: { valor_nota: valorNota, valor_medicao: valorMed, anexo: path } as any,
      } as any);

      // download local
      doc.save(`nota-${form.numero_nf}.pdf`);
      toast.success("Nota de Locação emitida e anexada ao faturamento");
      nav(`/faturamento/${id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar nota");
    } finally {
      setBusy(false);
    }
  };

  const F = (l: string, k: string, type = "text", full = false) => (
    <div className={full ? "md:col-span-3" : ""}>
      <Label className="text-xs">{l}</Label>
      <Input type={type} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => nav(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" />Voltar
      </Button>
      <PageHeader
        title="Gerar Nota de Locação"
        description={`Faturamento ${data.fatura?.numero_nf ? `NF ${data.fatura.numero_nf}` : "(sem NF)"} — ${data.contrato?.numero_dj ?? "-"}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={previewPDF}><FileText className="mr-1 h-4 w-4" />Pré-visualizar PDF</Button>
            {podeGerar && <Button variant="outline" size="sm" onClick={salvarRascunho} disabled={busy}><Save className="mr-1 h-4 w-4" />Salvar rascunho</Button>}
            {podeGerar && <Button size="sm" onClick={confirmarEmissao} disabled={busy || pendentes.length > 0}>Confirmar emissão</Button>}
          </div>
        }
      />

      {pendentes.length > 0 && (
        <Card className="mb-4 border-warning"><CardContent className="p-3 flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-warning" />
          <div>
            <p className="font-semibold mb-1">Campos pendentes para gerar a nota:</p>
            <ul className="list-disc pl-5 text-xs">{pendentes.map((p) => <li key={p}>{p}</li>)}</ul>
            {!emissora && <Button size="sm" variant="link" className="px-0 mt-1" onClick={() => nav("/empresa-emissora")}>Cadastrar empresa emissora</Button>}
          </div>
        </CardContent></Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Empresa Emissora */}
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Empresa Emissora / Locadora</h3>
            <Button size="sm" variant="link" className="px-0" onClick={() => nav("/empresa-emissora")}>Editar empresa emissora</Button>
          </div>
          {emissora ? (
            <div className="space-y-1 text-xs">
              <p className="font-semibold">{emissora.razao_social}</p>
              <p>CNPJ: {emissora.cnpj} • IE: {emissora.inscricao_estadual ?? "-"} • IM: {emissora.inscricao_municipal ?? "-"}</p>
              <p>{emissora.endereco}, {emissora.bairro} — CEP {emissora.cep}</p>
              <p>{emissora.municipio}/{emissora.uf} • Tel: {emissora.telefone ?? "-"}</p>
              <p className="pt-1 font-semibold">Banco {emissora.banco} — AG {emissora.agencia} — C/C {emissora.conta_corrente}</p>
            </div>
          ) : <p className="text-xs text-muted-foreground">Nenhuma empresa emissora cadastrada.</p>}
        </CardContent></Card>

        {/* Cliente */}
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Cliente / Contratante</h3>
            {data.cliente?.id && <Button size="sm" variant="link" className="px-0" onClick={() => nav(`/clientes`)}>Editar cadastro do cliente</Button>}
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-semibold">{data.cliente?.razao_social ?? "-"}</p>
            <p>CNPJ: {data.cliente?.cnpj ?? "-"} • IE: {data.cliente?.inscricao_estadual ?? "-"}</p>
            <p>{data.cliente?.endereco ?? "-"} — CEP {data.cliente?.cep ?? "-"}</p>
            <p>{data.cliente?.cidade ?? "-"}/{data.cliente?.uf ?? "-"} • Tel: {data.cliente?.contato_telefone ?? "-"}</p>
          </div>
        </CardContent></Card>

        {/* Dados do contrato/medição (somente leitura) */}
        <Card className="md:col-span-2"><CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-2">Contrato e Medição</h3>
          <div className="grid gap-2 md:grid-cols-4 text-xs">
            <Info l="Contrato / Nº DJ" v={data.contrato?.numero_dj ?? "-"} />
            <Info l="Centro de custo" v={data.contrato?.centro_custo ?? "-"} />
            <Info l="Tipo de serviço" v={data.contrato?.tipo_servico ?? "-"} />
            <Info l="Competência" v={fmtCompetencia(data.medicao?.competencia)} />
            <Info l="Período início" v={fmtDate(data.medicao?.periodo_inicio)} />
            <Info l="Período fim" v={fmtDate(data.medicao?.periodo_fim)} />
            <Info l="Valor aprovado da medição" v={fmtBRL(valorMed)} />
            <Info l="Status medição" v={data.medicao?.status ?? "-"} />
          </div>
        </CardContent></Card>

        {/* Campos editáveis da nota */}
        <Card className="md:col-span-2"><CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Dados da Nota (editáveis)</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {F("Número da nota *", "numero_nf")}
            {F("Série", "serie_nf")}
            {F("Natureza da operação", "natureza_operacao")}
            {F("Data de emissão *", "data_emissao", "date")}
            {F("Data de vencimento *", "data_vencimento", "date")}
            {F("Quantidade", "quantidade", "number")}
            {F("Código do item/serviço", "codigo_item")}
            {F("Valor unitário", "valor_unitario", "number")}
            {F("Valor total / líquido NF *", "valor_liquido", "number")}
            <div className="md:col-span-3">
              <Label className="text-xs">Descrição do item *</Label>
              <Textarea rows={3} value={form.descricao_item ?? ""} onChange={(e) => setForm({ ...form, descricao_item: e.target.value })} />
            </div>
            {F("Local do serviço", "local_servico", "text", true)}
            {F("Nº RF", "numero_rf")}
            {F("Nº contrato do cliente", "numero_contrato_cliente")}
            {F("Nº pedido / item", "numero_pedido_item")}
            {F("Nº FRS", "numero_frs")}
            {F("Nº BM", "numero_bm")}
            <div className="md:col-span-3">
              <Label className="text-xs">Dados bancários (opcional — sobrescreve os da empresa emissora)</Label>
              <Textarea rows={2} value={form.dados_bancarios ?? ""} onChange={(e) => setForm({ ...form, dados_bancarios: e.target.value })}
                placeholder={`BANCO ${emissora?.banco ?? ""} - AG ${emissora?.agencia ?? ""} - C/C ${emissora?.conta_corrente ?? ""}`} />
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs">Observações da nota</Label>
              <Textarea rows={2} value={form.observacoes_nota ?? ""} onChange={(e) => setForm({ ...form, observacoes_nota: e.target.value })} />
            </div>
            {valorDifere && (
              <div className="md:col-span-3 border-t pt-3">
                <div className="flex items-center gap-2 text-warning mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs font-semibold">O valor da nota ({fmtBRL(valorNota)}) difere do valor aprovado da medição ({fmtBRL(valorMed)}).</span>
                </div>
                <Label className="text-xs">Motivo da diferença *</Label>
                <Textarea rows={2} value={motivoDif} onChange={(e) => setMotivoDif(e.target.value)} />
              </div>
            )}
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}

function Info({ l, v }: { l: string; v: any }) {
  return <div><p className="text-muted-foreground">{l}</p><p className="font-medium">{v}</p></div>;
}
