import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Search } from "lucide-react";
import { toast } from "sonner";
import { fmtBRL, fmtDate } from "@/lib/format";

const empty = {
  cliente_id: "", numero_dj: "", tipo_servico: "", centro_custo: "",
  inicio_operacao: "", termino_contrato: "", valor_global: "", valor_hora_padrao: "",
  garantia_minima_horas: "", status: "rascunho", observacoes: "",
};

export default function Contratos() {
  const navigate = useNavigate();
  const [list, setList] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const load = async () => {
    const { data } = await supabase.from("contratos").select("*, clientes(razao_social)").order("created_at", { ascending: false });
    setList(data ?? []);
  };
  useEffect(() => {
    load();
    supabase.from("clientes").select("id, razao_social").eq("status", "ativo").order("razao_social").then(({ data }) => setClientes(data ?? []));
  }, []);

  const save = async () => {
    if (!form.cliente_id || !form.numero_dj || !form.tipo_servico || !form.inicio_operacao || !form.termino_contrato) {
      toast.error("Preencha cliente, número, tipo, início e término"); return;
    }
    const payload: any = {
      ...form,
      valor_global: form.valor_global ? Number(form.valor_global) : null,
      valor_hora_padrao: form.valor_hora_padrao ? Number(form.valor_hora_padrao) : null,
      garantia_minima_horas: form.garantia_minima_horas ? Number(form.garantia_minima_horas) : null,
    };
    const { data, error } = await supabase.from("contratos").insert(payload).select().single();
    if (error) toast.error(error.message);
    else { toast.success("Contrato criado"); setOpen(false); load(); navigate(`/contratos/${data.id}`); }
  };

  const filtered = list.filter((c) =>
    !search || c.numero_dj.toLowerCase().includes(search.toLowerCase()) || c.clientes?.razao_social?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader title="Contratos" description="Gestão de contratos de medição"
        actions={<Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />Novo contrato</Button>} />

      <Card><CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por nº DJ ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} contrato(s)</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nº DJ</TableHead><TableHead>Cliente</TableHead><TableHead>Tipo Serviço</TableHead>
              <TableHead>Vigência</TableHead><TableHead className="text-right">Valor Global</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-12"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Nenhum contrato.</TableCell></TableRow>}
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/contratos/${c.id}`)}>
                  <TableCell className="font-mono font-semibold">{c.numero_dj}</TableCell>
                  <TableCell>{c.clientes?.razao_social ?? "—"}</TableCell>
                  <TableCell className="text-sm">{c.tipo_servico}</TableCell>
                  <TableCell className="text-sm num">{fmtDate(c.inicio_operacao)} → {fmtDate(c.termino_contrato)}</TableCell>
                  <TableCell className="text-right num">{fmtBRL(c.valor_global)}</TableCell>
                  <TableCell><Badge variant={c.status === "ativo" ? "default" : c.status === "encerrado" ? "secondary" : "outline"}>{c.status}</Badge></TableCell>
                  <TableCell><Button size="icon" variant="ghost"><Eye className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Novo contrato</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Cliente *</Label>
              <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nº DJ *</Label><Input value={form.numero_dj} onChange={(e) => setForm({ ...form, numero_dj: e.target.value })} /></div>
            <div><Label>Tipo de serviço *</Label><Input value={form.tipo_servico} onChange={(e) => setForm({ ...form, tipo_servico: e.target.value })} /></div>
            <div><Label>Centro de custo</Label><Input value={form.centro_custo} onChange={(e) => setForm({ ...form, centro_custo: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem><SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem><SelectItem value="encerrado">Encerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Início operação *</Label><Input type="date" value={form.inicio_operacao} onChange={(e) => setForm({ ...form, inicio_operacao: e.target.value })} /></div>
            <div><Label>Término contrato *</Label><Input type="date" value={form.termino_contrato} onChange={(e) => setForm({ ...form, termino_contrato: e.target.value })} /></div>
            <div><Label>Valor global (R$)</Label><Input type="number" step="0.01" value={form.valor_global} onChange={(e) => setForm({ ...form, valor_global: e.target.value })} /></div>
            <div><Label>Valor/hora padrão</Label><Input type="number" step="0.01" value={form.valor_hora_padrao} onChange={(e) => setForm({ ...form, valor_hora_padrao: e.target.value })} /></div>
            <div><Label>Garantia mínima (h/mês)</Label><Input type="number" step="0.01" value={form.garantia_minima_horas} onChange={(e) => setForm({ ...form, garantia_minima_horas: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
