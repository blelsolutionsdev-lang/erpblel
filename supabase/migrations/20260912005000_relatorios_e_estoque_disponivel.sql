-- Relatórios gerenciais e saldo disponível (físico menos o comprometido em OS
-- abertas). Antes não havia relatório nenhum e duas OS podiam prometer a mesma
-- peça sem ninguém perceber.

-- Peça lançada numa OS ainda aberta já está prometida, mesmo sem ter saído do
-- estoque.
create or replace view public.vw_produtos_estoque
with (security_invoker = on) as
select
  p.id,
  p.nome,
  p.sku,
  p.tipo,
  p.ativo,
  p.estoque_atual,
  p.estoque_minimo,
  p.preco_custo,
  p.preco_venda,
  coalesce(c.comprometido, 0)::numeric as estoque_comprometido,
  (p.estoque_atual - coalesce(c.comprometido, 0))::numeric as estoque_disponivel
from public.produtos p
left join (
  select i.produto_id, sum(i.quantidade) as comprometido
    from public.ordens_servico_itens i
    join public.ordens_servico o on o.id = i.os_id
   where i.tipo = 'peca'
     and i.produto_id is not null
     and o.status in ('aberta', 'orcamento', 'em_andamento', 'aguardando_peca')
   group by i.produto_id
) c on c.produto_id = p.id;

comment on view public.vw_produtos_estoque is
  'Saldo físico x comprometido em OS abertas x disponível de verdade.';

insert into public.permissions (chave, modulo, descricao)
values ('relatorios.ver', 'relatorios', 'Ver relatórios gerenciais (faturamento, margem, produtividade, curva ABC)')
on conflict (chave) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
 cross join public.permissions p
 where r.nome in ('admin', 'gerente')
   and p.chave = 'relatorios.ver'
on conflict do nothing;

create or replace function public.relatorio_faturamento(p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_resultado jsonb;
begin
  if not public.user_has_permission('relatorios.ver') then
    raise exception 'Você não tem permissão para ver relatórios.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate),
    'os_concluidas', (
      select count(*) from public.ordens_servico
       where status = 'concluida' and data_conclusao::date between p_de and p_ate
    ),
    'faturamento', (
      select coalesce(sum(valor_total), 0) from public.ordens_servico
       where status = 'concluida' and data_conclusao::date between p_de and p_ate
    ),
    'valor_pecas', (
      select coalesce(sum(valor_pecas), 0) from public.ordens_servico
       where status = 'concluida' and data_conclusao::date between p_de and p_ate
    ),
    'valor_servicos', (
      select coalesce(sum(valor_servicos), 0) from public.ordens_servico
       where status = 'concluida' and data_conclusao::date between p_de and p_ate
    ),
    -- CMV sai do razão: cada baixa de OS guarda o custo médio do momento.
    'custo_pecas', (
      select coalesce(sum(m.quantidade * coalesce(m.preco_unitario, 0)), 0)
        from public.movimentacoes_estoque m
        join public.ordens_servico o on o.id = m.origem_id
       where m.origem_tipo = 'os_baixa'
         and o.status = 'concluida'
         and o.data_conclusao::date between p_de and p_ate
    ),
    'ticket_medio', (
      select coalesce(round(avg(valor_total), 2), 0) from public.ordens_servico
       where status = 'concluida' and data_conclusao::date between p_de and p_ate
    ),
    'recebido_no_periodo', (
      select coalesce(sum(valor), 0) from public.caixa_movimentacoes
       where tipo = 'entrada' and data_movimento between p_de and p_ate
    ),
    'pago_no_periodo', (
      select coalesce(sum(valor), 0) from public.caixa_movimentacoes
       where tipo = 'saida' and data_movimento between p_de and p_ate
    ),
    'por_mes', (
      select coalesce(jsonb_agg(x order by x->>'mes'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'mes', to_char(date_trunc('month', data_conclusao), 'YYYY-MM'),
                 'total', sum(valor_total),
                 'os', count(*)
               ) as x
          from public.ordens_servico
         where status = 'concluida' and data_conclusao::date between p_de and p_ate
         group by date_trunc('month', data_conclusao)
      ) m
    )
  ) into v_resultado;

  return v_resultado;
