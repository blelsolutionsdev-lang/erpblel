-- Agregações que estavam sendo feitas no navegador.

-- A tela de categorias baixava a tabela de produtos inteira só para contar
-- quantos havia em cada uma.
create or replace function public.contagem_produtos_por_categoria()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.usuario_ativo() then
    raise exception 'Usuário inativo.' using errcode = '42501';
  end if;

  return coalesce(
    (select jsonb_object_agg(categoria_id::text, total)
       from (
         select categoria_id, count(*) as total
           from public.produtos
          where categoria_id is not null
          group by categoria_id
       ) t),
    '{}'::jsonb
  );
end;
$function$;

-- A tela de caixa consultava o mesmo período duas vezes: uma paginada para a
-- lista e outra sem limite só para somar.
create or replace function public.totais_caixa(p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.user_has_permission('financeiro.gerenciar') then
    raise exception 'Você não tem permissão para ver o caixa.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'entradas', coalesce(sum(valor) filter (where tipo = 'entrada'), 0),
      'saidas', coalesce(sum(valor) filter (where tipo = 'saida'), 0),
      'saldo', coalesce(sum(valor) filter (where tipo = 'entrada'), 0)
                - coalesce(sum(valor) filter (where tipo = 'saida'), 0)
    )
    from public.caixa_movimentacoes
    where data_movimento between p_de and p_ate
  );
end;
$function$;

revoke execute on function public.contagem_produtos_por_categoria() from anon, public;
revoke execute on function public.totais_caixa(date, date) from anon, public;

grant execute on function public.contagem_produtos_por_categoria() to authenticated;
grant execute on function public.totais_caixa(date, date) to authenticated;
