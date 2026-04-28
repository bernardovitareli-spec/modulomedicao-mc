import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { usePermissions } from "@/lib/permissions";
import { Navigate } from "react-router-dom";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { toast } from "sonner";

export default function LimparImportacao() {
  const { canPurgeImportacao } = usePermissions();
  const [list, setList] = useState<any[]>([]);
  const [target, setTarget] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = () =>
    supabase.from("importacoes").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setList(data ?? []));

  useEffect(() => { if (canPurgeImportacao) load(); }, [canPurgeImportacao]);

  if (!canPurgeImportacao) return <Navigate to="/" replace />;

  const purge = async (motivo: string): Promise<void> => {
    if (!target) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("purge_importacao_teste", {
      _importacao_id: target.id, _motivo: motivo,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(`Removido: ${(data as any)?.medicoes ?? 0} medições, ${(data as any)?.equipamentos ?? 0} equipamentos, ${(data as any)?.contratos ?? 0} contratos, ${(data as any)?.clientes ?? 0} clientes.`);
    setTarget(null); load();
  };

  return (
    <div>
      <PageHeader
        title="Limpar importações de teste"
        description="Remove uma importação e seus dados órfãos (equipamentos, contratos e clientes sem outros vínculos)"
      />
      <Card><CardContent className="p-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Arquivo</TableHead>
            <TableHead>Competência</TableHead>
            <TableHead className="text-right">Linhas</TableHead>
            <TableHead className="text-right">Válidas</TableHead>
            <TableHead className="text-right">Erro</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Nenhuma importação registrada.</TableCell></TableRow>}
            {list.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="num text-xs">{fmtDate(i.created_at)}</TableCell>
                <TableCell className="text-sm">{i.arquivo_nome}</TableCell>
                <TableCell className="text-sm">{i.competencia}</TableCell>
                <TableCell className="text-right num">{i.total_linhas}</TableCell>
                <TableCell className="text-right num text-success">{i.linhas_validas}</TableCell>
                <TableCell className="text-right num text-destructive">{i.linhas_erro}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="destructive" onClick={() => setTarget(i)}>
                    <Trash2 className="mr-1 h-3 w-3" />Limpar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <DeleteConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Limpar importação de teste"
        message={`Esta ação removerá a importação "${target?.arquivo_nome}", suas medições, e equipamentos / contratos / clientes que ficarem órfãos. Não pode ser desfeita.`}
        confirmWord="LIMPAR"
        loading={loading}
        onConfirm={purge}
      />
    </div>
  );
}
