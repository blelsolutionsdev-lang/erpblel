-- Baseline do schema do ERP (extraído do projeto Supabase em 2026-09-11).
-- Representa o estado do banco ANTES das migrations de hardening. As migrations
-- seguintes evoluem a partir daqui.

-- ============================================================ enums
create type public.ambiente_fiscal as enum ('homologacao', 'producao');
create type public.caixa_movimento_tipo as enum ('entrada', 'saida');
create type public.financeiro_categoria_tipo as enum ('receita', 'despesa');
create type public.movimento_estoque_tipo as enum ('entrada', 'saida', 'ajuste', 'transferencia');
create type public.nfce_status as enum ('pendente', 'autorizada', 'cancelada', 'erro', 'rejeitada');
create type public.nota_fiscal_entrada_status as enum ('pendente', 'processada', 'erro');
create type public.os_anexo_tipo as enum ('foto_conclusao', 'assinatura_cliente', 'outro');
create type public.os_item_tipo as enum ('peca', 'servico');
create type public.os_status as enum ('aberta', 'em_andamento', 'aguardando_peca', 'concluida', 'cancelada');
create type public.pessoa_tipo as enum ('PF', 'PJ');
create type public.produto_tipo as enum ('simples', 'kit');
create type public.titulo_status as enum ('pendente', 'pago', 'atrasado', 'cancelado');

-- ============================================================ tabelas
create table public.roles (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  descricao text,
  created_at timestamp with time zone default now() not null
);

create table public.permissions (
  id uuid default gen_random_uuid() not null,
  chave text not null,
  modulo text not null,
  descricao text,
  created_at timestamp with time zone default now() not null
);

create table public.role_permissions (
  role_id uuid not null,
  permission_id uuid not null
);

