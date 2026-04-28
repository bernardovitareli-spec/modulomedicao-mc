# Sistema SaaS de Controle de Medições Mensais

Sistema completo para gestão de contratos de locação de equipamentos e prestação de serviços, com motor de regras configurável, importação de planilhas, cálculo automático de medições e fluxo de aprovação em duas etapas.

## Identidade visual

Interface profissional e limpa para o setor de locação, terraplenagem e serviços industriais:
- Tema claro com sidebar escura (azul-petróleo / grafite) e acento laranja-construção
- Tipografia Inter, tabelas densas legíveis, badges de status coloridos
- Layout responsivo (desktop-first, funcional em tablet)
- Cards de KPI no Dashboard, gráficos com Recharts

## Autenticação e perfis

- Login com email/senha + Google (Lovable Cloud)
- Tabela `user_roles` separada com enum `app_role`: `admin`, `gestor_contrato`, `operacional`, `faturamento`, `visualizacao`
- Função `has_role()` SECURITY DEFINER para RLS
- Página `/auth` (login + cadastro) e `/reset-password`

## Estrutura de navegação (sidebar colapsável)

```text
Dashboard
Cadastros
  ├ Clientes
  ├ Equipamentos
  └ Contratos
       ├ Equipamentos vinculados
       ├ Regras do contrato
       └ Alterações contratuais
Operação
  ├ Importação mensal
  ├ Medições mensais
  ├ Memória de cálculo
  ├ Boletim consolidado
  └ Aprovação
Financeiro
  └ Faturamento
Relatórios
Histórico de alterações
```

## Módulos

### 1. Dashboard
KPIs: contratos ativos, medições do mês (rascunho/em revisão/aprovadas/faturadas), valor total faturado, saldo contratual consumido %. Gráficos: faturamento mensal (12 meses), top 5 contratos por valor, equipamentos por status. Alertas: contratos próximos do vencimento, medições pendentes de aprovação.

### 2. Clientes
CRUD: razão social, CNPJ (com máscara/validação), IE, endereço, contatos, observações. Lista com busca, filtro por status, contagem de contratos ativos.

### 3. Contratos
CRUD: cliente, número (Nº DJ), tipo de serviço, centro de custo, vigência (início/fim operação, término contrato), valor global, status. Tabs internas: Dados gerais · Equipamentos · Regras · Alterações · Medições.

### 4. Equipamentos
Cadastro mestre: tipo, modelo, série, tag, ano, status (ativo/manutenção/inativo). Independente de contrato.

### 5. Equipamentos vinculados ao contrato
Vínculo N:N com período (data início/fim no contrato), horímetro inicial de referência e valor/hora específico (override do contrato).

### 6. Regras do contrato (motor de regras)
Cada regra tem `vigencia_inicio`, `vigencia_fim` (nullable) e tipo. Tipos suportados:
- `valor_hora` (R$/h)
- `garantia_minima` (horas/mês, ativável)
- `desconto_horas_mecanicas` (% ou integral)
- `desconto_horas_paradas` (% ou integral)
- `periodo_chuvoso` (% desconto ou abate horas)
- `excecao_chuvoso` (datas/condições que anulam o desconto)
- `complementar` (acréscimo fixo ou variável)
- `desconto` (percentual ou valor fixo)
- `glosa` (manual ou regra)
- `aditivo_contratual` (alteração de escopo/valor)

UI: lista cronológica de regras vigentes + formulário de nova regra (cria nova versão sem apagar a anterior).

### 7. Alterações contratuais
Registro de aditivos/termos: descrição, vigência, impacto (valor, prazo, escopo, regras alteradas), anexo opcional. Gera automaticamente novas versões de regras conforme a vigência.

### 8. Importação mensal de dados
Upload de **XLSX ou CSV** com os 23 campos especificados. Fluxo:
1. Upload → preview com validação linha a linha (CNPJ, contrato existente, equipamento existente, datas coerentes, horímetro final ≥ inicial)
2. Mapeamento automático de colunas (com correção manual)
3. Marcação de erros e avisos
4. Confirmação cria medições rascunho vinculadas ao contrato/equipamento/período

