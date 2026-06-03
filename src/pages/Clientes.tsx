import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Search } from "lucide-react";
import { notify } from "@/lib/notify";
import { fmtCNPJ } from "@/lib/format";
import { useClientesList, useSalvarCliente } from "@/data/clientes";
import { TableSkeleton } from "@/components/skeletons";

const empty = {
  razao_social: "", nome_fantasia: "", cnpj: "", inscricao_estadual: "",
  endereco: "", bairro: "", endereco_complemento: "", cidade: "", uf: "", cep: "",
  contato_nome: "", contato_email: "", contato_telefone: "", observacoes: "", status: "ativo",
};

export default function Clientes() {
  const { data: list = [], isLoading } = useClientesList();
  const salvar = useSalvarCliente();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(empty);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ ...empty, ...c }); setOpen(true); };

  const handleSave = async () => {
    if (!form.razao_social || !form.cnpj) { notify.error("Razão social e CNPJ obrigatórios"); return; }
    const cnpjLimpo = form.cnpj.replace(/\D/g, "");
    const payload: any = { ...form, cnpj: cnpjLimpo };
    try {
      await salvar.mutateAsync({ id: editing?.id, payload });
      setOpen(false);
    } catch { /* notify já feito */ }
  };

  const filtered = list.filter((c: any) =>
    !search || c.razao_social.toLowerCase().includes(search.toLowerCase()) || c.cnpj.includes(search.replace(/\D/g, "")),
  );

  return (
    <div>
      <PageHeader
        title="Clientes" description="Cadastro de contratantes"
        actions={<Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />Novo cliente</Button>}
      />
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por razão social ou CNPJ..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} cliente(s)</span>
          </div>
          {isLoading ? (
            <TableSkeleton cols={6} rows={6} />
          ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão Social</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Nenhum cliente cadastrado.</TableCell></TableRow>}
                {filtered.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.razao_social}{c.nome_fantasia && <div className="text-xs text-muted-foreground">{c.nome_fantasia}</div>}</TableCell>
                    <TableCell className="num">{fmtCNPJ(c.cnpj)}</TableCell>
                    <TableCell>{[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}</TableCell>
                    <TableCell className="text-sm">{c.contato_email ?? "—"}</TableCell>
                    <TableCell><Badge variant={c.status === "ativo" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Razão Social *" v={form.razao_social} on={(v) => setForm({ ...form, razao_social: v })} />
            <Field label="Nome Fantasia" v={form.nome_fantasia} on={(v) => setForm({ ...form, nome_fantasia: v })} />
            <Field label="CNPJ *" v={form.cnpj} on={(v) => setForm({ ...form, cnpj: v })} />
            <Field label="Inscrição Estadual" v={form.inscricao_estadual} on={(v) => setForm({ ...form, inscricao_estadual: v })} />
            <Field label="Endereço" v={form.endereco} on={(v) => setForm({ ...form, endereco: v })} className="md:col-span-2" />
            <Field label="Bairro" v={form.bairro} on={(v) => setForm({ ...form, bairro: v })} />
            <Field label="Complemento" v={form.endereco_complemento} on={(v) => setForm({ ...form, endereco_complemento: v })} />
            <Field label="CEP" v={form.cep} on={(v) => setForm({ ...form, cep: v })} />
            <Field label="Cidade" v={form.cidade} on={(v) => setForm({ ...form, cidade: v })} />
            <Field label="UF" v={form.uf} on={(v) => setForm({ ...form, uf: v })} />
            <Field label="Contato" v={form.contato_nome} on={(v) => setForm({ ...form, contato_nome: v })} />
            <Field label="Email" v={form.contato_email} on={(v) => setForm({ ...form, contato_email: v })} />
            <Field label="Telefone" v={form.contato_telefone} on={(v) => setForm({ ...form, contato_telefone: v })} />
            <div className="md:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave} disabled={salvar.isPending}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, v, on, className = "" }: { label: string; v: string | null | undefined; on: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input value={v ?? ""} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
