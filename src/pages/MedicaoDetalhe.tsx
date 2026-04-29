import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileDown, Trash2, Ban, Eye, Download, AlertTriangle, RotateCcw } from "lucide-react";
import { AcaoMedicaoDialog } from "@/components/medicao/AcaoMedicaoDialog";
import { fmtBRL, fmtDate, fmtNum, fmtCompetencia } from "@/lib/format";
import { StatusBadge } from "@/components/contrato/ContratoMedicoesTab";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/lib/permissions";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { gerarBoletimPDF } from "@/lib/boletimPdf";
import { MedicaoItensEditor } from "@/components/medicao/MedicaoItensEditor";
import { MedicaoHistoricoTab } from "@/components/medicao/MedicaoHistoricoTab";
import MedicaoRegrasActions from "@/components/medicao/MedicaoRegrasActions";
import { FluxoAprovacaoTab } from "@/components/medicao/FluxoAprovacaoTab";
import { FluxoAcoes } from "@/components/medicao/FluxoAcoes";
import { MedicaoAnexosTab } from "@/components/medicao/MedicaoAnexosTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { labelStatus } from "@/lib/medicaoStatus";
import { CriarFaturamentoButton } from "@/components/faturamento/CriarFaturamentoButton";

export default function MedicaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const perms = usePermissions();
  const [med, setMed] = useState<any>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [delOpen, setDelOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reabrirOpen, setReabrirOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    const [m, i] = await Promise.all([
      supabase.from("medicoes").select("*, contratos(numero_dj, tipo_servico, centro_custo, fornecedor_nome, fornecedor_codigo, fornecedor_cnpj, clientes(razao_social, cnpj))").eq("id", id).single(),
      supabase.from("medicao_itens").select("*, equipamentos(tag, tipo, modelo)").eq("medicao_id", id).order("created_at"),
    ]);
    setMed(m.data); setItens(i.data ?? []);
  };
  useEffect(() => { load(); }, [id]);

  const onDelete = async (motivo: string): Promise<void> => {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_medicao_safe", { _medicao_id: id, _motivo: motivo });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Medição excluída.");
    navigate("/medicoes");
  };

  const onCancel = async (motivo: string): Promise<void> => {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.rpc("cancel_medicao", { _medicao_id: id, _motivo: motivo });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Medição cancelada.");
    load();
  };

  const onReabrir = async (values: Record<string, string>): Promise<void> => {
    if (!id) return;
    const motivo = values._motivo;
    const { error } = await supabase.rpc("reabrir_medicao_cancelada" as any, {
      _medicao_id: id,
      _motivo: motivo,
    });
    if (error) { toast.error(error.message); throw error; }
    toast.success("Medição reaberta como rascunho.");
    load();
  };

  const exportarPDF = async (preview = false, modo: "interno" | "cliente" = "interno") => {
    if (!id) return;
    if (med?.status === "cancelada") {
      toast.error("Não é permitido gerar PDF de medição cancelada.");
      return;
    }
    try {
      await gerarBoletimPDF(id, { preview, modo });
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar PDF");
    }
  };

  if (!med) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  const status = med.status as string;
  const podeEditar = perms.canEditMedicao(status);
  const isReadOnly = !podeEditar;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" />Voltar
      </Button>
      <PageHeader
        title={`Medição ${fmtCompetencia(med.competencia)}`}
        description={`${med.contratos.numero_dj} — ${med.contratos.clientes.razao_social}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={status === "cancelada"}>
                  <FileDown className="mr-1 h-4 w-4" />PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">PDF Interno</div>
                <DropdownMenuItem onClick={() => exportarPDF(true, "interno")}><Eye className="mr-2 h-4 w-4" />Visualizar (interno)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportarPDF(false, "interno")}><Download className="mr-2 h-4 w-4" />Baixar (interno)</DropdownMenuItem>
                <div className="mt-1 px-2 py-1 text-xs font-semibold text-muted-foreground">PDF para Cliente</div>
                <DropdownMenuItem onClick={() => exportarPDF(true, "cliente")}><Eye className="mr-2 h-4 w-4" />Visualizar (cliente)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportarPDF(false, "cliente")}><Download className="mr-2 h-4 w-4" />Baixar (cliente)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {perms.canRecalcular(status) && (
              <MedicaoRegrasActions medicaoId={med.id} status={status} onApplied={load} />
            )}

            <FluxoAcoes medicaoId={med.id} status={status} onChanged={load} />

            <CriarFaturamentoButton
              medicaoId={med.id}
              status={status}
              valorFinal={Number(med.valor_final ?? 0)}
              competencia={med.competencia}
              contratoNumero={med.contratos?.numero_dj}
              cliente={med.contratos?.clientes?.razao_social}
              canCreate={perms.canFaturar(status)}
              onCreated={load}
            />

            {perms.canCancelMedicao(status) && (
              <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>
                <Ban className="mr-1 h-4 w-4" />Cancelar medição
              </Button>
            )}
            {perms.canDeleteMedicao(status) && (
              <Button size="sm" variant="destructive" onClick={() => setDelOpen(true)}>
                <Trash2 className="mr-1 h-4 w-4" />Excluir medição
              </Button>
            )}
          </div>
        }
      />

      {isReadOnly && status !== "cancelada" && (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Medição em <strong>{labelStatus(status)}</strong> — edição de itens e recálculo bloqueados.
            {perms.isAdmin && " Como administrador, você ainda pode editar com justificativa obrigatória."}
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-4">
        <CardContent className="p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-5 text-sm">
          <Info l="Cliente / Contratante" v={med.contratos?.clientes?.razao_social ?? "-"} />
          <Info l="Fornecedor / Locadora" v={
            med.contratos?.fornecedor_nome
              ? `${med.contratos.fornecedor_nome}${med.contratos.fornecedor_codigo ? ` (${med.contratos.fornecedor_codigo})` : ""}`
              : "-"
          } />
          <Info l="Contrato / Nº DJ" v={med.contratos?.numero_dj ?? "-"} />
          <Info l="Tipo de serviço" v={med.contratos?.tipo_servico ?? "-"} />
          <Info l="Centro de custo" v={med.contratos?.centro_custo ?? "-"} />
          <Info l="Competência" v={fmtCompetencia(med.competencia)} />
          <Info l="Período início" v={fmtDate(med.periodo_inicio)} />
          <Info l="Período fim" v={fmtDate(med.periodo_fim)} />
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="mt-1"><StatusBadge status={status} /></div>
          </div>
          {med.enviada_cliente_em && (
            <Info l="Enviada ao cliente em" v={fmtDate(med.enviada_cliente_em)} />
          )}
          {med.aprovada_cliente_em && (
            <Info l="Aprovada pelo cliente em" v={fmtDate(med.aprovada_cliente_em)} />
          )}
          {med.aprovador_cliente_nome && (
            <Info l="Aprovador (cliente)" v={med.aprovador_cliente_nome} />
          )}
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <Kpi l="Horas informadas" v={fmtNum(med.total_horas_informadas)} />
        <Kpi l="Horas líquidas" v={fmtNum(med.total_horas_liquidas)} />
        <Kpi l="Horas a pagar" v={fmtNum(med.total_horas_pagar)} />
        <Kpi l="Valor bruto" v={fmtBRL(med.valor_bruto)} />
        <Kpi l="Valor final" v={fmtBRL(med.valor_final)} accent />
      </div>

      <Tabs defaultValue="itens" className="mt-2">
        <TabsList>
          <TabsTrigger value="itens">Itens</TabsTrigger>
          <TabsTrigger value="historico">Histórico de alterações</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de aprovação</TabsTrigger>
          <TabsTrigger value="anexos">Anexos</TabsTrigger>
        </TabsList>

        <TabsContent value="itens" className="mt-4">
          <MedicaoItensEditor
            medicaoId={med.id}
            contratoId={med.contrato_id}
            periodoInicio={med.periodo_inicio}
            periodoFim={med.periodo_fim}
            competencia={med.competencia}
            cliente={med.contratos?.clientes?.razao_social}
            contratoNumero={med.contratos?.numero_dj}
            status={status}
            onChanged={load}
          />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <MedicaoHistoricoTab medicaoId={med.id} />
        </TabsContent>

        <TabsContent value="fluxo" className="mt-4">
          <FluxoAprovacaoTab medicaoId={med.id} />
        </TabsContent>

        <TabsContent value="anexos" className="mt-4">
          <MedicaoAnexosTab medicaoId={med.id} />
        </TabsContent>
      </Tabs>

      <DeleteConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title="Excluir medição"
        message="Tem certeza que deseja excluir esta medição? Esta ação removerá todos os itens da medição e não poderá ser desfeita."
        confirmWord="EXCLUIR"
        loading={busy}
        onConfirm={onDelete}
      />
      <DeleteConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar medição"
        message="Cancelar mantém o histórico e marca o status como 'cancelada'. Informe o motivo (mínimo 5 caracteres)."
        confirmWord="CANCELAR"
        loading={busy}
        onConfirm={onCancel}
      />
    </div>
  );
}

function Kpi({ l, v, accent }: { l: string; v: string; accent?: boolean }) {
  return <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{l}</p><p className={`mt-1 text-lg font-bold num ${accent ? "text-primary" : ""}`}>{v}</p></CardContent></Card>;
}

function Info({ l, v }: { l: string; v: string }) {
  return <div><p className="text-xs text-muted-foreground">{l}</p><p className="mt-0.5 font-medium">{v}</p></div>;
}
