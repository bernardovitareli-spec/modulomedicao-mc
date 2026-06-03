import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { notify } from "@/lib/notify";
import { fmtBRL, fmtDate } from "@/lib/format";

export default function ContratoAlteracoesTab({ contratoId }: { contratoId: string }) {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ numero_aditivo: "", descricao: "", vigencia_inicio: "", vigencia_fim: "", impacto_valor: "", impacto_prazo_dias: "" });

  const load = async () => {
    const { data } = await supabase.from("contrato_alteracoes").select("*").eq("contrato_id", contratoId).order("vigencia_inicio", { ascending: false });
    setList(data ?? []);
  };
  useEffect(() => { load(); }, [contratoId]);

  const save = async () => {
    if (!form.descricao || !form.vigencia_inicio) { notify.error("Descrição e vigência obrigatórios"); return; }
    const payload: any = {
      contrato_id: contratoId, numero_aditivo: form.numero_aditivo, descricao: form.descricao,
      vigencia_inicio: form.vigencia_inicio, vigencia_fim: form.vigencia_fim || null,
      impacto_valor: form.impacto_valor ? Number(form.impacto_valor) : null,
      impacto_prazo_dias: form.impacto_prazo_dias ? Number(form.impacto_prazo_dias) : null,
    };
    const { error } = await supabase.from("contrato_alteracoes").insert(payload);
    if (error) notify.error(error.message);
    else { notify.success("Alteração registrada"); setOpen(false); setForm({ numero_aditivo: "", descricao: "", vigencia_inicio: "", vigencia_fim: "", impacto_valor: "", impacto_prazo_dias: "" }); load(); }
  };

  return (
    <Card><CardContent className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Alterações contratuais</h3>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Nova alteração</Button>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Aditivo</TableHead><TableHead>Descrição</TableHead><TableHead>Vigência</TableHead>
          <TableHead className="text-right">Impacto valor</TableHead><TableHead className="text-right">Prazo (dias)</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {list.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">Nenhuma alteração.</TableCell></TableRow>}
          {list.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono">{a.numero_aditivo ?? "—"}</TableCell>
              <TableCell className="text-sm">{a.descricao}</TableCell>
              <TableCell className="text-sm num">{fmtDate(a.vigencia_inicio)}{a.vigencia_fim && ` → ${fmtDate(a.vigencia_fim)}`}</TableCell>
              <TableCell className="text-right num">{a.impacto_valor ? fmtBRL(a.impacto_valor) : "—"}</TableCell>
              <TableCell className="text-right num">{a.impacto_prazo_dias ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova alteração contratual</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Nº aditivo</Label><Input value={form.numero_aditivo} onChange={(e) => setForm({ ...form, numero_aditivo: e.target.value })} /></div>
            <div><Label>Vigência início *</Label><Input type="date" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} /></div>
            <div><Label>Vigência fim</Label><Input type="date" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} /></div>
            <div><Label>Impacto valor (R$)</Label><Input type="number" step="0.01" value={form.impacto_valor} onChange={(e) => setForm({ ...form, impacto_valor: e.target.value })} /></div>
            <div><Label>Impacto prazo (dias)</Label><Input type="number" value={form.impacto_prazo_dias} onChange={(e) => setForm({ ...form, impacto_prazo_dias: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Descrição *</Label><Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
}
