import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Send, CheckCircle2, Undo2, UserCheck, UserX, DollarSign,
} from "lucide-react";
import { notify } from "@/lib/notify";
import { usePermissions } from "@/lib/permissions";
import { AcaoMedicaoDialog } from "./AcaoMedicaoDialog";

interface Props {
  medicaoId: string;
  status: string;
  onChanged?: () => void;
}

type Acao =
  | "enviar_revisao"
  | "aprovar_interno"
  | "devolver_rascunho"
  | "enviar_cliente"
  | "devolver_revisao"
  | "aprovar_cliente"
  | "reprovar_cliente"
  | "faturar"
  | "marcar_paga"
  | null;

export function FluxoAcoes({ medicaoId, status, onChanged }: Props) {
  const perms = usePermissions();
  const [acao, setAcao] = useState<Acao>(null);

  const close = () => setAcao(null);

  const exec = async (rpc: string, args: Record<string, any>) => {
    const { error } = await supabase.rpc(rpc as any, { _medicao_id: medicaoId, ...args });
    if (error) throw new Error(error.message);
    notify.success("Ação realizada com sucesso");
    onChanged?.();
  };

  return (
    <>
      {perms.canEnviarRevisao(status) && (
        <Button size="sm" onClick={() => setAcao("enviar_revisao")}>
          <Send className="mr-1 h-4 w-4" />Enviar para revisão
        </Button>
      )}
      {perms.canAprovarInternamente(status) && (
        <Button size="sm" onClick={() => setAcao("aprovar_interno")}>
          <CheckCircle2 className="mr-1 h-4 w-4" />Aprovar internamente
        </Button>
      )}
      {perms.canDevolverParaRascunho(status) && (
        <Button size="sm" variant="outline" onClick={() => setAcao("devolver_rascunho")}>
          <Undo2 className="mr-1 h-4 w-4" />Devolver para rascunho
        </Button>
      )}
      {perms.canEnviarAoCliente(status) && (
        <Button size="sm" onClick={() => setAcao("enviar_cliente")}>
          <Send className="mr-1 h-4 w-4" />Enviar ao cliente
        </Button>
      )}
      {perms.canDevolverParaRevisao(status) && (
        <Button size="sm" variant="outline" onClick={() => setAcao("devolver_revisao")}>
          <Undo2 className="mr-1 h-4 w-4" />Devolver para revisão
        </Button>
      )}
      {perms.canAprovarPeloCliente(status) && (
        <Button size="sm" onClick={() => setAcao("aprovar_cliente")}>
          <UserCheck className="mr-1 h-4 w-4" />Aprovada pelo cliente
        </Button>
      )}
      {perms.canReprovarPeloCliente(status) && (
        <Button size="sm" variant="destructive" onClick={() => setAcao("reprovar_cliente")}>
          <UserX className="mr-1 h-4 w-4" />Reprovada pelo cliente
        </Button>
      )}
      {perms.canMarcarPaga(status) && (
        <Button size="sm" onClick={() => setAcao("marcar_paga")}>
          <DollarSign className="mr-1 h-4 w-4" />Marcar como paga
        </Button>
      )}

      {/* Diálogos */}
      <AcaoMedicaoDialog
        open={acao === "enviar_revisao"} onOpenChange={(o) => !o && close()}
        title="Enviar para revisão interna"
        confirmLabel="Enviar"
        onConfirm={(v) => exec("enviar_para_revisao", { _observacoes: v._observacoes || null })}
      />

      <AcaoMedicaoDialog
        open={acao === "aprovar_interno"} onOpenChange={(o) => !o && close()}
        title="Aprovar internamente"
        confirmLabel="Aprovar"
        onConfirm={(v) => exec("aprovar_internamente", { _observacoes: v._observacoes || null })}
      />

      <AcaoMedicaoDialog
        open={acao === "devolver_rascunho"} onOpenChange={(o) => !o && close()}
        title="Devolver para rascunho"
        motivoObrigatorio variant="destructive"
        confirmLabel="Devolver"
        onConfirm={(v) => exec("devolver_para_rascunho", { _motivo: v._motivo })}
      />

      <AcaoMedicaoDialog
        open={acao === "enviar_cliente"} onOpenChange={(o) => !o && close()}
        title="Enviar ao cliente"
        description="Será registrada a data/hora do envio e o usuário responsável."
        confirmLabel="Enviar"
        onConfirm={(v) => exec("enviar_ao_cliente", { _observacoes: v._observacoes || null })}
      />

      <AcaoMedicaoDialog
        open={acao === "devolver_revisao"} onOpenChange={(o) => !o && close()}
        title="Devolver para revisão"
        motivoObrigatorio variant="destructive"
        confirmLabel="Devolver"
        onConfirm={(v) => exec("devolver_para_revisao", { _motivo: v._motivo })}
      />

      <AcaoMedicaoDialog
        open={acao === "aprovar_cliente"} onOpenChange={(o) => !o && close()}
        title="Marcar como aprovada pelo cliente"
        campos={[{ name: "aprovador", label: "Nome do aprovador (cliente)", placeholder: "Quem aprovou pelo cliente" }]}
        confirmLabel="Confirmar aprovação"
        onConfirm={(v) => exec("aprovar_pelo_cliente", { _aprovador_nome: v.aprovador || null, _observacoes: v._observacoes || null })}
      />

      <AcaoMedicaoDialog
        open={acao === "reprovar_cliente"} onOpenChange={(o) => !o && close()}
        title="Marcar como reprovada pelo cliente"
        motivoObrigatorio variant="destructive"
        confirmLabel="Confirmar reprovação"
        onConfirm={(v) => exec("reprovar_pelo_cliente", { _motivo: v._motivo })}
      />

      <AcaoMedicaoDialog
        open={acao === "marcar_paga"} onOpenChange={(o) => !o && close()}
        title="Marcar como paga"
        campos={[
          { name: "data_pagamento", label: "Data de pagamento", type: "date", required: true },
          { name: "valor_pago", label: "Valor pago (R$)", type: "number" },
        ]}
        confirmLabel="Confirmar pagamento"
        onConfirm={(v) => exec("marcar_como_paga", {
          _data_pagamento: v.data_pagamento,
          _valor_pago: v.valor_pago ? Number(v.valor_pago) : null,
          _observacoes: v._observacoes || null,
        })}
      />
    </>
  );
}
