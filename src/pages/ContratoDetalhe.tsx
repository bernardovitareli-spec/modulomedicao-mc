import { useParams, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { fmtBRL, fmtDate } from "@/lib/format";
import ContratoEquipamentosTab from "@/components/contrato/ContratoEquipamentosTab";
import ContratoRegrasTab from "@/components/contrato/ContratoRegrasTab";
import ContratoAlteracoesTab from "@/components/contrato/ContratoAlteracoesTab";
import ContratoMedicoesTab from "@/components/contrato/ContratoMedicoesTab";
import { useContrato } from "@/data/contratos";
import { DetalheSkeleton } from "@/components/skeletons";

export default function ContratoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contrato, isLoading } = useContrato(id);

  if (isLoading || !contrato) return <DetalheSkeleton />;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate("/contratos")}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>
      <PageHeader
        title={`Contrato ${contrato.numero_dj}`}
        description={(contrato as any).clientes?.razao_social}
        actions={<Badge variant={contrato.status === "ativo" ? "default" : "secondary"}>{contrato.status}</Badge>}
      />

      <Card className="mb-4"><CardContent className="grid gap-3 p-4 md:grid-cols-4">
        <Info l="Tipo de serviço" v={contrato.tipo_servico} />
        <Info l="Centro de custo" v={contrato.centro_custo ?? "—"} />
        <Info l="Vigência" v={`${fmtDate(contrato.inicio_operacao)} → ${fmtDate(contrato.termino_contrato)}`} />
        <Info l="Valor global" v={fmtBRL(contrato.valor_global)} />
        <Info l="Valor/hora padrão" v={fmtBRL(contrato.valor_hora_padrao)} />
        <Info l="Garantia mínima (h)" v={String(contrato.garantia_minima_horas ?? "—")} />
      </CardContent></Card>

      <Tabs defaultValue="equipamentos">
        <TabsList>
          <TabsTrigger value="equipamentos">Equipamentos</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="alteracoes">Alterações</TabsTrigger>
          <TabsTrigger value="medicoes">Medições</TabsTrigger>
        </TabsList>
        <TabsContent value="equipamentos"><ContratoEquipamentosTab contratoId={contrato.id} /></TabsContent>
        <TabsContent value="regras"><ContratoRegrasTab contratoId={contrato.id} /></TabsContent>
        <TabsContent value="alteracoes"><ContratoAlteracoesTab contratoId={contrato.id} /></TabsContent>
        <TabsContent value="medicoes"><ContratoMedicoesTab contratoId={contrato.id} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ l, v }: { l: string; v: string }) {
  return <div><p className="text-xs text-muted-foreground">{l}</p><p className="font-semibold num">{v}</p></div>;
}