create table public.profiles (
  id uuid not null,
  nome text not null,
  email text not null,
  telefone text,
  role_id uuid,
  ativo boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.user_permissions (
  user_id uuid not null,
  permission_id uuid not null,
  allow boolean not null,
  created_at timestamp with time zone default now() not null
);

create table public.unidades_medida (
  id uuid default gen_random_uuid() not null,
  sigla text not null,
  descricao text not null
);

create table public.categorias_produtos (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  categoria_pai_id uuid,
  created_at timestamp with time zone default now() not null
);

create table public.categorias_financeiras (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  tipo financeiro_categoria_tipo not null,
  created_at timestamp with time zone default now() not null
);

create table public.produtos (
  id uuid default gen_random_uuid() not null,
  sku text,
  codigo_barras text,
  nome text not null,
  descricao text,
  categoria_id uuid,
  unidade_id uuid,
  tipo produto_tipo default 'simples'::produto_tipo not null,
  ncm text,
  cest text,
  origem_mercadoria smallint default 0 not null,
  preco_custo numeric(14,2) default 0 not null,
  preco_venda numeric(14,2) default 0 not null,
  estoque_atual numeric(14,3) default 0 not null,
  estoque_minimo numeric(14,3) default 0 not null,
  estoque_maximo numeric(14,3),
  peso_liquido numeric(10,3),
  peso_bruto numeric(10,3),
  ativo boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.produto_kit_itens (
  id uuid default gen_random_uuid() not null,
  kit_produto_id uuid not null,
  componente_produto_id uuid not null,
  quantidade numeric(14,3) default 1 not null
);

create table public.movimentacoes_estoque (
  id uuid default gen_random_uuid() not null,
  produto_id uuid not null,
  tipo movimento_estoque_tipo not null,
  quantidade numeric(14,3) not null,
  preco_unitario numeric(14,2),
  origem_tipo text,
  origem_id uuid,
  observacao text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table public.clientes (
  id uuid default gen_random_uuid() not null,
  tipo_pessoa pessoa_tipo default 'PJ'::pessoa_tipo not null,
  nome text not null,
  nome_fantasia text,
  cpf_cnpj text,
  ie text,
  email text,
  telefone text,
  endereco jsonb default '{}'::jsonb not null,
  observacoes text,
  ativo boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.fornecedores (
  id uuid default gen_random_uuid() not null,
  tipo_pessoa pessoa_tipo default 'PJ'::pessoa_tipo not null,
  nome text not null,
  nome_fantasia text,
  cpf_cnpj text,
  ie text,
  email text,
  telefone text,
  endereco jsonb default '{}'::jsonb not null,
  dados_bancarios jsonb default '{}'::jsonb not null,
  observacoes text,
  ativo boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.equipamentos (
  id uuid default gen_random_uuid() not null,
  cliente_id uuid not null,
  tipo text,
  marca text,
  modelo text,
  numero_serie text,
  observacoes text,
  created_at timestamp with time zone default now() not null
);

create table public.servicos (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  descricao text,
  preco numeric default 0 not null,
  ativo boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.ordens_servico (
  id uuid default gen_random_uuid() not null,
  numero bigint generated always as identity not null,
  cliente_id uuid not null,
  equipamento_id uuid,
  tecnico_id uuid,
  status os_status default 'aberta'::os_status not null,
  problema_relatado text,
  laudo_tecnico text,
  data_abertura timestamp with time zone default now() not null,
  data_conclusao timestamp with time zone,
  valor_pecas numeric(14,2) default 0 not null,
  valor_servicos numeric(14,2) default 0 not null,
  valor_total numeric(14,2),
  conta_receber_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  os_origem_id uuid,
  eh_garantia boolean default false not null,
  assinatura_cliente_nome text,
  assinatura_cliente_url text,
  assinatura_em timestamp with time zone,
  valor_acrescimo numeric default 0 not null,
  valor_desconto numeric default 0 not null
);

create table public.ordens_servico_itens (
  id uuid default gen_random_uuid() not null,
  os_id uuid not null,
  tipo os_item_tipo not null,
  produto_id uuid,
  descricao text not null,
  quantidade numeric(14,3) default 1 not null,
  valor_unitario numeric(14,2) default 0 not null,
  valor_total numeric(14,2) generated always as ((quantidade * valor_unitario)) stored,
  created_at timestamp with time zone default now() not null,
  servico_id uuid
);

create table public.os_anexos (
  id uuid default gen_random_uuid() not null,
  os_id uuid not null,
  tipo os_anexo_tipo not null,
  storage_path text not null,
  nome_arquivo text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table public.contas_pagar (
  id uuid default gen_random_uuid() not null,
  fornecedor_id uuid,
  categoria_id uuid,
  descricao text not null,
  valor numeric(14,2) not null,
  data_emissao date default CURRENT_DATE not null,
  data_vencimento date not null,
  data_pagamento date,
  status titulo_status default 'pendente'::titulo_status not null,
  forma_pagamento text,
  origem_tipo text,
  origem_id uuid,
  observacoes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.contas_receber (
  id uuid default gen_random_uuid() not null,
  cliente_id uuid,
  categoria_id uuid,
  descricao text not null,
  valor numeric(14,2) not null,
  data_emissao date default CURRENT_DATE not null,
  data_vencimento date not null,
  data_recebimento date,
  status titulo_status default 'pendente'::titulo_status not null,
  forma_pagamento text,
  origem_tipo text,
  origem_id uuid,
  observacoes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.caixa_movimentacoes (
  id uuid default gen_random_uuid() not null,
  tipo caixa_movimento_tipo not null,
  valor numeric(14,2) not null,
  data_movimento date default CURRENT_DATE not null,
  descricao text,
  conta_pagar_id uuid,
  conta_receber_id uuid,
  forma_pagamento text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table public.notas_fiscais_entrada (
  id uuid default gen_random_uuid() not null,
  chave_acesso text,
  numero text,
  serie text,
  fornecedor_id uuid,
  data_emissao timestamp with time zone,
  valor_total numeric(14,2),
  xml_original text,
  pdf_url text,
  status nota_fiscal_entrada_status default 'pendente'::nota_fiscal_entrada_status not null,
  created_at timestamp with time zone default now() not null,
  processed_at timestamp with time zone
);

create table public.notas_fiscais_entrada_itens (
  id uuid default gen_random_uuid() not null,
  nota_id uuid not null,
  produto_id uuid,
  codigo_produto_fornecedor text,
  descricao text not null,
  ncm text,
  cest text,
  quantidade numeric(14,3) not null,
  valor_unitario numeric(14,2) not null,
  valor_total numeric(14,2) not null
);

create table public.notas_fiscais_saida (
  id uuid default gen_random_uuid() not null,
  numero bigint,
  serie text,
  chave_acesso text,
  cliente_id uuid,
  os_id uuid,
  valor_total numeric(14,2) default 0 not null,
  status nfce_status default 'pendente'::nfce_status not null,
  xml_url text,
  danfe_url text,
  focus_nfe_ref text,
  erro_mensagem text,
  created_at timestamp with time zone default now() not null,
  autorizada_at timestamp with time zone
);

create table public.configuracoes_fiscais (
  id uuid default gen_random_uuid() not null,
  ambiente ambiente_fiscal default 'homologacao'::ambiente_fiscal not null,
  focus_nfe_token text,
  serie text default '1'::text not null,
  proximo_numero bigint default 1 not null,
  ativo boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- ============================================================ constraints
alter table public.roles add constraint roles_pkey primary key (id);
alter table public.roles add constraint roles_nome_key unique (nome);

alter table public.permissions add constraint permissions_pkey primary key (id);
alter table public.permissions add constraint permissions_chave_key unique (chave);

alter table public.role_permissions add constraint role_permissions_pkey primary key (role_id, permission_id);
alter table public.role_permissions add constraint role_permissions_role_id_fkey foreign key (role_id) references roles(id) on delete cascade;
alter table public.role_permissions add constraint role_permissions_permission_id_fkey foreign key (permission_id) references permissions(id) on delete cascade;

alter table public.profiles add constraint profiles_pkey primary key (id);
alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
alter table public.profiles add constraint profiles_role_id_fkey foreign key (role_id) references roles(id) on delete set null;

alter table public.user_permissions add constraint user_permissions_pkey primary key (user_id, permission_id);
alter table public.user_permissions add constraint user_permissions_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;
alter table public.user_permissions add constraint user_permissions_permission_id_fkey foreign key (permission_id) references permissions(id) on delete cascade;

alter table public.unidades_medida add constraint unidades_medida_pkey primary key (id);
alter table public.unidades_medida add constraint unidades_medida_sigla_key unique (sigla);

alter table public.categorias_produtos add constraint categorias_produtos_pkey primary key (id);
alter table public.categorias_produtos add constraint categorias_produtos_categoria_pai_id_fkey foreign key (categoria_pai_id) references categorias_produtos(id) on delete set null;

alter table public.categorias_financeiras add constraint categorias_financeiras_pkey primary key (id);

alter table public.produtos add constraint produtos_pkey primary key (id);
alter table public.produtos add constraint produtos_sku_key unique (sku);
alter table public.produtos add constraint produtos_codigo_barras_key unique (codigo_barras);
alter table public.produtos add constraint chk_precos_nao_negativos check (((preco_custo >= (0)::numeric) and (preco_venda >= (0)::numeric)));
alter table public.produtos add constraint produtos_categoria_id_fkey foreign key (categoria_id) references categorias_produtos(id) on delete set null;
alter table public.produtos add constraint produtos_unidade_id_fkey foreign key (unidade_id) references unidades_medida(id) on delete restrict;

alter table public.produto_kit_itens add constraint produto_kit_itens_pkey primary key (id);
alter table public.produto_kit_itens add constraint produto_kit_itens_kit_produto_id_componente_produto_id_key unique (kit_produto_id, componente_produto_id);
alter table public.produto_kit_itens add constraint chk_kit_nao_autoreferencia check ((kit_produto_id <> componente_produto_id));
alter table public.produto_kit_itens add constraint produto_kit_itens_kit_produto_id_fkey foreign key (kit_produto_id) references produtos(id) on delete cascade;
alter table public.produto_kit_itens add constraint produto_kit_itens_componente_produto_id_fkey foreign key (componente_produto_id) references produtos(id) on delete restrict;

alter table public.movimentacoes_estoque add constraint movimentacoes_estoque_pkey primary key (id);
alter table public.movimentacoes_estoque add constraint movimentacoes_estoque_produto_id_fkey foreign key (produto_id) references produtos(id) on delete restrict;
alter table public.movimentacoes_estoque add constraint movimentacoes_estoque_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table public.clientes add constraint clientes_pkey primary key (id);
alter table public.clientes add constraint clientes_cpf_cnpj_key unique (cpf_cnpj);

alter table public.fornecedores add constraint fornecedores_pkey primary key (id);
alter table public.fornecedores add constraint fornecedores_cpf_cnpj_key unique (cpf_cnpj);

alter table public.equipamentos add constraint equipamentos_pkey primary key (id);
alter table public.equipamentos add constraint equipamentos_cliente_id_fkey foreign key (cliente_id) references clientes(id) on delete cascade;

alter table public.servicos add constraint servicos_pkey primary key (id);

alter table public.ordens_servico add constraint ordens_servico_pkey primary key (id);
alter table public.ordens_servico add constraint ordens_servico_cliente_id_fkey foreign key (cliente_id) references clientes(id) on delete restrict;
alter table public.ordens_servico add constraint ordens_servico_equipamento_id_fkey foreign key (equipamento_id) references equipamentos(id) on delete set null;
alter table public.ordens_servico add constraint ordens_servico_tecnico_id_fkey foreign key (tecnico_id) references profiles(id) on delete set null;
alter table public.ordens_servico add constraint ordens_servico_os_origem_id_fkey foreign key (os_origem_id) references ordens_servico(id) on delete set null;
alter table public.ordens_servico add constraint fk_os_conta_receber foreign key (conta_receber_id) references contas_receber(id) on delete set null;

alter table public.ordens_servico_itens add constraint ordens_servico_itens_pkey primary key (id);
alter table public.ordens_servico_itens add constraint chk_os_item_produto_ou_servico check ((((tipo = 'peca'::os_item_tipo) and (produto_id is not null) and (servico_id is null)) or ((tipo = 'servico'::os_item_tipo) and (servico_id is not null) and (produto_id is null))));
alter table public.ordens_servico_itens add constraint ordens_servico_itens_os_id_fkey foreign key (os_id) references ordens_servico(id) on delete cascade;
alter table public.ordens_servico_itens add constraint ordens_servico_itens_produto_id_fkey foreign key (produto_id) references produtos(id) on delete restrict;
alter table public.ordens_servico_itens add constraint ordens_servico_itens_servico_id_fkey foreign key (servico_id) references servicos(id);

alter table public.os_anexos add constraint os_anexos_pkey primary key (id);
alter table public.os_anexos add constraint os_anexos_os_id_fkey foreign key (os_id) references ordens_servico(id) on delete cascade;
alter table public.os_anexos add constraint os_anexos_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table public.contas_pagar add constraint contas_pagar_pkey primary key (id);
alter table public.contas_pagar add constraint chk_valor_positivo check ((valor > (0)::numeric));
alter table public.contas_pagar add constraint contas_pagar_fornecedor_id_fkey foreign key (fornecedor_id) references fornecedores(id) on delete set null;
alter table public.contas_pagar add constraint contas_pagar_categoria_id_fkey foreign key (categoria_id) references categorias_financeiras(id) on delete set null;

alter table public.contas_receber add constraint contas_receber_pkey primary key (id);
alter table public.contas_receber add constraint chk_valor_positivo check ((valor > (0)::numeric));
alter table public.contas_receber add constraint contas_receber_cliente_id_fkey foreign key (cliente_id) references clientes(id) on delete set null;
alter table public.contas_receber add constraint contas_receber_categoria_id_fkey foreign key (categoria_id) references categorias_financeiras(id) on delete set null;

alter table public.caixa_movimentacoes add constraint caixa_movimentacoes_pkey primary key (id);
alter table public.caixa_movimentacoes add constraint chk_valor_positivo check ((valor > (0)::numeric));
alter table public.caixa_movimentacoes add constraint caixa_movimentacoes_conta_pagar_id_fkey foreign key (conta_pagar_id) references contas_pagar(id) on delete set null;
alter table public.caixa_movimentacoes add constraint caixa_movimentacoes_conta_receber_id_fkey foreign key (conta_receber_id) references contas_receber(id) on delete set null;
alter table public.caixa_movimentacoes add constraint caixa_movimentacoes_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table public.notas_fiscais_entrada add constraint notas_fiscais_entrada_pkey primary key (id);
alter table public.notas_fiscais_entrada add constraint notas_fiscais_entrada_chave_acesso_key unique (chave_acesso);
alter table public.notas_fiscais_entrada add constraint notas_fiscais_entrada_fornecedor_id_fkey foreign key (fornecedor_id) references fornecedores(id) on delete set null;

alter table public.notas_fiscais_entrada_itens add constraint notas_fiscais_entrada_itens_pkey primary key (id);
alter table public.notas_fiscais_entrada_itens add constraint notas_fiscais_entrada_itens_nota_id_fkey foreign key (nota_id) references notas_fiscais_entrada(id) on delete cascade;
alter table public.notas_fiscais_entrada_itens add constraint notas_fiscais_entrada_itens_produto_id_fkey foreign key (produto_id) references produtos(id) on delete set null;

alter table public.notas_fiscais_saida add constraint notas_fiscais_saida_pkey primary key (id);
alter table public.notas_fiscais_saida add constraint notas_fiscais_saida_chave_acesso_key unique (chave_acesso);
alter table public.notas_fiscais_saida add constraint notas_fiscais_saida_cliente_id_fkey foreign key (cliente_id) references clientes(id) on delete set null;
alter table public.notas_fiscais_saida add constraint notas_fiscais_saida_os_id_fkey foreign key (os_id) references ordens_servico(id) on delete set null;

alter table public.configuracoes_fiscais add constraint configuracoes_fiscais_pkey primary key (id);

-- ============================================================ índices
create index idx_caixa_mov_conta_pagar on public.caixa_movimentacoes using btree (conta_pagar_id);
create index idx_caixa_mov_conta_receber on public.caixa_movimentacoes using btree (conta_receber_id);
create index idx_caixa_mov_created_by on public.caixa_movimentacoes using btree (created_by);
create index idx_categorias_produtos_pai on public.categorias_produtos using btree (categoria_pai_id);
create index idx_clientes_cpf_cnpj on public.clientes using btree (cpf_cnpj);
create index idx_clientes_nome on public.clientes using gin (to_tsvector('portuguese'::regconfig, nome));
create index idx_contas_pagar_categoria on public.contas_pagar using btree (categoria_id);
create index idx_contas_pagar_fornecedor on public.contas_pagar using btree (fornecedor_id);
create index idx_contas_receber_categoria on public.contas_receber using btree (categoria_id);
create index idx_contas_receber_cliente on public.contas_receber using btree (cliente_id);
create index idx_equipamentos_cliente on public.equipamentos using btree (cliente_id);
create index idx_fornecedores_cpf_cnpj on public.fornecedores using btree (cpf_cnpj);
create index idx_kit_itens_componente on public.produto_kit_itens using btree (componente_produto_id);
create index idx_movimentacoes_created_by on public.movimentacoes_estoque using btree (created_by);
create index idx_movimentacoes_origem on public.movimentacoes_estoque using btree (origem_tipo, origem_id);
create index idx_movimentacoes_produto on public.movimentacoes_estoque using btree (produto_id);
create index idx_nfce_saida_cliente on public.notas_fiscais_saida using btree (cliente_id);
create index idx_nfce_saida_os on public.notas_fiscais_saida using btree (os_id);
create index idx_nfe_entrada_fornecedor on public.notas_fiscais_entrada using btree (fornecedor_id);
create index idx_nfe_entrada_itens_nota on public.notas_fiscais_entrada_itens using btree (nota_id);
create index idx_nfe_entrada_itens_produto on public.notas_fiscais_entrada_itens using btree (produto_id);
create index idx_os_anexos_os on public.os_anexos using btree (os_id);
create index idx_os_cliente on public.ordens_servico using btree (cliente_id);
create index idx_os_conta_receber on public.ordens_servico using btree (conta_receber_id);
create index idx_os_equipamento on public.ordens_servico using btree (equipamento_id);
create index idx_os_itens_os on public.ordens_servico_itens using btree (os_id);
create index idx_os_itens_produto on public.ordens_servico_itens using btree (produto_id);
create index idx_os_itens_servico_id on public.ordens_servico_itens using btree (servico_id);
create unique index idx_os_numero on public.ordens_servico using btree (numero);
create index idx_os_origem on public.ordens_servico using btree (os_origem_id);
create index idx_os_tecnico on public.ordens_servico using btree (tecnico_id);
create index idx_produtos_categoria on public.produtos using btree (categoria_id);
create index idx_produtos_ncm on public.produtos using btree (ncm);
create index idx_produtos_nome on public.produtos using gin (to_tsvector('portuguese'::regconfig, nome));
create index idx_produtos_unidade on public.produtos using btree (unidade_id);
create index idx_profiles_role on public.profiles using btree (role_id);
create index idx_role_permissions_permission on public.role_permissions using btree (permission_id);

-- ============================================================ funções
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.user_has_permission(p_chave text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce(
    (select up.allow
       from public.user_permissions up
       join public.permissions p on p.id = up.permission_id
      where up.user_id = auth.uid() and p.chave = p_chave),
    exists(
      select 1
        from public.profiles pr
        join public.role_permissions rp on rp.role_id = pr.role_id
        join public.permissions p on p.id = rp.permission_id
       where pr.id = auth.uid() and p.chave = p_chave
    ),
    false
  );
$function$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role_id uuid;
begin
  select id into v_role_id from public.roles where nome = 'gerente' limit 1;

  insert into public.profiles (id, nome, email, role_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    v_role_id
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

create or replace function public.impedir_auto_promocao()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user = 'service_role' or public.user_has_permission('administrativo.usuarios.gerenciar') then
    return new;
  end if;

  new.role_id := old.role_id;
  new.ativo := old.ativo;

  return new;
end;
$function$;

create or replace function public.impedir_kit_de_kit()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_tipo produto_tipo;
begin
  select tipo into v_tipo from public.produtos where id = new.componente_produto_id;
  if v_tipo = 'kit' then
    raise exception 'Um kit não pode ter outro kit como componente (%).', new.componente_produto_id;
  end if;
  return new;
end;
$function$;

create or replace function public.aplicar_movimentacao_estoque()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_delta numeric;
  v_tipo_produto produto_tipo;
  v_item record;
begin
  select tipo into v_tipo_produto from public.produtos where id = new.produto_id;

  if v_tipo_produto = 'kit' then
    -- Kit não mantém estoque próprio: cascade para os componentes.
    for v_item in
      select componente_produto_id, quantidade
      from public.produto_kit_itens
      where kit_produto_id = new.produto_id
    loop
      insert into public.movimentacoes_estoque
        (produto_id, tipo, quantidade, preco_unitario, origem_tipo, origem_id, observacao, created_by)
      values
        (v_item.componente_produto_id, new.tipo, v_item.quantidade * new.quantidade, null,
         coalesce(new.origem_tipo, 'kit_baixa'), coalesce(new.origem_id, new.id),
         'Baixa em cascata do kit ' || new.produto_id, new.created_by);
    end loop;

    return new;
  end if;

  v_delta := case new.tipo
    when 'entrada' then new.quantidade
    when 'saida' then -new.quantidade
    when 'ajuste' then new.quantidade
    else 0
  end;

  update public.produtos
    set estoque_atual = estoque_atual + v_delta
    where id = new.produto_id;

  return new;
end;
$function$;

create or replace function public.calcular_valor_total_os()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  new.valor_total := new.valor_pecas + new.valor_servicos + new.valor_acrescimo - new.valor_desconto;
  return new;
end;
$function$;

create or replace function public.sincronizar_totais_os_itens()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_os_id uuid := coalesce(new.os_id, old.os_id);
  v_pecas numeric;
  v_servicos numeric;
begin
  select
    coalesce(sum(valor_total) filter (where tipo = 'peca'), 0),
    coalesce(sum(valor_total) filter (where tipo = 'servico'), 0)
  into v_pecas, v_servicos
  from public.ordens_servico_itens
  where os_id = v_os_id;

  update public.ordens_servico
  set valor_pecas = v_pecas, valor_servicos = v_servicos
  where id = v_os_id;

  return coalesce(new, old);
end;
$function$;

create or replace function public.gerar_conta_receber_os()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_conta_id uuid;
begin
  if new.status = 'concluida'
     and old.status is distinct from 'concluida'
     and new.conta_receber_id is null
     and new.valor_total > 0 then

    insert into public.contas_receber (cliente_id, descricao, valor, data_vencimento, origem_tipo, origem_id)
    values (
      new.cliente_id,
      'OS #' || new.numero,
      new.valor_total,
      current_date + 30,
      'os',
      new.id
    )
    returning id into v_conta_id;

    update public.ordens_servico set conta_receber_id = v_conta_id where id = new.id;
  end if;

  return new;
end;
$function$;

create or replace function public.restringir_edicao_os()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user = 'service_role' or public.user_has_permission('os.editar') then
    return new;
  end if;

  if old.tecnico_id is distinct from auth.uid() then
    raise exception 'Você não tem permissão para editar esta ordem de serviço.';
  end if;

  new.cliente_id := old.cliente_id;
  new.equipamento_id := old.equipamento_id;
  new.tecnico_id := old.tecnico_id;
  new.problema_relatado := old.problema_relatado;
  new.numero := old.numero;
  new.os_origem_id := old.os_origem_id;
  new.eh_garantia := old.eh_garantia;
  new.data_abertura := old.data_abertura;
  new.created_at := old.created_at;

  return new;
end;
$function$;

-- ============================================================ triggers
create trigger trg_handle_new_user after insert on auth.users for each row execute function handle_new_user();
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function set_updated_at();
create trigger trg_impedir_auto_promocao before update on public.profiles for each row execute function impedir_auto_promocao();
create trigger trg_clientes_updated_at before update on public.clientes for each row execute function set_updated_at();
create trigger trg_fornecedores_updated_at before update on public.fornecedores for each row execute function set_updated_at();
create trigger trg_produtos_updated_at before update on public.produtos for each row execute function set_updated_at();
create trigger trg_servicos_updated_at before update on public.servicos for each row execute function set_updated_at();
create trigger trg_config_fiscais_updated_at before update on public.configuracoes_fiscais for each row execute function set_updated_at();
create trigger trg_contas_pagar_updated_at before update on public.contas_pagar for each row execute function set_updated_at();
create trigger trg_contas_receber_updated_at before update on public.contas_receber for each row execute function set_updated_at();
create trigger trg_impedir_kit_de_kit before insert or update on public.produto_kit_itens for each row execute function impedir_kit_de_kit();
create trigger trg_aplicar_movimentacao_estoque after insert on public.movimentacoes_estoque for each row execute function aplicar_movimentacao_estoque();
create trigger trg_os_calcular_total before insert or update on public.ordens_servico for each row execute function calcular_valor_total_os();
create trigger trg_os_updated_at before update on public.ordens_servico for each row execute function set_updated_at();
create trigger trg_restringir_edicao_os before update on public.ordens_servico for each row execute function restringir_edicao_os();
create trigger trg_os_gerar_conta_receber after update on public.ordens_servico for each row execute function gerar_conta_receber_os();
create trigger trg_os_itens_sincronizar_totais after insert or delete or update on public.ordens_servico_itens for each row execute function sincronizar_totais_os_itens();

-- ============================================================ RLS (estado inicial)
alter table public.caixa_movimentacoes enable row level security;
alter table public.categorias_financeiras enable row level security;
alter table public.categorias_produtos enable row level security;
alter table public.clientes enable row level security;
alter table public.configuracoes_fiscais enable row level security;
alter table public.contas_pagar enable row level security;
alter table public.contas_receber enable row level security;
alter table public.equipamentos enable row level security;
alter table public.fornecedores enable row level security;
alter table public.movimentacoes_estoque enable row level security;
alter table public.notas_fiscais_entrada enable row level security;
alter table public.notas_fiscais_entrada_itens enable row level security;
alter table public.notas_fiscais_saida enable row level security;
alter table public.ordens_servico enable row level security;
alter table public.ordens_servico_itens enable row level security;
alter table public.os_anexos enable row level security;
alter table public.permissions enable row level security;
alter table public.produto_kit_itens enable row level security;
alter table public.produtos enable row level security;
alter table public.profiles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.roles enable row level security;
alter table public.servicos enable row level security;
alter table public.unidades_medida enable row level security;
alter table public.user_permissions enable row level security;

create policy authenticated_all on public.caixa_movimentacoes for all to authenticated using (true) with check (true);
create policy authenticated_all on public.categorias_financeiras for all to authenticated using (true) with check (true);
create policy authenticated_all on public.categorias_produtos for all to authenticated using (true) with check (true);
create policy authenticated_all on public.clientes for all to authenticated using (true) with check (true);
create policy authenticated_all on public.configuracoes_fiscais for all to authenticated using (true) with check (true);
create policy authenticated_all on public.contas_pagar for all to authenticated using (true) with check (true);
create policy authenticated_all on public.contas_receber for all to authenticated using (true) with check (true);
create policy authenticated_all on public.equipamentos for all to authenticated using (true) with check (true);
create policy authenticated_all on public.fornecedores for all to authenticated using (true) with check (true);
create policy authenticated_all on public.movimentacoes_estoque for all to authenticated using (true) with check (true);
create policy authenticated_all on public.notas_fiscais_entrada for all to authenticated using (true) with check (true);
create policy authenticated_all on public.notas_fiscais_entrada_itens for all to authenticated using (true) with check (true);
create policy authenticated_all on public.notas_fiscais_saida for all to authenticated using (true) with check (true);
create policy authenticated_all on public.ordens_servico_itens for all to authenticated using (true) with check (true);
create policy authenticated_all on public.os_anexos for all to authenticated using (true) with check (true);
create policy authenticated_all on public.produto_kit_itens for all to authenticated using (true) with check (true);
create policy authenticated_all on public.produtos for all to authenticated using (true) with check (true);
create policy authenticated_all on public.servicos for all to public using (true) with check (true);
create policy authenticated_all on public.unidades_medida for all to authenticated using (true) with check (true);

create policy os_select_all on public.ordens_servico for select to authenticated using (true);
create policy os_insert_permissao on public.ordens_servico for insert to authenticated with check (user_has_permission('os.criar'::text));
create policy os_update_permissao_ou_tecnico on public.ordens_servico for update to authenticated using ((user_has_permission('os.editar'::text) or (tecnico_id = auth.uid())));
create policy os_delete_permissao on public.ordens_servico for delete to authenticated using (user_has_permission('os.excluir'::text));

create policy profiles_select_all on public.profiles for select to authenticated using (true);
create policy profiles_write_admin on public.profiles for update to authenticated using ((user_has_permission('administrativo.usuarios.gerenciar'::text) or (id = auth.uid()))) with check ((user_has_permission('administrativo.usuarios.gerenciar'::text) or (id = auth.uid())));

create policy roles_select_all on public.roles for select to authenticated using (true);
create policy roles_write_admin on public.roles for all to authenticated using (user_has_permission('administrativo.usuarios.gerenciar'::text)) with check (user_has_permission('administrativo.usuarios.gerenciar'::text));

create policy permissions_select_all on public.permissions for select to authenticated using (true);
create policy permissions_write_admin on public.permissions for all to authenticated using (user_has_permission('administrativo.usuarios.gerenciar'::text)) with check (user_has_permission('administrativo.usuarios.gerenciar'::text));

create policy role_permissions_select_all on public.role_permissions for select to authenticated using (true);
create policy role_permissions_write_admin on public.role_permissions for all to authenticated using (user_has_permission('administrativo.usuarios.gerenciar'::text)) with check (user_has_permission('administrativo.usuarios.gerenciar'::text));

create policy user_permissions_select_all on public.user_permissions for select to authenticated using (true);
create policy user_permissions_write_admin on public.user_permissions for all to authenticated using (user_has_permission('administrativo.usuarios.gerenciar'::text)) with check (user_has_permission('administrativo.usuarios.gerenciar'::text));

-- ============================================================ storage
insert into storage.buckets (id, name, public) values ('os-anexos', 'os-anexos', false)
on conflict (id) do nothing;

create policy os_anexos_storage_select on storage.objects for select to authenticated using ((bucket_id = 'os-anexos'::text));
create policy os_anexos_storage_insert on storage.objects for insert to authenticated with check ((bucket_id = 'os-anexos'::text));
create policy os_anexos_storage_delete on storage.objects for delete to authenticated using ((bucket_id = 'os-anexos'::text));
