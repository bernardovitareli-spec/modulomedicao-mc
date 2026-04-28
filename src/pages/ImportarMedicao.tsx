import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { fmtBRL } from "@/lib/format";
import { calcularItem } from "@/lib/calculo";

const SHEET_NAME = "BASE DE DADOS";

interface Linha {
  raw: any;
  mes_ref: string | null;          // YYYY-MM-01
  numero_dj: string;
  contratado: string;
  tipo_equip: string;
  modelo: string;
  serie: string;
  tag: string;
  centro_custo: string;
  inicio_op: string | null;
  termino_contrato: string | null;
  hor_inicial: number;
  hor_final: number;
  ht_calculado: number;            // recalculado
  ht_informado: number;
  divergencia_ht: number;          // recalculado
  garantia_contratual: number;
  horas_disposicao: number;
  horas_mecanicas: number;
  complementares: number;
  tipo_pagamento: string;
  valor_hora: number;
  desc_manutencao: number;
  excecao_chuvoso: number;
  observacoes: string;
  // calculados
  horas_liquidas: number;
  horas_a_pagar: number;
  valor_final: number;
  // status
  erros: string[];
  alertas: string[];
}

const num = (v: any) => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  return Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
};

const str = (v: any) => String(v ?? "").trim();

const parseDate = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
};

