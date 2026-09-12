-- Gera a solicitação a partir do que falta para produzir N do kit.
--
-- Recalcula a explosão no servidor em vez de aceitar a lista que a tela
-- mostrou: entre ver o resultado e clicar o botão, uma OS pode ter reservado o
-- saldo, e a solicitação tem que refletir a falta de agora.
create or replace function public.gerar_solicitacao_de_faltantes(
  p_produto_id uuid,
  p_quantidade numeric,
  p_observacao text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_explosao jsonb;
  v_solicitacao_id uuid;
  v_numero bigint;
  v_itens int;
begin
  if not public.user_has_permission('compras.solicitar') then
    raise exception 'Você não tem permissão para abrir solicitações de compra.' using errcode = '42501';
  end if;

  v_explosao := public.explodir_kit(p_produto_id, p_quantidade);

  if (v_explosao->>'itens_faltando')::int = 0 then
    raise exception 'Nada a comprar: o estoque disponível cobre essa produção.' using errcode = '22023';
  end if;

  insert into public.solicitacoes_compra
    (origem_tipo, origem_id, origem_descricao, observacao, solicitada_por)
  values
    ('explosao_kit', p_produto_id,
     'Produzir ' || trim(to_char(p_quantidade, 'FM999999990.####')) || ' × ' ||
       (v_explosao->>'produto_nome') || ' (ficha v' || (v_explosao->>'ficha_versao') || ')',
     nullif(p_observacao, ''), auth.uid())
  returning id, numero into v_solicitacao_id, v_numero;

  -- `FM` tira o zero à direita: sem ele a observação saía com o jsonb cru
  -- ("Necessário 10.0000, disponível 3.0000").
  insert into public.solicitacoes_compra_itens (solicitacao_id, produto_id, quantidade, observacao)
  select v_solicitacao_id,
         (c->>'id')::uuid,
         (c->>'faltante')::numeric,
         'Necessário ' || trim(to_char((c->>'necessario')::numeric, 'FM999999990.####')) ||
         ', disponível ' || trim(to_char((c->>'disponivel')::numeric, 'FM999999990.####')) ||
         coalesce(' (' || nullif(trim(to_char((c->>'comprometido')::numeric, 'FM999999990.####')), '0')
                  || ' já reservado em OS aberta)', '')
    from jsonb_array_elements(v_explosao->'componentes') c
   where (c->>'faltante')::numeric > 0;

  get diagnostics v_itens = row_count;

  return jsonb_build_object(
    'solicitacao_id', v_solicitacao_id,
    'numero', v_numero,
    'itens', v_itens
  );
end;
$function$;

revoke execute on function public.gerar_solicitacao_de_faltantes(uuid, numeric, text) from anon, public;
grant execute on function public.gerar_solicitacao_de_faltantes(uuid, numeric, text) to authenticated;

-- Cancelar é a única transição de status alcançável hoje; aprovação entra com
-- o módulo de alçadas.
create or replace function public.cancelar_solicitacao_compra(
  p_solicitacao_id uuid,
  p_motivo text default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_status solicitacao_compra_status;
  v_numero bigint;
begin
  if not public.user_has_permission('compras.solicitar') then
    raise exception 'Você não tem permissão para cancelar solicitações de compra.' using errcode = '42501';
  end if;

  select status, numero into v_status, v_numero
    from public.solicitacoes_compra where id = p_solicitacao_id for update;
  if not found then
    raise exception 'Solicitação não encontrada.' using errcode = 'P0002';
  end if;
  if v_status <> 'aberta' then
    raise exception 'A solicitação #% está % e não pode ser cancelada.', v_numero, v_status
      using errcode = '22023';
  end if;

  update public.solicitacoes_compra
     set status = 'cancelada',
         observacao = trim(both E'\n' from coalesce(observacao, '') || E'\n' ||
                           'Cancelada: ' || coalesce(nullif(p_motivo, ''), 'sem motivo informado'))
   where id = p_solicitacao_id;
end;
$function$;

revoke execute on function public.cancelar_solicitacao_compra(uuid, text) from anon, public;
grant execute on function public.cancelar_solicitacao_compra(uuid, text) to authenticated;
