import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { TIPOS_REGRA, labelTipo } from "@/lib/regras";

export default function ContratoRegras() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fTipo, setFTipo] = useState<string>("_all");
  const [fStatus, setFStatus] = useState<string>("_all");
  const [fContrato, setFContrato] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("contrato_regras")
        .select("*, equipamentos:equipamento_id(serie, tag, modelo), contratos:contrato_id(numero_dj, cliente_id, clientes:cliente_id(razao_social))")
        .order("vigencia_inicio", { ascending: false })
        .limit(2000);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  const hoje = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(() => rows.filter((r) => {
    if (fTipo !== "_all" && r.tipo !== fTipo) return false;
    const vigente = r.ativa && r.vigencia_inicio <= hoje && (!r.vigencia_fim || r.vigencia_fim >= hoje);
    if (fStatus === "vigente" && !vigente) return false;
    if (fStatus === "inativa" && r.ativa) return false;
    if (fStatus === "fora" && (!r.ativa || vigente)) return false;
    if (fContrato.trim()) {
      const q = fContrato.trim().toLowerCase();
      const dj = (r.contratos?.numero_dj ?? "").toLowerCase();
      const cli = (r.contratos?.clientes?.razao_social ?? "").toLowerCase();
      if (!dj.includes(q) && !cli.includes(q)) return false;
    }
    return true;
  }), [rows, fTipo, fStatus, fContrato, hoje]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Regras do Contrato</h1>
        <p className="text-sm text-muted-foreground">Gerencie regras vigentes por contrato e equipamento. Editar regras detalhadas dentro do contrato.</p>
      </div>

      <Card><CardContent className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Buscar contrato/cliente</Label>
            <Input value={fContrato} onChange={(e) => setFContrato(e.target.value)} placeholder="Nº DJ ou cliente" />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                {TIPOS_REGRA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                <SelectItem value="vigente">Vigente</SelectItem>
                <SelectItem value="fora">Fora da vigência</SelectItem>
                <SelectItem value="inativa">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end text-xs text-muted-foreground">
            {filtered.length} regra(s)
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Contrato</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Equipamento</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Parâmetros</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Nenhuma regra encontrada.</TableCell></TableRow>}
              {filtered.map((r) => {
                const vigente = r.ativa && r.vigencia_inicio <= hoje && (!r.vigencia_fim || r.vigencia_fim >= hoje);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{r.contratos?.numero_dj ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate" title={r.contratos?.clientes?.razao_social}>{r.contratos?.clientes?.razao_social ?? "—"}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{labelTipo(r.tipo)}</TableCell>
                    <TableCell className="text-xs">
                      {r.equipamento_id
                        ? <span className="font-mono">{r.equipamentos?.serie ?? ""} / {r.equipamentos?.tag ?? ""}</span>
                        : <Badge variant="outline">Geral</Badge>}
                    </TableCell>
                    <TableCell className="text-sm num whitespace-nowrap">
                      {fmtDate(r.vigencia_inicio)} → {r.vigencia_fim ? fmtDate(r.vigencia_fim) : "vigente"}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[220px] truncate" title={JSON.stringify(r.parametros)}>
                      {Object.entries(r.parametros ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      {!r.ativa
                        ? <Badge variant="secondary">inativa</Badge>
                        : vigente ? <Badge>Vigente hoje</Badge> : <Badge variant="outline">Fora da vigência hoje</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="icon" variant="ghost" title="Abrir contrato">
                        <Link to={`/contratos/${r.contrato_id}`}><ExternalLink className="h-4 w-4" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>
    </div>
  );
}
