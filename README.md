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
| `20260912100000_triggers_permitem_manutencao_admin.sql` | manutenção administrativa não esbarra nos gatilhos de proteção da OS |
| `20260912110000_dashboard_com_estoque.sql` | panorama de estoque e reposição no `resumo_dashboard` |
| `20260912120000_estoque_minimo_em_lote.sql` | `definir_estoque_minimo` e `consumo_produtos` |
| `20260912181946_ficha_tecnica_versionada_schema.sql` | **BOM versionada**: `fichas_tecnicas` e `fichas_tecnicas_itens` |
| `20260912182002_ficha_tecnica_ciclo_auditoria_rastro.sql` | detecção de ciclo, auditoria da ficha e `movimentacoes_estoque.ficha_tecnica_id` |
| `20260912182013_ficha_tecnica_migrar_produto_kit_itens.sql` | migra a composição antiga para a versão 1 (nada é apagado) |
| `20260912182038_ficha_tecnica_rpcs_versao_e_ativacao.sql` | `criar_versao_ficha` e `ativar_ficha_tecnica` |
| `20260912182050_cascata_estoque_usa_ficha_vigente.sql` | a baixa em cascata passa a ler a ficha em vigor |
| `20260912190000_comprometido_explode_kit.sql` | a reserva das OS abertas desce pela ficha até os componentes |
| `20260912190100_rpc_necessidade_de_materiais.sql` | `necessidade_de_materiais`: necessário × disponível × faltante |
| `20260912190200_solicitacao_compra.sql` | `solicitacoes_compra` e a permissão `compras.solicitar` |
| `20260912190300_rpcs_solicitacao_de_faltantes.sql` | `gerar_solicitacao_de_faltantes` e `cancelar_solicitacao_compra` |

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
`compras.solicitar`, `estoque.entradas.processar`, `estoque.produtos.gerenciar`,
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
- Toda alteração de tabela sensível vai para `auditoria` — inclusive a ficha
  técnica, que antes era a única operação crítica sem rastro.

#### Ficha técnica (BOM)

- A composição de um kit vive em `fichas_tecnicas` + `fichas_tecnicas_itens`, e
  **só uma versão fica em vigor por produto** (índice único parcial).
- A versão em vigor é imutável pela tela: alterar exige abrir um rascunho
  (`criar_versao_ficha`, que nasce como cópia) e ativá-lo (`ativar_ficha_tecnica`,
  que encerra a anterior e congela o custo do dia).
- Cada baixa em cascata grava em `movimentacoes_estoque.ficha_tecnica_id` de qual
  **versão** ela saiu — é isso que mantém o histórico reconstruível depois que a
  ficha muda.
- A ficha aceita submontados (kit dentro de kit): a cascata recursa sozinha e
  `impedir_ciclo_ficha` recusa ciclos até 20 níveis.
- `perda_percentual` é refugo previsto: 3 m com 5% consomem 3,15 m. A mesma conta
  está em `src/lib/ficha.ts` para o custo estimado do rascunho, com testes que
  travam as duas versões juntas.
- `produto_kit_itens` está **obsoleta** — mantida só como registro do que havia
  antes de existir versionamento.

#### Necessidade de materiais e reserva

- `necessidade_de_materiais(produto, quantidade)` desce pela ficha em vigor (com
  perda) e agrega nos componentes reais: submontado é etapa de montagem, não
  linha de compra. Recusa explodir se algum submontado estiver sem ficha em
  vigor, porque a necessidade sairia subestimada.
- `vw_produtos_estoque.estoque_comprometido` **explode o kit**: uma OS aberta com
  kit reserva os componentes, não só o kit (que não tem saldo próprio).
- O faltante é calculado sobre o **disponível**, não sobre o saldo físico —
  comprar contra o saldo físico é o jeito de prometer a mesma peça duas vezes.
- `gerar_solicitacao_de_faltantes` **refaz a conta no servidor**: entre a
  tela mostrar o resultado e a pessoa clicar, uma OS pode ter reservado o saldo.
- A mesma aritmética está em `src/lib/ficha.ts` (`necessidadeDe`, `faltanteDe`),
  com testes que travam o exemplo do cadastro junto com a versão SQL.

### Rotinas agendadas (pg_cron)

| Job | Quando | O que faz |
| --- | --- | --- |
| `marcar-titulos-atrasados` | 03:05 diariamente | move títulos vencidos para `atrasado` e devolve para `pendente` os prorrogados |

## Edge Functions

| Função | O que faz | Exige |
| --- | --- | --- |
| `admin-users` | criar/resetar senha/excluir usuário no Auth | `compras.solicitar` | abrir e cancelar solicitações de compra (admin, gerente, estoque) |
| `administrativo.usuarios.gerenciar` |
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
