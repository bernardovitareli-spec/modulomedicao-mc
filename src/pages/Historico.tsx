import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate } from "@/lib/format";

export default function Historico() {
  const [list, setList] = useState<any[]>([]);
  const [ent, setEnt] = useState("todas");

  useEffect(() => {
    let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
    if (ent !== "todas") q = q.eq("entidade", ent);
    q.then(({ data }) => setList(data ?? []));
  }, [ent]);

  return (
    <div>
      <PageHeader title="Histórico de alterações" description="Trilha de auditoria automática (últimos 200 registros)" />
      <Card><CardContent className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <Select value={ent} onValueChange={setEnt}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as entidades</SelectItem>
              <SelectItem value="contratos">Contratos</SelectItem>
              <SelectItem value="contrato_regras">Regras</SelectItem>
              <SelectItem value="contrato_alteracoes">Alterações</SelectItem>
              <SelectItem value="medicoes">Medições</SelectItem>
              <SelectItem value="aprovacoes">Aprovações</SelectItem>
              <SelectItem value="faturas">Faturas</SelectItem>
              <SelectItem value="clientes">Clientes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Entidade</TableHead><TableHead>Ação</TableHead><TableHead>ID</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">Sem registros.</TableCell></TableRow>}
            {list.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-xs num">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-sm">{l.entidade}</TableCell>
                <TableCell><Badge variant={l.acao === "DELETE" ? "destructive" : l.acao === "UPDATE" ? "secondary" : "default"}>{l.acao}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{l.entidade_id?.slice(0, 8)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
