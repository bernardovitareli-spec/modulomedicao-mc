import { useEffect, useMemo, useState } from "react";
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
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { TIPOS_REGRA, labelTipo } from "@/lib/regras";

interface Equip { id: string; serie: string | null; tag: string; tipo: string; modelo: string }

type Escopo = "geral" | "tipo" | "equipamento";

const normTipo = (t: string) =>
  (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export default function ContratoRegrasTab({ contratoId }: { contratoId: string }) {
  const [list, setList] = useState<any[]>([]);
  const [equips, setEquips] = useState<Equip[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const emptyForm = {
    tipo: "valor_hora",
    escopo: "geral" as Escopo,
    equipamento_id: "",
    tipo_equipamento: "",
    vigencia_inicio: "",
    vigencia_fim: "",
    parametros: {} as Record<string, any>,
    observacoes: "",
    ativa: true,
  };
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);

  const load = async () => {
    const { data } = await supabase
      .from("contrato_regras")
      .select("*, equipamentos:equipamento_id(serie, tag, tipo, modelo)")
      .eq("contrato_id", contratoId)
      .order("vigencia_inicio", { ascending: false });
    setList(data ?? []);
  };

  const loadEquips = async () => {
    const { data: ce } = await supabase
      .from("contrato_equipamentos")
      .select("equipamento_id, equipamentos:equipamento_id(id, serie, tag, tipo, modelo)")
      .eq("contrato_id", contratoId);
    const list = (ce ?? []).map((r: any) => r.equipamentos).filter(Boolean) as Equip[];
    setEquips(list);
  };

  useEffect(() => { load(); loadEquips(); }, [contratoId]);

  const tipoConfig = TIPOS_REGRA.find((t) => t.value === form.tipo)!;

  // Tipos de equipamento únicos do contrato (preservando primeiro nome encontrado)
  const tiposEquipamento = useMemo(() => {
    const map = new Map<string, string>();
    equips.forEach((e) => {
      if (!e.tipo) return;
      const k = normTipo(e.tipo);
      if (!map.has(k)) map.set(k, e.tipo);
    });
    return Array.from(map.values()).sort();
  }, [equips]);

  const openNova = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEditar = (r: any) => {
    const escopo: Escopo = r.equipamento_id ? "equipamento" : r.tipo_equipamento ? "tipo" : "geral";
    setEditId(r.id);
    setForm({
      tipo: r.tipo,
      escopo,
      equipamento_id: r.equipamento_id ?? "",
      tipo_equipamento: r.tipo_equipamento ?? "",
      vigencia_inicio: r.vigencia_inicio ?? "",
      vigencia_fim: r.vigencia_fim ?? "",
      parametros: r.parametros ?? {},
      observacoes: r.observacoes ?? "",
      ativa: r.ativa ?? true,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.tipo || !form.vigencia_inicio) {
      toast.error("Tipo e vigência início são obrigatórios"); return;
    }
    if (form.vigencia_fim && form.vigencia_fim < form.vigencia_inicio) {
      toast.error("Vigência fim deve ser posterior ao início"); return;
    }
    if (form.escopo === "tipo" && !form.tipo_equipamento) {
      toast.error("Selecione o tipo de equipamento"); return;
    }
    if (form.escopo === "equipamento" && !form.equipamento_id) {
      toast.error("Selecione o equipamento"); return;
    }

    const payload: any = {
      contrato_id: contratoId,
      tipo: form.tipo,
      equipamento_id: form.escopo === "equipamento" ? form.equipamento_id : null,
      tipo_equipamento: form.escopo === "tipo" ? form.tipo_equipamento : null,
      vigencia_inicio: form.vigencia_inicio,
      vigencia_fim: form.vigencia_fim || null,
      parametros: form.parametros,
      observacoes: form.observacoes || null,
      ativa: form.ativa,
    };

    let error: any = null;
    if (editId) {
      ({ error } = await supabase.from("contrato_regras").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("contrato_regras").insert(payload));
    }
    if (error) {
      if (String(error.message).includes("uniq_contrato_regra_escopo")) {
        toast.error("Já existe uma regra ativa com o mesmo tipo, escopo e vigência.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success(editId ? "Regra atualizada" : "Regra criada");
    setOpen(false); load();
  };

  const toggleAtiva = async (r: any) => {
    await supabase.from("contrato_regras").update({ ativa: !r.ativa } as any).eq("id", r.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover regra?")) return;
    await supabase.from("contrato_regras").delete().eq("id", id);
    load();
  };

  const escopoLabel = (r: any) => {
    if (r.equipamento_id) return "Equipamento específico";
    if (r.tipo_equipamento) return "Tipo de equipamento";
    return "Geral";
  };

  return (
    <Card><CardContent className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Regras do contrato</h3>
          <p className="text-xs text-muted-foreground">
            Prioridade: equipamento específico → tipo de equipamento → geral → dados da planilha.
          </p>
        </div>
        <Button size="sm" onClick={openNova}><Plus className="mr-1 h-4 w-4" />Nova regra</Button>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Escopo</TableHead>
            <TableHead>Tipo de equipamento</TableHead>
            <TableHead>Equipamento</TableHead>
            <TableHead>Vigência</TableHead>
            <TableHead>Parâmetros</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24 text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">Nenhuma regra cadastrada.</TableCell></TableRow>
            )}
            {list.map((r) => {
              const hoje = new Date().toISOString().slice(0, 10);
              const vigente = r.ativa && r.vigencia_inicio <= hoje && (!r.vigencia_fim || r.vigencia_fim >= hoje);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{labelTipo(r.tipo)}</TableCell>
                  <TableCell><Badge variant="outline">{escopoLabel(r)}</Badge></TableCell>
                  <TableCell className="text-xs">{r.tipo_equipamento ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {r.equipamento_id
                      ? <span className="font-mono">{r.equipamentos?.serie ?? ""} / {r.equipamentos?.tag ?? ""}</span>
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm num whitespace-nowrap">
                    {fmtDate(r.vigencia_inicio)} → {r.vigencia_fim ? fmtDate(r.vigencia_fim) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[280px] truncate" title={JSON.stringify(r.parametros)}>
                    {Object.entries(r.parametros ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    {!r.ativa
                      ? <Badge variant="secondary">inativa</Badge>
                      : vigente ? <Badge>Vigente hoje</Badge> : <Badge variant="outline">Fora da vigência hoje</Badge>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => toggleAtiva(r)} title={r.ativa ? "Desativar" : "Ativar"}>
                      <Switch checked={r.ativa} />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openEditar(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar regra" : "Nova regra"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v, parametros: {} })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_REGRA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">{tipoConfig.descricao}</p>
            </div>

            <div className="md:col-span-2">
              <Label>Escopo da regra *</Label>
              <Select value={form.escopo} onValueChange={(v: Escopo) => setForm({ ...form, escopo: v, equipamento_id: "", tipo_equipamento: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Geral — todos os equipamentos</SelectItem>
                  <SelectItem value="tipo">Por tipo de equipamento</SelectItem>
                  <SelectItem value="equipamento">Por equipamento específico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.escopo === "tipo" && (
              <div className="md:col-span-2">
                <Label>Tipo de equipamento *</Label>
                <Select value={form.tipo_equipamento} onValueChange={(v) => setForm({ ...form, tipo_equipamento: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {tiposEquipamento.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Nenhum tipo encontrado no contrato</div>}
                    {tiposEquipamento.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.escopo === "equipamento" && (
              <div className="md:col-span-2">
                <Label>Equipamento *</Label>
                <Select value={form.equipamento_id} onValueChange={(v) => setForm({ ...form, equipamento_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {equips.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.serie ?? "-"} | {e.tag} | {e.tipo} | {e.modelo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div><Label>Vigência início *</Label><Input type="date" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} /></div>
            <div><Label>Vigência fim</Label><Input type="date" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} /></div>

            {tipoConfig.campos.map((c) => (
              <div key={c.key} className={c.type === "textarea" ? "md:col-span-2" : ""}>
                <Label>{c.label}</Label>
                {c.type === "number" && (
                  <Input type="number" step={c.step ?? "0.01"} placeholder={c.placeholder}
                    value={form.parametros[c.key] ?? ""}
                    onChange={(e) => setForm({ ...form, parametros: { ...form.parametros, [c.key]: e.target.value === "" ? "" : Number(e.target.value) } })} />
                )}
                {c.type === "text" && (
                  <Input placeholder={c.placeholder} value={form.parametros[c.key] ?? ""}
                    onChange={(e) => setForm({ ...form, parametros: { ...form.parametros, [c.key]: e.target.value } })} />
                )}
                {c.type === "textarea" && (
                  <Textarea placeholder={c.placeholder} value={form.parametros[c.key] ?? ""}
                    onChange={(e) => setForm({ ...form, parametros: { ...form.parametros, [c.key]: e.target.value } })} />
                )}
                {c.type === "switch" && (
                  <div className="flex h-10 items-center"><Switch checked={form.parametros[c.key] ?? c.default ?? false}
                    onCheckedChange={(v) => setForm({ ...form, parametros: { ...form.parametros, [c.key]: v } })} /></div>
                )}
                {c.type === "select" && (
                  <Select value={form.parametros[c.key] ?? c.default ?? ""}
                    onValueChange={(v) => setForm({ ...form, parametros: { ...form.parametros, [c.key]: v } })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{c.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            ))}

            <div className="flex items-center gap-2 md:col-span-2">
              <Switch checked={form.ativa} onCheckedChange={(v) => setForm({ ...form, ativa: v })} />
              <Label>Regra ativa</Label>
            </div>
            <div className="md:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>{editId ? "Salvar" : "Criar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
}
