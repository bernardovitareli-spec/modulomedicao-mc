import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt } from "lucide-react";
import { fmtBRL, fmtDate } from "@/lib/format";
import { toast } from "sonner";

export default function Faturamento() {
  const [paraFaturar, setParaFaturar] = useState<any[]>([]);
  const [faturas, setFaturas] = useState<any[]>([]);
  const [open, setOpen] = useState<{ open: boolean; medicao?: any }>({ open: false });
  const [form, setForm] = useState<any>({ numero_nf: "", data_emissao: "", data_vencimento: "" });

  const load = async () => {
    const [a, b] = await Promise.all([
      supabase.from("medicoes").select("*, contratos(numero_dj, clientes(razao_social))").eq("status", "aprovada_cliente"),
      supabase.from("faturas").select("*, medicoes(competencia, contratos(numero_dj, clientes(razao_social)))").order("created_at", { ascending: false }),
    ]);
    setParaFaturar(a.data ?? []); setFaturas(b.data ?? []);
  };
  useEffect(() => { load(); }, []);

  const emitir = async () => {
    if (!form.numero_nf || !form.data_emissao) { toast.error("NF e data emissão obrigatórios"); return; }
    const m = open.medicao;
    const { error } = await supabase.from("faturas").insert({
      medicao_id: m.id, numero_nf: form.numero_nf, data_emissao: form.data_emissao,
      data_vencimento: form.data_vencimento || null, valor: m.valor_final, status: "emitida",
    } as any);
    if (error) { toast.error(error.message); return; }
    await supabase.from("medicoes").update({ status: "faturada" } as any).eq("id", m.id);
    toast.success("Fatura emitida"); setOpen({ open: false }); setForm({ numero_nf: "", data_emissao: "", data_vencimento: "" }); load();
  };

  const setStatus = async (id: string, status: string) => {
    const update: any = { status }; if (status === "paga") update.data_pagamento = new Date().toISOString().slice(0, 10);
    await supabase.from("faturas").update(update).eq("id", id); load();
  };

  return (
    <div>
      <PageHeader title="Faturamento" description="Medições aprovadas prontas para faturar e histórico de notas" />
      <Card className="mb-4"><CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Aprovadas aguardando emissão</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Competência</TableHead><TableHead>Contrato</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Valor</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {paraFaturar.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">Nenhuma medição aprovada.</TableCell></TableRow>}
            {paraFaturar.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="num font-medium">{fmtDate(m.competencia).slice(3)}</TableCell>
                <TableCell className="font-mono">{m.contratos?.numero_dj}</TableCell>
                <TableCell className="text-sm">{m.contratos?.clientes?.razao_social}</TableCell>
                <TableCell className="text-right num font-semibold">{fmtBRL(m.valor_final)}</TableCell>
                <TableCell><Button size="sm" onClick={() => setOpen({ open: true, medicao: m })}><Receipt className="mr-1 h-4 w-4" />Emitir NF</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Faturas</h3>
        <Table>
          <TableHeader><TableRow><TableHead>NF</TableHead><TableHead>Cliente</TableHead><TableHead>Emissão</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {faturas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-mono">{f.numero_nf}</TableCell>
                <TableCell className="text-sm">{f.medicoes?.contratos?.clientes?.razao_social}</TableCell>
                <TableCell className="num text-sm">{fmtDate(f.data_emissao)}</TableCell>
                <TableCell className="num text-sm">{fmtDate(f.data_vencimento)}</TableCell>
                <TableCell className="text-right num font-semibold">{fmtBRL(f.valor)}</TableCell>
                <TableCell>
                  <Select value={f.status} onValueChange={(v) => setStatus(f.id, v)}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem><SelectItem value="emitida">Emitida</SelectItem>
                      <SelectItem value="paga">Paga</SelectItem><SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open.open} onOpenChange={(o) => setOpen({ open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Emitir nota fiscal — {fmtBRL(open.medicao?.valor_final ?? 0)}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Número NF *</Label><Input value={form.numero_nf} onChange={(e) => setForm({ ...form, numero_nf: e.target.value })} /></div>
            <div><Label>Data emissão *</Label><Input type="date" value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} /></div>
            <div><Label>Data vencimento</Label><Input type="date" value={form.data_vencimento} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen({ open: false })}>Cancelar</Button><Button onClick={emitir}>Emitir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
