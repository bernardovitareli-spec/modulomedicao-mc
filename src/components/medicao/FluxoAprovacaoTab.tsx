import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock, User } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from "@/lib/medicaoStatus";

interface Item {
  id: string;
  status_anterior: string | null;
  status_novo: string;
  user_email: string | null;
  perfil_usuario: string | null;
  motivo: string | null;
  observacoes: string | null;
  contexto: any;
  created_at: string;
}

export function FluxoAprovacaoTab({ medicaoId }: { medicaoId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("medicao_status_historico" as any)
        .select("*")
        .eq("medicao_id", medicaoId)
        .order("created_at", { ascending: true });
      setItems((data ?? []) as any);
      setLoading(false);
    })();
  }, [medicaoId]);

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Fluxo de aprovação</h3>
        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">Sem mudanças de status registradas ainda.</p>
        )}
        <ol className="relative border-l border-border ml-2 space-y-4">
          {items.map((it) => {
            const labelDe = it.status_anterior ? (STATUS_LABELS as any)[it.status_anterior] ?? it.status_anterior : "—";
            const labelPara = (STATUS_LABELS as any)[it.status_novo] ?? it.status_novo;
            const variantPara = (STATUS_BADGE_VARIANT as any)[it.status_novo] ?? "secondary";
            return (
              <li key={it.id} className="ml-4">
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-primary" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {it.status_anterior && (
                    <>
                      <Badge variant="outline">{labelDe}</Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </>
                  )}
                  <Badge variant={variantPara as any}>{labelPara}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDate(it.created_at)} {new Date(it.created_at).toLocaleTimeString("pt-BR")}
                  </span>
                  {it.user_email && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {it.user_email}
                      {it.perfil_usuario && ` (${it.perfil_usuario})`}
                    </span>
                  )}
                </div>
                {it.motivo && (
                  <div className="mt-1 text-xs">
                    <span className="font-medium">Motivo: </span>
                    <span className="text-muted-foreground">{it.motivo}</span>
                  </div>
                )}
                {it.observacoes && (
                  <div className="mt-1 text-xs">
                    <span className="font-medium">Obs.: </span>
                    <span className="text-muted-foreground">{it.observacoes}</span>
                  </div>
                )}
                {it.contexto && Object.keys(it.contexto).length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {Object.entries(it.contexto)
                      .filter(([, v]) => v !== null && v !== "")
                      .map(([k, v]) => (
                        <span key={k} className="mr-3">
                          <span className="font-medium">{k}:</span> {String(v)}
                        </span>
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
