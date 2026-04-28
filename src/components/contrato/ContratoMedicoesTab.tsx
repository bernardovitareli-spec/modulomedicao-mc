import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtBRL, fmtDate } from "@/lib/format";

export default function ContratoMedicoesTab({ contratoId }: { contratoId: string }) {
  const [list, setList] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("medicoes").select("*").eq("contrato_id", contratoId).order("competencia", { ascending: false })
      .then(({ data }) => setList(data ?? []));
  }, [contratoId]);

  return (
    <Card><CardContent className="p-4">
      <h3 className="mb-3 text-sm font-semibold">Medições do contrato</h3>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Competência</TableHead><TableHead>Período</TableHead>
          <TableHead className="text-right">Horas a pagar</TableHead><TableHead className="text-right">Valor final</TableHead>
          <TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {list.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">Nenhuma medição.</TableCell></TableRow>}
          {list.map((m) => (
            <TableRow key={m.id} className="cursor-pointer" onClick={() => navigate(`/medicoes/${m.id}`)}>
              <TableCell className="num font-medium">{fmtDate(m.competencia).slice(3)}</TableCell>
              <TableCell className="text-sm num">{fmtDate(m.periodo_inicio)} → {fmtDate(m.periodo_fim)}</TableCell>
              <TableCell className="text-right num">{Number(m.total_horas_pagar).toFixed(2)}</TableCell>
              <TableCell className="text-right num font-semibold">{fmtBRL(m.valor_final)}</TableCell>
              <TableCell><StatusBadge status={m.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { v: any; l: string }> = {
    rascunho: { v: "outline", l: "Rascunho" },
    revisao_tecnica: { v: "secondary", l: "Em revisão" },
    aprovada: { v: "default", l: "Aprovada" },
    faturada: { v: "default", l: "Faturada" },
    rejeitada: { v: "destructive", l: "Rejeitada" },
    contestada: { v: "destructive", l: "Contestada" },
  };
  const c = map[status] ?? { v: "secondary", l: status };
  return <Badge variant={c.v}>{c.l}</Badge>;
}
