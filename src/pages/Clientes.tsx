import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Search } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CnpjInput, CepInput, TelefoneInput, FormSubmitButton } from "@/components/inputs";
import { fmtCNPJ } from "@/lib/format";
import { useClientesList, useSalvarCliente } from "@/data/clientes";
import { TableSkeleton } from "@/components/skeletons";
import { clienteSchema, ClienteFormData, UFS } from "@/lib/schemas/cliente";

const empty: ClienteFormData = {
  razao_social: "", nome_fantasia: "", cnpj: "", inscricao_estadual: "",
  endereco: "", bairro: "", endereco_complemento: "", cidade: "", uf: "", cep: "",
  contato_nome: "", contato_email: "", contato_telefone: "", observacoes: "", status: "ativo",
};

export default function Clientes() {
  const { data: list = [], isLoading } = useClientesList();
  const salvar = useSalvarCliente();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id?: string } | null>(null);

  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: empty,
    mode: "onBlur",
  });

  const openNew = () => { setEditing(null); form.reset(empty); setOpen(true); };
  const openEdit = (c: Record<string, unknown>) => {
    setEditing({ id: c.id as string });
    form.reset({ ...empty, ...c } as ClienteFormData);
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    await salvar.mutateAsync({ id: editing?.id, payload: values as Record<string, unknown> });
    setOpen(false);
  });

  const filtered = list.filter((c: Record<string, string>) =>
    !search ||
    c.razao_social.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj.includes(search.replace(/\D/g, "")),
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
                  {filtered.map((c: Record<string, string>) => (
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
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField control={form.control} name="razao_social" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Razão Social *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="nome_fantasia" render={({ field }) => (
                  <FormItem><FormLabel>Nome Fantasia</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="cnpj" render={({ field }) => (
                  <FormItem><FormLabel>CNPJ *</FormLabel><FormControl><CnpjInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="inscricao_estadual" render={({ field }) => (
                  <FormItem><FormLabel>Inscrição Estadual</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem><FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endereco" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Endereço</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem><FormLabel>Bairro</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="endereco_complemento" render={({ field }) => (
                  <FormItem><FormLabel>Complemento</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="cep" render={({ field }) => (
                  <FormItem><FormLabel>CEP</FormLabel><FormControl><CepInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="cidade" render={({ field }) => (
                  <FormItem><FormLabel>Cidade</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="uf" render={({ field }) => (
                  <FormItem><FormLabel>UF</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="contato_nome" render={({ field }) => (
                  <FormItem><FormLabel>Contato</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contato_email" render={({ field }) => (
                  <FormItem><FormLabel>E-mail</FormLabel><FormControl><Input type="email" inputMode="email" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contato_telefone" render={({ field }) => (
                  <FormItem><FormLabel>Telefone</FormLabel><FormControl><TelefoneInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="observacoes" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <FormSubmitButton requireDirty={!!editing} />
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
