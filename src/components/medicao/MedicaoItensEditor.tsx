import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Eye, AlertTriangle, RefreshCw } from "lucide-react";
import { fmtBRL, fmtNum, fmtCompetencia } from "@/lib/format";
import { toast } from "sonner";

interface Props {
  medicaoId: string;
  contratoId: string;
  periodoInicio: string;
  periodoFim: string;
  competencia?: string;
  cliente?: string;
  contratoNumero?: string;
  onChanged?: () => void;
}

interface ItemForm {
  id?: string;
  contrato_equipamento_id: string;
  equipamento_id: string;
  horimetro_inicial: number;
  horimetro_final: number;
  horas_informadas_input: number; // HT Informado (Boletim) — operacional
  horas_mecanicas: number;
  horas_chuvoso: number;
  horas_excecao_chuvoso: number;
  valor_complementares: number;
  valor_descontos: number;
  observacoes: string;
  motivo: string;
  data_inicio_operacao_item: string;
  data_fim_operacao_item: string;
  motivo_proporcionalidade: string;
}

const empty = (): ItemForm => ({
  contrato_equipamento_id: "",
  equipamento_id: "",
  horimetro_inicial: 0,
  horimetro_final: 0,
  horas_informadas_input: 0,
  horas_mecanicas: 0,
  horas_chuvoso: 0,
  horas_excecao_chuvoso: 0,
  valor_complementares: 0,
  valor_descontos: 0,
  observacoes: "",
  motivo: "",
  data_inicio_operacao_item: "",
  data_fim_operacao_item: "",
  motivo_proporcionalidade: "",
});

// Calcula garantia proporcional (espelho da função SQL _calc_proporcionalidade_item)
function calcProporcionalidade(
  pIni: string, pFim: string,
  dIni: string | null, dFim: string | null,
  garantiaMensal: number, baseDias: number,
) {
  const periodoIni = pIni;
  const periodoFim = pFim;
  const ini = dIni && dIni.length ? dIni : periodoIni;
  const fim = dFim && dFim.length ? dFim : periodoFim;
  let erro: string | null = null;
  if (dFim && dFim < periodoIni) erro = "Data de fim do equipamento anterior ao início da medição.";
  else if (dIni && dIni > periodoFim) erro = "Data de início do equipamento posterior ao fim da medição.";
  else if (ini > fim) erro = "Data de início do equipamento maior que a data fim.";
  const ms = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
  const dias = Math.max(0, ms(ini, fim) + 1);
  const proporcional = ini > periodoIni || fim < periodoFim;
  const base = baseDias && baseDias > 0 ? baseDias : 30;
  const garantiaProp = proporcional ? Math.round(((garantiaMensal || 0) / base) * dias * 100) / 100 : (garantiaMensal || 0);
  return { ini, fim, dias, proporcional, garantiaProp, erro };
}

