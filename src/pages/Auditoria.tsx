import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, ShieldAlert } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { usePermissions } from "@/lib/permissions";
import { Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export default function Auditoria() {
  const { canViewAudit } = usePermissions();
  const [list, setList] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!canViewAudit) return;
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setList(data ?? []));
  }, [canViewAudit]);

  if (!canViewAudit) return <Navigate to="/" replace />;

  const filtered = list.filter((l) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return JSON.stringify(l).toLowerCase().includes(s);
  });

  return (
    <div>
      <PageHeader title="Auditoria" description="Registro de exclusões, cancelamentos e alterações sensíveis" />
      <Card><CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} registro(s)</span>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data/hora</TableHead>
            <TableHead>Usuário</TableHead>
            <TableHead>Perfil</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Entidade</TableHead>
            <TableHead>Cliente / Contrato / Competência</TableHead>
            <TableHead>Motivo</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
              <ShieldAlert className="mx-auto mb-2 h-6 w-6" />Nenhum registro
            </TableCell></TableRow>}
            {filtered.map((l) => {
              const ctx = l.contexto || {};
              return (
                <TableRow key={l.id}>
                  <TableCell className="num text-xs">{fmtDate(l.created_at)} {new Date(l.created_at).toLocaleTimeString("pt-BR")}</TableCell>
                  <TableCell className="font-mono text-xs">{l.user_id?.slice(0, 8)}...</TableCell>
                  <TableCell><Badge variant="outline">{l.perfil_usuario || "-"}</Badge></TableCell>
                  <TableCell><Badge variant={l.acao.startsWith("DELETE") || l.acao === "PURGE" ? "destructive" : "secondary"}>{l.acao}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{l.entidade}</TableCell>
                  <TableCell className="text-xs">
                    {ctx.cliente && <div>{ctx.cliente}</div>}
                    {ctx.contrato && <div className="font-mono">{ctx.contrato}</div>}
                    {ctx.competencia && <div>{ctx.competencia}</div>}
                    {ctx.qtd_itens != null && <div className="text-muted-foreground">{ctx.qtd_itens} itens</div>}
                  </TableCell>
                  <TableCell className="text-xs max-w-xs">{l.motivo || "-"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
