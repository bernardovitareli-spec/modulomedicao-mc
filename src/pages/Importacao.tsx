import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { calcularItem, Regra } from "@/lib/calculo";

const CAMPOS = ["Contratante","CNPJ","Nº DJ","Tipo Serviço","Centro Custo","Período Início","Período Fim","Tipo Equipamento","Modelo","Série","Tag","Horímetro Inicial","Horímetro Final","Horas Informadas","Garantia Contratual","Período Chuvoso","Exceção Chuvoso","Horas Mecânicas","Valor/Hora","Complementares","Observações","Início Operação","Término Contrato"];

interface Linha { raw: any; status: "ok" | "erro"; erros: string[]; contrato_id?: string; equipamento_id?: string; }

const parseDate = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
};
const num = (v: any) => Number(String(v ?? "0").replace(",", ".")) || 0;

export default function Importacao() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);

  const onFile = async (file: File) => {
    setFilename(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // Buscar contratos e equipamentos para validação
    const [contratos, equipamentos] = await Promise.all([
      supabase.from("contratos").select("id, numero_dj, clientes(cnpj)"),
      supabase.from("equipamentos").select("id, tag"),
    ]);
    const mapaContrato = new Map(contratos.data?.map((c: any) => [c.numero_dj, c.id]) ?? []);
    const mapaEquip = new Map(equipamentos.data?.map((e: any) => [e.tag, e.id]) ?? []);

    const out: Linha[] = rows.map((r) => {
      const erros: string[] = [];
      const numDJ = String(r["Nº DJ"] ?? "").trim();
      const tag = String(r["Tag"] ?? "").trim();
      const pIni = parseDate(r["Período Início"]);
      const pFim = parseDate(r["Período Fim"]);
      const hIni = num(r["Horímetro Inicial"]);
      const hFim = num(r["Horímetro Final"]);
      const contrato_id = mapaContrato.get(numDJ);
      const equipamento_id = mapaEquip.get(tag);
      if (!contrato_id) erros.push(`Contrato ${numDJ} não cadastrado`);
      if (!equipamento_id) erros.push(`Equipamento ${tag} não cadastrado`);
      if (!pIni || !pFim) erros.push("Datas inválidas");
      if (hFim < hIni) erros.push("Horímetro final < inicial");
      return { raw: r, status: erros.length ? "erro" : "ok", erros, contrato_id, equipamento_id };
    });
    setLinhas(out);
  };

  const importar = async () => {
    const validas = linhas.filter((l) => l.status === "ok");
    if (!validas.length) { notify.error("Nenhuma linha válida"); return; }
    setImporting(true);

    try {
      const compDate = competencia + "-01";
      const { data: imp, error: errImp } = await supabase.from("importacoes").insert({
        arquivo_nome: filename, competencia: compDate,
        total_linhas: linhas.length, linhas_validas: validas.length, linhas_erro: linhas.length - validas.length,
      } as any).select().single();
      if (errImp) throw errImp;

      // Agrupa por contrato
      const porContrato = new Map<string, Linha[]>();
      validas.forEach((l) => {
        const arr = porContrato.get(l.contrato_id!) ?? [];
        arr.push(l); porContrato.set(l.contrato_id!, arr);
      });

      for (const [contratoId, items] of porContrato) {
        // Carregar regras vigentes
        const { data: regras } = await supabase.from("contrato_regras").select("*").eq("contrato_id", contratoId);
        const { data: contrato } = await supabase.from("contratos").select("valor_hora_padrao, garantia_minima_horas").eq("id", contratoId).single();

        const periodos = items.map((i) => parseDate(i.raw["Período Início"])!).sort();
        const periodoInicio = periodos[0]; const periodoFim = items.map((i) => parseDate(i.raw["Período Fim"])!).sort().reverse()[0];

        // Cria/recupera medição
        const { data: medExistente } = await supabase.from("medicoes").select("id").eq("contrato_id", contratoId).eq("competencia", compDate).maybeSingle();
        let medicaoId = medExistente?.id;
        if (!medicaoId) {
          const { data: med, error: errMed } = await supabase.from("medicoes").insert({
            contrato_id: contratoId, competencia: compDate, periodo_inicio: periodoInicio, periodo_fim: periodoFim,
            status: "rascunho", importacao_id: imp.id,
          } as any).select().single();
          if (errMed) throw errMed; medicaoId = med.id;
        } else {
          await supabase.from("medicao_itens").delete().eq("medicao_id", medicaoId);
        }

        let totHi = 0, totHl = 0, totHp = 0, vBruto = 0, vComp = 0, vDesc = 0, vGl = 0, vAd = 0, vFinal = 0;

        for (const l of items) {
          const r = l.raw;
          const calc = calcularItem({
            horas_informadas: num(r["Horas Informadas"]) || (num(r["Horímetro Final"]) - num(r["Horímetro Inicial"])),
            horas_mecanicas: num(r["Horas Mecânicas"]),
            horas_paradas: 0,
            horas_chuvoso: num(r["Período Chuvoso"]),
            horas_excecao_chuvoso: num(r["Exceção Chuvoso"]),
            valor_hora_override: r["Valor/Hora"] ? num(r["Valor/Hora"]) : undefined,
            complementares_extra: num(r["Complementares"]),
          }, (regras ?? []) as Regra[], parseDate(r["Período Início"])!, Number(contrato?.valor_hora_padrao ?? 0), Number(contrato?.garantia_minima_horas ?? 0));

          await supabase.from("medicao_itens").insert({
            medicao_id: medicaoId, equipamento_id: l.equipamento_id!,
            periodo_inicio: parseDate(r["Período Início"])!, periodo_fim: parseDate(r["Período Fim"])!,
            horimetro_inicial: num(r["Horímetro Inicial"]), horimetro_final: num(r["Horímetro Final"]),
            ...calc, regras_aplicadas: calc.regras_aplicadas as any, memoria_calculo: calc.memoria_calculo as any,
            observacoes: r["Observações"] ?? null,
          } as any);

          totHi += calc.horas_informadas; totHl += calc.horas_liquidas; totHp += calc.horas_a_pagar;
          vBruto += calc.valor_bruto; vComp += calc.valor_complementares; vDesc += calc.valor_descontos;
          vGl += calc.valor_glosas; vAd += calc.valor_aditivos; vFinal += calc.valor_final;
        }

        await supabase.from("medicoes").update({
          total_horas_informadas: totHi, total_horas_liquidas: totHl, total_horas_pagar: totHp,
          valor_bruto: vBruto, valor_complementares: vComp, valor_descontos: vDesc,
          valor_glosas: vGl, valor_aditivos: vAd, valor_final: vFinal,
        } as any).eq("id", medicaoId);
      }

      notify.success(`Importadas ${validas.length} linha(s) em ${porContrato.size} medição(ões)`);
      setLinhas([]); setFilename("");
    } catch (e: any) {
      notify.error("Erro: " + e.message);
    } finally { setImporting(false); }
  };

  const okCount = linhas.filter((l) => l.status === "ok").length;
  const erroCount = linhas.length - okCount;

  return (
    <div>
      <PageHeader title="Importação mensal" description="Carregue a planilha XLSX/CSV com os dados das medições" />
      <Card className="mb-4"><CardContent className="p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label>Competência *</Label><Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Arquivo (.xlsx ou .csv) *</Label>
            <Input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </div>
        </div>
        <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Campos esperados (23)</summary><div className="mt-2 grid grid-cols-2 gap-1 md:grid-cols-3">{CAMPOS.map((c) => <span key={c} className="font-mono">• {c}</span>)}</div></details>
      </CardContent></Card>

      {linhas.length > 0 && (
        <Card><CardContent className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">{filename}</span>
            <Badge variant="default" className="ml-2"><CheckCircle2 className="mr-1 h-3 w-3" />{okCount} válidas</Badge>
            {erroCount > 0 && <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />{erroCount} com erro</Badge>}
            <Button className="ml-auto" onClick={importar} disabled={importing || okCount === 0}>
              {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
              Importar {okCount} linha(s)
            </Button>
          </div>
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Nº DJ</TableHead><TableHead>Tag</TableHead><TableHead>Período</TableHead><TableHead>Horas Inf.</TableHead><TableHead>Mensagens</TableHead></TableRow></TableHeader>
              <TableBody>
                {linhas.slice(0, 200).map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{l.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-destructive" />}</TableCell>
                    <TableCell className="font-mono text-xs">{l.raw["Nº DJ"]}</TableCell>
                    <TableCell className="font-mono text-xs">{l.raw["Tag"]}</TableCell>
                    <TableCell className="text-xs num">{String(l.raw["Período Início"])} → {String(l.raw["Período Fim"])}</TableCell>
                    <TableCell className="num text-xs">{l.raw["Horas Informadas"]}</TableCell>
                    <TableCell className="text-xs text-destructive">{l.erros.join("; ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {linhas.length > 200 && <p className="mt-2 text-xs text-muted-foreground">... mostrando primeiras 200 de {linhas.length}</p>}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
