-- Abrir a ordem congela a versão da ficha e explode o previsto item a item.
create or replace function public.abrir_ordem_producao(
  p_produto_id uuid,
  p_quantidade numeric,
  p_data_prevista date default null,
  p_responsavel_id uuid default null,
  p_observacao text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_tipo produto_tipo;
  v_modo kit_modo;
  v_nome text;
  v_ficha uuid;
  v_versao integer;
  v_necessidade jsonb;
  v_ordem_id uuid;
  v_numero bigint;
  v_itens int;
begin
  if not public.user_has_permission('producao.gerenciar') then
    raise exception 'Você não tem permissão para abrir ordens de produção.' using errcode = '42501';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Informe uma quantidade maior que zero.' using errcode = '22023';
  end if;

  select tipo, kit_modo, nome into v_tipo, v_modo, v_nome
    from public.produtos where id = p_produto_id;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;
  if v_tipo <> 'kit' then
    raise exception '"%" é um produto simples: não há o que montar.', v_nome using errcode = '22023';
  end if;
  if v_modo <> 'producao' then
    raise exception '"%" está marcado como kit fantasma: ele baixa os componentes direto no consumo e não passa por ordem de produção. Mude para "montado por ordem" no cadastro.', v_nome
      using errcode = '22023';
  end if;

  select id, versao into v_ficha, v_versao
    from public.fichas_tecnicas
   where produto_id = p_produto_id and status = 'ativa';
  if v_ficha is null then
    raise exception 'O kit "%" não tem ficha técnica em vigor.', v_nome using errcode = '22023';
  end if;

  v_necessidade := public.necessidade_de_materiais(p_produto_id, p_quantidade);

  insert into public.ordens_producao
    (produto_id, ficha_id, quantidade_planejada, data_prevista, responsavel_id, observacao, created_by)
  values
    (p_produto_id, v_ficha, p_quantidade, p_data_prevista,
     coalesce(p_responsavel_id, auth.uid()), nullif(p_observacao, ''), auth.uid())
  returning id, numero into v_ordem_id, v_numero;

  insert into public.ordens_producao_itens (ordem_id, produto_id, quantidade_prevista)
  select v_ordem_id, (c->>'id')::uuid, (c->>'necessario')::numeric
    from jsonb_array_elements(v_necessidade->'componentes') c;

  get diagnostics v_itens = row_count;

  if v_itens = 0 then
    raise exception 'A ficha de "%" não rendeu nenhum componente.', v_nome using errcode = '22023';
  end if;

  return jsonb_build_object(
    'ordem_id', v_ordem_id,
    'numero', v_numero,
    'ficha_versao', v_versao,
    'itens', v_itens,
    'itens_faltando', (v_necessidade->>'itens_faltando')::int
  );
end;
$function$;

revoke execute on function public.abrir_ordem_producao(uuid, numeric, date, uuid, text) from anon, public;
grant execute on function public.abrir_ordem_producao(uuid, numeric, date, uuid, text) to authenticated;

create or replace function public.iniciar_ordem_producao(p_ordem_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_status ordem_producao_status;
  v_numero bigint;
begin
  if not public.user_has_permission('producao.gerenciar') then
    raise exception 'Você não tem permissão para iniciar ordens de produção.' using errcode = '42501';
  end if;

  select status, numero into v_status, v_numero
    from public.ordens_producao where id = p_ordem_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;
  if v_status <> 'planejada' then
    raise exception 'A ordem #% está % e não pode ser iniciada.', v_numero, v_status
      using errcode = '22023';
  end if;

  update public.ordens_producao
     set status = 'em_producao', iniciada_em = now()
   where id = p_ordem_id;
end;
$function$;

revoke execute on function public.iniciar_ordem_producao(uuid) from anon, public;
grant execute on function public.iniciar_ordem_producao(uuid) to authenticated;

create or replace function public.cancelar_ordem_producao(
  p_ordem_id uuid,
  p_motivo text default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_status ordem_producao_status;
  v_numero bigint;
begin
  if not public.user_has_permission('producao.gerenciar') then
    raise exception 'Você não tem permissão para cancelar ordens de produção.' using errcode = '42501';
  end if;

  select status, numero into v_status, v_numero
    from public.ordens_producao where id = p_ordem_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;
  if v_status = 'concluida' then
    raise exception 'A ordem #% já foi concluída: o consumo está no razão de estoque e não se desfaz por cancelamento.', v_numero
      using errcode = '22023';
  end if;
  if v_status = 'cancelada' then
    raise exception 'A ordem #% já está cancelada.', v_numero using errcode = '22023';
  end if;

  update public.ordens_producao
     set status = 'cancelada',
         observacao = trim(both E'\n' from coalesce(observacao, '') || E'\n' ||
                           'Cancelada: ' || coalesce(nullif(p_motivo, ''), 'sem motivo informado'))
   where id = p_ordem_id;
end;
$function$;

revoke execute on function public.cancelar_ordem_producao(uuid, text) from anon, public;
grant execute on function public.cancelar_ordem_producao(uuid, text) to authenticated;
