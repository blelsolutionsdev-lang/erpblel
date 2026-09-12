-- Primeira peça do ciclo de compras: a solicitação. Nasce aqui porque é o
-- destino natural do que falta na explosão de kit — sem ela, a explosão para
-- num diagnóstico que ninguém consegue acionar.
--
-- Os status de aprovação já entram no enum porque são o domínio real, mas só
-- 'aberta' e 'cancelada' são alcançáveis hoje; a alçada é o módulo de
-- aprovações (P3).
do $$ begin
  create type public.solicitacao_compra_status as enum
    ('aberta', 'aprovada', 'reprovada', 'atendida', 'cancelada');
exception when duplicate_object then null; end $$;

create table if not exists public.solicitacoes_compra (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  status public.solicitacao_compra_status not null default 'aberta',
  origem_tipo text,
  origem_id uuid,
  origem_descricao text,
  observacao text,
  solicitada_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_solicitacao_numero on public.solicitacoes_compra (numero);
create index if not exists idx_solicitacao_status on public.solicitacoes_compra (status, created_at desc);
create index if not exists idx_solicitacao_origem on public.solicitacoes_compra (origem_tipo, origem_id);
create index if not exists idx_solicitacao_autor on public.solicitacoes_compra (solicitada_por);

create table if not exists public.solicitacoes_compra_itens (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes_compra(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete restrict,
  quantidade numeric not null,
  observacao text,
  constraint uq_solicitacao_item unique (solicitacao_id, produto_id),
  constraint chk_solicitacao_item_quantidade check (quantidade > 0)
);

create index if not exists idx_solicitacao_itens_sol on public.solicitacoes_compra_itens (solicitacao_id);
create index if not exists idx_solicitacao_itens_produto on public.solicitacoes_compra_itens (produto_id);

drop trigger if exists trg_solicitacoes_updated_at on public.solicitacoes_compra;
create trigger trg_solicitacoes_updated_at
  before update on public.solicitacoes_compra
  for each row execute function public.set_updated_at();

drop trigger if exists trg_auditoria on public.solicitacoes_compra;
create trigger trg_auditoria
  after insert or update or delete on public.solicitacoes_compra
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_auditoria on public.solicitacoes_compra_itens;
create trigger trg_auditoria
  after insert or update or delete on public.solicitacoes_compra_itens
  for each row execute function public.registrar_auditoria();

-- ------------------------------------------------------------- permissão
insert into public.permissions (chave, modulo, descricao)
values ('compras.solicitar', 'compras', 'Abrir e cancelar solicitações de compra')
on conflict (chave) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  cross join public.permissions p
 where p.chave = 'compras.solicitar'
   and r.nome in ('admin', 'gerente', 'estoque')
on conflict do nothing;

-- ------------------------------------------------------------------ RLS
alter table public.solicitacoes_compra enable row level security;
alter table public.solicitacoes_compra_itens enable row level security;

drop policy if exists solicitacoes_select on public.solicitacoes_compra;
create policy solicitacoes_select on public.solicitacoes_compra for select to authenticated
  using ((select public.usuario_ativo()));

drop policy if exists solicitacoes_write on public.solicitacoes_compra;
create policy solicitacoes_write on public.solicitacoes_compra for all to authenticated
  using ((select public.user_has_permission('compras.solicitar')))
  with check ((select public.user_has_permission('compras.solicitar')));

drop policy if exists solicitacoes_itens_select on public.solicitacoes_compra_itens;
create policy solicitacoes_itens_select on public.solicitacoes_compra_itens for select to authenticated
  using ((select public.usuario_ativo()));

drop policy if exists solicitacoes_itens_write on public.solicitacoes_compra_itens;
create policy solicitacoes_itens_write on public.solicitacoes_compra_itens for all to authenticated
  using ((select public.user_has_permission('compras.solicitar')))
  with check ((select public.user_has_permission('compras.solicitar')));

comment on table public.solicitacoes_compra is
  'Solicitação de compra. Hoje nasce da explosão de kit; a cotação e o pedido são as etapas seguintes do módulo de compras.';
