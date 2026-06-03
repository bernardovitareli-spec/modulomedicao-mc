# Plano: Validação centralizada com Zod + RHF

Refatoração ampla de validação. Estimo ~40 arquivos novos + ~12 formulários migrados + 1 migração SQL.

## Fase 1 — Helpers brasileiros (`src/lib/br/`)
Funções puras, sem dependências externas:
- `cnpj.ts`, `cpf.ts`, `cep.ts`, `telefone.ts`, `moeda.ts`, `data.ts`
- Cada um exporta `validarX`, `formatarX`, `normalizarX` (ou `parseX`).

## Fase 2 — Schemas zod (`src/lib/schemas/`)
Um arquivo por entidade, com `z.infer` tipado e mensagens em PT-BR:
- `cliente.ts`, `equipamento.ts`, `contrato.ts`, `contratoEquipamento.ts`,
  `regra.ts` (discriminated union por tipo), `alteracao.ts`,
  `empresaEmissora.ts`, `fatura.ts`, `medicaoItem.ts`,
  `importacaoLinha.ts` (discriminated union M1/M3/M4).
- `index.ts` reexporta todos.

## Fase 3 — Inputs mascarados (`src/components/inputs/`)
Wrappers do shadcn `Input` integrados ao `Controller` do RHF:
- `CnpjInput`, `CepInput`, `TelefoneInput`, `MoedaInput`, `HorasInput`, `DataInput`.
- `FormSubmitButton` usa `useFormState()`.

## Fase 4 — Migração de formulários
Substituir `useState` cru por `useForm({ resolver: zodResolver })`:
- `Clientes.tsx`, `Equipamentos.tsx`
- `Contratos.tsx`, `ContratoDetalhe.tsx`
- `ContratoEquipamentosTab.tsx`, `ContratoRegrasTab.tsx`, `ContratoAlteracoesTab.tsx`
- `EmpresaEmissora.tsx`
- `MedicaoItensEditor.tsx` (edição manual)
- `NovaMedicao.tsx`, `GerarNotaLocacao.tsx`, `FaturamentoDetalhe.tsx`
- `ImportarMedicao.tsx`: usar `importacaoLinhaSchema.safeParse` por linha; coluna "Erros" mostra mensagens do zod; linhas inválidas não-selecionáveis.

## Fase 5 — SQL (migração `validacoes_de_dominio`)
- `medicao_itens`: CHECK horímetro/valor (NOT VALID).
- `contratos`: CHECK datas/valor.
- `contrato_equipamentos`, `contrato_regras`: CHECK vigências.
- `faturas`: CHECK valor/datas.
- Trigger em `clientes` validando 14 dígitos no CNPJ.
- Função `public.traduzir_erro_constraint(text)` mapeando nomes de constraint → PT-BR. Espelho client-side em `src/lib/sqlErrors.ts` para uso em `onError` das mutations.

## Detalhes técnicos
- **Não alterar**: RLS, fluxo de status, motor de cálculo, autenticação, react-query.
- **Reuso**: parsers M3/M4 passam a delegar ao schema da linha; sem duplicar regras.
- **Acessibilidade**: `FormMessage` com `aria-live="polite"`; inputs com `inputmode`.
- **Tipagem**: zero `any` nos resolvers; `z.infer` em cada schema.

## Ordem de execução
1. Helpers BR + schemas + inputs (paralelo, independente).
2. Migração SQL (precisa de aprovação do usuário; disparada cedo).
3. Migrar formulários em lote (depende de 1).
4. `ImportarMedicao` por último (depende dos schemas).

## Riscos
- Migração SQL pode falhar se houver dados legados violando regras → uso de `NOT VALID` em todos os CHECKs em tabelas com histórico.
- Trigger de CNPJ pode bloquear inserts; aplicar só para `INSERT OR UPDATE OF cnpj`.