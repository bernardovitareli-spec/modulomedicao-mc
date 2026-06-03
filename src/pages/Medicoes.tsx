import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Search, Plus, Upload, MoreHorizontal, Eye, Pencil, Trash2, Ban, History } from "lucide-react";
import { fmtBRL, fmtCompetencia } from "@/lib/format";
import { StatusBadge } from "@/components/contrato/ContratoMedicoesTab";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/lib/permissions";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { notify } from "@/lib/notify";

export default function Medicoes() {
  const navigate = useNavigate();
  const perms = usePermissions();
  const [list, setList] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [versaoFilter, setVersaoFilter] = useState<"ativas" | "todas" | "inativas" | "canceladas">("ativas");
  const [delTarget, setDelTarget] = useState<any>(null);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [versionCounts, setVersionCounts] = useState<Record<string, number>>({});

  const load = async () => {
    let q = supabase.from("medicoes").select("*, contratos(numero_dj, clientes(razao_social))").order("competencia", { ascending: false });
    if (status !== "todos") q = q.eq("status", status as any);
    if (versaoFilter === "ativas") q = q.eq("ativa", true);
    else if (versaoFilter === "inativas") q = q.eq("ativa", false);
    else if (versaoFilter === "canceladas") q = q.eq("status", "cancelada" as any);
    const { data } = await q;
    setList(data ?? []);

    // Calcula contagem de versões por cadeia (medicao_original_id ou id)
    const { data: all } = await supabase.from("medicoes").select("id, medicao_original_id");
    const counts: Record<string, number> = {};
    (all ?? []).forEach((m: any) => {
      const k = m.medicao_original_id ?? m.id;
      counts[k] = (counts[k] ?? 0) + 1;
    });
    setVersionCounts(counts);
  };
  useEffect(() => { load(); }, [status, versaoFilter]);

  const filtered = list.filter((m) =>
    !search || m.contratos?.numero_dj?.toLowerCase().includes(search.toLowerCase()) || m.contratos?.clientes?.razao_social?.toLowerCase().includes(search.toLowerCase()),
  );

  const onDelete = async (motivo: string): Promise<void> => {
    if (!delTarget) return;
    setLoading(true);
    const { error } = await supabase.rpc("delete_medicao_safe", { _medicao_id: delTarget.id, _motivo: motivo });
    setLoading(false);
    if (error) { notify.error(error.message); return; }
    notify.success("Medição excluída");
    setDelTarget(null); load();
  };

  const onCancel = async (motivo: string): Promise<void> => {
    if (!cancelTarget) return;
    setLoading(true);
    const { error } = await supabase.rpc("cancel_medicao", { _medicao_id: cancelTarget.id, _motivo: motivo });
    setLoading(false);
    if (error) { notify.error(error.message); return; }
    notify.success("Medição cancelada");
    setCancelTarget(null); load();
  };

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
              <SelectItem value="importada">Importada</SelectItem>
              <SelectItem value="revisao_tecnica">Em revisão</SelectItem>
              <SelectItem value="aprovada">Aprovada</SelectItem>
              <SelectItem value="faturada">Faturada</SelectItem>
              <SelectItem value="rejeitada">Rejeitada</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={versaoFilter} onValueChange={(v) => setVersaoFilter(v as any)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativas">Apenas versões ativas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="canceladas">Canceladas</SelectItem>
              <SelectItem value="inativas">Versões anteriores (inativas)</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} medição(ões)</span>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Competência</TableHead><TableHead>Contrato</TableHead><TableHead>Cliente</TableHead>
            <TableHead className="text-right">Horas pagar</TableHead><TableHead className="text-right">Valor final</TableHead>
            <TableHead>Status</TableHead><TableHead className="w-12"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Nenhuma medição.</TableCell></TableRow>}
            {filtered.map((m) => {
              const podeExcluir = perms.canDeleteMedicao(m.status);
              const podeCancelar = perms.canCancelMedicao(m.status);
              const podeEditar = perms.canEditMedicao(m.status);
              return (
                <TableRow key={m.id} className="cursor-pointer" onClick={() => navigate(`/medicoes/${m.id}`)}>
                  <TableCell className="num font-medium">{fmtCompetencia(m.competencia)}</TableCell>
                  <TableCell className="font-mono">{m.contratos?.numero_dj}</TableCell>
                  <TableCell className="text-sm">{m.contratos?.clientes?.razao_social}</TableCell>
                  <TableCell className="text-right num">{Number(m.total_horas_pagar).toFixed(2)}</TableCell>
                  <TableCell className="text-right num font-semibold">{fmtBRL(m.valor_final)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={m.status} />
                      {Number(m.versao ?? 1) > 1 && <Badge variant="outline" className="text-[10px]"><History className="h-2.5 w-2.5 mr-0.5" />v{m.versao}</Badge>}
                      {m.ativa === false && <Badge variant="secondary" className="text-[10px]">inativa</Badge>}
                      {(versionCounts[m.medicao_original_id ?? m.id] ?? 1) > 1 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] cursor-pointer border-primary text-primary hover:bg-primary/10"
                          onClick={(e) => { e.stopPropagation(); navigate(`/medicoes/${m.id}?tab=versoes`); }}
                          title="Possui versões — clique para ver histórico"
                        >
                          <History className="h-2.5 w-2.5 mr-0.5" />Possui versões ({versionCounts[m.medicao_original_id ?? m.id]})
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/medicoes/${m.id}`)}>
                          <Eye className="mr-2 h-4 w-4" />Visualizar
                        </DropdownMenuItem>
                        {podeEditar && (
                          <DropdownMenuItem onClick={() => navigate(`/medicoes/${m.id}`)}>
                            <Pencil className="mr-2 h-4 w-4" />Editar
                          </DropdownMenuItem>
                        )}
                        {(podeCancelar || podeExcluir) && <DropdownMenuSeparator />}
                        {podeCancelar && (
                          <DropdownMenuItem onClick={() => setCancelTarget(m)}>
                            <Ban className="mr-2 h-4 w-4" />Cancelar medição
                          </DropdownMenuItem>
                        )}
                        {podeExcluir && (
                          <DropdownMenuItem className="text-destructive" onClick={() => setDelTarget(m)}>
                            <Trash2 className="mr-2 h-4 w-4" />Excluir medição
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>

      <DeleteConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="Excluir medição"
        message="Tem certeza que deseja excluir esta medição? Esta ação removerá todos os itens da medição e não poderá ser desfeita."
        confirmWord="EXCLUIR"
        loading={loading}
        onConfirm={onDelete}
      />
      <DeleteConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Cancelar medição"
        message="Cancelar mantém o histórico e marca o status como 'cancelada'. Informe o motivo."
        confirmWord="CANCELAR"
        loading={loading}
        onConfirm={onCancel}
      />
    </div>
  );
}
