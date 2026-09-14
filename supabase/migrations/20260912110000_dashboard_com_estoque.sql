-- O dashboard dizia quantos produtos estavam abaixo do mínimo, mas não quais —
-- o número sozinho não dá para agir. Passa a trazer a lista de reposição, o
-- valor imobilizado e as últimas movimentações.
create or replace function public.resumo_dashboard()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_ver_financeiro boolean := public.user_has_permission('financeiro.gerenciar');
  -- O valor imobilizado é informação de custo: fica com quem já vê dinheiro.
  v_ver_valor boolean := v_ver_financeiro or public.user_has_permission('relatorios.ver');
  v_resultado jsonb;
begin
  if not public.usuario_ativo() then
    raise exception 'Usuário inativo.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_produtos', (select count(*) from public.produtos where ativo),
    'produtos_abaixo_minimo', (
      select count(*) from public.produtos
      where ativo and tipo = 'simples' and estoque_minimo > 0 and estoque_atual < estoque_minimo
    ),
    'produtos_sem_saldo', (
      select count(*) from public.produtos
      where ativo and tipo = 'simples' and estoque_atual <= 0
    ),
    'os_abertas', (
      select count(*) from public.ordens_servico
      where status in ('aberta', 'orcamento', 'em_andamento', 'aguardando_peca')
    ),
    'ver_financeiro', v_ver_financeiro,
    'ver_valor_estoque', v_ver_valor,
    'valor_estoque', case when v_ver_valor then (
      select coalesce(sum(estoque_atual * preco_custo), 0)
        from public.produtos where ativo and tipo = 'simples'
    ) else null end,
    'total_receber', case when v_ver_financeiro then (
      select coalesce(sum(valor - valor_pago), 0) from public.contas_receber
       where status in ('pendente', 'atrasado')
    ) else null end,
    'total_pagar', case when v_ver_financeiro then (
      select coalesce(sum(valor - valor_pago), 0) from public.contas_pagar
       where status in ('pendente', 'atrasado')
    ) else null end,
    -- Produtos que pedem compra: abaixo do mínimo, sem saldo, ou já prometidos
    -- em OS aberta além do que existe fisicamente.
    'reposicao', (
      select coalesce(jsonb_agg(x order by (x->>'falta')::numeric desc), '[]'::jsonb)
        from (
          select jsonb_build_object(
                   'id', v.id,
                   'nome', v.nome,
                   'unidade', coalesce(u.sigla, ''),
                   'saldo', v.estoque_atual,
                   'minimo', v.estoque_minimo,
                   'comprometido', v.estoque_comprometido,
                   'disponivel', v.estoque_disponivel,
                   'falta', greatest(v.estoque_minimo - v.estoque_disponivel, 0)
                 ) as x
            from public.vw_produtos_estoque v
            left join public.produtos p on p.id = v.id
            left join public.unidades_medida u on u.id = p.unidade_id
           where v.ativo
             and v.tipo = 'simples'
             and (
               (v.estoque_minimo > 0 and v.estoque_disponivel < v.estoque_minimo)
               or v.estoque_disponivel <= 0
             )
           limit 8
        ) t
    ),
    'ultimas_movimentacoes', (
      select coalesce(jsonb_agg(x order by x->>'quando' desc), '[]'::jsonb)
        from (
          select jsonb_build_object(
                   'quando', m.created_at,
                   'produto', p.nome,
                   'tipo', m.tipo,
                   'quantidade', m.quantidade,
                   'origem', coalesce(m.origem_tipo, '')
                 ) as x
            from public.movimentacoes_estoque m
            join public.produtos p on p.id = m.produto_id
           order by m.created_at desc
           limit 5
        ) t
    )
  ) into v_resultado;

  return v_resultado;
end;
$function$;
