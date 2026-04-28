import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { fmtBRL, fmtNum, fmtDate } from "@/lib/format";

export default function MemoriaCalculo() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<any>(null);

  useEffect(() => {
    if (!itemId) return;
    supabase.from("medicao_itens").select("*, equipamentos(tag, tipo, modelo), medicoes(competencia, contratos(numero_dj, clientes(razao_social)))").eq("id", itemId).single()
      .then(({ data }) => setItem(data));
  }, [itemId]);

  if (!itemId) return (
    <div>
      <PageHeader title="Memória de cálculo" description="Selecione uma medição e clique em 'Memória' em cada item" />
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Acesse uma medição para visualizar a memória de cálculo de cada equipamento.</CardContent></Card>
    </div>
  );
  if (!item) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  const memoria: any[] = item.memoria_calculo ?? [];
  const regras: any[] = item.regras_aplicadas ?? [];

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>
      <PageHeader title={`Memória — ${item.equipamentos?.tag}`} description={`${item.medicoes?.contratos?.numero_dj} · ${fmtDate(item.medicoes?.competencia).slice(3)}`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Passo a passo</h3>
          <div className="space-y-1.5">
            {memoria.map((p, i) => (
              <div key={i} className={`flex items-center justify-between rounded px-3 py-2 text-sm ${p.passo.startsWith("=") || p.passo.startsWith("→") ? "bg-secondary font-semibold" : ""}`}>
                <span>{p.passo}{p.detalhe && <span className="ml-2 text-xs text-muted-foreground">({p.detalhe})</span>}</span>
                <span className="num">{p.passo.includes("Valor") || p.passo.includes("Complementares") || p.passo.includes("Descontos") || p.passo.includes("Glosas") || p.passo.includes("Aditivos") ? fmtBRL(p.valor) : fmtNum(p.valor)}</span>
              </div>
            ))}
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Regras aplicadas</h3>
          {regras.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma regra específica aplicada — usados valores padrão do contrato.</p>}
          <div className="space-y-2">
            {regras.map((r, i) => (
              <div key={i} className="rounded border p-3 text-sm">
                <div className="flex items-center justify-between"><Badge variant="secondary">{r.tipo}</Badge></div>
                <p className="mt-1.5 text-muted-foreground">{r.descricao}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded bg-primary/5 p-3 text-sm">
            <p className="text-xs text-muted-foreground">Valor final</p>
            <p className="text-2xl font-bold text-primary num">{fmtBRL(item.valor_final)}</p>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}
