-- Hardening 1/4 — funções de segurança, integridade de estoque e baixa de peças da OS.

-- ------------------------------------------------------------------
-- Usuário desativado não é mais "autenticado válido" para o banco: nem
-- permissões, nem leitura das tabelas operacionais (ver migration de RLS).
-- ------------------------------------------------------------------
create or replace function public.usuario_ativo()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo);
$function$;

revoke execute on function public.usuario_ativo() from anon, public;
grant execute on function public.usuario_ativo() to authenticated, service_role;

create or replace function public.user_has_permission(p_chave text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select case
    when not exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo) then false
    else coalesce(
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
    )
  end;
$function$;

revoke execute on function public.user_has_permission(text) from anon, public;
grant execute on function public.user_has_permission(text) to authenticated, service_role;

-- Gatilho interno: nunca deve ser chamável como RPC (advisor 0028/0029).
revoke execute on function public.sincronizar_totais_os_itens() from anon, authenticated, public;

-- ------------------------------------------------------------------
-- Auto-promoção: antes o trigger revertia em silêncio e a UI dizia "salvo".
-- Agora falha alto, com mensagem clara.
-- ------------------------------------------------------------------
create or replace function public.impedir_auto_promocao()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user = 'service_role' or public.user_has_permission('administrativo.usuarios.gerenciar') then
    return new;
  end if;

  if new.role_id is distinct from old.role_id then
    raise exception 'Você não tem permissão para alterar o papel de um usuário.'
      using errcode = '42501';
  end if;

  if new.ativo is distinct from old.ativo then
    raise exception 'Você não tem permissão para ativar/desativar usuários.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- ------------------------------------------------------------------
-- Novo usuário entra como 'tecnico' (menor privilégio), não como 'gerente'.
-- O papel definitivo é atribuído pela Edge Function admin-users logo depois.
-- ------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role_id uuid;
begin
  select id into v_role_id from public.roles where nome = 'tecnico' limit 1;

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

-- ------------------------------------------------------------------
-- A conta a receber da OS é criada pelo trigger em nome de quem concluiu a OS
-- (normalmente um técnico, que não tem 'financeiro.gerenciar'). Com o RLS
-- granular, isso só funciona se a função rodar como definer.
-- ------------------------------------------------------------------
create or replace function public.gerar_conta_receber_os()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
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

revoke execute on function public.gerar_conta_receber_os() from anon, authenticated, public;

-- ------------------------------------------------------------------
-- Estoque: saldo nunca negativo e movimentação de kit sem componentes falha
-- em vez de sumir em silêncio.
-- ------------------------------------------------------------------
create or replace function public.aplicar_movimentacao_estoque()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_delta numeric;
  v_tipo_produto produto_tipo;
  v_nome text;
  v_saldo numeric;
  v_item record;
  v_componentes int := 0;
begin
  select tipo, nome, estoque_atual into v_tipo_produto, v_nome, v_saldo
  from public.produtos where id = new.produto_id;

  if v_tipo_produto = 'kit' then
    -- Kit não mantém estoque próprio: cascade para os componentes.
    for v_item in
      select componente_produto_id, quantidade
      from public.produto_kit_itens
      where kit_produto_id = new.produto_id
    loop
      v_componentes := v_componentes + 1;
      insert into public.movimentacoes_estoque
        (produto_id, tipo, quantidade, preco_unitario, origem_tipo, origem_id, observacao, created_by)
      values
        (v_item.componente_produto_id, new.tipo, v_item.quantidade * new.quantidade, null,
         coalesce(new.origem_tipo, 'kit_baixa'), coalesce(new.origem_id, new.id),
         'Baixa em cascata do kit ' || new.produto_id, new.created_by);
    end loop;

    if v_componentes = 0 then
      raise exception 'O kit "%" não tem componentes cadastrados; movimentação de estoque impossível.', v_nome
        using errcode = '23514';
    end if;

    return new;
  end if;

  v_delta := case new.tipo
    when 'entrada' then new.quantidade
    when 'saida' then -new.quantidade
    when 'ajuste' then new.quantidade
    else 0
  end;

  if v_saldo + v_delta < 0 then
    raise exception 'Estoque insuficiente de "%": saldo % e a movimentação pede %.', v_nome, v_saldo, abs(v_delta)
      using errcode = '23514';
  end if;

  update public.produtos
    set estoque_atual = estoque_atual + v_delta
    where id = new.produto_id;

  return new;
