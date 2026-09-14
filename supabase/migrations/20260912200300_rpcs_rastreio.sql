-- Onde este lote entrou e para onde foi.
create or replace function public.rastrear_lote(p_lote_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_lote jsonb;
  v_movimentos jsonb;
  v_series jsonb;
begin
  if not public.usuario_ativo() then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'id', l.id,
           'codigo', l.codigo,
           'produto_id', p.id,
           'produto', p.nome,
           'unidade', coalesce(u.sigla, ''),
           'fabricacao', l.fabricacao,
           'validade', l.validade,
           'fornecedor', f.nome,
           'origem_tipo', l.origem_tipo,
           'nota', n.numero,
           'saldo', coalesce(s.saldo, 0),
           'criado_em', l.created_at,
           'observacao', l.observacao
         )
    into v_lote
    from public.lotes l
    join public.produtos p on p.id = l.produto_id
    left join public.unidades_medida u on u.id = p.unidade_id
    left join public.fornecedores f on f.id = l.fornecedor_id
    left join public.notas_fiscais_entrada n on n.id = l.origem_id
    left join public.vw_saldo_lotes s on s.lote_id = l.id
   where l.id = p_lote_id;

  if v_lote is null then
    raise exception 'Lote não encontrado.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(linha order by linha->>'quando' desc), '[]'::jsonb)
    into v_movimentos
    from (
      select jsonb_build_object(
               'quando', m.created_at,
               'tipo', m.tipo,
               'quantidade', m.quantidade,
               'origem_tipo', m.origem_tipo,
               'os_numero', o.numero,
               'cliente', c.nome,
               'nota', n.numero,
               'responsavel', pr.nome,
               'observacao', m.observacao
             ) as linha
        from public.movimentacoes_estoque m
        left join public.ordens_servico o on o.id = m.origem_id
          and m.origem_tipo in ('os_baixa', 'os_estorno', 'kit_baixa')
        left join public.clientes c on c.id = o.cliente_id
        left join public.notas_fiscais_entrada n on n.id = m.origem_id
          and m.origem_tipo in ('compra_xml', 'compra_pdf', 'compra_chave')
        left join public.profiles pr on pr.id = m.created_by
       where m.lote_id = p_lote_id
    ) linhas;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ns.id, 'serie', ns.serie, 'status', ns.status, 'cliente', c.nome
         ) order by ns.serie), '[]'::jsonb)
    into v_series
    from public.numeros_serie ns
    left join public.clientes c on c.id = ns.cliente_id
   where ns.lote_id = p_lote_id;

  return jsonb_build_object('lote', v_lote, 'movimentos', v_movimentos, 'series', v_series);
end;
$function$;

revoke execute on function public.rastrear_lote(uuid) from anon, public;
grant execute on function public.rastrear_lote(uuid) to authenticated;

-- A vida de uma unidade: de onde veio, de que lote, para quem foi.
create or replace function public.rastrear_serie(p_serie_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_serie jsonb;
  v_historico jsonb;
begin
  if not public.usuario_ativo() then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'id', ns.id,
           'serie', ns.serie,
           'status', ns.status,
           'produto_id', p.id,
           'produto', p.nome,
           'fabricacao', ns.fabricacao,
           'garantia_ate', ns.garantia_ate,
           'fornecedor', f.nome,
           'cliente', c.nome,
           'cliente_id', c.id,
           'os_numero', o.numero,
           'os_id', o.id,
           'observacao', ns.observacao,
           'lote', case when l.id is null then null else jsonb_build_object(
             'id', l.id, 'codigo', l.codigo, 'validade', l.validade, 'fabricacao', l.fabricacao
           ) end,
           'entrada', case when me.id is null then null else jsonb_build_object(
             'quando', me.created_at, 'origem_tipo', me.origem_tipo, 'observacao', me.observacao
           ) end,
           'saida', case when ms.id is null then null else jsonb_build_object(
             'quando', ms.created_at, 'origem_tipo', ms.origem_tipo, 'observacao', ms.observacao
           ) end
         )
    into v_serie
    from public.numeros_serie ns
    join public.produtos p on p.id = ns.produto_id
    left join public.lotes l on l.id = ns.lote_id
    left join public.fornecedores f on f.id = ns.fornecedor_id
    left join public.clientes c on c.id = ns.cliente_id
    left join public.ordens_servico o on o.id = ns.os_id
    left join public.movimentacoes_estoque me on me.id = ns.movimentacao_entrada_id
    left join public.movimentacoes_estoque ms on ms.id = ns.movimentacao_saida_id
   where ns.id = p_serie_id;

  if v_serie is null then
    raise exception 'Número de série não encontrado.' using errcode = 'P0002';
  end if;

  -- O histórico de status vem da auditoria, que já registra antes e depois.
  select coalesce(jsonb_agg(jsonb_build_object(
           'quando', a.alterado_em,
           'acao', a.acao,
           'quem', pr.nome,
           'mudancas', a.mudancas
         ) order by a.alterado_em desc), '[]'::jsonb)
    into v_historico
    from public.auditoria a
    left join public.profiles pr on pr.id = a.alterado_por
   where a.tabela = 'numeros_serie' and a.registro_id = p_serie_id::text;

  return jsonb_build_object('serie', v_serie, 'historico', v_historico);
end;
$function$;

revoke execute on function public.rastrear_serie(uuid) from anon, public;
grant execute on function public.rastrear_serie(uuid) to authenticated;
