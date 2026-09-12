# ThermoTech ERP (`erpblel`)

ERP web para assistência técnica: orçamento, ordem de serviço, estoque,
financeiro, fiscal e relatórios. SPA em React + Vite falando direto com o
Postgres do Supabase via PostgREST — não há backend próprio, então **a segurança
e as regras de negócio moram no banco** (RLS + funções), e o front apenas reflete
o que o usuário pode fazer.

## Stack

- React 19 + TypeScript + Vite
- React Router 7, TanStack Query 5, react-hook-form + zod
- Tailwind 4 + shadcn/base-ui
- Supabase: Postgres, Auth, Storage, Edge Functions (Deno) e pg_cron

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha com a URL e a chave publishable do projeto
npm run dev
```

| Variável | Onde achar |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | idem (chave publishable/anon) |

Scripts: `npm run dev`, `npm run build`, `npm test`, `npm run lint`, `npm run preview`.

## Fluxo do negócio

```
Cliente + equipamento
        ↓
   OS aberta ──► orçamento ──► aprovado ──► em andamento ──► concluída
                    │                                            │
                    └──► reprovado (pode reorçar)                │
                                                                 ├─ baixa as peças do estoque
                                                                 ├─ gera a conta a receber
                                                                 ├─ carimba o prazo de garantia
                                                                 └─ libera NFC-e e a via impressa
