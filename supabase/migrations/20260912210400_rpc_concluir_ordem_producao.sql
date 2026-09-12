-- Concluir é a operação que fecha o ciclo, e toda ela numa transação só:
-- baixa os componentes pelo consumo real, registra a perda, calcula o custo e
-- dá entrada no produto acabado — com lote ou séries, se ele for rastreado.
--
-- `p_consumos` é opcional: sem ele, o consumo real é o previsto. É o caso
-- comum, e obrigar a redigitar tudo só para dizer "saiu como planejado" seria
-- um convite a não usar a ordem.
create or replace function public.concluir_ordem_producao(
  p_ordem_id uuid,
  p_quantidade_produzida numeric default null,
  p_quantidade_perdida numeric default 0,
  p_consumos jsonb default null,
  p_lote_codigo text default null,
  p_series jsonb default null,
  p_observacao text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_op record;
  v_produto record;
  v_produzida numeric;
  v_perdida numeric;
  v_item record;
  v_consumido numeric;
  v_perdido numeric;
  v_custo_unit numeric;
  v_custo_total numeric := 0;
  v_lote_id uuid;
  v_lote_codigo text;
  v_mov_id uuid;
  v_serie text;
  v_series_qtd int;
begin
  if not public.user_has_permission('producao.gerenciar') then
    raise exception 'Você não tem permissão para concluir ordens de produção.' using errcode = '42501';
  end if;

  select * into v_op from public.ordens_producao where id = p_ordem_id for update;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;
  if v_op.status <> 'em_producao' then
    raise exception 'A ordem #% está % — só uma ordem em produção pode ser concluída.',
      v_op.numero, v_op.status using errcode = '22023';
  end if;

  v_produzida := coalesce(p_quantidade_produzida, v_op.quantidade_planejada);
  v_perdida := coalesce(p_quantidade_perdida, 0);

  if v_produzida < 0 or v_perdida < 0 then
    raise exception 'Quantidade produzida e perdida não podem ser negativas.' using errcode = '22023';
  end if;
  if v_produzida = 0 and v_perdida = 0 then
    raise exception 'Informe quanto foi produzido ou perdido: uma ordem não se conclui sem resultado.'
      using errcode = '22023';
  end if;

  select p.*, coalesce(u.sigla, '') as unidade into v_produto
    from public.produtos p
    left join public.unidades_medida u on u.id = p.unidade_id
   where p.id = v_op.produto_id;

  if v_produto.controle = 'serie' then
    v_series_qtd := coalesce(jsonb_array_length(p_series), 0);
    if v_produzida <> trunc(v_produzida) then
      raise exception '"%" é controlado por série: a quantidade produzida tem que ser inteira.',
        v_produto.nome using errcode = '22023';
    end if;
    if v_series_qtd <> v_produzida then
      raise exception '"%" é controlado por série: informe % número(s) de série (veio %).',
        v_produto.nome, v_produzida, v_series_qtd using errcode = '22023';
    end if;
  end if;

  -- ------------------------------------------------------ consumo real
  for v_item in
    select i.*, p.nome, p.preco_custo
      from public.ordens_producao_itens i
      join public.produtos p on p.id = i.produto_id
     where i.ordem_id = p_ordem_id
  loop
    v_consumido := v_item.quantidade_prevista;
    v_perdido := 0;

    if p_consumos is not null then
      select coalesce((c->>'consumido')::numeric, v_item.quantidade_prevista),
             coalesce((c->>'perdido')::numeric, 0)
        into v_consumido, v_perdido
        from jsonb_array_elements(p_consumos) c
       where (c->>'produto_id')::uuid = v_item.produto_id
       limit 1;

      v_consumido := coalesce(v_consumido, v_item.quantidade_prevista);
      v_perdido := coalesce(v_perdido, 0);
    end if;

    if v_consumido < 0 or v_perdido < 0 then
      raise exception 'Consumo e perda de "%" não podem ser negativos.', v_item.nome
        using errcode = '22023';
    end if;

    -- A perda também sai do estoque e, como é custo de produção, é absorvida
    -- pelas unidades boas.
    v_custo_total := v_custo_total + (v_consumido + v_perdido) * coalesce(v_item.preco_custo, 0);

    if v_consumido > 0 then
      insert into public.movimentacoes_estoque
        (produto_id, tipo, quantidade, origem_tipo, origem_id, observacao, created_by, ficha_tecnica_id)
      values
        (v_item.produto_id, 'saida', v_consumido, 'op_consumo', p_ordem_id,
         'Consumo da OP #' || v_op.numero, auth.uid(), v_op.ficha_id);
    end if;

    if v_perdido > 0 then
      insert into public.movimentacoes_estoque
        (produto_id, tipo, quantidade, origem_tipo, origem_id, observacao, created_by, ficha_tecnica_id)
      values
        (v_item.produto_id, 'saida', v_perdido, 'op_perda', p_ordem_id,
         'Perda na OP #' || v_op.numero, auth.uid(), v_op.ficha_id);
    end if;

    update public.ordens_producao_itens
       set quantidade_consumida = v_consumido,
           quantidade_perdida = v_perdido
     where id = v_item.id;
  end loop;

  -- ------------------------------------------- entrada do produto acabado
  if v_produzida > 0 then
    v_custo_unit := round(v_custo_total / v_produzida, 2);

    if v_produto.controle = 'lote' then
      v_lote_codigo := coalesce(nullif(p_lote_codigo, ''), 'OP ' || v_op.numero);
      insert into public.lotes
        (produto_id, codigo, fabricacao, origem_tipo, origem_id, ordem_producao_id, created_by)
      values
        (v_op.produto_id, v_lote_codigo, current_date, 'op_entrada', p_ordem_id, p_ordem_id, auth.uid())
      on conflict (produto_id, codigo) do update set codigo = excluded.codigo
      returning id into v_lote_id;
    end if;

    insert into public.movimentacoes_estoque
      (produto_id, tipo, quantidade, preco_unitario, origem_tipo, origem_id,
       observacao, created_by, ficha_tecnica_id, lote_id)
    values
      (v_op.produto_id, 'entrada', v_produzida, v_custo_unit, 'op_entrada', p_ordem_id,
       'Produção da OP #' || v_op.numero, auth.uid(), v_op.ficha_id, v_lote_id)
    returning id into v_mov_id;

    if v_produto.controle = 'serie' then
      for v_serie in select jsonb_array_elements_text(p_series)
      loop
        v_serie := trim(v_serie);
        if v_serie = '' then
          raise exception 'Número de série vazio na conclusão da OP #%.', v_op.numero
            using errcode = '22023';
        end if;
        insert into public.numeros_serie
          (produto_id, serie, lote_id, fabricacao, origem_tipo, origem_id,
           ordem_producao_id, movimentacao_entrada_id, created_by)
        values
          (v_op.produto_id, v_serie, v_lote_id, current_date, 'op_entrada', p_ordem_id,
           p_ordem_id, v_mov_id, auth.uid());
      end loop;
    end if;
  end if;

  update public.ordens_producao
     set status = 'concluida',
         quantidade_produzida = v_produzida,
         quantidade_perdida = v_perdida,
         custo_total = round(v_custo_total, 2),
         concluida_em = now(),
         lote_id = v_lote_id,
         observacao = case when nullif(p_observacao, '') is null then observacao
                           else trim(both E'\n' from coalesce(observacao, '') || E'\n' || p_observacao) end
   where id = p_ordem_id;

  return jsonb_build_object(
    'ordem_id', p_ordem_id,
    'numero', v_op.numero,
    'produzida', v_produzida,
    'perdida', v_perdida,
    'custo_total', round(v_custo_total, 2),
    'custo_unitario', v_custo_unit,
    'lote_id', v_lote_id
  );
end;
$function$;

revoke execute on function public.concluir_ordem_producao(uuid, numeric, numeric, jsonb, text, jsonb, text) from anon, public;
grant execute on function public.concluir_ordem_producao(uuid, numeric, numeric, jsonb, text, jsonb, text) to authenticated;
