import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { fmtBRL, fmtDate, fmtNum } from "@/lib/format";

export default function ContratoEquipamentosTab({ contratoId }: { contratoId: string }) {
  const [list, setList] = useState<any[]>([]);
  const [equipamentos, setEquipamentos] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ equipamento_id: "", data_inicio: "", data_fim: "", horimetro_inicial: "0", valor_hora_override: "" });

  const load = async () => {
    const { data } = await supabase.from("contrato_equipamentos").select("*, equipamentos(tag, tipo, modelo)").eq("contrato_id", contratoId).order("created_at");
    setList(data ?? []);
  };
  useEffect(() => {
    load();
    supabase.from("equipamentos").select("id, tag, tipo, modelo").order("tag").then(({ data }) => setEquipamentos(data ?? []));
  }, [contratoId]);

  const add = async () => {
    if (!form.equipamento_id || !form.data_inicio) { notify.error("Equipamento e data início obrigatórios"); return; }
    const payload: any = {
      contrato_id: contratoId,
      equipamento_id: form.equipamento_id,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      horimetro_inicial: Number(form.horimetro_inicial || 0),
      valor_hora_override: form.valor_hora_override ? Number(form.valor_hora_override) : null,
    };
    const { error } = await supabase.from("contrato_equipamentos").insert(payload);
    if (error) notify.error(error.message); else { notify.success("Vinculado"); setOpen(false); load(); }
  };

  const remove = async (id: string) => {
    const reason = await confirm({
      title: "Remover vínculo do equipamento?",
      description: "O equipamento será desvinculado deste contrato. Medições já existentes não serão afetadas.",
      variant: "destructive",
      confirmLabel: "Remover",
      requireReason: true,
      reasonPlaceholder: "Ex.: equipamento substituído pelo cliente",
    });
    if (reason === null) return;
    const { error } = await supabase.from("contrato_equipamentos").delete().eq("id", id);
    if (error) { notify.error(error.message); return; }
    notify.success("Vínculo removido.");
    load();
  };

  return (
    <Card><CardContent className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Equipamentos vinculados</h3>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Vincular</Button>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Tag</TableHead><TableHead>Equipamento</TableHead><TableHead>Período</TableHead>
          <TableHead className="text-right">Horímetro inicial</TableHead><TableHead className="text-right">Valor/h override</TableHead>
          <TableHead>Status</TableHead><TableHead className="w-12"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {list.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">Nenhum equipamento.</TableCell></TableRow>}
          {list.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-mono font-semibold">{e.equipamentos?.tag}</TableCell>
              <TableCell className="text-sm">{e.equipamentos?.tipo} {e.equipamentos?.modelo}</TableCell>
              <TableCell className="text-sm num">{fmtDate(e.data_inicio)} → {e.data_fim ? fmtDate(e.data_fim) : "—"}</TableCell>
              <TableCell className="text-right num">{fmtNum(e.horimetro_inicial)}</TableCell>
              <TableCell className="text-right num">{e.valor_hora_override ? fmtBRL(e.valor_hora_override) : "—"}</TableCell>
              <TableCell><Badge variant={e.ativo ? "default" : "secondary"}>{e.ativo ? "ativo" : "inativo"}</Badge></TableCell>
              <TableCell><Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vincular equipamento</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Equipamento *</Label>
              <Select value={form.equipamento_id} onValueChange={(v) => setForm({ ...form, equipamento_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{equipamentos.map((e) => <SelectItem key={e.id} value={e.id}>{e.tag} — {e.tipo} {e.modelo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Data início *</Label><Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} /></div>
            <div><Label>Data fim</Label><Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} /></div>
            <div><Label>Horímetro inicial</Label><Input type="number" step="0.01" value={form.horimetro_inicial} onChange={(e) => setForm({ ...form, horimetro_inicial: e.target.value })} /></div>
            <div><Label>Valor/h override</Label><Input type="number" step="0.01" placeholder="(usa do contrato)" value={form.valor_hora_override} onChange={(e) => setForm({ ...form, valor_hora_override: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={add}>Vincular</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
}
