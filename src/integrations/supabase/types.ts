export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aprovacoes: {
        Row: {
          comentario: string | null
          created_at: string
          etapa: Database["public"]["Enums"]["aprovacao_etapa"]
          id: string
          medicao_id: string
          resultado: Database["public"]["Enums"]["aprovacao_resultado"]
          user_id: string
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          etapa: Database["public"]["Enums"]["aprovacao_etapa"]
          id?: string
          medicao_id: string
          resultado: Database["public"]["Enums"]["aprovacao_resultado"]
          user_id: string
        }
        Update: {
          comentario?: string | null
          created_at?: string
          etapa?: Database["public"]["Enums"]["aprovacao_etapa"]
          id?: string
          medicao_id?: string
          resultado?: Database["public"]["Enums"]["aprovacao_resultado"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aprovacoes_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string
          contexto: Json | null
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          motivo: string | null
          perfil_usuario: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          contexto?: Json | null
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          motivo?: string | null
          perfil_usuario?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          contexto?: Json | null
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          motivo?: string | null
          perfil_usuario?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          cep: string | null
          cidade: string | null
          cnpj: string | null
          codigo_cliente: string | null
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          created_at: string
          created_by: string | null
          endereco: string | null
          id: string
          inscricao_estadual: string | null
          nome_fantasia: string | null
          observacoes: string | null
          razao_social: string
          status: Database["public"]["Enums"]["cliente_status"]
          uf: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          codigo_cliente?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          created_by?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social: string
          status?: Database["public"]["Enums"]["cliente_status"]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          codigo_cliente?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          created_by?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social?: string
          status?: Database["public"]["Enums"]["cliente_status"]
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contrato_alteracoes: {
        Row: {
          contrato_id: string
          created_at: string
          created_by: string | null
          descricao: string
          detalhes: Json | null
          id: string
          impacto_prazo_dias: number | null
          impacto_valor: number | null
          numero_aditivo: string | null
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          contrato_id: string
          created_at?: string
          created_by?: string | null
          descricao: string
          detalhes?: Json | null
          id?: string
          impacto_prazo_dias?: number | null
          impacto_valor?: number | null
          numero_aditivo?: string | null
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string
          detalhes?: Json | null
          id?: string
          impacto_prazo_dias?: number | null
          impacto_valor?: number | null
          numero_aditivo?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_alteracoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_equipamentos: {
        Row: {
          ativo: boolean
          contrato_id: string
          created_at: string
          data_fim: string | null
          data_inicio: string
          equipamento_id: string
          horimetro_inicial: number | null
          id: string
          valor_hora_override: number | null
        }
        Insert: {
          ativo?: boolean
          contrato_id: string
          created_at?: string
          data_fim?: string | null
          data_inicio: string
          equipamento_id: string
          horimetro_inicial?: number | null
          id?: string
          valor_hora_override?: number | null
        }
        Update: {
          ativo?: boolean
          contrato_id?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          equipamento_id?: string
          horimetro_inicial?: number | null
          id?: string
          valor_hora_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_equipamentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_equipamentos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_regras: {
        Row: {
          ativa: boolean
          contrato_id: string
          created_at: string
          created_by: string | null
          equipamento_id: string | null
          id: string
          observacoes: string | null
          parametros: Json
          tipo: Database["public"]["Enums"]["regra_tipo"]
          tipo_equipamento: string | null
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          ativa?: boolean
          contrato_id: string
          created_at?: string
          created_by?: string | null
          equipamento_id?: string | null
          id?: string
          observacoes?: string | null
          parametros?: Json
          tipo: Database["public"]["Enums"]["regra_tipo"]
          tipo_equipamento?: string | null
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          ativa?: boolean
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          equipamento_id?: string | null
          id?: string
          observacoes?: string | null
          parametros?: Json
          tipo?: Database["public"]["Enums"]["regra_tipo"]
          tipo_equipamento?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_regras_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_regras_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          base_dias_garantia: number
          centro_custo: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          fornecedor_cnpj: string | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          garantia_minima_horas: number | null
          id: string
          inicio_operacao: string
          numero_dj: string
          observacoes: string | null
          status: Database["public"]["Enums"]["contrato_status"]
          termino_contrato: string
          tipo_servico: string
          updated_at: string
          valor_global: number | null
          valor_hora_padrao: number | null
        }
        Insert: {
          base_dias_garantia?: number
          centro_custo?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          garantia_minima_horas?: number | null
          id?: string
          inicio_operacao: string
          numero_dj: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["contrato_status"]
          termino_contrato: string
          tipo_servico: string
          updated_at?: string
          valor_global?: number | null
          valor_hora_padrao?: number | null
        }
        Update: {
          base_dias_garantia?: number
          centro_custo?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          garantia_minima_horas?: number | null
          id?: string
          inicio_operacao?: string
          numero_dj?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["contrato_status"]
          termino_contrato?: string
          tipo_servico?: string
          updated_at?: string
          valor_global?: number | null
          valor_hora_padrao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_emissora: {
        Row: {
          agencia: string | null
          ativa: boolean
          bairro: string | null
          banco: string | null
          cep: string | null
          chave_pix: string | null
          cnpj: string
          complemento: string | null
          conta_corrente: string | null
          created_at: string
          created_by: string | null
          email: string | null
          endereco: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          logo_storage_path: string | null
          municipio: string | null
          nome_fantasia: string | null
          numero: string | null
          padrao: boolean
          razao_social: string
          telefone: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativa?: boolean
          bairro?: string | null
          banco?: string | null
          cep?: string | null
          chave_pix?: string | null
          cnpj: string
          complemento?: string | null
          conta_corrente?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logo_storage_path?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          padrao?: boolean
          razao_social: string
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativa?: boolean
          bairro?: string | null
          banco?: string | null
          cep?: string | null
          chave_pix?: string | null
          cnpj?: string
          complemento?: string | null
          conta_corrente?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logo_storage_path?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          padrao?: boolean
          razao_social?: string
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      equipamentos: {
        Row: {
          ano: number | null
          created_at: string
          id: string
          modelo: string
          observacoes: string | null
          serie: string | null
          status: Database["public"]["Enums"]["equipamento_status"]
          tag: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ano?: number | null
          created_at?: string
          id?: string
          modelo: string
          observacoes?: string | null
          serie?: string | null
          status?: Database["public"]["Enums"]["equipamento_status"]
          tag: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ano?: number | null
          created_at?: string
          id?: string
          modelo?: string
          observacoes?: string | null
          serie?: string | null
          status?: Database["public"]["Enums"]["equipamento_status"]
          tag?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      faturamento_historico: {
        Row: {
          acao: string
          campo: string | null
          contexto: Json | null
          created_at: string
          fatura_id: string
          id: string
          medicao_id: string | null
          motivo: string | null
          perfil_usuario: string | null
          user_email: string | null
          user_id: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acao: string
          campo?: string | null
          contexto?: Json | null
          created_at?: string
          fatura_id: string
          id?: string
          medicao_id?: string | null
          motivo?: string | null
          perfil_usuario?: string | null
          user_email?: string | null
          user_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acao?: string
          campo?: string | null
          contexto?: Json | null
          created_at?: string
          fatura_id?: string
          id?: string
          medicao_id?: string | null
          motivo?: string | null
          perfil_usuario?: string | null
          user_email?: string | null
          user_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      faturas: {
        Row: {
          anexo_nf_nome: string | null
          anexo_nf_storage_path: string | null
          anexo_nota_nome: string | null
          anexo_nota_storage_path: string | null
          chave_verificacao: string | null
          codigo_item: string | null
          created_at: string
          created_by: string | null
          dados_bancarios: string | null
          data_emissao: string | null
          data_pagamento: string | null
          data_prevista_recebimento: string | null
          data_vencimento: string | null
          descricao_item: string | null
          empresa_emissora_id: string | null
          erro_emissao: string | null
          id: string
          local_servico: string | null
          medicao_id: string
          motivo_diferenca: string | null
          motivo_valor_diferente: string | null
          natureza_operacao: string | null
          nota_emitida_em: string | null
          nota_emitida_por: string | null
          numero_bm: string | null
          numero_contrato_cliente: string | null
          numero_frs: string | null
          numero_nf: string | null
          numero_pedido_item: string | null
          numero_rf: string | null
          observacoes: string | null
          observacoes_financeiras: string | null
          observacoes_fiscais: string | null
          observacoes_nota: string | null
          protocolo_emissao: string | null
          provedor_fiscal: string | null
          quantidade: number | null
          serie_nf: string | null
          status: Database["public"]["Enums"]["faturamento_status"]
          status_emissao_fiscal: string | null
          updated_at: string
          valor: number
          valor_bruto: number | null
          valor_liquido: number | null
          valor_recebido: number | null
          valor_unitario: number | null
          xml_nota: string | null
        }
        Insert: {
          anexo_nf_nome?: string | null
          anexo_nf_storage_path?: string | null
          anexo_nota_nome?: string | null
          anexo_nota_storage_path?: string | null
          chave_verificacao?: string | null
          codigo_item?: string | null
          created_at?: string
          created_by?: string | null
          dados_bancarios?: string | null
          data_emissao?: string | null
          data_pagamento?: string | null
          data_prevista_recebimento?: string | null
          data_vencimento?: string | null
          descricao_item?: string | null
          empresa_emissora_id?: string | null
          erro_emissao?: string | null
          id?: string
          local_servico?: string | null
          medicao_id: string
          motivo_diferenca?: string | null
          motivo_valor_diferente?: string | null
          natureza_operacao?: string | null
          nota_emitida_em?: string | null
          nota_emitida_por?: string | null
          numero_bm?: string | null
          numero_contrato_cliente?: string | null
          numero_frs?: string | null
          numero_nf?: string | null
          numero_pedido_item?: string | null
          numero_rf?: string | null
          observacoes?: string | null
          observacoes_financeiras?: string | null
          observacoes_fiscais?: string | null
          observacoes_nota?: string | null
          protocolo_emissao?: string | null
          provedor_fiscal?: string | null
          quantidade?: number | null
          serie_nf?: string | null
          status?: Database["public"]["Enums"]["faturamento_status"]
          status_emissao_fiscal?: string | null
          updated_at?: string
          valor: number
          valor_bruto?: number | null
          valor_liquido?: number | null
          valor_recebido?: number | null
          valor_unitario?: number | null
          xml_nota?: string | null
        }
        Update: {
          anexo_nf_nome?: string | null
          anexo_nf_storage_path?: string | null
          anexo_nota_nome?: string | null
          anexo_nota_storage_path?: string | null
          chave_verificacao?: string | null
          codigo_item?: string | null
          created_at?: string
          created_by?: string | null
          dados_bancarios?: string | null
          data_emissao?: string | null
          data_pagamento?: string | null
          data_prevista_recebimento?: string | null
          data_vencimento?: string | null
          descricao_item?: string | null
          empresa_emissora_id?: string | null
          erro_emissao?: string | null
          id?: string
          local_servico?: string | null
          medicao_id?: string
          motivo_diferenca?: string | null
          motivo_valor_diferente?: string | null
          natureza_operacao?: string | null
          nota_emitida_em?: string | null
          nota_emitida_por?: string | null
          numero_bm?: string | null
          numero_contrato_cliente?: string | null
          numero_frs?: string | null
          numero_nf?: string | null
          numero_pedido_item?: string | null
          numero_rf?: string | null
          observacoes?: string | null
          observacoes_financeiras?: string | null
          observacoes_fiscais?: string | null
          observacoes_nota?: string | null
          protocolo_emissao?: string | null
          provedor_fiscal?: string | null
          quantidade?: number | null
          serie_nf?: string | null
          status?: Database["public"]["Enums"]["faturamento_status"]
          status_emissao_fiscal?: string | null
          updated_at?: string
          valor?: number
          valor_bruto?: number | null
          valor_liquido?: number | null
          valor_recebido?: number | null
          valor_unitario?: number | null
          xml_nota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faturas_empresa_emissora_id_fkey"
            columns: ["empresa_emissora_id"]
            isOneToOne: false
            referencedRelation: "empresa_emissora"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: true
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes: {
        Row: {
          arquivo_nome: string
          competencia: string
          created_at: string
          created_by: string | null
          id: string
          linhas_erro: number
          linhas_validas: number
          resumo: Json | null
          total_linhas: number
        }
        Insert: {
          arquivo_nome: string
          competencia: string
          created_at?: string
          created_by?: string | null
          id?: string
          linhas_erro?: number
          linhas_validas?: number
          resumo?: Json | null
          total_linhas?: number
        }
        Update: {
          arquivo_nome?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          id?: string
          linhas_erro?: number
          linhas_validas?: number
          resumo?: Json | null
          total_linhas?: number
        }
        Relationships: []
      }
      medicao_anexos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          medicao_id: string
          mime_type: string | null
          nome_arquivo: string
          observacoes: string | null
          storage_path: string
          tamanho_bytes: number | null
          tipo: string
          user_email: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          medicao_id: string
          mime_type?: string | null
          nome_arquivo: string
          observacoes?: string | null
          storage_path: string
          tamanho_bytes?: number | null
          tipo: string
          user_email?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          medicao_id?: string
          mime_type?: string | null
          nome_arquivo?: string
          observacoes?: string | null
          storage_path?: string
          tamanho_bytes?: number | null
          tipo?: string
          user_email?: string | null
        }
        Relationships: []
      }
      medicao_item_alteracoes: {
        Row: {
          acao: string
          campo: string | null
          cliente_id: string | null
          cliente_nome: string | null
          competencia: string | null
          contrato_id: string | null
          contrato_numero: string | null
          created_at: string
          equipamento_id: string | null
          equipamento_serie: string | null
          equipamento_tag: string | null
          id: string
          medicao_id: string
          medicao_item_id: string | null
          motivo: string
          perfil_usuario: string | null
          user_email: string | null
          user_id: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acao?: string
          campo?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          competencia?: string | null
          contrato_id?: string | null
          contrato_numero?: string | null
          created_at?: string
          equipamento_id?: string | null
          equipamento_serie?: string | null
          equipamento_tag?: string | null
          id?: string
          medicao_id: string
          medicao_item_id?: string | null
          motivo: string
          perfil_usuario?: string | null
          user_email?: string | null
          user_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acao?: string
          campo?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          competencia?: string | null
          contrato_id?: string | null
          contrato_numero?: string | null
          created_at?: string
          equipamento_id?: string | null
          equipamento_serie?: string | null
          equipamento_tag?: string | null
          id?: string
          medicao_id?: string
          medicao_item_id?: string | null
          motivo?: string
          perfil_usuario?: string | null
          user_email?: string | null
          user_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      medicao_itens: {
        Row: {
          aplicar_garantia_proporcional: boolean
          contrato_equipamento_id: string | null
          created_at: string
          data_fim_operacao_item: string | null
          data_inicio_operacao_item: string | null
          dias_considerados: number | null
          equipamento_id: string
          garantia_mensal_horas: number | null
          garantia_minima: number
          garantia_proporcional_horas: number | null
          horas_a_pagar: number
          horas_chuvoso: number
          horas_descontaveis: number
          horas_excecao_chuvoso: number
          horas_informadas: number
          horas_liquidas: number
          horas_mecanicas: number
          horas_paradas: number
          horimetro_final: number | null
          horimetro_inicial: number | null
          id: string
          medicao_id: string
          memoria_calculo: Json | null
          motivo_proporcionalidade: string | null
          observacoes: string | null
          periodo_fim: string
          periodo_inicio: string
          regras_aplicadas: Json | null
          updated_at: string
          valor_aditivos: number
          valor_bruto: number
          valor_complementares: number
          valor_descontos: number
          valor_final: number
          valor_glosas: number
          valor_hora: number
        }
        Insert: {
          aplicar_garantia_proporcional?: boolean
          contrato_equipamento_id?: string | null
          created_at?: string
          data_fim_operacao_item?: string | null
          data_inicio_operacao_item?: string | null
          dias_considerados?: number | null
          equipamento_id: string
          garantia_mensal_horas?: number | null
          garantia_minima?: number
          garantia_proporcional_horas?: number | null
          horas_a_pagar?: number
          horas_chuvoso?: number
          horas_descontaveis?: number
          horas_excecao_chuvoso?: number
          horas_informadas?: number
          horas_liquidas?: number
          horas_mecanicas?: number
          horas_paradas?: number
          horimetro_final?: number | null
          horimetro_inicial?: number | null
          id?: string
          medicao_id: string
          memoria_calculo?: Json | null
          motivo_proporcionalidade?: string | null
          observacoes?: string | null
          periodo_fim: string
          periodo_inicio: string
          regras_aplicadas?: Json | null
          updated_at?: string
          valor_aditivos?: number
          valor_bruto?: number
          valor_complementares?: number
          valor_descontos?: number
          valor_final?: number
          valor_glosas?: number
          valor_hora?: number
        }
        Update: {
          aplicar_garantia_proporcional?: boolean
          contrato_equipamento_id?: string | null
          created_at?: string
          data_fim_operacao_item?: string | null
          data_inicio_operacao_item?: string | null
          dias_considerados?: number | null
          equipamento_id?: string
          garantia_mensal_horas?: number | null
          garantia_minima?: number
          garantia_proporcional_horas?: number | null
          horas_a_pagar?: number
          horas_chuvoso?: number
          horas_descontaveis?: number
          horas_excecao_chuvoso?: number
          horas_informadas?: number
          horas_liquidas?: number
          horas_mecanicas?: number
          horas_paradas?: number
          horimetro_final?: number | null
          horimetro_inicial?: number | null
          id?: string
          medicao_id?: string
          memoria_calculo?: Json | null
          motivo_proporcionalidade?: string | null
          observacoes?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          regras_aplicadas?: Json | null
          updated_at?: string
          valor_aditivos?: number
          valor_bruto?: number
          valor_complementares?: number
          valor_descontos?: number
          valor_final?: number
          valor_glosas?: number
          valor_hora?: number
        }
        Relationships: [
          {
            foreignKeyName: "medicao_itens_contrato_equipamento_id_fkey"
            columns: ["contrato_equipamento_id"]
            isOneToOne: false
            referencedRelation: "contrato_equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicao_itens_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicao_itens_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      medicao_status_historico: {
        Row: {
          contexto: Json | null
          created_at: string
          id: string
          medicao_id: string
          motivo: string | null
          observacoes: string | null
          perfil_usuario: string | null
          status_anterior: Database["public"]["Enums"]["medicao_status"] | null
          status_novo: Database["public"]["Enums"]["medicao_status"]
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          contexto?: Json | null
          created_at?: string
          id?: string
          medicao_id: string
          motivo?: string | null
          observacoes?: string | null
          perfil_usuario?: string | null
          status_anterior?: Database["public"]["Enums"]["medicao_status"] | null
          status_novo: Database["public"]["Enums"]["medicao_status"]
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          contexto?: Json | null
          created_at?: string
          id?: string
          medicao_id?: string
          motivo?: string | null
          observacoes?: string | null
          perfil_usuario?: string | null
          status_anterior?: Database["public"]["Enums"]["medicao_status"] | null
          status_novo?: Database["public"]["Enums"]["medicao_status"]
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      medicoes: {
        Row: {
          aprovada_cliente_em: string | null
          aprovada_cliente_por: string | null
          aprovador_cliente_nome: string | null
          competencia: string
          contrato_id: string
          created_at: string
          created_by: string | null
          enviada_cliente_em: string | null
          enviada_cliente_por: string | null
          id: string
          importacao_id: string | null
          observacoes: string | null
          periodo_fim: string
          periodo_inicio: string
          status: Database["public"]["Enums"]["medicao_status"]
          total_horas_informadas: number
          total_horas_liquidas: number
          total_horas_pagar: number
          updated_at: string
          valor_aditivos: number
          valor_bruto: number
          valor_complementares: number
          valor_descontos: number
          valor_final: number
          valor_glosas: number
        }
        Insert: {
          aprovada_cliente_em?: string | null
          aprovada_cliente_por?: string | null
          aprovador_cliente_nome?: string | null
          competencia: string
          contrato_id: string
          created_at?: string
          created_by?: string | null
          enviada_cliente_em?: string | null
          enviada_cliente_por?: string | null
          id?: string
          importacao_id?: string | null
          observacoes?: string | null
          periodo_fim: string
          periodo_inicio: string
          status?: Database["public"]["Enums"]["medicao_status"]
          total_horas_informadas?: number
          total_horas_liquidas?: number
          total_horas_pagar?: number
          updated_at?: string
          valor_aditivos?: number
          valor_bruto?: number
          valor_complementares?: number
          valor_descontos?: number
          valor_final?: number
          valor_glosas?: number
        }
        Update: {
          aprovada_cliente_em?: string | null
          aprovada_cliente_por?: string | null
          aprovador_cliente_nome?: string | null
          competencia?: string
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          enviada_cliente_em?: string | null
          enviada_cliente_por?: string | null
          id?: string
          importacao_id?: string | null
          observacoes?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          status?: Database["public"]["Enums"]["medicao_status"]
          total_horas_informadas?: number
          total_horas_liquidas?: number
          total_horas_pagar?: number
          updated_at?: string
          valor_aditivos?: number
          valor_bruto?: number
          valor_complementares?: number
          valor_descontos?: number
          valor_final?: number
          valor_glosas?: number
        }
        Relationships: [
          {
            foreignKeyName: "medicoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicoes_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _calc_item_com_regras: { Args: { _item_id: string }; Returns: Json }
      _calc_proporcionalidade_item: {
        Args: {
          _base_dias: number
          _data_fim_op: string
          _data_inicio_op: string
          _garantia_mensal: number
          _periodo_fim: string
          _periodo_inicio: string
        }
        Returns: Json
      }
      _calc_status_faturamento: {
        Args: { _f: Database["public"]["Tables"]["faturas"]["Row"] }
        Returns: Database["public"]["Enums"]["faturamento_status"]
      }
      _exigir_papel: {
        Args: { _papeis: Database["public"]["Enums"]["app_role"][] }
        Returns: undefined
      }
      _log_fatura_change: {
        Args: {
          _acao: string
          _antes: string
          _campo: string
          _ctx?: Json
          _depois: string
          _fatura_id: string
          _medicao_id: string
          _motivo: string
        }
        Returns: undefined
      }
      _log_item_change: {
        Args: {
          _antes: string
          _campo: string
          _cliente: Record<string, unknown>
          _contrato: Record<string, unknown>
          _depois: string
          _email: string
          _eq: Record<string, unknown>
          _item_id: string
          _med: Record<string, unknown>
          _motivo: string
          _old: Record<string, unknown>
          _role: string
          _uid: string
        }
        Returns: undefined
      }
      _norm_tipo_eq: { Args: { _t: string }; Returns: string }
      _recalc_medicao_totais: {
        Args: { _medicao_id: string }
        Returns: undefined
      }
      _registrar_status_medicao: {
        Args: {
          _contexto?: Json
          _medicao_id: string
          _motivo?: string
          _observacoes?: string
          _status_anterior: Database["public"]["Enums"]["medicao_status"]
          _status_novo: Database["public"]["Enums"]["medicao_status"]
        }
        Returns: undefined
      }
      _regra_vigente: {
        Args: {
          _contrato_id: string
          _equipamento_id: string
          _periodo_fim: string
          _periodo_inicio: string
          _tipo: Database["public"]["Enums"]["regra_tipo"]
          _tipo_equipamento: string
        }
        Returns: Json
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      aplicar_regras_medicao: {
        Args: { _medicao_id: string; _motivo: string }
        Returns: Json
      }
      aprovar_internamente: {
        Args: { _medicao_id: string; _observacoes?: string }
        Returns: undefined
      }
      aprovar_pelo_cliente: {
        Args: {
          _aprovador_nome?: string
          _medicao_id: string
          _observacoes?: string
        }
        Returns: undefined
      }
      atualizar_faturamento: {
        Args: {
          _anexo_nf_nome: string
          _anexo_nf_storage_path: string
          _data_emissao: string
          _data_prevista_recebimento: string
          _data_vencimento: string
          _fatura_id: string
          _motivo: string
          _numero_nf: string
          _observacoes_financeiras: string
          _observacoes_fiscais: string
          _serie_nf: string
          _valor_bruto: number
          _valor_liquido: number
        }
        Returns: undefined
      }
      atualizar_status_atraso: { Args: never; Returns: number }
      cancel_medicao: {
        Args: { _medicao_id: string; _motivo: string }
        Returns: undefined
      }
      cancelar_faturamento: {
        Args: { _fatura_id: string; _motivo: string }
        Returns: undefined
      }
      criar_faturamento: { Args: { _medicao_id: string }; Returns: string }
      delete_medicao_safe: {
        Args: { _medicao_id: string; _motivo: string }
        Returns: Json
      }
      devolver_para_rascunho: {
        Args: { _medicao_id: string; _motivo: string }
        Returns: undefined
      }
      devolver_para_revisao: {
        Args: { _medicao_id: string; _motivo: string }
        Returns: undefined
      }
      enviar_ao_cliente: {
        Args: { _medicao_id: string; _observacoes?: string }
        Returns: undefined
      }
      enviar_para_revisao: {
        Args: { _medicao_id: string; _observacoes?: string }
        Returns: undefined
      }
      faturar_medicao: {
        Args: {
          _data_emissao: string
          _data_vencimento: string
          _medicao_id: string
          _numero_nf: string
          _observacoes?: string
          _valor: number
        }
        Returns: undefined
      }
      get_primary_role: { Args: { _uid: string }; Returns: string }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      marcar_como_paga: {
        Args: {
          _data_pagamento: string
          _medicao_id: string
          _observacoes?: string
          _valor_pago?: number
        }
        Returns: undefined
      }
      purge_importacao_teste: {
        Args: { _importacao_id: string; _motivo: string }
        Returns: Json
      }
      recalcular_medicao: {
        Args: { _medicao_id: string; _motivo: string }
        Returns: Json
      }
      registrar_pagamento_faturamento: {
        Args: {
          _data_pagamento: string
          _fatura_id: string
          _motivo: string
          _motivo_diferenca: string
          _valor_recebido: number
        }
        Returns: undefined
      }
      reprovar_pelo_cliente: {
        Args: { _medicao_id: string; _motivo: string }
        Returns: undefined
      }
      simular_regras_medicao: { Args: { _medicao_id: string }; Returns: Json }
      update_medicao_item:
        | {
            Args: {
              _horas_chuvoso: number
              _horas_excecao_chuvoso: number
              _horas_informadas: number
              _horas_mecanicas: number
              _horimetro_final: number
              _horimetro_inicial: number
              _item_id: string
              _motivo: string
              _observacoes: string
              _valor_complementares: number
              _valor_descontos: number
            }
            Returns: Json
          }
        | {
            Args: {
              _data_fim_operacao_item?: string
              _data_inicio_operacao_item?: string
              _horas_chuvoso: number
              _horas_excecao_chuvoso: number
              _horas_informadas: number
              _horas_mecanicas: number
              _horimetro_final: number
              _horimetro_inicial: number
              _item_id: string
              _motivo: string
              _motivo_proporcionalidade?: string
              _observacoes: string
              _valor_complementares: number
              _valor_descontos: number
            }
            Returns: Json
          }
    }
    Enums: {
      app_role:
        | "admin"
        | "gestor_contrato"
        | "operacional"
        | "faturamento"
        | "visualizacao"
      aprovacao_etapa: "revisao_tecnica" | "aprovacao_gerencial"
      aprovacao_resultado: "aprovado" | "rejeitado" | "ajuste_solicitado"
      cliente_status: "ativo" | "inativo"
      contrato_status: "rascunho" | "ativo" | "suspenso" | "encerrado"
      equipamento_status: "ativo" | "manutencao" | "inativo"
      faturamento_status:
        | "a_faturar"
        | "nf_emitida"
        | "aguardando_pagamento"
        | "pago"
        | "pago_parcial"
        | "em_atraso"
        | "cancelado"
      medicao_status:
        | "rascunho"
        | "em_revisao_interna"
        | "aprovada_internamente"
        | "enviada_cliente"
        | "aprovada_cliente"
        | "reprovada_cliente"
        | "faturada"
        | "paga"
        | "cancelada"
      regra_tipo:
        | "valor_hora"
        | "garantia_minima"
        | "desconto_horas_mecanicas"
        | "desconto_horas_paradas"
        | "periodo_chuvoso"
        | "excecao_chuvoso"
        | "complementar"
        | "desconto"
        | "glosa"
        | "aditivo_contratual"
        | "desconto_manual"
        | "regra_personalizada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "gestor_contrato",
        "operacional",
        "faturamento",
        "visualizacao",
      ],
      aprovacao_etapa: ["revisao_tecnica", "aprovacao_gerencial"],
      aprovacao_resultado: ["aprovado", "rejeitado", "ajuste_solicitado"],
      cliente_status: ["ativo", "inativo"],
      contrato_status: ["rascunho", "ativo", "suspenso", "encerrado"],
      equipamento_status: ["ativo", "manutencao", "inativo"],
      faturamento_status: [
        "a_faturar",
        "nf_emitida",
        "aguardando_pagamento",
        "pago",
        "pago_parcial",
        "em_atraso",
        "cancelado",
      ],
      medicao_status: [
        "rascunho",
        "em_revisao_interna",
        "aprovada_internamente",
        "enviada_cliente",
        "aprovada_cliente",
        "reprovada_cliente",
        "faturada",
        "paga",
        "cancelada",
      ],
      regra_tipo: [
        "valor_hora",
        "garantia_minima",
        "desconto_horas_mecanicas",
        "desconto_horas_paradas",
        "periodo_chuvoso",
        "excecao_chuvoso",
        "complementar",
        "desconto",
        "glosa",
        "aditivo_contratual",
        "desconto_manual",
        "regra_personalizada",
      ],
    },
  },
} as const
