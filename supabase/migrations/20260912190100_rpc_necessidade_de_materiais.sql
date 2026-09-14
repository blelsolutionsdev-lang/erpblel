-- "Produzir 10 unidades do Kit Aquecedor X" → o que é preciso, o que existe, o
-- que já está prometido e o que falta comprar.
--
-- Desce pela ficha em vigor (multinível, com a perda prevista) e agrega nos
-- componentes reais — submontado não é linha de compra, é etapa de montagem.
--
-- A recursão fica num jsonb local: a primeira versão usava tabela temporária e
-- a limpava com `delete from` sem WHERE, que o guard de DELETE sem cláusula
-- recusa para o papel `authenticated` ("DELETE requires a WHERE clause").
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
      join public.produtos pk on pk.id = e.produto_id and pk.tipo = 'kit'
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
   where p.tipo = 'kit'
     and not exists (select 1 from public.fichas_tecnicas f
                      where f.produto_id = p.id and f.status = 'ativa');
  if v_sem_ficha is not null then
    raise exception 'Submontado sem ficha técnica em vigor: %. Defina a ficha antes de explodir.', v_sem_ficha
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
       where p.tipo <> 'kit'
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

revoke execute on function public.necessidade_de_materiais(uuid, numeric) from anon, public;
grant execute on function public.necessidade_de_materiais(uuid, numeric) to authenticated;

comment on function public.necessidade_de_materiais(uuid, numeric) is
  'Necessidade de materiais para produzir N de um kit: desce pela ficha em vigor (multinível, com perda) e devolve necessário, saldo, reservado, disponível e faltante por componente real.';
