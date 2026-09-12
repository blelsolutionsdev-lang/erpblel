-- Ficha técnica (BOM) versionada.
--
-- Antes a composição do kit vivia em `produto_kit_itens`: quatro colunas, sem
-- versão, vigência, custo ou histórico. A tela editava as linhas no lugar, e
-- como a baixa em cascata lê a composição no momento do movimento, depois de
-- uma alteração não havia como saber com o que um kit tinha sido montado.

do $$ begin
  create type public.ficha_status as enum ('rascunho', 'ativa', 'encerrada');
exception when duplicate_object then null; end $$;

create table if not exists public.fichas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  versao integer not null,
  status public.ficha_status not null default 'rascunho',
  vigencia_inicio date not null default current_date,
  vigencia_fim date,
  observacao text,
  -- Congelado na ativação: o custo da ficha no dia em que ela entrou em vigor.
  custo_calculado numeric not null default 0,
  custo_calculado_em timestamptz,
  criada_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ficha_produto_versao unique (produto_id, versao),
  constraint chk_ficha_versao_positiva check (versao > 0),
  constraint chk_ficha_vigencia check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

-- Só uma ficha vigente por produto — a regra que garante que a cascata de
-- estoque nunca fique em dúvida sobre qual composição usar.
create unique index if not exists uq_ficha_ativa_por_produto
  on public.fichas_tecnicas (produto_id) where status = 'ativa';

create index if not exists idx_fichas_produto on public.fichas_tecnicas (produto_id, versao desc);
create index if not exists idx_fichas_criada_por on public.fichas_tecnicas (criada_por);

create table if not exists public.fichas_tecnicas_itens (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.fichas_tecnicas(id) on delete cascade,
  componente_produto_id uuid not null references public.produtos(id) on delete restrict,
  quantidade numeric not null,
  -- Refugo previsto: 3 m de tubo com 5% de perda consomem 3,15 m.
  perda_percentual numeric not null default 0,
  observacao text,
  constraint uq_ficha_item unique (ficha_id, componente_produto_id),
  constraint chk_ficha_item_quantidade check (quantidade > 0),
  constraint chk_ficha_item_perda check (perda_percentual >= 0 and perda_percentual < 100)
);

create index if not exists idx_fichas_itens_ficha on public.fichas_tecnicas_itens (ficha_id);
create index if not exists idx_fichas_itens_componente on public.fichas_tecnicas_itens (componente_produto_id);

drop trigger if exists trg_fichas_updated_at on public.fichas_tecnicas;
create trigger trg_fichas_updated_at
  before update on public.fichas_tecnicas
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ RLS
alter table public.fichas_tecnicas enable row level security;
alter table public.fichas_tecnicas_itens enable row level security;

drop policy if exists fichas_select on public.fichas_tecnicas;
create policy fichas_select on public.fichas_tecnicas for select to authenticated
  using ((select public.usuario_ativo()));

drop policy if exists fichas_write on public.fichas_tecnicas;
create policy fichas_write on public.fichas_tecnicas for all to authenticated
  using ((select public.user_has_permission('estoque.produtos.gerenciar')))
  with check ((select public.user_has_permission('estoque.produtos.gerenciar')));

drop policy if exists fichas_itens_select on public.fichas_tecnicas_itens;
create policy fichas_itens_select on public.fichas_tecnicas_itens for select to authenticated
  using ((select public.usuario_ativo()));

drop policy if exists fichas_itens_write on public.fichas_tecnicas_itens;
create policy fichas_itens_write on public.fichas_tecnicas_itens for all to authenticated
  using ((select public.user_has_permission('estoque.produtos.gerenciar')))
  with check ((select public.user_has_permission('estoque.produtos.gerenciar')));

comment on table public.fichas_tecnicas is
  'Ficha técnica (BOM) versionada. Uma versão ativa por produto; as encerradas ficam para consulta histórica.';
comment on table public.fichas_tecnicas_itens is
  'Componentes de uma versão da ficha. A unidade é a do próprio componente (produtos.unidade_id).';
