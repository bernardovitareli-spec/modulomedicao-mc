import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notify";

export default function NovaMedicao() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contratos, setContratos] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const today = new Date();
  const [form, setForm] = useState({
    contrato_id: "",
    competencia: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`,
    periodo_inicio: "",
    periodo_fim: "",
    status: "rascunho" as "rascunho" | "revisao_tecnica" | "aprovada" | "rejeitada",
    observacoes: "",
  });

  useEffect(() => {
    supabase
      .from("contratos")
      .select("id, numero_dj, tipo_servico, clientes(razao_social)")
      .order("numero_dj")
      .then(({ data }) => setContratos(data ?? []));
  }, []);

  // Auto-preencher período a partir da competência
  useEffect(() => {
    if (!form.competencia) return;
    const d = new Date(form.competencia + "T00:00:00");
    const ini = new Date(d.getFullYear(), d.getMonth(), 1);
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    setForm((f) => ({
      ...f,
      periodo_inicio: f.periodo_inicio || iso(ini),
      periodo_fim: f.periodo_fim || iso(fim),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.competencia]);

  const submit = async () => {
    if (!form.contrato_id) return notify.error("Selecione um contrato");
    if (!form.periodo_inicio || !form.periodo_fim) return notify.error("Defina o período");
    setSaving(true);
    const { data, error } = await supabase
      .from("medicoes")
      .insert({
        contrato_id: form.contrato_id,
        competencia: form.competencia,
        periodo_inicio: form.periodo_inicio,
        periodo_fim: form.periodo_fim,
        status: form.status,
        observacoes: form.observacoes || null,
        created_by: user?.id ?? null,
      } as any)
      .select("id")
      .single();
    setSaving(false);
    if (error) return notify.error(error.message);
    notify.success("Medição criada");
    navigate(`/medicoes/${data!.id}`);
  };

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" />Voltar
      </Button>
      <PageHeader title="Nova medição" description="Crie uma medição mensal e adicione os itens por equipamento" />

      <Card className="max-w-3xl">
        <CardContent className="p-6 space-y-4">
          <div>
            <Label>Contrato *</Label>
            <Select value={form.contrato_id} onValueChange={(v) => setForm({ ...form, contrato_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o contrato" /></SelectTrigger>
              <SelectContent>
                {contratos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.numero_dj} — {c.clientes?.razao_social} ({c.tipo_servico})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Competência (mês/ano) *</Label>
              <Input
                type="month"
                value={form.competencia.slice(0, 7)}
                onChange={(e) => setForm({ ...form, competencia: e.target.value + "-01", periodo_inicio: "", periodo_fim: "" })}
              />
            </div>
            <div>
              <Label>Período início *</Label>
              <Input type="date" value={form.periodo_inicio} onChange={(e) => setForm({ ...form, periodo_inicio: e.target.value })} />
            </div>
            <div>
              <Label>Período fim *</Label>
              <Input type="date" value={form.periodo_fim} onChange={(e) => setForm({ ...form, periodo_fim: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="revisao_tecnica">Em revisão</SelectItem>
                <SelectItem value="aprovada">Aprovada</SelectItem>
                <SelectItem value="rejeitada">Rejeitada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>
              <Save className="mr-1 h-4 w-4" />Criar e adicionar itens
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
