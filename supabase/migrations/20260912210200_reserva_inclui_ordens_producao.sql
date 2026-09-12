-- A reserva passa a contar também o que as ordens de produção abertas ainda vão
-- consumir. Sem isso, abrir uma OP não segurava nada: a peça seguia aparecendo
-- disponível e podia ser prometida de novo numa OS.
--
-- A explosão também para no kit de produção: ele tem saldo próprio, então é
-- item de estoque como qualquer outro, não uma etapa a descer.
create or replace view public.vw_produtos_estoque as
with recursive demanda as (
  -- Peças prometidas em OS aberta.
  select i.produto_id, sum(i.quantidade) as qtd, 0 as nivel
    from public.ordens_servico_itens i
    join public.ordens_servico o on o.id = i.os_id
   where i.tipo = 'peca'
     and i.produto_id is not null
     and o.status = any (array['aberta','orcamento','em_andamento','aguardando_peca']::os_status[])
   group by i.produto_id
  union all
  -- Componentes que uma ordem de produção aberta ainda vai consumir.
  select oi.produto_id,
         sum(greatest(oi.quantidade_prevista - oi.quantidade_consumida, 0)),
         0
    from public.ordens_producao_itens oi
    join public.ordens_producao op on op.id = oi.ordem_id
   where op.status in ('planejada', 'em_producao')
   group by oi.produto_id
),
explosao as (
  select produto_id, qtd, nivel from demanda
  union all
  select fi.componente_produto_id,
         e.qtd * fi.quantidade * (1 + fi.perda_percentual / 100),
         e.nivel + 1
    from explosao e
    join public.produtos pk on pk.id = e.produto_id
     and pk.tipo = 'kit' and pk.kit_modo = 'fantasma'
    join public.fichas_tecnicas f on f.produto_id = pk.id and f.status = 'ativa'
    join public.fichas_tecnicas_itens fi on fi.ficha_id = f.id
   where e.nivel < 20
),
comprometido as (
  select produto_id, sum(qtd) as comprometido
    from explosao
   group by produto_id
)
select p.id,
       p.nome,
       p.sku,
       p.tipo,
       p.ativo,
       p.estoque_atual,
       p.estoque_minimo,
       p.preco_custo,
       p.preco_venda,
       coalesce(c.comprometido, 0::numeric) as estoque_comprometido,
       p.estoque_atual - coalesce(c.comprometido, 0::numeric) as estoque_disponivel
  from public.produtos p
  left join comprometido c on c.produto_id = p.id;

alter view public.vw_produtos_estoque set (security_invoker = true);

comment on view public.vw_produtos_estoque is
  'Saldo por produto com a reserva já explodida pela ficha em vigor: peças de OS aberta e componentes de ordem de produção aberta.';

-- A necessidade de materiais para no kit de produção: ele tem saldo próprio,
-- então é linha de estoque (e possivelmente de compra), não etapa de montagem.
create or replace function public.necessidade_de_materiais(
  p_produto_id uuid,
  p_quantidade numeric default 1
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_tipo produto_tipo;
  v_nome text;
  v_ficha uuid;
  v_versao integer;
  v_custo numeric;
  v_bruto jsonb;
  v_sem_ficha text;
  v_componentes jsonb;
begin
  if not public.usuario_ativo() then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Informe uma quantidade maior que zero.' using errcode = '22023';
  end if;

  select tipo, nome into v_tipo, v_nome from public.produtos where id = p_produto_id;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;
  if v_tipo <> 'kit' then
    raise exception '"%" é um produto simples: não há ficha técnica para explodir.', v_nome
      using errcode = '22023';
  end if;

  select id, versao, custo_calculado into v_ficha, v_versao, v_custo
    from public.fichas_tecnicas
   where produto_id = p_produto_id and status = 'ativa';
  if v_ficha is null then
    raise exception 'O kit "%" não tem ficha técnica em vigor.', v_nome using errcode = '22023';
  end if;

  with recursive explosao as (
    select fi.componente_produto_id as produto_id,
           p_quantidade * fi.quantidade * (1 + fi.perda_percentual / 100) as qtd,
           1 as nivel
      from public.fichas_tecnicas_itens fi
     where fi.ficha_id = v_ficha
    union all
    select fi.componente_produto_id,
           e.qtd * fi.quantidade * (1 + fi.perda_percentual / 100),
           e.nivel + 1
      from explosao e
      join public.produtos pk on pk.id = e.produto_id
       and pk.tipo = 'kit' and pk.kit_modo = 'fantasma'
      join public.fichas_tecnicas f on f.produto_id = pk.id and f.status = 'ativa'
      join public.fichas_tecnicas_itens fi on fi.ficha_id = f.id
     where e.nivel < 20
  )
  select coalesce(jsonb_agg(jsonb_build_object('produto_id', produto_id, 'qtd', qtd, 'nivel', nivel)), '[]'::jsonb)
    into v_bruto
    from explosao;

  -- Submontado sem ficha em vigor não explodiria e a necessidade sairia
  -- subestimada: é melhor recusar do que devolver conta errada.
  select string_agg(distinct p.nome, ', ')
    into v_sem_ficha
    from jsonb_to_recordset(v_bruto) as e(produto_id uuid, qtd numeric, nivel int)
    join public.produtos p on p.id = e.produto_id
   where p.tipo = 'kit' and p.kit_modo = 'fantasma'
     and not exists (select 1 from public.fichas_tecnicas f
                      where f.produto_id = p.id and f.status = 'ativa');
  if v_sem_ficha is not null then
    raise exception 'Submontado sem ficha técnica em vigor: %. Defina a ficha antes de calcular.', v_sem_ficha
      using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(linha order by linha->>'nome'), '[]'::jsonb)
    into v_componentes
    from (
      select jsonb_build_object(
               'id', p.id,
               'nome', p.nome,
               'sku', p.sku,
               'unidade', coalesce(u.sigla, ''),
               'nivel', min(e.nivel),
               'necessario', round(sum(e.qtd), 4),
               'estoque', round(coalesce(v.estoque_atual, 0), 4),
               'comprometido', round(coalesce(v.estoque_comprometido, 0), 4),
               'disponivel', round(coalesce(v.estoque_disponivel, 0), 4),
               'faltante', round(greatest(sum(e.qtd) - coalesce(v.estoque_disponivel, 0), 0), 4),
               'custo_unitario', p.preco_custo,
               'custo_total', round(sum(e.qtd) * p.preco_custo, 2)
             ) as linha
        from jsonb_to_recordset(v_bruto) as e(produto_id uuid, qtd numeric, nivel int)
        join public.produtos p on p.id = e.produto_id
        left join public.unidades_medida u on u.id = p.unidade_id
        left join public.vw_produtos_estoque v on v.id = p.id
       where not (p.tipo = 'kit' and p.kit_modo = 'fantasma')
       group by p.id, p.nome, p.sku, u.sigla, p.preco_custo,
                v.estoque_atual, v.estoque_comprometido, v.estoque_disponivel
    ) linhas;

  return jsonb_build_object(
    'produto_id', p_produto_id,
    'produto_nome', v_nome,
    'quantidade', p_quantidade,
    'ficha_id', v_ficha,
    'ficha_versao', v_versao,
    'custo_unitario_ficha', v_custo,
    'componentes', v_componentes,
    'itens_faltando', (select count(*) from jsonb_array_elements(v_componentes) c
                        where (c->>'faltante')::numeric > 0),
    'custo_total', (select coalesce(round(sum((c->>'custo_total')::numeric), 2), 0)
                      from jsonb_array_elements(v_componentes) c)
  );
end;
$function$;