const parseMesRef = (v: any): string | null => {
  if (!v) return null;
  const d = parseDate(v);
  if (d) return d.slice(0, 7) + "-01";
  const s = String(v).trim().toLowerCase();
  const meses: Record<string, string> = { jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06", jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12" };
  const m = s.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*[\/\s-]*(\d{2,4})/);
  if (m) {
    const mm = meses[m[1]];
    let yy = m[2];
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm}-01`;
  }
  const m2 = s.match(/^(\d{2})[\/\-](\d{4})$/);
  if (m2) return `${m2[2]}-${m2[1]}-01`;
  return null;
};

const lastDayOfMonth = (yyyymm01: string) => {
  const [y, m] = yyyymm01.split("-").map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
};

export default function ImportarMedicao() {
  const navigate = useNavigate();
  const [filename, setFilename] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [importing, setImporting] = useState(false);

  const onFile = async (file: File) => {
    setFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const sheetName = wb.SheetNames.find((n) => n.trim().toUpperCase() === SHEET_NAME) ?? wb.SheetNames[0];
      if (sheetName !== SHEET_NAME) {
        toast.warning(`Aba "${SHEET_NAME}" não encontrada. Usando "${sheetName}".`);
      }
      const sheet = wb.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const parsed: Linha[] = rows.map((r) => {
        const erros: string[] = [];
        const alertas: string[] = [];

        const mes_ref = parseMesRef(r["Mês Referência"] ?? r["Mes Referencia"] ?? r["Mês Ref"]);
        const numero_dj = str(r["Nº DJ"] ?? r["No DJ"] ?? r["DJ"]);
        const contratado = str(r["Contratado"] ?? r["Contratante"] ?? r["Cliente"]);
        const serie = str(r["Série"] ?? r["Serie"]);
        const tag = str(r["Tag"]);
        const hor_inicial = num(r["Hor. Inicial"] ?? r["Horímetro Inicial"]);
        const hor_final = num(r["Hor. Final"] ?? r["Horímetro Final"]);
        const ht_informado = num(r["HT Informado (Boletim)"] ?? r["HT Informado"] ?? r["Horas Informadas"]);
        const garantia_contratual = num(r["Garantia Contratual"]);
        const horas_disposicao = num(r["Horas Disposição"] ?? r["Horas Disposicao"]);
        const horas_mecanicas = num(r["H. Mecânicas"] ?? r["Horas Mecânicas"] ?? r["H. Mecanicas"]);
        const complementares = num(r["Complementares"]);
        const valor_hora = num(r["Valor/Hora (R$)"] ?? r["Valor/Hora"]);
        const desc_manutencao = num(r["Desc. Manutenção (R$)"] ?? r["Desc. Manutencao"] ?? r["Descontos"]);
        const excecao_chuvoso = num(r["Exceção Chuvoso"] ?? r["Excecao Chuvoso"]);

        // Cálculos
        const ht_calculado = hor_final - hor_inicial;
        const divergencia_ht = ht_informado - ht_calculado;
        const horas_liquidas = Math.max(0, ht_informado - horas_mecanicas);
        const horas_a_pagar = Math.max(horas_liquidas, garantia_contratual);
        const valor_final = horas_a_pagar * valor_hora + complementares - desc_manutencao;

        // Validações
        if (!mes_ref) erros.push("Mês Referência inválido");
        if (!numero_dj) erros.push("Nº DJ ausente");
        if (!contratado) erros.push("Contratado ausente");
        if (!serie) erros.push("Série ausente");
        if (!tag) erros.push("Tag ausente");
        if (hor_final < hor_inicial) erros.push("Horímetro final < inicial");
        if (!valor_hora) erros.push("Valor/hora ausente");
        if (!garantia_contratual) alertas.push("Garantia contratual ausente");
        if (Math.abs(divergencia_ht) > 0.01) alertas.push(`Divergência HT: ${divergencia_ht.toFixed(2)}h`);

        return {
          raw: r, mes_ref, numero_dj, contratado,
          tipo_equip: str(r["Tipo Equipamento"]),
          modelo: str(r["Modelo"]),
          serie, tag,
          centro_custo: str(r["Centro Custo"]),
          inicio_op: parseDate(r["Início Operação"] ?? r["Inicio Operacao"]),
          termino_contrato: parseDate(r["Término Contrato"] ?? r["Termino Contrato"]),
          hor_inicial, hor_final, ht_calculado, ht_informado, divergencia_ht,
          garantia_contratual, horas_disposicao, horas_mecanicas, complementares,
          tipo_pagamento: str(r["Tipo Pagamento"]),
          valor_hora, desc_manutencao, excecao_chuvoso,
          observacoes: str(r["Observações"] ?? r["Observacoes"]),
          horas_liquidas, horas_a_pagar, valor_final,
          erros, alertas,
        };
      });

      // Validação: contrato duplicado na mesma competência (mesma combinação dj+mês_ref+tag duplicada)
      const seen = new Map<string, number>();
      parsed.forEach((l, i) => {
        const k = `${l.numero_dj}|${l.mes_ref}|${l.tag}`;
        if (seen.has(k)) {
          l.erros.push("Linha duplicada (mesmo contrato/mês/tag)");
          parsed[seen.get(k)!].erros.push("Linha duplicada (mesmo contrato/mês/tag)");
        } else seen.set(k, i);
      });

      setLinhas(parsed);
      toast.success(`${parsed.length} linha(s) carregada(s) da aba "${sheetName}"`);
    } catch (e: any) {
      toast.error("Erro ao ler planilha: " + e.message);
    }
  };

  const totais = linhas.reduce((acc, l) => ({
    equipamentos: acc.equipamentos + (l.erros.length === 0 ? 1 : 0),
    horas_trab: acc.horas_trab + l.ht_informado,
    horas_disp: acc.horas_disp + l.horas_disposicao,
    horas_mec: acc.horas_mec + l.horas_mecanicas,
    descontos: acc.descontos + l.desc_manutencao,
    valor: acc.valor + l.valor_final,
    erros: acc.erros + l.erros.length,
    alertas: acc.alertas + l.alertas.length,
  }), { equipamentos: 0, horas_trab: 0, horas_disp: 0, horas_mec: 0, descontos: 0, valor: 0, erros: 0, alertas: 0 });

  const validas = linhas.filter((l) => l.erros.length === 0);

  const confirmar = async () => {
    if (!validas.length) { toast.error("Nenhuma linha válida"); return; }
    setImporting(true);
    try {
      // Caches
      const clientesCache = new Map<string, string>(); // contratado -> cliente_id
      const contratosCache = new Map<string, { id: string; valor_hora: number; garantia: number }>(); // numero_dj -> id
      const equipsCache = new Map<string, string>(); // serie|tag -> equipamento_id
      const contratoEquipCache = new Map<string, string>(); // contrato_id|equipamento_id -> ce_id
      const medicoesCache = new Map<string, string>(); // contrato_id|mes_ref -> medicao_id

      // Pré-carregar
      const [{ data: cli }, { data: ctr }, { data: eqp }] = await Promise.all([
        supabase.from("clientes").select("id, razao_social"),
        supabase.from("contratos").select("id, numero_dj, valor_hora_padrao, garantia_minima_horas"),
        supabase.from("equipamentos").select("id, serie, tag"),
      ]);
      cli?.forEach((c: any) => clientesCache.set(c.razao_social.toUpperCase(), c.id));
      ctr?.forEach((c: any) => contratosCache.set(c.numero_dj, { id: c.id, valor_hora: Number(c.valor_hora_padrao ?? 0), garantia: Number(c.garantia_minima_horas ?? 0) }));
      eqp?.forEach((e: any) => equipsCache.set(`${e.serie ?? ""}|${e.tag ?? ""}`, e.id));

      let createdCli = 0, createdCtr = 0, createdEqp = 0, createdMed = 0, createdItens = 0;

      for (const l of validas) {
        // 1. Cliente
        const cliKey = l.contratado.toUpperCase();
        let clienteId = clientesCache.get(cliKey);
        if (!clienteId) {
          const { data, error } = await supabase.from("clientes").insert({
            razao_social: l.contratado, cnpj: `IMPORT-${Date.now()}-${createdCli}`, status: "ativo",
          } as any).select("id").single();
          if (error) throw error;
          clienteId = data.id; clientesCache.set(cliKey, clienteId); createdCli++;
        }

        // 2. Contrato
        let contrato = contratosCache.get(l.numero_dj);
        if (!contrato) {
          const inicio = l.inicio_op ?? (l.mes_ref ?? new Date().toISOString().slice(0, 10));
          const termino = l.termino_contrato ?? new Date(new Date(inicio).getFullYear() + 1, 11, 31).toISOString().slice(0, 10);
          const { data, error } = await supabase.from("contratos").insert({
            numero_dj: l.numero_dj, cliente_id: clienteId,
            tipo_servico: l.tipo_equip || "Locação", centro_custo: l.centro_custo || null,
            inicio_operacao: inicio, termino_contrato: termino,
            valor_hora_padrao: l.valor_hora, garantia_minima_horas: l.garantia_contratual,
            status: "ativo",
          } as any).select("id, valor_hora_padrao, garantia_minima_horas").single();
          if (error) throw error;
          contrato = { id: data.id, valor_hora: Number(data.valor_hora_padrao ?? 0), garantia: Number(data.garantia_minima_horas ?? 0) };
          contratosCache.set(l.numero_dj, contrato); createdCtr++;
        }

        // 3. Equipamento
        const eqpKey = `${l.serie}|${l.tag}`;
        let equipId = equipsCache.get(eqpKey);
        if (!equipId) {
          const { data, error } = await supabase.from("equipamentos").insert({
            tag: l.tag, serie: l.serie, modelo: l.modelo || "—", tipo: l.tipo_equip || "—", status: "ativo",
          } as any).select("id").single();
          if (error) throw error;
          equipId = data.id; equipsCache.set(eqpKey, equipId); createdEqp++;
        }

        // 4. Vincular ao contrato
        const ceKey = `${contrato.id}|${equipId}`;
        let ceId = contratoEquipCache.get(ceKey);
        if (!ceId) {
          const { data: existing } = await supabase.from("contrato_equipamentos")
            .select("id").eq("contrato_id", contrato.id).eq("equipamento_id", equipId).maybeSingle();
          if (existing) { ceId = existing.id; }
          else {
            const { data, error } = await supabase.from("contrato_equipamentos").insert({
              contrato_id: contrato.id, equipamento_id: equipId,
              data_inicio: l.inicio_op ?? l.mes_ref!, horimetro_inicial: l.hor_inicial,
              valor_hora_override: l.valor_hora || null, ativo: true,
            } as any).select("id").single();
            if (error) throw error;
            ceId = data.id;
          }
          contratoEquipCache.set(ceKey, ceId);
        }

        // 5. Medição (uma por contrato+competência)
        const medKey = `${contrato.id}|${l.mes_ref}`;
        let medicaoId = medicoesCache.get(medKey);
        if (!medicaoId) {
          const { data: existing } = await supabase.from("medicoes")
            .select("id").eq("contrato_id", contrato.id).eq("competencia", l.mes_ref!).maybeSingle();
          if (existing) {
            medicaoId = existing.id;
            // Limpa itens antigos para reimportar
            await supabase.from("medicao_itens").delete().eq("medicao_id", medicaoId);
          } else {
            const { data, error } = await supabase.from("medicoes").insert({
              contrato_id: contrato.id, competencia: l.mes_ref!,
              periodo_inicio: l.mes_ref!, periodo_fim: lastDayOfMonth(l.mes_ref!),
              status: "rascunho",
              observacoes: `Importado de ${filename}`,
            } as any).select("id").single();
            if (error) throw error;
            medicaoId = data.id; createdMed++;
          }
          medicoesCache.set(medKey, medicaoId);
        }

        // 6. Item de medição (recalculando)
        const calc = calcularItem({
          horas_informadas: l.ht_informado,
          horas_mecanicas: l.horas_mecanicas,
          horas_paradas: 0,
          horas_chuvoso: 0,
          horas_excecao_chuvoso: l.excecao_chuvoso,
          valor_hora_override: l.valor_hora,
          complementares_extra: l.complementares,
        }, [], l.mes_ref!, l.valor_hora, l.garantia_contratual);

        // descontos manuais (Desc. Manutenção)
        const valor_final_real = calc.valor_final - l.desc_manutencao;

        const { error: errIt } = await supabase.from("medicao_itens").insert({
          medicao_id: medicaoId, equipamento_id: equipId, contrato_equipamento_id: ceId,
          periodo_inicio: l.mes_ref!, periodo_fim: lastDayOfMonth(l.mes_ref!),
          horimetro_inicial: l.hor_inicial, horimetro_final: l.hor_final,
          horas_informadas: l.ht_informado,
          horas_mecanicas: l.horas_mecanicas,
          horas_paradas: l.horas_disposicao,
          horas_chuvoso: 0,
          horas_excecao_chuvoso: l.excecao_chuvoso,
          horas_descontaveis: calc.horas_descontaveis,
          horas_liquidas: calc.horas_liquidas,
          garantia_minima: l.garantia_contratual,
          horas_a_pagar: calc.horas_a_pagar,
          valor_hora: l.valor_hora,
          valor_bruto: calc.valor_bruto,
          valor_complementares: l.complementares,
          valor_descontos: l.desc_manutencao,
          valor_final: valor_final_real,
          regras_aplicadas: calc.regras_aplicadas as any,
          memoria_calculo: calc.memoria_calculo as any,
          observacoes: l.observacoes || null,
        } as any);
        if (errIt) throw errIt;
        createdItens++;
      }

      // Atualizar totais das medições criadas
      for (const medicaoId of medicoesCache.values()) {
        const { data: itens } = await supabase.from("medicao_itens")
          .select("horas_informadas, horas_liquidas, horas_a_pagar, valor_bruto, valor_complementares, valor_descontos, valor_final")
          .eq("medicao_id", medicaoId);
        const t = (itens ?? []).reduce((a, i: any) => ({
          hi: a.hi + Number(i.horas_informadas), hl: a.hl + Number(i.horas_liquidas), hp: a.hp + Number(i.horas_a_pagar),
          vb: a.vb + Number(i.valor_bruto), vc: a.vc + Number(i.valor_complementares),
          vd: a.vd + Number(i.valor_descontos), vf: a.vf + Number(i.valor_final),
        }), { hi: 0, hl: 0, hp: 0, vb: 0, vc: 0, vd: 0, vf: 0 });
        await supabase.from("medicoes").update({
          total_horas_informadas: t.hi, total_horas_liquidas: t.hl, total_horas_pagar: t.hp,
          valor_bruto: t.vb, valor_complementares: t.vc, valor_descontos: t.vd, valor_final: t.vf,
        } as any).eq("id", medicaoId);
      }

      toast.success(`Importação concluída: ${createdItens} itens em ${medicoesCache.size} medição(ões). ${createdCli} clientes, ${createdCtr} contratos, ${createdEqp} equipamentos novos.`);
      navigate("/medicoes");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally { setImporting(false); }
  };

  return (
    <div>
      <PageHeader
        title="Importar planilha de medição"
        description='Carregue um arquivo .xlsx contendo a aba "BASE DE DADOS"'
        actions={<Button variant="outline" onClick={() => navigate("/medicoes")}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>}
      />

      <Card className="mb-4"><CardContent className="p-4">
        <Label>Arquivo Excel (.xlsx) *</Label>
        <Input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <p className="mt-2 text-xs text-muted-foreground">A planilha deve conter uma aba chamada "BASE DE DADOS".</p>
      </CardContent></Card>

      {linhas.length > 0 && (
        <>
          <Card className="mb-4"><CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Pré-visualização</h3>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Stat label="Equipamentos" value={String(totais.equipamentos)} />
              <Stat label="Horas trabalhadas" value={totais.horas_trab.toFixed(2)} />
              <Stat label="Horas à disposição" value={totais.horas_disp.toFixed(2)} />
              <Stat label="Horas mecânicas" value={totais.horas_mec.toFixed(2)} />
              <Stat label="Descontos" value={fmtBRL(totais.descontos)} />
              <Stat label="Valor total" value={fmtBRL(totais.valor)} highlight />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="default"><CheckCircle2 className="mr-1 h-3 w-3" />{validas.length} válidas</Badge>
              {totais.erros > 0 && <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />{totais.erros} erro(s)</Badge>}
              {totais.alertas > 0 && <Badge variant="secondary">{totais.alertas} alerta(s)</Badge>}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => { setLinhas([]); setFilename(""); }}>Cancelar</Button>
                <Button onClick={confirmar} disabled={importing || validas.length === 0}>
                  {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                  Confirmar importação ({validas.length})
                </Button>
              </div>
            </div>
          </CardContent></Card>

          {totais.erros + totais.alertas > 0 && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Linhas com erros não serão importadas. Alertas são apenas avisos e não bloqueiam a importação.
              </AlertDescription>
            </Alert>
          )}

          <Card><CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span className="font-medium">{filename}</span>
              <span className="text-muted-foreground">({linhas.length} linhas)</span>
            </div>
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Mês</TableHead>
                  <TableHead>Nº DJ</TableHead>
                  <TableHead>Contratado</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead className="text-right">HT Calc.</TableHead>
                  <TableHead className="text-right">HT Inf.</TableHead>
                  <TableHead className="text-right">H. pagar</TableHead>
                  <TableHead className="text-right">Valor final</TableHead>
                  <TableHead>Mensagens</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {linhas.slice(0, 300).map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.erros.length === 0 ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-destructive" />}</TableCell>
                      <TableCell className="text-xs num">{l.mes_ref?.slice(0, 7) ?? "?"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.numero_dj}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{l.contratado}</TableCell>
                      <TableCell className="font-mono text-xs">{l.tag}</TableCell>
                      <TableCell className="num text-xs">{l.ht_calculado.toFixed(2)}</TableCell>
                      <TableCell className="num text-xs">{l.ht_informado.toFixed(2)}</TableCell>
                      <TableCell className="num text-xs">{l.horas_a_pagar.toFixed(2)}</TableCell>
                      <TableCell className="num text-xs font-medium">{fmtBRL(l.valor_final)}</TableCell>
                      <TableCell className="text-xs">
                        {l.erros.map((e, j) => <div key={j} className="text-destructive">• {e}</div>)}
                        {l.alertas.map((a, j) => <div key={j} className="text-warning">⚠ {a}</div>)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {linhas.length > 300 && <p className="mt-2 text-xs text-muted-foreground">... primeiras 300 de {linhas.length}</p>}
            </div>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold num ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
