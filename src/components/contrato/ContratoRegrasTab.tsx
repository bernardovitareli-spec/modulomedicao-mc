import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";

const TIPOS: { value: string; label: string; campos: { key: string; label: string; type: "number" | "switch"; default?: any }[] }[] = [
  { value: "valor_hora", label: "Valor por hora", campos: [{ key: "valor", label: "R$/hora", type: "number" }] },
  { value: "garantia_minima", label: "Garantia mínima", campos: [{ key: "horas", label: "Horas/mês", type: "number" }, { key: "ativa", label: "Ativa", type: "switch", default: true }] },
  { value: "desconto_horas_mecanicas", label: "Desconto horas mecânicas", campos: [{ key: "aplicar", label: "Aplicar", type: "switch", default: true }] },
  { value: "desconto_horas_paradas", label: "Desconto horas paradas", campos: [{ key: "aplicar", label: "Aplicar", type: "switch", default: true }] },
  { value: "periodo_chuvoso", label: "Período chuvoso", campos: [{ key: "aplicar", label: "Descontar", type: "switch", default: true }] },
  { value: "excecao_chuvoso", label: "Exceção chuvoso", campos: [] },
  { value: "complementar", label: "Complementar", campos: [{ key: "valor_fixo", label: "Valor fixo R$", type: "number" }, { key: "percentual", label: "% sobre bruto", type: "number" }] },
  { value: "desconto", label: "Desconto", campos: [{ key: "valor_fixo", label: "Valor fixo R$", type: "number" }, { key: "percentual", label: "% sobre bruto", type: "number" }] },
  { value: "glosa", label: "Glosa", campos: [{ key: "valor", label: "Valor R$", type: "number" }] },
  { value: "aditivo_contratual", label: "Aditivo contratual", campos: [{ key: "valor", label: "Valor R$", type: "number" }] },
];

export default function ContratoRegrasTab({ contratoId }: { contratoId: string }) {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ tipo: "valor_hora", vigencia_inicio: "", vigencia_fim: "", parametros: {}, observacoes: "" });

  const load = async () => {
    const { data } = await supabase.from("contrato_regras").select("*").eq("contrato_id", contratoId).order("vigencia_inicio", { ascending: false });
    setList(data ?? []);
  };
  useEffect(() => { load(); }, [contratoId]);

  const tipoConfig = TIPOS.find((t) => t.value === form.tipo)!;

  const save = async () => {
    if (!form.tipo || !form.vigencia_inicio) { toast.error("Tipo e vigência início obrigatórios"); return; }
    // Encerra a regra anterior do mesmo tipo se ainda aberta
    const dataAnt = new Date(form.vigencia_inicio); dataAnt.setDate(dataAnt.getDate() - 1);
    await supabase.from("contrato_regras").update({ vigencia_fim: dataAnt.toISOString().slice(0, 10) } as any)
      .eq("contrato_id", contratoId).eq("tipo", form.tipo).is("vigencia_fim", null);
    const payload: any = {
      contrato_id: contratoId, tipo: form.tipo,
      vigencia_inicio: form.vigencia_inicio, vigencia_fim: form.vigencia_fim || null,
      parametros: form.parametros, observacoes: form.observacoes,
    };
    const { error } = await supabase.from("contrato_regras").insert(payload);
    if (error) toast.error(error.message); else { toast.success("Regra criada"); setOpen(false); setForm({ tipo: "valor_hora", vigencia_inicio: "", vigencia_fim: "", parametros: {}, observacoes: "" }); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover regra?")) return;
    await supabase.from("contrato_regras").delete().eq("id", id);
    load();
  };

  return (
    <Card><CardContent className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Regras do contrato</h3>
          <p className="text-xs text-muted-foreground">As regras são versionadas por vigência. Cada nova versão preserva o histórico.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Nova regra</Button>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Tipo</TableHead><TableHead>Vigência</TableHead><TableHead>Parâmetros</TableHead>
          <TableHead>Status</TableHead><TableHead className="w-12"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {list.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">Nenhuma regra cadastrada.</TableCell></TableRow>}
          {list.map((r) => {
            const ativa = !r.vigencia_fim || r.vigencia_fim >= new Date().toISOString().slice(0, 10);
            const tcfg = TIPOS.find((t) => t.value === r.tipo);
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{tcfg?.label ?? r.tipo}</TableCell>
                <TableCell className="text-sm num">{fmtDate(r.vigencia_inicio)} → {r.vigencia_fim ? fmtDate(r.vigencia_fim) : "vigente"}</TableCell>
                <TableCell className="font-mono text-xs">{Object.entries(r.parametros ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</TableCell>
                <TableCell><Badge variant={ativa ? "default" : "secondary"}>{ativa ? "vigente" : "encerrada"}</Badge></TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova regra</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v, parametros: {} })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Vigência início *</Label><Input type="date" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} /></div>
            <div><Label>Vigência fim</Label><Input type="date" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} /></div>
            {tipoConfig.campos.map((c) => (
              <div key={c.key}>
                <Label>{c.label}</Label>
                {c.type === "number" ? (
                  <Input type="number" step="0.01" value={form.parametros[c.key] ?? ""} onChange={(e) => setForm({ ...form, parametros: { ...form.parametros, [c.key]: Number(e.target.value) } })} />
                ) : (
                  <div className="flex h-10 items-center"><Switch checked={form.parametros[c.key] ?? c.default ?? false} onCheckedChange={(v) => setForm({ ...form, parametros: { ...form.parametros, [c.key]: v } })} /></div>
                )}
              </div>
            ))}
            <div className="md:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
}
