import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtBRL, fmtDate, fmtNum } from "@/lib/format";
import { Download } from "lucide-react";

export default function Relatorios() {
  const [ini, setIni] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [fim, setFim] = useState(new Date().toISOString().slice(0, 10));
  const [porCliente, setPorCliente] = useState<any[]>([]);
  const [porEquip, setPorEquip] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: m } = await supabase.from("medicoes").select("valor_final, total_horas_pagar, contratos(clientes(razao_social))").gte("competencia", ini).lte("competencia", fim).in("status", ["aprovada", "faturada"]);
      const cli: Record<string, { nome: string; valor: number; horas: number }> = {};
      m?.forEach((x: any) => {
        const k = x.contratos?.clientes?.razao_social ?? "—";
        cli[k] = cli[k] ?? { nome: k, valor: 0, horas: 0 };
        cli[k].valor += Number(x.valor_final); cli[k].horas += Number(x.total_horas_pagar);
      });
      setPorCliente(Object.values(cli).sort((a, b) => b.valor - a.valor));

      const { data: it } = await supabase.from("medicao_itens").select("horas_a_pagar, valor_final, equipamentos(tag, tipo, modelo), medicoes!inner(competencia, status)").gte("medicoes.competencia", ini).lte("medicoes.competencia", fim);
      const eq: Record<string, any> = {};
      it?.forEach((x: any) => {
        const tag = x.equipamentos?.tag ?? "—";
        eq[tag] = eq[tag] ?? { tag, equip: `${x.equipamentos?.tipo} ${x.equipamentos?.modelo}`, horas: 0, valor: 0 };
        eq[tag].horas += Number(x.horas_a_pagar); eq[tag].valor += Number(x.valor_final);
      });
      setPorEquip(Object.values(eq).sort((a: any, b: any) => b.valor - a.valor));
    })();
  }, [ini, fim]);

  const exportCSV = (rows: any[], cols: string[], file: string) => {
    const csv = [cols.join(";"), ...rows.map((r) => cols.map((c) => r[c]).join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = file; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Relatórios" description="Análises consolidadas por cliente e equipamento" />
      <Card className="mb-4"><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div><label className="text-xs text-muted-foreground">De</label><Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">Até</label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
        <p className="ml-auto text-sm num">Período: <strong>{fmtDate(ini)} → {fmtDate(fim)}</strong></p>
      </CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Faturamento por cliente</CardTitle>
            <Button size="sm" variant="outline" onClick={() => exportCSV(porCliente, ["nome", "horas", "valor"], "clientes.csv")}><Download className="mr-1 h-4 w-4" />CSV</Button>
          </CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Horas</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>{porCliente.map((c) => (<TableRow key={c.nome}><TableCell className="text-sm">{c.nome}</TableCell><TableCell className="text-right num">{fmtNum(c.horas)}</TableCell><TableCell className="text-right num font-semibold">{fmtBRL(c.valor)}</TableCell></TableRow>))}</TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Horas por equipamento</CardTitle>
            <Button size="sm" variant="outline" onClick={() => exportCSV(porEquip, ["tag", "equip", "horas", "valor"], "equipamentos.csv")}><Download className="mr-1 h-4 w-4" />CSV</Button>
          </CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Tag</TableHead><TableHead>Equipamento</TableHead><TableHead className="text-right">Horas</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>{porEquip.map((e) => (<TableRow key={e.tag}><TableCell className="font-mono">{e.tag}</TableCell><TableCell className="text-sm">{e.equip}</TableCell><TableCell className="text-right num">{fmtNum(e.horas)}</TableCell><TableCell className="text-right num font-semibold">{fmtBRL(e.valor)}</TableCell></TableRow>))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
