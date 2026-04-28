import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { fmtBRL, fmtDate, fmtNum } from "@/lib/format";
import { StatusBadge } from "@/components/contrato/ContratoMedicoesTab";

export default function Boletim() {
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    const start = comp + "-01";
    supabase.from("medicoes").select("*, contratos(numero_dj, clientes(razao_social))").eq("competencia", start)
      .then(({ data }) => setList(data ?? []));
  }, [comp]);

  const total = list.reduce((s, m) => s + Number(m.valor_final ?? 0), 0);
  const totalH = list.reduce((s, m) => s + Number(m.total_horas_pagar ?? 0), 0);

  return (
    <div>
      <PageHeader title="Boletim consolidado" description="Visão consolidada das medições por competência" />
      <Card className="mb-4"><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div><label className="text-xs text-muted-foreground">Competência</label><Input type="month" value={comp} onChange={(e) => setComp(e.target.value)} /></div>
        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground">Total horas a pagar / valor final</p>
          <p className="text-lg font-bold num text-primary">{fmtNum(totalH)} h · {fmtBRL(total)}</p>
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Contrato</TableHead><TableHead>Cliente</TableHead><TableHead>Período</TableHead><TableHead className="text-right">H. pagar</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Sem medições nesta competência.</TableCell></TableRow>}
            {list.map((m) => (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => navigate(`/medicoes/${m.id}`)}>
                <TableCell className="font-mono">{m.contratos?.numero_dj}</TableCell>
                <TableCell className="text-sm">{m.contratos?.clientes?.razao_social}</TableCell>
                <TableCell className="text-sm num">{fmtDate(m.periodo_inicio)} → {fmtDate(m.periodo_fim)}</TableCell>
                <TableCell className="text-right num">{fmtNum(m.total_horas_pagar)}</TableCell>
                <TableCell className="text-right num font-semibold">{fmtBRL(m.valor_final)}</TableCell>
                <TableCell><StatusBadge status={m.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
