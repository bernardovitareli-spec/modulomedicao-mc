import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtBRL, fmtCompetencia } from "@/lib/format";
import { FileText, ClipboardList, CheckCircle2, Receipt, AlertTriangle, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Stats {
  contratosAtivos: number;
  medicoesMes: number;
  aprovadasMes: number;
  faturadoMes: number;
  pendentesAprovacao: number;
  contratosVencendo: number;
  serieFaturamento: { mes: string; valor: number }[];
  topContratos: { numero: string; valor: number }[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
      const em30 = new Date(hoje.getTime() + 30 * 86400000).toISOString().slice(0, 10);

      const [contratos, medicoesMes, aprovadasMes, pendentes, vencendo, faturas12, todasMedicoes] = await Promise.all([
        supabase.from("contratos").select("id", { count: "exact", head: true }).eq("status", "ativo"),
        supabase.from("medicoes").select("id", { count: "exact", head: true }).gte("competencia", inicioMes),
        supabase.from("medicoes").select("valor_final").in("status", ["aprovada_internamente", "aprovada_cliente", "faturada", "paga"]).gte("competencia", inicioMes),
        supabase.from("medicoes").select("id", { count: "exact", head: true }).in("status", ["em_revisao_interna", "enviada_cliente"]),
        supabase.from("contratos").select("id", { count: "exact", head: true }).lte("termino_contrato", em30).eq("status", "ativo"),
        supabase.from("faturas").select("valor, data_emissao").eq("status", "emitida").not("data_emissao", "is", null),
        supabase.from("medicoes").select("contrato_id, valor_final, contratos(numero_dj)").in("status", ["aprovada_internamente", "aprovada_cliente", "faturada", "paga"]).order("valor_final", { ascending: false }).limit(20),
      ]);

      // série 12 meses
      const serie: Record<string, number> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        serie[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`] = 0;
      }
      faturas12.data?.forEach((f: any) => {
        const k = (f.data_emissao as string).slice(0, 7);
        if (k in serie) serie[k] += Number(f.valor);
      });

      // top contratos
      const agg: Record<string, { numero: string; valor: number }> = {};
      todasMedicoes.data?.forEach((m: any) => {
        const num = m.contratos?.numero_dj ?? "—";
        agg[num] = agg[num] ?? { numero: num, valor: 0 };
        agg[num].valor += Number(m.valor_final ?? 0);
      });
      const top = Object.values(agg).sort((a, b) => b.valor - a.valor).slice(0, 5);

      setStats({
        contratosAtivos: contratos.count ?? 0,
        medicoesMes: medicoesMes.count ?? 0,
        aprovadasMes: aprovadasMes.data?.length ?? 0,
        faturadoMes: aprovadasMes.data?.reduce((s: number, x: any) => s + Number(x.valor_final), 0) ?? 0,
        pendentesAprovacao: pendentes.count ?? 0,
        contratosVencendo: vencendo.count ?? 0,
        serieFaturamento: Object.entries(serie).map(([mes, valor]) => ({ mes, valor })),
        topContratos: top,
      });
    })();
  }, []);

  return (
    <div>
      <PageHeader title="Dashboard" description="Visão geral das medições, contratos e faturamento" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={FileText} label="Contratos ativos" value={String(stats?.contratosAtivos ?? "—")} />
        <KpiCard icon={ClipboardList} label="Medições do mês" value={String(stats?.medicoesMes ?? "—")} />
        <KpiCard icon={CheckCircle2} label="Aprovadas no mês" value={String(stats?.aprovadasMes ?? "—")} accent="success" />
        <KpiCard icon={Receipt} label="Valor aprovado" value={fmtBRL(stats?.faturadoMes ?? 0)} accent="primary" />
        <KpiCard icon={AlertTriangle} label="Pendentes aprovação" value={String(stats?.pendentesAprovacao ?? "—")} accent="warning" />
        <KpiCard icon={TrendingUp} label="Contratos vencendo (30d)" value={String(stats?.contratosVencendo ?? "—")} accent="warning" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Faturamento mensal (12 meses)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.serieFaturamento ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v: string) => {
                  const f = fmtCompetencia(v);
                  return f === "-" ? v : f.slice(0, 3) + "/" + f.slice(-2);
                }} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(l: string) => fmtCompetencia(l)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top 5 contratos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {stats?.topContratos.length ? stats.topContratos.map((c, i) => (
              <div key={c.numero} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="secondary" className="shrink-0">{i + 1}</Badge>
                  <span className="truncate text-sm font-medium">{c.numero}</span>
                </div>
                <span className="text-sm font-semibold num text-primary">{fmtBRL(c.valor)}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">Sem dados ainda.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: "primary" | "success" | "warning" }) {
  const color = accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : accent === "primary" ? "text-primary" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
        <p className={`mt-2 text-xl font-bold num ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