end;
$function$;

-- created_by deixa de depender do client mandar o valor certo.
alter table public.movimentacoes_estoque alter column created_by set default auth.uid();

-- ------------------------------------------------------------------
-- estoque_atual é derivado do razão de movimentações. Escrita direta (o
-- cadastro de produto mandava o valor do formulário de volta e desfazia
-- entradas concorrentes) passa a ser recusada.
-- ------------------------------------------------------------------
create or replace function public.proteger_estoque_atual()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  -- pg_trigger_depth() = 1 significa UPDATE direto do client; a atualização
  -- feita por aplicar_movimentacao_estoque() chega com profundidade maior.
  if new.estoque_atual is distinct from old.estoque_atual and pg_trigger_depth() <= 1 then
    raise exception 'estoque_atual é calculado pelas movimentações de estoque. Use a função ajustar_estoque().'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_proteger_estoque_atual on public.produtos;
create trigger trg_proteger_estoque_atual
  before update on public.produtos
  for each row execute function public.proteger_estoque_atual();

-- Ajuste manual de saldo: única porta de entrada, registrada no razão.
create or replace function public.ajustar_estoque(
  p_produto_id uuid,
  p_novo_saldo numeric,
  p_observacao text default null
) returns numeric language plpgsql security definer set search_path to 'public' as $function$
declare
  v_tipo produto_tipo;
  v_saldo numeric;
  v_delta numeric;
begin
  if not public.user_has_permission('estoque.produtos.gerenciar') then
    raise exception 'Você não tem permissão para ajustar estoque.' using errcode = '42501';
  end if;

  if p_novo_saldo is null or p_novo_saldo < 0 then
    raise exception 'Saldo informado inválido.' using errcode = '22023';
  end if;

  select tipo, estoque_atual into v_tipo, v_saldo from public.produtos where id = p_produto_id;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;

  if v_tipo = 'kit' then
    raise exception 'Kits não têm estoque próprio: ajuste o saldo dos componentes.' using errcode = '22023';
  end if;

  v_delta := p_novo_saldo - v_saldo;
  if v_delta = 0 then
    return v_saldo;
  end if;

  insert into public.movimentacoes_estoque
    (produto_id, tipo, quantidade, origem_tipo, observacao, created_by)
  values
    (p_produto_id, 'ajuste', v_delta, 'ajuste_manual',
     coalesce(p_observacao, 'Ajuste manual de saldo'), auth.uid());

  return p_novo_saldo;
end;
$function$;

revoke execute on function public.ajustar_estoque(uuid, numeric, text) from anon, public;
grant execute on function public.ajustar_estoque(uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------------
-- Peças lançadas na OS agora baixam o estoque quando a OS é concluída.
-- Antes nada baixava: o saldo só subia (entradas de NF-e) e nunca descia.
-- ------------------------------------------------------------------
create or replace function public.baixar_estoque_os()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_item record;
begin
  if new.status <> 'concluida' or old.status is not distinct from 'concluida' then
    return new;
  end if;

  -- Idempotente: se já houve baixa para esta OS, não repete.
  if exists (
    select 1 from public.movimentacoes_estoque
    where origem_tipo = 'os_baixa' and origem_id = new.id
  ) then
    return new;
  end if;

  for v_item in
    select produto_id, sum(quantidade) as quantidade, descricao
    from public.ordens_servico_itens
    where os_id = new.id and tipo = 'peca' and produto_id is not null
    group by produto_id, descricao
  loop
    insert into public.movimentacoes_estoque
      (produto_id, tipo, quantidade, origem_tipo, origem_id, observacao, created_by)
    values
      (v_item.produto_id, 'saida', v_item.quantidade, 'os_baixa', new.id,
       'Peça usada na OS #' || new.numero, auth.uid());
  end loop;

  return new;
end;
$function$;

revoke execute on function public.baixar_estoque_os() from anon, authenticated, public;

drop trigger if exists trg_os_baixar_estoque on public.ordens_servico;
-- Roda antes de gerar a conta a receber para que, faltando peça, a conclusão
-- inteira seja abortada e nenhum título seja emitido.
create trigger trg_os_baixar_estoque
  after update on public.ordens_servico
  for each row execute function public.baixar_estoque_os();
