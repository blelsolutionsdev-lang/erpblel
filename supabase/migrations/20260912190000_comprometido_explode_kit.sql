-- O comprometido agrupava os itens de OS por `produto_id`. Quando o item era um
-- kit, a reserva ficava lançada no kit — que não tem saldo próprio — e os
-- componentes seguiam aparecendo integralmente disponíveis. Quem olhasse o
-- componente não via que ele já estava prometido.
--
-- Agora a necessidade desce pela ficha em vigor, com a perda prevista, até os
-- componentes reais.
create or replace view public.vw_produtos_estoque as
with recursive demanda_os as (
  select i.produto_id, sum(i.quantidade) as qtd, 0 as nivel
    from public.ordens_servico_itens i
    join public.ordens_servico o on o.id = i.os_id
   where i.tipo = 'peca'
     and i.produto_id is not null
     and o.status = any (array['aberta','orcamento','em_andamento','aguardando_peca']::os_status[])
   group by i.produto_id
),
explosao as (
  select produto_id, qtd, nivel from demanda_os
  union all
  select fi.componente_produto_id,
         e.qtd * fi.quantidade * (1 + fi.perda_percentual / 100),
         e.nivel + 1
    from explosao e
    join public.produtos pk on pk.id = e.produto_id and pk.tipo = 'kit'
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

-- `create or replace view` não preserva as opções da view: sem isto ela volta
-- ao padrão do Postgres (security definer) e passa a ler ignorando a RLS de
-- quem consulta.
alter view public.vw_produtos_estoque set (security_invoker = true);

comment on view public.vw_produtos_estoque is
  'Saldo por produto com a reserva das OS abertas já explodida pela ficha técnica em vigor (inclusive submontados).';
