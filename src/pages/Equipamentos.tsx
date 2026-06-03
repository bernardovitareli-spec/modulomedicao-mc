import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Search } from "lucide-react";
import { notify } from "@/lib/notify";
import { useEquipamentosList, useSalvarEquipamento } from "@/data/equipamentos";
import { TableSkeleton } from "@/components/skeletons";

const empty = { tipo: "", modelo: "", serie: "", tag: "", ano: "", status: "ativo", observacoes: "" };

export default function Equipamentos() {
  const { data: list = [], isLoading } = useEquipamentosList();
  const salvar = useSalvarEquipamento();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(empty);

  const handleSave = async () => {
    if (!form.tag || !form.tipo || !form.modelo) { notify.error("Tag, tipo e modelo obrigatórios"); return; }
    const payload: any = { ...form, ano: form.ano ? Number(form.ano) : null };
    try {
      await salvar.mutateAsync({ id: editing?.id, payload });
      setOpen(false);
    } catch { /* notify já feito */ }
  };

  const filtered = list.filter((e: any) =>
    !search || e.tag.toLowerCase().includes(search.toLowerCase()) || e.modelo.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader title="Equipamentos" description="Cadastro mestre da frota"
        actions={<Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />Novo equipamento</Button>} />
      <Card><CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por tag ou modelo..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} equipamento(s)</span>
        </div>
        {isLoading ? <TableSkeleton cols={7} rows={6} /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Tag</TableHead><TableHead>Tipo</TableHead><TableHead>Modelo</TableHead>
              <TableHead>Série</TableHead><TableHead>Ano</TableHead><TableHead>Status</TableHead><TableHead className="w-12"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Nenhum equipamento.</TableCell></TableRow>}
              {filtered.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono font-semibold">{e.tag}</TableCell>
                  <TableCell>{e.tipo}</TableCell>
                  <TableCell>{e.modelo}</TableCell>
                  <TableCell className="text-sm">{e.serie ?? "—"}</TableCell>
                  <TableCell>{e.ano ?? "—"}</TableCell>
                  <TableCell><Badge variant={e.status === "ativo" ? "default" : e.status === "manutencao" ? "secondary" : "outline"}>{e.status}</Badge></TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => { setEditing(e); setForm({ ...empty, ...e }); setOpen(true); }}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} equipamento</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Tag *</Label><Input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} /></div>
            <div><Label>Tipo *</Label><Input placeholder="Ex: Escavadeira" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} /></div>
            <div><Label>Modelo *</Label><Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></div>
            <div><Label>Série</Label><Input value={form.serie ?? ""} onChange={(e) => setForm({ ...form, serie: e.target.value })} /></div>
            <div><Label>Ano</Label><Input type="number" value={form.ano ?? ""} onChange={(e) => setForm({ ...form, ano: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave} disabled={salvar.isPending}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