export function MedicaoItensEditor({ medicaoId, contratoId, periodoInicio, periodoFim, competencia, cliente, contratoNumero, onChanged }: Props) {
  const [contratoEqs, setContratoEqs] = useState<any[]>([]);
  const [contrato, setContrato] = useState<any>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ItemForm>(empty());
  const [saving, setSaving] = useState(false);
  

  const load = async () => {
    const [ce, c, it] = await Promise.all([
      supabase
        .from("contrato_equipamentos")
        .select("id, equipamento_id, valor_hora_override, horimetro_inicial, equipamentos(tag, tipo, modelo, serie)")
        .eq("contrato_id", contratoId)
        .eq("ativo", true),
      supabase.from("contratos").select("valor_hora_padrao, garantia_minima_horas, base_dias_garantia").eq("id", contratoId).single(),
      supabase.from("medicao_itens").select("*, equipamentos(tag, tipo, modelo, serie)").eq("medicao_id", medicaoId).order("created_at"),
    ]);
    setContratoEqs(ce.data ?? []);
    setContrato(c.data);
    setItens(it.data ?? []);
  };

  useEffect(() => {
    if (contratoId && medicaoId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId, medicaoId]);

  // Cálculos automáticos (com proporcionalidade)
  const calc = useMemo(() => {
    const ht_calc = Math.max(0, Number(form.horimetro_final) - Number(form.horimetro_inicial));
    const ht_informado = Number(form.horas_informadas_input) || 0;
    const divergencia_ht = ht_informado - ht_calc;
    const horas_liquidas = Math.max(0, ht_informado - Number(form.horas_mecanicas));
    const ce = contratoEqs.find((x) => x.id === form.contrato_equipamento_id);
    const valor_hora = Number(ce?.valor_hora_override ?? contrato?.valor_hora_padrao ?? 0);
    const garantia_mensal = Number(contrato?.garantia_minima_horas ?? 0);
    const base_dias = Number(contrato?.base_dias_garantia ?? 30);
    const prop = calcProporcionalidade(
      periodoInicio, periodoFim,
      form.data_inicio_operacao_item || null,
      form.data_fim_operacao_item || null,
      garantia_mensal, base_dias,
    );
    const garantia_efetiva = prop.proporcional ? prop.garantiaProp : garantia_mensal;
    const horas_a_pagar = Math.max(horas_liquidas, garantia_efetiva);
    const valor_bruto = horas_a_pagar * valor_hora;
    const valor_final = valor_bruto + Number(form.valor_complementares) - Number(form.valor_descontos);
    return {
      ht_calc, ht_informado, divergencia_ht, horas_liquidas, horas_a_pagar,
      valor_hora, valor_bruto, valor_final,
      garantia: garantia_efetiva, garantia_mensal,
      garantia_proporcional: prop.garantiaProp,
      dias_considerados: prop.dias,
      aplicar_proporcional: prop.proporcional,
      erro_data: prop.erro,
      base_dias,
    };
  }, [form, contratoEqs, contrato, periodoInicio, periodoFim]);

  const recalcTotais = async () => {
    const { data } = await supabase.from("medicao_itens").select("horas_informadas, horas_liquidas, horas_a_pagar, valor_bruto, valor_complementares, valor_descontos, valor_final").eq("medicao_id", medicaoId);
    const t = (data ?? []).reduce((acc: any, r: any) => ({
      total_horas_informadas: acc.total_horas_informadas + Number(r.horas_informadas),
      total_horas_liquidas: acc.total_horas_liquidas + Number(r.horas_liquidas),
      total_horas_pagar: acc.total_horas_pagar + Number(r.horas_a_pagar),
      valor_bruto: acc.valor_bruto + Number(r.valor_bruto),
      valor_complementares: acc.valor_complementares + Number(r.valor_complementares),
      valor_descontos: acc.valor_descontos + Number(r.valor_descontos),
      valor_final: acc.valor_final + Number(r.valor_final),
    }), { total_horas_informadas: 0, total_horas_liquidas: 0, total_horas_pagar: 0, valor_bruto: 0, valor_complementares: 0, valor_descontos: 0, valor_final: 0 });
    await supabase.from("medicoes").update(t as any).eq("id", medicaoId);
  };

  const openNovo = () => { setForm(empty()); setOpen(true); };
  const openEditar = (it: any) => {
    setForm({
      id: it.id,
      contrato_equipamento_id: it.contrato_equipamento_id ?? "",
      equipamento_id: it.equipamento_id,
      horimetro_inicial: Number(it.horimetro_inicial ?? 0),
      horimetro_final: Number(it.horimetro_final ?? 0),
      horas_informadas_input: Number(it.horas_informadas ?? 0),
      horas_mecanicas: Number(it.horas_mecanicas ?? 0),
      horas_chuvoso: Number(it.horas_chuvoso ?? 0),
      horas_excecao_chuvoso: Number(it.horas_excecao_chuvoso ?? 0),
      valor_complementares: Number(it.valor_complementares ?? 0),
      valor_descontos: Number(it.valor_descontos ?? 0),
      observacoes: it.observacoes ?? "",
      motivo: "",
      data_inicio_operacao_item: it.data_inicio_operacao_item ?? "",
      data_fim_operacao_item: it.data_fim_operacao_item ?? "",
      motivo_proporcionalidade: it.motivo_proporcionalidade ?? "",
    });
    setOpen(true);
  };

  const onSelectEq = (contrato_equipamento_id: string) => {
    const ce = contratoEqs.find((x) => x.id === contrato_equipamento_id);
    setForm((f) => ({
      ...f,
      contrato_equipamento_id,
      equipamento_id: ce?.equipamento_id ?? "",
      horimetro_inicial: f.horimetro_inicial || Number(ce?.horimetro_inicial ?? 0),
    }));
  };

  const salvar = async () => {
    if (!form.contrato_equipamento_id) return toast.error("Selecione o equipamento");
    if (Number(form.horimetro_inicial) < 0) return toast.error("Horímetro inicial não pode ser negativo");
    if (Number(form.horimetro_final) < Number(form.horimetro_inicial)) return toast.error("Horímetro final deve ser ≥ inicial");
    if (Number(form.horas_informadas_input) < 0) return toast.error("HT informado não pode ser negativo");
    if (Number(form.horas_mecanicas) < 0) return toast.error("Horas mecânicas não pode ser negativa");
    if (calc.valor_final < 0) return toast.error("Valor final não pode ser negativo");

    setSaving(true);
    try {
      if (form.id) {
        // Edição via RPC com motivo obrigatório e log automático
        if (!form.motivo || form.motivo.trim().length < 5) {
          setSaving(false);
          return toast.error("Informe o motivo da alteração (mínimo 5 caracteres)");
        }
        const { error } = await supabase.rpc("update_medicao_item", {
          _item_id: form.id,
          _motivo: form.motivo.trim(),
          _horimetro_inicial: form.horimetro_inicial,
          _horimetro_final: form.horimetro_final,
          _horas_informadas: form.horas_informadas_input,
          _horas_mecanicas: form.horas_mecanicas,
          _horas_chuvoso: form.horas_chuvoso,
          _horas_excecao_chuvoso: form.horas_excecao_chuvoso,
          _valor_complementares: form.valor_complementares,
          _valor_descontos: form.valor_descontos,
          _observacoes: form.observacoes || "",
        });
        if (error) { setSaving(false); return toast.error(error.message); }
      } else {
        // Inserção direta (sem log de campos — é criação inicial)
        const payload: any = {
          medicao_id: medicaoId,
          contrato_equipamento_id: form.contrato_equipamento_id,
          equipamento_id: form.equipamento_id,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
          horimetro_inicial: form.horimetro_inicial,
          horimetro_final: form.horimetro_final,
          horas_informadas: calc.ht_informado,
          horas_mecanicas: form.horas_mecanicas,
          horas_chuvoso: form.horas_chuvoso,
          horas_excecao_chuvoso: form.horas_excecao_chuvoso,
          horas_descontaveis: form.horas_mecanicas,
          horas_liquidas: calc.horas_liquidas,
          garantia_minima: calc.garantia,
          horas_a_pagar: calc.horas_a_pagar,
          valor_hora: calc.valor_hora,
          valor_bruto: calc.valor_bruto,
          valor_complementares: form.valor_complementares,
          valor_descontos: form.valor_descontos,
          valor_final: calc.valor_final,
          observacoes: form.observacoes || null,
        };
        const { error } = await supabase.from("medicao_itens").insert(payload);
        if (error) { setSaving(false); return toast.error(error.message); }
        await recalcTotais();
      }
      setOpen(false);
      await load();
      onChanged?.();
      toast.success("Item salvo e totais atualizados");
    } finally {
      setSaving(false);
    }
  };

  const recalcularMedicao = async () => {
    const motivo = window.prompt("Motivo do recálculo (mínimo 5 caracteres):", "Recálculo manual com base nas regras atuais");
    if (motivo === null) return;
    if (motivo.trim().length < 5) return toast.error("Motivo é obrigatório");
    setSaving(true);
    const { error } = await supabase.rpc("recalcular_medicao", { _medicao_id: medicaoId, _motivo: motivo.trim() });
    setSaving(false);
    if (error) return toast.error(error.message);
    await load();
    onChanged?.();
    toast.success("Medição recalculada");
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este item?")) return;
    const { error } = await supabase.from("medicao_itens").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await load();
    await recalcTotais();
    onChanged?.();
  };

  const eqOptions = contratoEqs.filter((ce) =>
    !itens.some((it) => it.contrato_equipamento_id === ce.id && it.id !== form.id),
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Itens por equipamento</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={recalcularMedicao} disabled={saving}>
              <RefreshCw className="mr-1 h-4 w-4" />Recalcular medição
            </Button>
            <Button size="sm" onClick={openNovo}><Plus className="mr-1 h-4 w-4" />Adicionar item</Button>
          </div>
        </div>

        <p className="mb-2 text-xs text-muted-foreground">
          As colunas <strong>Série</strong>, <strong>Tag</strong>, <strong>Tipo Equipamento</strong> e <strong>Modelo</strong> ficam fixas. Role horizontalmente para ver os demais campos →
        </p>
        <div className="relative w-full overflow-x-auto overflow-y-visible border rounded-md scrollbar-thin">
          <Table className="min-w-max text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-20 bg-background border-r min-w-[110px]">Série</TableHead>
                <TableHead className="sticky left-[110px] z-20 bg-background border-r min-w-[90px]">Tag</TableHead>
                <TableHead className="sticky left-[200px] z-20 bg-background border-r min-w-[170px] whitespace-nowrap">Tipo Equipamento</TableHead>
                <TableHead className="sticky left-[370px] z-20 bg-background border-r-2 border-r-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] min-w-[150px] whitespace-nowrap">Modelo</TableHead>
                <TableHead className="text-right whitespace-nowrap">Horím. Ini.</TableHead>
                <TableHead className="text-right whitespace-nowrap">Horím. Fin.</TableHead>
                <TableHead className="text-right whitespace-nowrap">HT Calc.</TableHead>
                <TableHead className="text-right whitespace-nowrap">HT Inf.</TableHead>
                <TableHead className="text-right whitespace-nowrap">Diverg. HT</TableHead>
                <TableHead className="text-right whitespace-nowrap">Garantia</TableHead>
                <TableHead className="text-right whitespace-nowrap">H. Mec.</TableHead>
                <TableHead className="text-right whitespace-nowrap">H. Líq.</TableHead>
                <TableHead className="text-right whitespace-nowrap font-semibold">Horas a pagar</TableHead>
                <TableHead className="text-right whitespace-nowrap">Valor/h</TableHead>
                <TableHead className="text-right whitespace-nowrap">Compl.</TableHead>
                <TableHead className="text-right whitespace-nowrap">Desc.</TableHead>
                <TableHead className="text-right whitespace-nowrap">Valor Final</TableHead>
                <TableHead className="text-right whitespace-nowrap">Chuvoso</TableHead>
                <TableHead className="text-right whitespace-nowrap">Exc. Chuv.</TableHead>
                <TableHead>Obs.</TableHead>
                <TableHead className="text-right whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.length === 0 && <TableRow><TableCell colSpan={21} className="text-center py-6 text-sm text-muted-foreground">Nenhum item. Clique em "Adicionar item".</TableCell></TableRow>}
              {itens.map((i) => {
                const htCalc = Math.max(0, Number(i.horimetro_final ?? 0) - Number(i.horimetro_inicial ?? 0));
                const diverg = Number(i.horas_informadas ?? 0) - htCalc;
                return (
                  <TableRow key={i.id} className="group">
                    <TableCell className="sticky left-0 z-10 bg-background group-hover:bg-muted/50 border-r font-mono text-xs whitespace-nowrap">{i.equipamentos?.serie ?? "-"}</TableCell>
                    <TableCell className="sticky left-[110px] z-10 bg-background group-hover:bg-muted/50 border-r font-mono text-xs whitespace-nowrap">{i.equipamentos?.tag}</TableCell>
                    <TableCell className="sticky left-[200px] z-10 bg-background group-hover:bg-muted/50 border-r text-xs whitespace-nowrap">{i.equipamentos?.tipo}</TableCell>
                    <TableCell className="sticky left-[370px] z-10 bg-background group-hover:bg-muted/50 border-r-2 border-r-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] text-xs whitespace-nowrap">{i.equipamentos?.modelo}</TableCell>
                    <TableCell className="text-right num">{fmtNum(i.horimetro_inicial)}</TableCell>
                    <TableCell className="text-right num">{fmtNum(i.horimetro_final)}</TableCell>
                    <TableCell className="text-right num">{fmtNum(htCalc)}</TableCell>
                    <TableCell className="text-right num">{fmtNum(i.horas_informadas)}</TableCell>
                    <TableCell className={`text-right num ${Math.abs(diverg) > 0.01 ? "text-destructive" : ""}`}>{fmtNum(diverg)}</TableCell>
                    <TableCell className="text-right num">{fmtNum(i.garantia_minima)}</TableCell>
                    <TableCell className="text-right num">{fmtNum(i.horas_mecanicas)}</TableCell>
                    <TableCell className="text-right num">{fmtNum(i.horas_liquidas)}</TableCell>
                    <TableCell className="text-right num font-semibold">{fmtNum(i.horas_a_pagar)}</TableCell>
                    <TableCell className="text-right num">{fmtBRL(i.valor_hora)}</TableCell>
                    <TableCell className="text-right num">{fmtBRL(i.valor_complementares)}</TableCell>
                    <TableCell className="text-right num">{fmtBRL(i.valor_descontos)}</TableCell>
                    <TableCell className="text-right num font-semibold text-primary">{fmtBRL(i.valor_final)}</TableCell>
                    <TableCell className="text-right num">{fmtNum(i.horas_chuvoso)}</TableCell>
                    <TableCell className="text-right num">{fmtNum(i.horas_excecao_chuvoso)}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate" title={i.observacoes ?? ""}>{i.observacoes ?? "-"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => openEditar(i)}><Eye className="mr-1 h-3 w-3" />Ver detalhes / Editar</Button>
                      <Button size="icon" variant="ghost" onClick={() => excluir(i.id)} className="ml-1"><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>

                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Detalhes / Editar item" : "Novo item de medição"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Identificação (somente leitura) */}
              {form.id && (() => {
                const ce = contratoEqs.find((x) => x.id === form.contrato_equipamento_id);
                const eq = ce?.equipamentos;
                return (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Identificação</h4>
                    <div className="grid gap-3 md:grid-cols-3 rounded-md border bg-muted/20 p-3 text-sm">
                      <DetRow l="Cliente" v={cliente ?? "-"} />
                      <DetRow l="Contrato" v={contratoNumero ?? "-"} />
                      <DetRow l="Competência" v={competencia ? fmtCompetencia(competencia) : "-"} />
                      <DetRow l="Série" v={eq?.serie ?? "-"} />
                      <DetRow l="Tag" v={eq?.tag ?? "-"} />
                      <DetRow l="Tipo Equipamento" v={eq?.tipo ?? "-"} />
                      <DetRow l="Modelo" v={eq?.modelo ?? "-"} />
                    </div>
                  </section>
                );
              })()}

              {!form.id && (
                <div>
                  <Label>Equipamento *</Label>
                  <Select value={form.contrato_equipamento_id} onValueChange={onSelectEq}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {eqOptions.map((ce) => (
                        <SelectItem key={ce.id} value={ce.id}>
                          {ce.equipamentos?.tag} — {ce.equipamentos?.tipo} {ce.equipamentos?.modelo}
                          {ce.equipamentos?.serie ? ` (S/N ${ce.equipamentos.serie})` : ""}
                        </SelectItem>
                      ))}
                      {eqOptions.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">Todos os equipamentos do contrato já foram adicionados.</div>}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Campos operacionais (editáveis)</h4>
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Horímetro inicial" value={form.horimetro_inicial} onChange={(v) => setForm({ ...form, horimetro_inicial: v })} />
                    <Field label="Horímetro final" value={form.horimetro_final} onChange={(v) => setForm({ ...form, horimetro_final: v })} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="HT informado (boletim)" value={form.horas_informadas_input} onChange={(v) => setForm({ ...form, horas_informadas_input: v })} />
                    <Field label="Horas mecânicas" value={form.horas_mecanicas} onChange={(v) => setForm({ ...form, horas_mecanicas: v })} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Período chuvoso (h)" value={form.horas_chuvoso} onChange={(v) => setForm({ ...form, horas_chuvoso: v })} />
                    <Field label="Exceção chuvoso (h)" value={form.horas_excecao_chuvoso} onChange={(v) => setForm({ ...form, horas_excecao_chuvoso: v })} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Complementares (R$)" value={form.valor_complementares} onChange={(v) => setForm({ ...form, valor_complementares: v })} />
                    <Field label="Descontos (R$)" value={form.valor_descontos} onChange={(v) => setForm({ ...form, valor_descontos: v })} />
                  </div>
                  <div>
                    <Label>Observações</Label>
                    <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
                  </div>
                </div>
              </section>

              {Math.abs(calc.divergencia_ht) > 0.01 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Divergência entre HT calculado ({fmtNum(calc.ht_calc)}) e HT informado ({fmtNum(calc.ht_informado)}): {fmtNum(calc.divergencia_ht)}h. Verifique os horímetros — você pode salvar mesmo assim.
                  </AlertDescription>
                </Alert>
              )}

              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Campos calculados (somente leitura)</h4>
                <div className="grid gap-3 md:grid-cols-3 rounded-md border bg-muted/30 p-3">
                  <FieldRO label="HT calculado" value={fmtNum(calc.ht_calc)} hint="final − inicial" />
                  <FieldRO label="Divergência HT" value={fmtNum(calc.divergencia_ht)} hint="informado − calculado" accent={Math.abs(calc.divergencia_ht) > 0.01} />
                  <FieldRO label="Horas líquidas" value={fmtNum(calc.horas_liquidas)} hint="HT inf. − mecânicas" />
                  <FieldRO label="Garantia contratual" value={fmtNum(calc.garantia)} />
                  <FieldRO label="Horas a pagar" value={fmtNum(calc.horas_a_pagar)} hint="máx(líq, garantia)" />
                  <FieldRO label="Valor/hora" value={fmtBRL(calc.valor_hora)} />
                  <div className="md:col-span-3">
                    <FieldRO label="Valor final" value={fmtBRL(calc.valor_final)} hint={`${fmtNum(calc.horas_a_pagar)}h × ${fmtBRL(calc.valor_hora)} + compl. − desc.`} accent />
                  </div>
                </div>
              </section>

              {form.id && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Motivo da alteração *</h4>
                  <Textarea
                    rows={2}
                    placeholder="Ex.: Correção do HT informado conforme boletim revisado."
                    value={form.motivo}
                    onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Obrigatório (mínimo 5 caracteres). Será registrado no histórico de alterações.
                  </p>
                </section>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
              <Button onClick={salvar} disabled={saving || (!!form.id && form.motivo.trim().length < 5)}>Salvar item</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function FieldRO({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className={`mt-1 rounded-md border bg-background px-3 py-2 text-sm font-semibold num ${accent ? "text-primary" : ""}`}>{value}</div>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DetRow({ l, v, accent }: { l: string; v: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{l}</p>
      <p className={`mt-0.5 font-medium num ${accent ? "text-primary" : ""}`}>{v}</p>
    </div>
  );
}
