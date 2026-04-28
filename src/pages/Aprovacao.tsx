import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fmtBRL, fmtDate } from "@/lib/format";
import { StatusBadge } from "@/components/contrato/ContratoMedicoesTab";

export default function Aprovacao() {
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("medicoes").select("*, contratos(numero_dj, clientes(razao_social))").eq("status", "revisao_tecnica").order("competencia", { ascending: false })
      .then(({ data }) => setList(data ?? []));
  }, []);

  return (
    <div>
      <PageHeader title="Aprovação de medições" description="Medições aguardando revisão técnica ou aprovação gerencial" />
      <Card><CardContent className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Competência</TableHead><TableHead>Contrato</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Nenhuma medição pendente.</TableCell></TableRow>}
            {list.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="num font-medium">{fmtDate(m.competencia).slice(3)}</TableCell>
                <TableCell className="font-mono">{m.contratos?.numero_dj}</TableCell>
                <TableCell className="text-sm">{m.contratos?.clientes?.razao_social}</TableCell>
                <TableCell className="text-right num font-semibold">{fmtBRL(m.valor_final)}</TableCell>
                <TableCell><StatusBadge status={m.status} /></TableCell>
                <TableCell><Button size="sm" onClick={() => navigate(`/medicoes/${m.id}`)}>Analisar</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