end;
$function$;

create or replace function public.relatorio_tecnicos(p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.user_has_permission('relatorios.ver') then
    raise exception 'Você não tem permissão para ver relatórios.' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(x order by (x->>'faturamento')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'tecnico', coalesce(pr.nome, 'Sem técnico'),
                 'tecnico_id', o.tecnico_id,
                 'os_concluidas', count(*),
                 'faturamento', coalesce(sum(o.valor_total), 0),
                 'ticket_medio', coalesce(round(avg(o.valor_total), 2), 0),
                 'horas_medias', coalesce(round(avg(extract(epoch from (o.data_conclusao - o.data_abertura)) / 3600)::numeric, 1), 0),
                 'garantias', count(*) filter (where o.eh_garantia)
               ) as x
          from public.ordens_servico o
          left join public.profiles pr on pr.id = o.tecnico_id
         where o.status = 'concluida'
           and o.data_conclusao::date between p_de and p_ate
         group by o.tecnico_id, pr.nome
      ) t
  );
end;
$function$;

create or replace function public.relatorio_abc_pecas(p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.user_has_permission('relatorios.ver') then
    raise exception 'Você não tem permissão para ver relatórios.' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(x order by (x->>'valor')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'produto', p.nome,
                 'produto_id', p.id,
                 'quantidade', sum(i.quantidade),
                 'valor', sum(i.valor_total),
                 'custo', coalesce(sum(i.quantidade * p.preco_custo), 0),
                 'margem', sum(i.valor_total) - coalesce(sum(i.quantidade * p.preco_custo), 0)
               ) as x
          from public.ordens_servico_itens i
          join public.ordens_servico o on o.id = i.os_id
          join public.produtos p on p.id = i.produto_id
         where i.tipo = 'peca'
           and o.status = 'concluida'
           and o.data_conclusao::date between p_de and p_ate
         group by p.id, p.nome
         limit 100
      ) t
  );
end;
$function$;

create or replace function public.relatorio_contas_aging()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public.user_has_permission('relatorios.ver') and not public.user_has_permission('financeiro.gerenciar') then
    raise exception 'Você não tem permissão para ver relatórios financeiros.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'receber', (
      select jsonb_build_object(
        'a_vencer', coalesce(sum(valor - valor_pago) filter (where data_vencimento >= current_date), 0),
        'ate_30', coalesce(sum(valor - valor_pago) filter (where data_vencimento < current_date and data_vencimento >= current_date - 30), 0),
        'de_31_a_60', coalesce(sum(valor - valor_pago) filter (where data_vencimento < current_date - 30 and data_vencimento >= current_date - 60), 0),
        'acima_60', coalesce(sum(valor - valor_pago) filter (where data_vencimento < current_date - 60), 0)
      ) from public.contas_receber where status in ('pendente', 'atrasado')
    ),
    'pagar', (
      select jsonb_build_object(
        'a_vencer', coalesce(sum(valor - valor_pago) filter (where data_vencimento >= current_date), 0),
        'ate_30', coalesce(sum(valor - valor_pago) filter (where data_vencimento < current_date and data_vencimento >= current_date - 30), 0),
        'de_31_a_60', coalesce(sum(valor - valor_pago) filter (where data_vencimento < current_date - 30 and data_vencimento >= current_date - 60), 0),
        'acima_60', coalesce(sum(valor - valor_pago) filter (where data_vencimento < current_date - 60), 0)
      ) from public.contas_pagar where status in ('pendente', 'atrasado')
    )
  );
end;
$function$;

revoke execute on function public.relatorio_faturamento(date, date) from anon, public;
revoke execute on function public.relatorio_tecnicos(date, date) from anon, public;
revoke execute on function public.relatorio_abc_pecas(date, date) from anon, public;
revoke execute on function public.relatorio_contas_aging() from anon, public;

grant execute on function public.relatorio_faturamento(date, date) to authenticated;
grant execute on function public.relatorio_tecnicos(date, date) to authenticated;
grant execute on function public.relatorio_abc_pecas(date, date) to authenticated;
grant execute on function public.relatorio_contas_aging() to authenticated;
