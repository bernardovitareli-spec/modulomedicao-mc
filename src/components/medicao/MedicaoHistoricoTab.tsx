import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";

interface Props {
  medicaoId: string;
}

const FIELD_LABEL: Record<string, string> = {
  horimetro_inicial: "Horímetro inicial",
  horimetro_final: "Horímetro final",
  horas_informadas: "HT informado",
  horas_mecanicas: "Horas mecânicas",
  horas_chuvoso: "Período chuvoso",
  horas_excecao_chuvoso: "Exceção chuvoso",
  valor_complementares: "Complementares",
  valor_descontos: "Descontos",
  observacoes: "Observações",
  valor_final: "Valor final",
};

export function MedicaoHistoricoTab({ medicaoId }: Props) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fEquip, setFEquip] = useState<string>("all");
  const [fUser, setFUser] = useState<string>("all");
  const [fCampo, setFCampo] = useState<string>("all");
  const [fDe, setFDe] = useState<string>("");
  const [fAte, setFAte] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("medicao_item_alteracoes")
        .select("*")
        .eq("medicao_id", medicaoId)
        .order("created_at", { ascending: false });
      setLogs(data ?? []);
      setLoading(false);
    })();
  }, [medicaoId]);

  const equipamentos = useMemo(() => {
    const m = new Map<string, string>();
    logs.forEach((l) => {
      if (l.equipamento_id) {
        const lbl = `${l.equipamento_tag ?? "-"}${l.equipamento_serie ? ` (S/N ${l.equipamento_serie})` : ""}`;
        m.set(l.equipamento_id, lbl);
      }
    });
    return Array.from(m.entries());
  }, [logs]);

  const usuarios = useMemo(() => {
    const m = new Map<string, string>();
    logs.forEach((l) => { if (l.user_id) m.set(l.user_id, l.user_email ?? l.user_id); });
    return Array.from(m.entries());
  }, [logs]);

  const campos = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => { if (l.campo) s.add(l.campo); });
    return Array.from(s);
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (fEquip !== "all" && l.equipamento_id !== fEquip) return false;
      if (fUser !== "all" && l.user_id !== fUser) return false;
      if (fCampo !== "all" && l.campo !== fCampo) return false;
      if (fDe && l.created_at < fDe) return false;
      if (fAte && l.created_at > fAte + "T23:59:59") return false;
      return true;
    });
  }, [logs, fEquip, fUser, fCampo, fDe, fAte]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Histórico de alterações</h3>
          <span className="text-xs text-muted-foreground">{filtered.length} registro(s)</span>
        </div>

        <div className="mb-3 grid gap-3 md:grid-cols-5">
          <div>
            <Label className="text-xs">Equipamento</Label>
            <Select value={fEquip} onValueChange={setFEquip}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {equipamentos.map(([id, lbl]) => <SelectItem key={id} value={id}>{lbl}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Usuário</Label>
            <Select value={fUser} onValueChange={setFUser}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {usuarios.map(([id, lbl]) => <SelectItem key={id} value={id}>{lbl}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Campo</Label>
            <Select value={fCampo} onValueChange={setFCampo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {campos.map((c) => <SelectItem key={c} value={c}>{FIELD_LABEL[c] ?? c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto border rounded-md">
          <Table className="min-w-max">
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Equipamento</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Campo</TableHead>
                <TableHead>Valor anterior</TableHead>
                <TableHead>Novo valor</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={9} className="text-center py-6 text-sm text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-6 text-sm text-muted-foreground">Nenhuma alteração registrada.</TableCell></TableRow>}
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-xs num">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-xs">{l.user_email ?? "-"}</TableCell>
                  <TableCell className="text-xs"><Badge variant="outline">{l.perfil_usuario ?? "-"}</Badge></TableCell>
                  <TableCell className="text-xs font-mono">
                    {l.equipamento_tag ?? "-"}
                    {l.equipamento_serie ? <div className="text-[10px] text-muted-foreground">S/N {l.equipamento_serie}</div> : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={l.acao === "EDIT" ? "default" : "secondary"}>{l.acao}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{l.campo ? (FIELD_LABEL[l.campo] ?? l.campo) : "-"}</TableCell>
                  <TableCell className="text-xs num text-muted-foreground line-through max-w-[160px] truncate" title={l.valor_anterior ?? ""}>{l.valor_anterior ?? "-"}</TableCell>
                  <TableCell className="text-xs num font-semibold max-w-[160px] truncate" title={l.valor_novo ?? ""}>{l.valor_novo ?? "-"}</TableCell>
                  <TableCell className="text-xs max-w-[260px] truncate" title={l.motivo ?? ""}>{l.motivo ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
