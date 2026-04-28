import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Send, CheckCircle2, XCircle, FileDown, Trash2, Ban } from "lucide-react";
import { fmtBRL, fmtDate, fmtNum, fmtCompetencia } from "@/lib/format";
import { StatusBadge } from "@/components/contrato/ContratoMedicoesTab";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/lib/permissions";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MedicaoItensEditor } from "@/components/medicao/MedicaoItensEditor";

export default function MedicaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasAnyRole } = useAuth();
  const perms = usePermissions();
  const [med, setMed] = useState<any>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [aprovs, setAprovs] = useState<any[]>([]);
  const [dlg, setDlg] = useState<{ open: boolean; etapa: string; resultado: string }>({ open: false, etapa: "", resultado: "" });
  const [coment, setComent] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    const [m, i, a] = await Promise.all([
      supabase.from("medicoes").select("*, contratos(numero_dj, tipo_servico, centro_custo, clientes(razao_social, cnpj))").eq("id", id).single(),
      supabase.from("medicao_itens").select("*, equipamentos(tag, tipo, modelo)").eq("medicao_id", id).order("created_at"),
      supabase.from("aprovacoes").select("*").eq("medicao_id", id).order("created_at"),
    ]);
    setMed(m.data); setItens(i.data ?? []); setAprovs(a.data ?? []);
  };
  useEffect(() => { load(); }, [id]);

  const enviarRevisao = async () => {
    await supabase.from("medicoes").update({ status: "revisao_tecnica" } as any).eq("id", id!);
    toast.success("Enviado para revisão técnica"); load();
  };

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

  const registrar = async () => {
    await supabase.from("aprovacoes").insert({
      medicao_id: id!, etapa: dlg.etapa as any, resultado: dlg.resultado as any,
      comentario: coment, user_id: user!.id,
    } as any);
    let novoStatus = med.status;
    if (dlg.resultado === "aprovado" && dlg.etapa === "revisao_tecnica") novoStatus = "revisao_tecnica"; // segue para gerencial
    if (dlg.resultado === "aprovado" && dlg.etapa === "aprovacao_gerencial") novoStatus = "aprovada";
    if (dlg.resultado === "rejeitado") novoStatus = "rejeitada";
    if (dlg.resultado === "ajuste_solicitado") novoStatus = "rascunho";
    await supabase.from("medicoes").update({ status: novoStatus } as any).eq("id", id!);
    setDlg({ open: false, etapa: "", resultado: "" }); setComent("");
    toast.success("Aprovação registrada"); load();
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("Boletim de Medição", 14, 18);
    doc.setFontSize(10);
    doc.text(`Cliente: ${med.contratos.clientes.razao_social}`, 14, 26);
    doc.text(`Contrato: ${med.contratos.numero_dj}`, 14, 32);
    doc.text(`Competência: ${fmtCompetencia(med.competencia)}`, 14, 38);
    doc.text(`Período: ${fmtDate(med.periodo_inicio)} a ${fmtDate(med.periodo_fim)}`, 14, 44);
    autoTable(doc, {
      startY: 50,
      head: [["Tag", "Equipamento", "H. Inf.", "H. Líq.", "H. Pagar", "Valor/h", "Valor Final"]],
      body: itens.map((i) => [i.equipamentos?.tag, `${i.equipamentos?.tipo} ${i.equipamentos?.modelo}`, fmtNum(i.horas_informadas), fmtNum(i.horas_liquidas), fmtNum(i.horas_a_pagar), fmtBRL(i.valor_hora), fmtBRL(i.valor_final)]),
      foot: [["", "", "", "", fmtNum(med.total_horas_pagar), "TOTAL", fmtBRL(med.valor_final)]],
      styles: { fontSize: 8 },
    });
    doc.save(`boletim-${med.contratos.numero_dj}-${med.competencia.slice(0, 7)}.pdf`);
  };

  if (!med) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  const podeAprovar = hasAnyRole(["admin", "gestor_contrato", "operacional"]);

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(-1)}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>
      <PageHeader title={`Medição ${fmtCompetencia(med.competencia)}`} description={`${med.contratos.numero_dj} — ${med.contratos.clientes.razao_social}`}
        actions={<div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={med.status} />
          <Button size="sm" variant="outline" onClick={exportarPDF}><FileDown className="mr-1 h-4 w-4" />PDF</Button>
          {perms.canCancelMedicao(med.status) && (
            <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>
              <Ban className="mr-1 h-4 w-4" />Cancelar medição
            </Button>
          )}
          {perms.canDeleteMedicao(med.status) && (
            <Button size="sm" variant="destructive" onClick={() => setDelOpen(true)}>
              <Trash2 className="mr-1 h-4 w-4" />
              {perms.isAdmin ? "Excluir medição teste" : "Excluir medição"}
            </Button>
          )}
          {med.status === "rascunho" && podeAprovar && <Button size="sm" onClick={enviarRevisao}><Send className="mr-1 h-4 w-4" />Enviar para revisão</Button>}
          {med.status === "revisao_tecnica" && podeAprovar && (<>
            <Button size="sm" variant="default" onClick={() => setDlg({ open: true, etapa: aprovs.some((a) => a.etapa === "revisao_tecnica" && a.resultado === "aprovado") ? "aprovacao_gerencial" : "revisao_tecnica", resultado: "aprovado" })}><CheckCircle2 className="mr-1 h-4 w-4" />Aprovar</Button>
            <Button size="sm" variant="destructive" onClick={() => setDlg({ open: true, etapa: "revisao_tecnica", resultado: "rejeitado" })}><XCircle className="mr-1 h-4 w-4" />Rejeitar</Button>
          </>)}
        </div>} />

      <Card className="mb-4">
        <CardContent className="p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-5 text-sm">
          <Info l="Cliente" v={med.contratos?.clientes?.razao_social ?? "-"} />
          <Info l="CNPJ" v={med.contratos?.clientes?.cnpj ?? "-"} />
          <Info l="Contrato / Nº DJ" v={med.contratos?.numero_dj ?? "-"} />
          <Info l="Tipo de serviço" v={med.contratos?.tipo_servico ?? "-"} />
          <Info l="Centro de custo" v={med.contratos?.centro_custo ?? "-"} />
          <Info l="Competência" v={fmtCompetencia(med.competencia)} />
          <Info l="Período início" v={fmtDate(med.periodo_inicio)} />
          <Info l="Período fim" v={fmtDate(med.periodo_fim)} />
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="mt-1"><StatusBadge status={med.status} /></div>
          </div>
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
          <TabsTrigger value="aprovacoes">Aprovações</TabsTrigger>
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
            onChanged={load}
          />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <MedicaoHistoricoTab medicaoId={med.id} />
        </TabsContent>

        <TabsContent value="aprovacoes" className="mt-4">
          <Card><CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Histórico de aprovações</h3>
            {aprovs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma aprovação registrada.</p>
            ) : (
              <div className="space-y-2">
                {aprovs.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 rounded border p-3 text-sm">
                    <div className="flex-1">
                      <p className="font-medium">{a.etapa === "revisao_tecnica" ? "Revisão técnica" : "Aprovação gerencial"} — <span className={a.resultado === "aprovado" ? "text-success" : "text-destructive"}>{a.resultado}</span></p>
                      {a.comentario && <p className="text-muted-foreground">{a.comentario}</p>}
                      <p className="text-xs text-muted-foreground mt-1 num">{fmtDate(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dlg.open} onOpenChange={(o) => setDlg({ ...dlg, open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dlg.etapa === "revisao_tecnica" ? "Revisão técnica" : "Aprovação gerencial"} — {dlg.resultado}</DialogTitle></DialogHeader>
          <Textarea placeholder="Comentário (opcional)" value={coment} onChange={(e) => setComent(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setDlg({ ...dlg, open: false })}>Cancelar</Button><Button onClick={registrar}>Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

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
        message="Cancelar mantém o histórico e marca o status como 'cancelada'. Informe o motivo."
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
