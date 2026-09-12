-- Ordem de produção.
--
-- A montagem era invisível: quando um kit saía, os componentes baixavam em
-- cascata dentro de um gatilho. Não havia ordem, responsável, data, consumo
-- real, perda nem retrabalho — e o produto acabado nunca entrava no estoque.
do $$ begin
  create type public.ordem_producao_status as enum
    ('planejada', 'em_producao', 'concluida', 'cancelada');
exception when duplicate_object then null; end $$;

create table if not exists public.ordens_producao (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  -- Congelada na abertura: a ficha pode ganhar versão nova no meio da produção,
  -- e a ordem tem que continuar contando o que foi planejado.
  ficha_id uuid not null references public.fichas_tecnicas(id) on delete restrict,
  quantidade_planejada numeric not null,
  quantidade_produzida numeric not null default 0,
  quantidade_perdida numeric not null default 0,
  status public.ordem_producao_status not null default 'planejada',
  responsavel_id uuid references public.profiles(id) on delete set null,
  data_prevista date,
  iniciada_em timestamptz,
  concluida_em timestamptz,
  -- Lote do produto acabado, quando ele é rastreado.
  lote_id uuid references public.lotes(id) on delete set null,
  custo_total numeric not null default 0,
  observacao text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_op_quantidade check (quantidade_planejada > 0),
  constraint chk_op_produzida check (quantidade_produzida >= 0 and quantidade_perdida >= 0)
);

create unique index if not exists uq_op_numero on public.ordens_producao (numero);
create index if not exists idx_op_status on public.ordens_producao (status, created_at desc);
create index if not exists idx_op_produto on public.ordens_producao (produto_id);
create index if not exists idx_op_ficha on public.ordens_producao (ficha_id);
create index if not exists idx_op_responsavel on public.ordens_producao (responsavel_id);
create index if not exists idx_op_prevista on public.ordens_producao (data_prevista);

create table if not exists public.ordens_producao_itens (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_producao(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  quantidade_prevista numeric not null,
  quantidade_consumida numeric not null default 0,
  quantidade_perdida numeric not null default 0,
  observacao text,
  constraint uq_op_item unique (ordem_id, produto_id),
  constraint chk_op_item_prevista check (quantidade_prevista > 0),
  constraint chk_op_item_real check (quantidade_consumida >= 0 and quantidade_perdida >= 0)
);

create index if not exists idx_op_itens_ordem on public.ordens_producao_itens (ordem_id);
create index if not exists idx_op_itens_produto on public.ordens_producao_itens (produto_id);

-- Agora o lote pode dizer de qual ordem nasceu, com FK de verdade.
alter table public.lotes
  add column if not exists ordem_producao_id uuid references public.ordens_producao(id) on delete set null;
create index if not exists idx_lotes_ordem on public.lotes (ordem_producao_id);

alter table public.numeros_serie
  add column if not exists ordem_producao_id uuid references public.ordens_producao(id) on delete set null;
create index if not exists idx_series_ordem on public.numeros_serie (ordem_producao_id);

drop trigger if exists trg_op_updated_at on public.ordens_producao;
create trigger trg_op_updated_at
  before update on public.ordens_producao
  for each row execute function public.set_updated_at();

drop trigger if exists trg_auditoria on public.ordens_producao;
create trigger trg_auditoria
  after insert or update or delete on public.ordens_producao
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_auditoria on public.ordens_producao_itens;
create trigger trg_auditoria
  after insert or update or delete on public.ordens_producao_itens
  for each row execute function public.registrar_auditoria();

-- ------------------------------------------------------------- permissão
insert into public.permissions (chave, modulo, descricao)
values ('producao.gerenciar', 'producao', 'Abrir, iniciar, concluir e cancelar ordens de produção')
on conflict (chave) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  cross join public.permissions p
 where p.chave = 'producao.gerenciar'
   and r.nome in ('admin', 'gerente', 'estoque')
on conflict do nothing;

-- ------------------------------------------------------------------ RLS
alter table public.ordens_producao enable row level security;
alter table public.ordens_producao_itens enable row level security;

drop policy if exists op_select on public.ordens_producao;
create policy op_select on public.ordens_producao for select to authenticated
  using ((select public.usuario_ativo()));

drop policy if exists op_write on public.ordens_producao;
create policy op_write on public.ordens_producao for all to authenticated
  using ((select public.user_has_permission('producao.gerenciar')))
  with check ((select public.user_has_permission('producao.gerenciar')));

drop policy if exists op_itens_select on public.ordens_producao_itens;
create policy op_itens_select on public.ordens_producao_itens for select to authenticated
  using ((select public.usuario_ativo()));

drop policy if exists op_itens_write on public.ordens_producao_itens;
create policy op_itens_write on public.ordens_producao_itens for all to authenticated
  using ((select public.user_has_permission('producao.gerenciar')))
  with check ((select public.user_has_permission('producao.gerenciar')));

comment on table public.ordens_producao is
  'Ordem de montagem: congela a versão da ficha, reserva os componentes e, ao concluir, baixa o consumo real e dá entrada no produto acabado.';
