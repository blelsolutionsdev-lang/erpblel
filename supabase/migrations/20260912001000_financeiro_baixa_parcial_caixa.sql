-- Financeiro: baixa parcial, juros/desconto, lançamento automático no caixa e
-- marcação diária de títulos vencidos.
--
-- Antes: só existia "marcar como pago" pelo valor cheio; o status 'atrasado'
-- nunca era atribuído (não havia job) e a tabela caixa_movimentacoes existia
-- sem receber lançamento nenhum.

alter table public.contas_receber
  add column if not exists valor_pago numeric(14,2) not null default 0,
  add column if not exists juros numeric(14,2) not null default 0,
  add column if not exists desconto numeric(14,2) not null default 0;

alter table public.contas_pagar
  add column if not exists valor_pago numeric(14,2) not null default 0,
  add column if not exists juros numeric(14,2) not null default 0,
  add column if not exists desconto numeric(14,2) not null default 0;

update public.contas_receber set valor_pago = valor where status = 'pago' and valor_pago = 0;
update public.contas_pagar set valor_pago = valor where status = 'pago' and valor_pago = 0;

create index if not exists idx_contas_receber_vencimento_status on public.contas_receber (status, data_vencimento);
create index if not exists idx_contas_pagar_vencimento_status on public.contas_pagar (status, data_vencimento);

create or replace function public.baixar_titulo(
  p_tipo text,
  p_titulo_id uuid,
  p_valor numeric,
  p_data date default current_date,
  p_forma_pagamento text default null,
  p_juros numeric default 0,
  p_desconto numeric default 0
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_valor numeric;
  v_pago numeric;
  v_saldo numeric;
  v_novo_pago numeric;
  v_status titulo_status;
  v_desc text;
begin
  if not public.user_has_permission('financeiro.gerenciar') then
    raise exception 'Você não tem permissão para baixar títulos.' using errcode = '42501';
  end if;

  if p_tipo not in ('receber', 'pagar') then
    raise exception 'Tipo de título inválido.' using errcode = '22023';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = '22023';
  end if;

  if p_tipo = 'receber' then
    select valor, valor_pago, descricao into v_valor, v_pago, v_desc
    from public.contas_receber where id = p_titulo_id for update;
  else
    select valor, valor_pago, descricao into v_valor, v_pago, v_desc
    from public.contas_pagar where id = p_titulo_id for update;
  end if;

  if v_valor is null then
    raise exception 'Título não encontrado.' using errcode = 'P0002';
  end if;

  v_saldo := v_valor - v_pago + coalesce(p_juros, 0) - coalesce(p_desconto, 0);
  if p_valor > v_saldo + 0.005 then
    raise exception 'Valor maior que o saldo em aberto (%).', v_saldo using errcode = '22023';
  end if;

  v_novo_pago := v_pago + p_valor;
  -- Baixa parcial mantém o título em aberto; só quita quando fecha o saldo.
  v_status := case when v_novo_pago >= v_valor + coalesce(p_juros,0) - coalesce(p_desconto,0) - 0.005
                   then 'pago'::titulo_status else 'pendente'::titulo_status end;

  if p_tipo = 'receber' then
    update public.contas_receber
       set valor_pago = v_novo_pago,
           juros = juros + coalesce(p_juros, 0),
           desconto = desconto + coalesce(p_desconto, 0),
           status = v_status,
           data_recebimento = case when v_status = 'pago' then p_data else data_recebimento end,
           forma_pagamento = coalesce(p_forma_pagamento, forma_pagamento)
     where id = p_titulo_id;

    insert into public.caixa_movimentacoes
      (tipo, valor, data_movimento, descricao, conta_receber_id, forma_pagamento, created_by)
    values ('entrada', p_valor, p_data, 'Recebimento: ' || v_desc, p_titulo_id, p_forma_pagamento, auth.uid());
  else
    update public.contas_pagar
       set valor_pago = v_novo_pago,
           juros = juros + coalesce(p_juros, 0),
           desconto = desconto + coalesce(p_desconto, 0),
           status = v_status,
           data_pagamento = case when v_status = 'pago' then p_data else data_pagamento end,
           forma_pagamento = coalesce(p_forma_pagamento, forma_pagamento)
     where id = p_titulo_id;

    insert into public.caixa_movimentacoes
      (tipo, valor, data_movimento, descricao, conta_pagar_id, forma_pagamento, created_by)
    values ('saida', p_valor, p_data, 'Pagamento: ' || v_desc, p_titulo_id, p_forma_pagamento, auth.uid());
  end if;

  return jsonb_build_object('valor_pago', v_novo_pago, 'status', v_status, 'saldo', v_saldo - p_valor);
end;
$function$;

revoke execute on function public.baixar_titulo(text, uuid, numeric, date, text, numeric, numeric) from anon, public;
grant execute on function public.baixar_titulo(text, uuid, numeric, date, text, numeric, numeric) to authenticated;

create or replace function public.marcar_titulos_atrasados()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_receber int;
  v_pagar int;
begin
  with atualizadas as (
    update public.contas_receber
       set status = 'atrasado'
     where status = 'pendente' and data_vencimento < current_date
    returning 1
  ) select count(*) into v_receber from atualizadas;

  with atualizadas as (
    update public.contas_pagar
       set status = 'atrasado'
     where status = 'pendente' and data_vencimento < current_date
    returning 1
  ) select count(*) into v_pagar from atualizadas;

  -- Título atrasado que recebeu prorrogação de vencimento volta a ser pendente.
  update public.contas_receber set status = 'pendente'
   where status = 'atrasado' and data_vencimento >= current_date;
  update public.contas_pagar set status = 'pendente'
   where status = 'atrasado' and data_vencimento >= current_date;

  return jsonb_build_object('contas_receber', v_receber, 'contas_pagar', v_pagar);
end;
$function$;

-- Roda só pelo cron/service_role: não há motivo para um usuário logado
-- disparar o job pela API REST.
revoke execute on function public.marcar_titulos_atrasados() from anon, authenticated, public;
grant execute on function public.marcar_titulos_atrasados() to service_role;

-- Job diário: sem ele o status 'atrasado' nunca acontecia.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'marcar-titulos-atrasados',
  '5 3 * * *',
  $$select public.marcar_titulos_atrasados();$$
);