### 9. Medições mensais
Lista de medições por contrato/competência. Filtros: cliente, contrato, status (rascunho · em revisão técnica · aprovada · faturada · contestada), competência. Ações: editar, recalcular, enviar para revisão, aprovar, rejeitar.

### 10. Memória de cálculo por equipamento
Para cada linha de medição mostra o passo a passo:
```text
Horas Informadas (Horímetro Final - Inicial ou informado)
- Horas Mecânicas
- Horas Paradas
- Período Chuvoso (+ Exceções)
= Horas Líquidas
→ Horas a Pagar = max(Horas Líquidas, Garantia Mínima)
× Valor/Hora (regra vigente no período)
= Valor Bruto
+ Complementares
- Descontos
- Glosas
+ Aditivos
= Valor Final
```
Cada linha mostra qual versão da regra foi aplicada (com link para a regra).

### 11. Boletim de medição consolidado
Visão consolidada por contrato/competência: cabeçalho com cliente/contrato/período, tabela de equipamentos com valores, totais por equipamento, total do contrato, saldo contratual restante. Exportação PDF.

### 12. Aprovação da medição (2 etapas)
- **Etapa 1 — Revisão técnica** (perfil operacional/gestor): valida cálculos e horas
- **Etapa 2 — Aprovação gerencial** (gestor_contrato): libera para faturamento
Cada etapa: aprovar, rejeitar com motivo, solicitar ajuste. Trilha completa com usuário, data e comentário.

### 13. Faturamento
Lista de medições aprovadas prontas para faturar. Geração de número de NF (manual), data de emissão, status (pendente/emitida/paga). Exportação para integração contábil (CSV).

### 14. Relatórios
- Faturamento por cliente/contrato/período
- Horas por equipamento
- Descontos aplicados (mecânicas, chuvoso, glosas)
- Saldo contratual e consumo
- Comparativo de competências
Filtros + exportação CSV/PDF.

### 15. Histórico de alterações (audit log)
Registro automático de toda alteração em contratos, regras, medições e aprovações: usuário, ação, antes/depois, timestamp. Filtros por entidade e período.

## Cálculos automáticos

Para cada linha de medição, ao salvar/recalcular:
- Busca regras vigentes no `período_inicio` da medição (motor de versionamento por data)
- Aplica fórmula descrita em "Memória de cálculo"
- Persiste valores calculados + snapshot das regras aplicadas (garante auditoria mesmo se a regra mudar depois)
- Recalcula totais por equipamento, contrato, cliente e atualiza saldo contratual

## Detalhes técnicos

**Stack**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + react-router + react-query + Recharts + react-hook-form + zod + Lovable Cloud (Supabase).

**Tabelas principais**: `clientes`, `contratos`, `equipamentos`, `contrato_equipamentos`, `contrato_regras` (com vigência), `contrato_alteracoes`, `importacoes`, `medicoes` (cabeçalho por contrato/competência), `medicao_itens` (por equipamento, com snapshot de regras), `aprovacoes`, `faturas`, `audit_log`, `user_roles`.

**RLS**: todos os usuários autenticados leem; escrita conforme role via `has_role()`. Audit log via triggers PostgreSQL.

**Importação XLSX**: biblioteca `xlsx` (SheetJS) no client, validação com zod, inserção em lote via Supabase.

**PDF**: `jspdf` + `jspdf-autotable` para boletim e relatórios.

**Versionamento de regras**: ao alterar uma regra, novo registro é criado com `vigencia_inicio` da nova; a anterior recebe `vigencia_fim`. Cálculo busca a regra ativa no período da medição.

## Entrega faseada (recomendado)

Vou implementar a base completa em uma primeira leva (auth, schema, dashboard, clientes, contratos, equipamentos, vínculo, regras com vigência, importação, medições com cálculo, memória de cálculo, boletim, aprovação 2 etapas). Faturamento, relatórios avançados, exportação PDF e histórico de alterações entram em refinamentos seguintes para manter qualidade.
