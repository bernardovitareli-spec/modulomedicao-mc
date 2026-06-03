import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormSubmitButton, DataInput } from "@/components/inputs";
import { ArrowLeft, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notify";
import { traduzirErroSQL } from "@/lib/sqlErrors";

const novaMedicaoSchema = z.object({
  contrato_id: z.string().uuid({ message: "Selecione um contrato." }),
  competencia: z.string().min(7, { message: "Competência obrigatória." }),
  periodo_inicio: z.string().min(1, { message: "Período início obrigatório." }),
  periodo_fim: z.string().min(1, { message: "Período fim obrigatório." }),
  status: z.enum(["rascunho", "revisao_tecnica", "aprovada", "rejeitada"]).default("rascunho"),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
}).superRefine((d, ctx) => {
  if (d.periodo_fim < d.periodo_inicio) {
    ctx.addIssue({ code: "custom", path: ["periodo_fim"], message: "Período fim deve ser maior ou igual ao início." });
  }
});

type NovaMedicaoData = z.input<typeof novaMedicaoSchema>;

export default function NovaMedicao() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: contratos = [] } = useQuery({
    queryKey: ["contratos-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos")
        .select("id, numero_dj, tipo_servico, clientes(razao_social)")
        .order("numero_dj");
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = new Date();
  const compInicial = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const form = useForm<NovaMedicaoData>({
    resolver: zodResolver(novaMedicaoSchema),
    defaultValues: {
      contrato_id: "",
      competencia: compInicial,
      periodo_inicio: "",
      periodo_fim: "",
      status: "rascunho",
      observacoes: "",
    },
    mode: "onBlur",
  });

  const competencia = form.watch("competencia");

  // Auto-preencher período a partir da competência
  useEffect(() => {
    if (!competencia) return;
    const [y, m] = competencia.split("-").map(Number);
    if (!y || !m) return;
    const ini = new Date(y, m - 1, 1);
    const fim = new Date(y, m, 0);
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    if (!form.getValues("periodo_inicio")) form.setValue("periodo_inicio", iso(ini));
    if (!form.getValues("periodo_fim")) form.setValue("periodo_fim", iso(fim));
  }, [competencia, form]);

  const criar = useMutation({
    mutationFn: async (values: NovaMedicaoData) => {
      const { data, error } = await supabase
        .from("medicoes")
        .insert({
          contrato_id: values.contrato_id,
          competencia: values.competencia + "-01",
          periodo_inicio: values.periodo_inicio,
          periodo_fim: values.periodo_fim,
          status: values.status,
          observacoes: values.observacoes || null,
          created_by: user?.id ?? null,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      notify.success("Medição criada");
      navigate(`/medicoes/${data!.id}`);
    },
    onError: (e: Error) => notify.error(traduzirErroSQL(e.message)),
  });

  const onSubmit = form.handleSubmit((values) => criar.mutateAsync(values));

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" />Voltar
      </Button>
      <PageHeader title="Nova medição" description="Crie uma medição mensal e adicione os itens por equipamento" />

      <Card className="max-w-3xl">
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField control={form.control} name="contrato_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contrato *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o contrato" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {contratos.map((c) => {
                        const cliente = (c as { clientes?: { razao_social?: string } }).clientes;
                        return (
                          <SelectItem key={c.id} value={c.id}>
                            {c.numero_dj} — {cliente?.razao_social} ({c.tipo_servico})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="competencia" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Competência (mês/ano) *</FormLabel>
                    <FormControl>
                      <Input type="month" value={field.value} onChange={(e) => {
                        field.onChange(e.target.value);
                        form.setValue("periodo_inicio", "");
                        form.setValue("periodo_fim", "");
                      }} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="periodo_inicio" render={({ field }) => (
                  <FormItem><FormLabel>Período início *</FormLabel><FormControl><DataInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="periodo_fim" render={({ field }) => (
                  <FormItem><FormLabel>Período fim *</FormLabel><FormControl><DataInput value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="revisao_tecnica">Em revisão</SelectItem>
                      <SelectItem value="aprovada">Aprovada</SelectItem>
                      <SelectItem value="rejeitada">Rejeitada</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="observacoes" render={({ field }) => (
                <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea rows={3} {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
                <FormSubmitButton requireDirty={false}>
                  <Save className="mr-1 h-4 w-4" />Criar e adicionar itens
                </FormSubmitButton>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
