-- Definir o mínimo produto a produto, abrindo o diálogo de cada um, não escala:
-- o catálogo cresce sozinho a cada NF-e e os produtos nascem com mínimo zero.
create or replace function public.definir_estoque_minimo(p_itens jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  v_item jsonb;
  v_minimo numeric;
  v_id uuid;
  v_alterados int := 0;
begin
  if not public.user_has_permission('estoque.produtos.gerenciar') then
    raise exception 'Você não tem permissão para alterar produtos.' using errcode = '42501';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    return 0;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_id := nullif(v_item->>'produto_id', '')::uuid;
    v_minimo := coalesce(nullif(v_item->>'estoque_minimo', '')::numeric, 0);

    if v_id is null then
      continue;
    end if;
    if v_minimo < 0 then
      raise exception 'Estoque mínimo não pode ser negativo.' using errcode = '22023';
    end if;

    update public.produtos
       set estoque_minimo = v_minimo
     where id = v_id
       and tipo = 'simples'
       and estoque_minimo is distinct from v_minimo;

    if found then
      v_alterados := v_alterados + 1;
    end if;
  end loop;

  return v_alterados;
end;
$function$;

-- Consumo real de cada produto, para o mínimo ser decidido com base no que
-- saiu de verdade em vez de chute.
create or replace function public.consumo_produtos(p_dias integer default 90)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_dias integer := greatest(coalesce(p_dias, 90), 1);
begin
  if not public.usuario_ativo() then
    raise exception 'Usuário inativo.' using errcode = '42501';
  end if;

  return coalesce(
    (select jsonb_object_agg(produto_id::text, jsonb_build_object(
       'saidas', total,
       'media_mensal', round(total * 30.0 / v_dias, 2),
       -- Sugestão: cobrir um mês de consumo, sempre pelo menos 1 unidade.
       'sugestao', greatest(ceil(total * 30.0 / v_dias), 1)
     ))
     from (
       select m.produto_id, sum(m.quantidade) as total
         from public.movimentacoes_estoque m
        where m.tipo = 'saida'
          and m.created_at >= now() - make_interval(days => v_dias)
        group by m.produto_id
     ) t),
    '{}'::jsonb
  );
end;
$function$;

revoke execute on function public.definir_estoque_minimo(jsonb) from anon, public;
revoke execute on function public.consumo_produtos(integer) from anon, public;

grant execute on function public.definir_estoque_minimo(jsonb) to authenticated;
grant execute on function public.consumo_produtos(integer) to authenticated;
