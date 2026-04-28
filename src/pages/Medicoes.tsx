import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Upload } from "lucide-react";
import { fmtBRL, fmtDate, fmtCompetencia } from "@/lib/format";
import { StatusBadge } from "@/components/contrato/ContratoMedicoesTab";

export default function Medicoes() {
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");

  useEffect(() => {
    let q = supabase.from("medicoes").select("*, contratos(numero_dj, clientes(razao_social))").order("competencia", { ascending: false });
    if (status !== "todos") q = q.eq("status", status as any);
    q.then(({ data }) => setList(data ?? []));
  }, [status]);

  const filtered = list.filter((m) =>
    !search || m.contratos?.numero_dj?.toLowerCase().includes(search.toLowerCase()) || m.contratos?.clientes?.razao_social?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Medições mensais"
        description="Todas as medições por contrato e competência"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/medicoes/importar")}><Upload className="mr-1 h-4 w-4" />Importar planilha</Button>
            <Button onClick={() => navigate("/medicoes/nova")}><Plus className="mr-1 h-4 w-4" />Nova medição</Button>
          </div>
        }
      />
      <Card><CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar contrato/cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="revisao_tecnica">Em revisão</SelectItem>
              <SelectItem value="aprovada">Aprovada</SelectItem>
              <SelectItem value="faturada">Faturada</SelectItem>
              <SelectItem value="rejeitada">Rejeitada</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} medição(ões)</span>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Competência</TableHead><TableHead>Contrato</TableHead><TableHead>Cliente</TableHead>
            <TableHead className="text-right">Horas pagar</TableHead><TableHead className="text-right">Valor final</TableHead>
            <TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Nenhuma medição.</TableCell></TableRow>}
            {filtered.map((m) => (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => navigate(`/medicoes/${m.id}`)}>
                <TableCell className="num font-medium">{fmtCompetencia(m.competencia)}</TableCell>
                <TableCell className="font-mono">{m.contratos?.numero_dj}</TableCell>
                <TableCell className="text-sm">{m.contratos?.clientes?.razao_social}</TableCell>
                <TableCell className="text-right num">{Number(m.total_horas_pagar).toFixed(2)}</TableCell>
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