```

Cancelar uma OS concluída **estorna** as peças e cancela o título (se ninguém
pagou). Retorno dentro do prazo abre sub-OS de garantia herdando cliente,
equipamento e técnico.

## Banco de dados

Schema versionado em `supabase/migrations/`:

| Arquivo | Conteúdo |
| --- | --- |
| `20260909000000_baseline.sql` | schema inicial completo (tabelas, triggers, RLS) |
| `20260911120000_hardening_funcoes.sql` | funções de segurança, estoque e baixa de peças da OS |
| `20260911121000_rls_granular.sql` | RLS por permissão, módulo a módulo |
| `20260911122000_rpcs_transacionais.sql` | `registrar_entrada_nfe`, `concluir_os`, `resumo_dashboard` |
| `20260911123000_seed_permissoes.sql` | vínculos de permissão que faltavam |
| `20260911124000_troca_senha_obrigatoria.sql` | flag de troca de senha no primeiro acesso |
| `20260912000000_os_orcamento_agenda_garantia.sql` | status de orçamento, prioridade, previsão, garantia, equipamentos |
| `20260912001000_financeiro_baixa_parcial_caixa.sql` | baixa parcial, caixa e job diário de títulos vencidos |
| `20260912002000_estoque_custo_medio_e_de_para.sql` | custo médio ponderado, CMV e de-para do fornecedor |
| `20260912003000_os_rpcs_orcamento_garantia_estorno.sql` | RPCs do ciclo da OS e estorno do cancelamento |
| `20260912004000_auditoria.sql` | trilha de auditoria |
| `20260912005000_relatorios_e_estoque_disponivel.sql` | relatórios gerenciais e saldo disponível |
| `20260912006000_fiscal_nfce.sql` | dados do emitente e emissão de NFC-e |
| `20260912007000_rpcs_agregacoes_front.sql` | agregações que estavam sendo feitas no navegador |

Para aplicar num projeto novo: `supabase db push`. No projeto que já estava no
ar, essas versões foram registradas como aplicadas no histórico do Supabase, e
o `baseline` reproduz o schema que já existia lá — então `db push` não tenta
recriar nada. Depois de mudar o schema, regere os tipos:

```bash
supabase gen types typescript --project-id SEU_PROJECT_ID > src/types/database.ts
```

### Permissões

Papéis (`roles`) recebem permissões (`permissions`) via `role_permissions`, e
cada usuário pode ter exceções individuais em `user_permissions`. A função
`user_has_permission(chave)` é a fonte da verdade — usada nas policies de RLS,
nas Edge Functions e no front (`useAuth().hasPermission`). Usuário com
`profiles.ativo = false` não tem permissão nenhuma e é deslogado ao entrar.

Chaves: `administrativo.clientes.gerenciar`,
`administrativo.fornecedores.gerenciar`, `administrativo.usuarios.gerenciar`,
`estoque.entradas.processar`, `estoque.produtos.gerenciar`,
`financeiro.gerenciar`, `fiscal.gerenciar`, `os.criar`, `os.editar`,
`os.excluir`, `os.servicos.gerenciar`, `relatorios.ver`.

### Regras que o banco garante

- `produtos.estoque_atual` é derivado de `movimentacoes_estoque`; escrita direta
  é recusada. Ajuste manual só por `ajustar_estoque()`.
- `produtos.preco_custo` é **custo médio ponderado**, recalculado a cada entrada;
  toda saída grava o custo do momento, o que torna CMV e margem calculáveis.
- Saída não pode deixar saldo negativo.
- Concluir OS baixa peças, gera conta a receber, grava anexos e carimba a
  garantia numa transação só (`concluir_os`).
- Entrada de NF-e é uma transação só (`registrar_entrada_nfe`) e **aprende** o
  código do produto no catálogo do fornecedor (`fornecedor_produto_codigos`),
  para a próxima nota casar sozinha mesmo sem GTIN.
- Orçamento só vira serviço executado depois de aprovado, com registro de quem
  aprovou e quando.
- Baixa de título aceita valor parcial, juros e desconto, e lança no caixa.
- Ninguém altera o próprio papel nem o próprio status de ativo.
- Toda alteração de tabela sensível vai para `auditoria`.

### Rotinas agendadas (pg_cron)

| Job | Quando | O que faz |
| --- | --- | --- |
| `marcar-titulos-atrasados` | 03:05 diariamente | move títulos vencidos para `atrasado` e devolve para `pendente` os prorrogados |

## Edge Functions

| Função | O que faz | Exige |
| --- | --- | --- |
| `admin-users` | criar/resetar senha/excluir usuário no Auth | `administrativo.usuarios.gerenciar` |
| `parse-danfe` | lê um PDF de DANFE com a API da Anthropic | `estoque.entradas.processar` |
| `focus-nfe-consulta` | consulta NF-e recebida na Focus NFE | `estoque.entradas.processar` |
| `focus-nfe-emitir` | emite/consulta a NFC-e da OS na Focus NFE | `fiscal.gerenciar` |

Deploy: `supabase functions deploy <nome>`.

Secrets (Project Settings → Edge Functions → Secrets):

- `ANTHROPIC_API_KEY` — leitura de DANFE em PDF
- `FOCUS_NFE_TOKEN` e `FOCUS_NFE_AMBIENTE` (`homologacao` | `producao`)
- `ALLOWED_ORIGINS` (opcional) — origens que podem chamar as funções pelo
  navegador; sem ela o CORS fica aberto.

> A emissão de NFC-e depende de token da Focus NFE, certificado e credenciamento
> da empresa na SEFAZ. O código está completo (payload montado no banco, envio,
> consulta e gravação do retorno), mas **não foi exercitado contra a SEFAZ**
> neste projeto — teste primeiro em homologação.

## Convenções do front

| Precisa de | Use |
| --- | --- |
| Listagem | `<DataTable>` — vira cartão abaixo de `md`, tabela acima |
| Busca/filtro/página | `useFiltrosUrl` + `useBuscaUrl` (estado vai para a querystring) |
| Valor em dinheiro | `<CampoMoeda>` (formato pt-BR, entrega `number`) |
| CPF/CNPJ, telefone, CEP | `<CampoMascarado>` + validação de `@/lib/documentos` |
| Escolher cliente/produto/serviço/técnico | `<Combobox>` com as funções de `@/lib/buscas` (busca no servidor) |
| Ação sem volta | `useConfirmacao()` — nunca execute direto no `onClick` |
| Erro de API | `mensagemErro` / `mensagemErroFuncao` de `@/lib/erros` |
| Tema | `useTema()` de `@/lib/tema` (o anti-flash fica no `index.html`) |

Testes: `npm test` (Vitest + Testing Library).

```bash
npm test          # roda uma vez
npm run test:watch
```
