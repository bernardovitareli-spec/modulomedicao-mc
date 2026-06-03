import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fmtBRL, fmtDate, fmtCompetencia } from "@/lib/format";
import { FATURAMENTO_STATUS_LABELS, FATURAMENTO_STATUS_VARIANT, labelFatStatus, FaturamentoStatus } from "@/lib/faturamentoStatus";
import { ExternalLink, Filter, X } from "lucide-react";
import { useFaturasList } from "@/data/faturas";
import { TableSkeleton } from "@/components/skeletons";

export default function Faturamento() {
  const navigate = useNavigate();
  const { data: list = [], isLoading } = useFaturasList();

  // filtros
  const [fStatus, setFStatus] = useState<string>("todos");
  const [fCliente, setFCliente] = useState<string>("");
  const [fContrato, setFContrato] = useState<string>("");
  const [fCompetencia, setFCompetencia] = useState<string>("");
  const [fEmissaoDe, setFEmissaoDe] = useState<string>("");
  const [fVencDe, setFVencDe] = useState<string>("");

  const limparFiltros = () => {
    setFStatus("todos"); setFCliente(""); setFContrato("");
    setFCompetencia(""); setFEmissaoDe(""); setFVencDe("");
  };

  const filtered = list.filter((f: any) => {
    const cli = (f.medicoes?.contratos?.clientes?.razao_social ?? "").toLowerCase();
    const ctr = (f.medicoes?.contratos?.numero_dj ?? "").toLowerCase();
    const comp = (f.medicoes?.competencia ?? "").slice(0, 7);
    if (fStatus !== "todos" && f.status !== fStatus) return false;
    if (fCliente && !cli.includes(fCliente.toLowerCase())) return false;
    if (fContrato && !ctr.includes(fContrato.toLowerCase())) return false;
    if (fCompetencia && comp !== fCompetencia) return false;
    if (fEmissaoDe && (f.data_emissao ?? "") < fEmissaoDe) return false;
    if (fVencDe && (f.data_vencimento ?? "") < fVencDe) return false;
    return true;
  });

  const totalAFaturar = filtered.filter((f: any) => f.status === "a_faturar").reduce((s: number, f: any) => s + Number(f.valor ?? 0), 0);
  const totalAReceber = filtered.filter((f: any) => ["nf_emitida","aguardando_pagamento","em_atraso","pago_parcial"].includes(f.status))
    .reduce((s: number, f: any) => s + (Number(f.valor_liquido ?? f.valor ?? 0) - Number(f.valor_recebido ?? 0)), 0);
  const totalRecebido = filtered.filter((f: any) => f.status !== "cancelado").reduce((s: number, f: any) => s + Number(f.valor_recebido ?? 0), 0);
  const totalAtraso = filtered.filter((f: any) => f.status === "em_atraso").reduce((s: number, f: any) => s + Number(f.valor_liquido ?? f.valor ?? 0), 0);

  return (
    <div>
      <PageHeader title="Faturamento" description="Faturamentos vinculados a medições aprovadas" />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi l="A faturar" v={fmtBRL(totalAFaturar)} />
        <Kpi l="A receber" v={fmtBRL(totalAReceber)} accent="primary" />
        <Kpi l="Recebido" v={fmtBRL(totalRecebido)} accent="success" />
        <Kpi l="Em atraso" v={fmtBRL(totalAtraso)} accent="destructive" />
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4" />Filtros</div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {Object.entries(FATURAMENTO_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cliente</label>
              <Input value={fCliente} onChange={(e) => setFCliente(e.target.value)} placeholder="Buscar..." className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Contrato</label>
              <Input value={fContrato} onChange={(e) => setFContrato(e.target.value)} placeholder="Nº DJ" className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Competência (AAAA-MM)</label>
              <Input value={fCompetencia} onChange={(e) => setFCompetencia(e.target.value)} placeholder="2026-04" className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Emissão a partir de</label>
              <Input type="date" value={fEmissaoDe} onChange={(e) => setFEmissaoDe(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Vencimento a partir de</label>
              <Input type="date" value={fVencDe} onChange={(e) => setFVencDe(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={limparFiltros}><X className="mr-1 h-4 w-4" />Limpar filtros</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-4"><TableSkeleton cols={12} rows={6} /></div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contrato</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Valor medição</TableHead>
                <TableHead>NF</TableHead>
                <TableHead className="text-right">Valor NF</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={12} className="text-center py-6 text-sm text-muted-foreground">Nenhum faturamento.</TableCell></TableRow>}
              {filtered.map((f: any) => {
                const valorNf = Number(f.valor_liquido ?? f.valor ?? 0);
                const recebido = Number(f.valor_recebido ?? 0);
                const saldo = Math.max(0, valorNf - recebido);
                return (
                  <TableRow key={f.id} className="cursor-pointer" onClick={() => navigate(`/faturamento/${f.id}`)}>
                    <TableCell className="text-sm">{f.medicoes?.contratos?.clientes?.razao_social ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{f.medicoes?.contratos?.numero_dj ?? "-"}</TableCell>
                    <TableCell className="num text-sm">{fmtCompetencia(f.medicoes?.competencia)}</TableCell>
                    <TableCell className="text-right num">{fmtBRL(f.medicoes?.valor_final)}</TableCell>
                    <TableCell className="font-mono text-xs">{f.numero_nf ?? "-"}{f.serie_nf ? `/${f.serie_nf}` : ""}</TableCell>
                    <TableCell className="text-right num">{f.valor_liquido ? fmtBRL(f.valor_liquido) : "-"}</TableCell>
                    <TableCell className="num text-sm">{fmtDate(f.data_emissao)}</TableCell>
                    <TableCell className="num text-sm">{fmtDate(f.data_vencimento)}</TableCell>
                    <TableCell>
                      <Badge variant={FATURAMENTO_STATUS_VARIANT[f.status as FaturamentoStatus] ?? "secondary"}>
                        {labelFatStatus(f.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right num">{fmtBRL(recebido)}</TableCell>
                    <TableCell className="text-right num font-semibold">{fmtBRL(saldo)}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/faturamento/${f.id}`); }}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ l, v, accent }: { l: string; v: string; accent?: "primary" | "success" | "destructive" }) {
  const color = accent === "success" ? "text-success" : accent === "destructive" ? "text-destructive" : accent === "primary" ? "text-primary" : "";
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{l}</p>
      <p className={`mt-1 text-xl font-bold num ${color}`}>{v}</p>
    </CardContent></Card>
  );
}
