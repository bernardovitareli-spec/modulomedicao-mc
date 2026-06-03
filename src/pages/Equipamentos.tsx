import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Search } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormSubmitButton } from "@/components/inputs";
import { useEquipamentosList, useSalvarEquipamento } from "@/data/equipamentos";
import { TableSkeleton } from "@/components/skeletons";
import { equipamentoSchema, EquipamentoFormData } from "@/lib/schemas/equipamento";

const empty: EquipamentoFormData = { tipo: "", modelo: "", serie: "", tag: "", ano: null, status: "ativo", observacoes: "" };

export default function Equipamentos() {
  const { data: list = [], isLoading } = useEquipamentosList();
  const salvar = useSalvarEquipamento();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id?: string } | null>(null);

  const form = useForm<EquipamentoFormData>({
    resolver: zodResolver(equipamentoSchema),
    defaultValues: empty,
    mode: "onBlur",
  });

  const openNew = () => { setEditing(null); form.reset(empty); setOpen(true); };
  const openEdit = (e: Record<string, unknown>) => {
    setEditing({ id: e.id as string });
    form.reset({ ...empty, ...e } as EquipamentoFormData);
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    await salvar.mutateAsync({ id: editing?.id, payload: values as Record<string, unknown> });
    setOpen(false);
  });

  const filtered = list.filter((e) =>
    !search || e.tag.toLowerCase().includes(search.toLowerCase()) || e.modelo.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader title="Equipamentos" description="Cadastro mestre da frota"
        actions={<Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />Novo equipamento</Button>} />
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
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono font-semibold">{e.tag}</TableCell>
                    <TableCell>{e.tipo}</TableCell>
                    <TableCell>{e.modelo}</TableCell>
                    <TableCell className="text-sm">{e.serie ?? "—"}</TableCell>
                    <TableCell>{e.ano ?? "—"}</TableCell>
                    <TableCell><Badge variant={e.status === "ativo" ? "default" : e.status === "manutencao" ? "secondary" : "outline"}>{e.status}</Badge></TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => openEdit(e as unknown as Record<string, unknown>)}><Pencil className="h-4 w-4" /></Button></TableCell>
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
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField control={form.control} name="tag" render={({ field }) => (
                  <FormItem><FormLabel>Tag *</FormLabel><FormControl><Input {...field} className="font-mono uppercase" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="tipo" render={({ field }) => (
                  <FormItem><FormLabel>Tipo *</FormLabel><FormControl><Input placeholder="Ex: Escavadeira" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="modelo" render={({ field }) => (
                  <FormItem><FormLabel>Modelo *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="serie" render={({ field }) => (
                  <FormItem><FormLabel>Série</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="ano" render={({ field }) => (
                  <FormItem><FormLabel>Ano</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                    </FormControl><FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem><FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="manutencao">Manutenção</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
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
