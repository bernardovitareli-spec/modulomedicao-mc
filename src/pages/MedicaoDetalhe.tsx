import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { notify } from "@/lib/notify";
import { gerarBoletimPDF } from "@/lib/boletimPdf";
import { MedicaoItensEditor } from "@/components/medicao/MedicaoItensEditor";
import { MedicaoHistoricoTab } from "@/components/medicao/MedicaoHistoricoTab";
import MedicaoRegrasActions from "@/components/medicao/MedicaoRegrasActions";
import { FluxoAprovacaoTab } from "@/components/medicao/FluxoAprovacaoTab";
import { FluxoAcoes } from "@/components/medicao/FluxoAcoes";
import { MedicaoAnexosTab } from "@/components/medicao/MedicaoAnexosTab";
import { MedicaoVersoesTab } from "@/components/medicao/MedicaoVersoesTab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { labelStatus } from "@/lib/medicaoStatus";
import { CriarFaturamentoButton } from "@/components/faturamento/CriarFaturamentoButton";
import { useMedicao, useMedicaoVersoes, useDeletarMedicao, useCancelarMedicao, useReabrirMedicao } from "@/data/medicoes";
import { qk } from "@/lib/queryKeys";
import { DetalheSkeleton } from "@/components/skeletons";

export default function MedicaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const perms = usePermissions();
  const qc = useQueryClient();

  const { data: med, isLoading } = useMedicao(id);
  const originalId = useMemo(() => {
    if (!med) return undefined;
    return (med as any).medicao_original_id ?? med.id;
  }, [med]);
  const { data: versoes = [] } = useMedicaoVersoes(originalId);

  const [delOpen, setDelOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reabrirOpen, setReabrirOpen] = useState(false);

  const deletar = useDeletarMedicao();
  const cancelar = useCancelarMedicao();
  const reabrir = useReabrirMedicao();

  const reloadAll = () => {
    if (id) qc.invalidateQueries({ queryKey: qk.medicoes.byId(id) });
    qc.invalidateQueries({ queryKey: qk.medicoes.all });
  };

  const onDelete = async (motivo: string): Promise<void> => {
    if (!id) return;
    try {
      await deletar.mutateAsync({ id, motivo });
      navigate("/medicoes");
    } catch { /* notify */ }
  };

  const onCancel = async (motivo: string): Promise<void> => {
    if (!id) return;
    try {
      await cancelar.mutateAsync({ id, motivo });
    } catch { /* notify */ }
  };

  const onReabrir = async (values: Record<string, string>): Promise<void> => {
    if (!id) return;
    try {
      await reabrir.mutateAsync({ id, motivo: values._motivo });
    } catch (e) {
      throw e;
    }
  };

  const exportarPDF = async (preview = false, modo: "interno" | "cliente" = "interno") => {
    if (!id) return;
    if ((med as any)?.status === "cancelada") {
      notify.error("Não é permitido gerar PDF de medição cancelada.");
      return;
    }
    try {
      await gerarBoletimPDF(id, { preview, modo });
    } catch (e: any) {
      notify.error(e.message ?? "Falha ao gerar PDF");
    }
  };

  if (isLoading || !med) return <DetalheSkeleton />;
  const status = (med as any).status as string;
  const podeEditar = perms.canEditMedicao(status);
  const isReadOnly = !podeEditar;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" />Voltar
      </Button>
      <PageHeader
        title={`Medição ${fmtCompetencia((med as any).competencia)}`}
        description={`${(med as any).contratos.numero_dj} — ${(med as any).contratos.clientes.razao_social}`}
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
              <MedicaoRegrasActions medicaoId={(med as any).id} status={status} onApplied={reloadAll} />
            )}

            <FluxoAcoes medicaoId={(med as any).id} status={status} onChanged={reloadAll} />

            <CriarFaturamentoButton
              medicaoId={(med as any).id}
              status={status}
              valorFinal={Number((med as any).valor_final ?? 0)}
              competencia={(med as any).competencia}
              contratoNumero={(med as any).contratos?.numero_dj}
              cliente={(med as any).contratos?.clientes?.razao_social}
              canCreate={perms.canFaturar(status)}
              onCreated={reloadAll}
            />

            {perms.canCancelMedicao(status) && (
              <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>
                <Ban className="mr-1 h-4 w-4" />Cancelar medição
              </Button>
            )}
            {perms.isAdmin && status === "cancelada" && (
              <Button size="sm" variant="outline" onClick={() => setReabrirOpen(true)}>
                <RotateCcw className="mr-1 h-4 w-4" />Reabrir como Rascunho
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
          <Info l="Cliente / Contratante" v={(med as any).contratos?.clientes?.razao_social ?? "-"} />
          <Info l="Fornecedor / Locadora" v={
            (med as any).contratos?.fornecedor_nome
              ? `${(med as any).contratos.fornecedor_nome}${(med as any).contratos.fornecedor_codigo ? ` (${(med as any).contratos.fornecedor_codigo})` : ""}`
              : "MC TERRAPLENAGEM E CONSTRUÇÕES LTDA"
          } />
          <Info l="Contrato / Nº DJ" v={(med as any).contratos?.numero_dj ?? "-"} />
          <Info l="Tipo de serviço" v={(med as any).contratos?.tipo_servico ?? "-"} />
          <Info l="Centro de custo" v={(med as any).contratos?.centro_custo ?? "-"} />
          <Info l="Competência" v={fmtCompetencia((med as any).competencia)} />
          <Info l="Período início" v={fmtDate((med as any).periodo_inicio)} />
          <Info l="Período fim" v={fmtDate((med as any).periodo_fim)} />
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="mt-1 flex items-center gap-1.5">
              <StatusBadge status={status} />
              {Number((med as any).versao ?? 1) > 1 && <span className="text-xs px-1.5 py-0.5 rounded border">v{(med as any).versao}</span>}
              {(med as any).ativa === false && <span className="text-xs px-1.5 py-0.5 rounded bg-muted">inativa</span>}
            </div>
          </div>
          {(med as any).enviada_cliente_em && (
            <Info l="Enviada ao cliente em" v={fmtDate((med as any).enviada_cliente_em)} />
          )}
          {(med as any).aprovada_cliente_em && (
            <Info l="Aprovada pelo cliente em" v={fmtDate((med as any).aprovada_cliente_em)} />
          )}
          {(med as any).aprovador_cliente_nome && (
            <Info l="Aprovador (cliente)" v={(med as any).aprovador_cliente_nome} />
          )}
        </CardContent>
      </Card>

      {versoes.length > 1 && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold">Versões desta medição</h3>
                <p className="text-xs text-muted-foreground">Todas as versões para o mesmo contrato/competência/período</p>
              </div>
              <span className="text-xs text-muted-foreground">{versoes.length} versão(ões)</span>
            </div>
            <div className="space-y-1.5">
              {versoes.map((v: any) => {
                const atual = v.id === id;
                return (
                  <div
                    key={v.id}
                    className={`flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs ${atual ? "bg-muted/50 border-primary" : "cursor-pointer hover:bg-muted/30"}`}
                    onClick={() => { if (!atual) navigate(`/medicoes/${v.id}`); }}
                  >
                    <span className="px-1.5 py-0.5 rounded border font-mono">v{v.versao}</span>
                    <StatusBadge status={v.status} />
                    {v.ativa ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">ativa</span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted">inativa</span>
                    )}
                    <span className="text-muted-foreground">{fmtDate(v.created_at)}</span>
                    <span className="num font-semibold ml-auto">{fmtBRL(v.valor_final)}</span>
                    {v.arquivo_origem && (
                      <span className="basis-full text-muted-foreground truncate">📎 {v.arquivo_origem}</span>
                    )}
                    {atual && <span className="basis-full text-[10px] text-primary">⬤ Visualizando esta versão</span>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <Kpi l="Horas informadas" v={fmtNum((med as any).total_horas_informadas)} />
        <Kpi l="Horas líquidas" v={fmtNum((med as any).total_horas_liquidas)} />
        <Kpi l="Horas a pagar" v={fmtNum((med as any).total_horas_pagar)} />
        <Kpi l="Valor bruto" v={fmtBRL((med as any).valor_bruto)} />
        <Kpi l="Valor final" v={fmtBRL((med as any).valor_final)} accent />
      </div>

      <Tabs defaultValue="itens" className="mt-2">
        <TabsList>
          <TabsTrigger value="itens">Itens</TabsTrigger>
          <TabsTrigger value="historico">Histórico de alterações</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de aprovação</TabsTrigger>
          <TabsTrigger value="anexos">Anexos</TabsTrigger>
          <TabsTrigger value="versoes">
            Versões{versoes.length > 1 && <span className="ml-1 text-[10px] px-1.5 rounded bg-primary/15 text-primary">{versoes.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="itens" className="mt-4">
          <MedicaoItensEditor
            medicaoId={(med as any).id}
            contratoId={(med as any).contrato_id}
            periodoInicio={(med as any).periodo_inicio}
            periodoFim={(med as any).periodo_fim}
            competencia={(med as any).competencia}
            cliente={(med as any).contratos?.clientes?.razao_social}
            contratoNumero={(med as any).contratos?.numero_dj}
            status={status}
            onChanged={reloadAll}
          />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <MedicaoHistoricoTab medicaoId={(med as any).id} />
        </TabsContent>

        <TabsContent value="fluxo" className="mt-4">
          <FluxoAprovacaoTab medicaoId={(med as any).id} />
        </TabsContent>

        <TabsContent value="anexos" className="mt-4">
          <MedicaoAnexosTab medicaoId={(med as any).id} />
        </TabsContent>

        <TabsContent value="versoes" className="mt-4">
          <MedicaoVersoesTab medicaoId={(med as any).id} />
        </TabsContent>
      </Tabs>

      <DeleteConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title="Excluir medição"
        message="Tem certeza que deseja excluir esta medição? Esta ação removerá todos os itens da medição e não poderá ser desfeita."
        confirmWord="EXCLUIR"
        loading={deletar.isPending}
        onConfirm={onDelete}
      />
      <DeleteConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar medição"
        message="Cancelar mantém o histórico e marca o status como 'cancelada'. Informe o motivo (mínimo 5 caracteres)."
        confirmWord="CANCELAR"
        loading={cancelar.isPending}
        onConfirm={onCancel}
      />
      <AcaoMedicaoDialog
        open={reabrirOpen}
        onOpenChange={setReabrirOpen}
        title="Reabrir medição cancelada como Rascunho"
        description="A medição voltará para o status Rascunho e poderá ser editada/recalculada novamente. Outras versões da mesma chave (contrato/competência/período) serão marcadas como inativas."
        motivoObrigatorio
        motivoLabel="Motivo da reabertura *"
        confirmLabel="Reabrir medição"
        onConfirm={onReabrir}
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
