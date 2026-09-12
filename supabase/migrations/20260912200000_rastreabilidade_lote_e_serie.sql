-- Lote e número de série.
--
-- Sem isso, "com o que este aquecedor foi montado e para quem foi" não tinha
-- resposta: o razão de estoque sabia a quantidade e o produto, nunca qual
-- unidade física.
--
-- O controle é POR PRODUTO. Parafuso não precisa de lote; aquecedor precisa de
-- série. O default 'nenhum' preserva exatamente o comportamento atual — nada
-- muda para os produtos já cadastrados.
do $$ begin
  create type public.controle_rastreio as enum ('nenhum', 'lote', 'serie');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.serie_status as enum
    ('em_estoque', 'reservado', 'vendido', 'em_assistencia', 'baixado');
exception when duplicate_object then null; end $$;

alter table public.produtos
  add column if not exists controle public.controle_rastreio not null default 'nenhum';

comment on column public.produtos.controle is
  'Rastreio exigido nas movimentações: nenhum (padrão), lote (quantidade por lote) ou serie (uma unidade por número).';

create table if not exists public.lotes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete restrict,
  codigo text not null,
  fabricacao date,
  validade date,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  -- Mesma convenção de `movimentacoes_estoque`: de onde o lote nasceu.
  origem_tipo text,
  origem_id uuid,
  observacao text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uq_lote_produto_codigo unique (produto_id, codigo),
  constraint chk_lote_validade check (validade is null or fabricacao is null or validade >= fabricacao)
);

create index if not exists idx_lotes_produto on public.lotes (produto_id);
create index if not exists idx_lotes_validade on public.lotes (validade);
create index if not exists idx_lotes_fornecedor on public.lotes (fornecedor_id);
create index if not exists idx_lotes_origem on public.lotes (origem_tipo, origem_id);

create table if not exists public.numeros_serie (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete restrict,
  serie text not null,
  lote_id uuid references public.lotes(id) on delete set null,
  status public.serie_status not null default 'em_estoque',
  fabricacao date,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  origem_tipo text,
  origem_id uuid,
  -- Para quem foi, e por qual OS saiu.
  cliente_id uuid references public.clientes(id) on delete set null,
  os_id uuid references public.ordens_servico(id) on delete set null,
  equipamento_id uuid references public.equipamentos(id) on delete set null,
  garantia_ate date,
  observacao text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  movimentacao_entrada_id uuid references public.movimentacoes_estoque(id) on delete set null,
  movimentacao_saida_id uuid references public.movimentacoes_estoque(id) on delete set null,
  constraint uq_serie_produto unique (produto_id, serie)
);

create index if not exists idx_series_produto on public.numeros_serie (produto_id, status);
create index if not exists idx_series_lote on public.numeros_serie (lote_id);
create index if not exists idx_series_cliente on public.numeros_serie (cliente_id);
create index if not exists idx_series_os on public.numeros_serie (os_id);
create index if not exists idx_series_equipamento on public.numeros_serie (equipamento_id);
create index if not exists idx_series_busca on public.numeros_serie (serie);
create index if not exists idx_series_mov_entrada on public.numeros_serie (movimentacao_entrada_id);
create index if not exists idx_series_mov_saida on public.numeros_serie (movimentacao_saida_id);

-- O razão passa a dizer de qual lote saiu/entrou cada quantidade.
alter table public.movimentacoes_estoque
  add column if not exists lote_id uuid references public.lotes(id) on delete restrict;

create index if not exists idx_movimentacoes_lote on public.movimentacoes_estoque (lote_id);

comment on column public.movimentacoes_estoque.lote_id is
  'Lote movimentado. Obrigatório na entrada de produto com controle de lote; na saída é alocado por FEFO quando não informado.';

drop trigger if exists trg_series_updated_at on public.numeros_serie;
create trigger trg_series_updated_at
  before update on public.numeros_serie
  for each row execute function public.set_updated_at();

drop trigger if exists trg_auditoria on public.lotes;
create trigger trg_auditoria
  after insert or update or delete on public.lotes
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_auditoria on public.numeros_serie;
create trigger trg_auditoria
  after insert or update or delete on public.numeros_serie
  for each row execute function public.registrar_auditoria();

-- ------------------------------------------------------------------ RLS
alter table public.lotes enable row level security;
alter table public.numeros_serie enable row level security;

drop policy if exists lotes_select on public.lotes;
create policy lotes_select on public.lotes for select to authenticated
  using ((select public.usuario_ativo()));

drop policy if exists lotes_write on public.lotes;
create policy lotes_write on public.lotes for all to authenticated
  using ((select public.user_has_permission('estoque.produtos.gerenciar'))
      or (select public.user_has_permission('estoque.entradas.processar')))
  with check ((select public.user_has_permission('estoque.produtos.gerenciar'))
           or (select public.user_has_permission('estoque.entradas.processar')));

drop policy if exists series_select on public.numeros_serie;
create policy series_select on public.numeros_serie for select to authenticated
  using ((select public.usuario_ativo()));

drop policy if exists series_write on public.numeros_serie;
create policy series_write on public.numeros_serie for all to authenticated
  using ((select public.user_has_permission('estoque.produtos.gerenciar'))
      or (select public.user_has_permission('estoque.entradas.processar')))
  with check ((select public.user_has_permission('estoque.produtos.gerenciar'))
           or (select public.user_has_permission('estoque.entradas.processar')));

comment on table public.lotes is
  'Lote de um produto: o que entrou junto e sai junto. Saldo por lote sai do razão (vw_saldo_lotes).';
comment on table public.numeros_serie is
  'Unidade física identificada. Uma linha = uma unidade; o histórico de status fica em auditoria.';
