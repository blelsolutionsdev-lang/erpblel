-- A entrada de NF-e passa a alimentar o rastreio.
--
-- Para produto com controle de lote, o lote da compra é a própria nota: é o
-- que entrou junto e vai sair junto. Sem isso, marcar um produto como
-- "controlado por lote" quebraria a entrada de NF-e, que é hoje a única porta
-- de entrada de estoque.
--
-- Para produto com controle de série, as séries têm que vir no item: inventar
-- número de série seria pior do que recusar.
create or replace function public.registrar_entrada_nfe(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_fornecedor_id uuid;
  v_nota_id uuid;
  v_cnpj text;
  v_chave text;
  v_origem text := coalesce(p_payload->>'origem_tipo', 'compra_xml');
  v_venc date;
  v_valor_total numeric;
  v_item jsonb;
  v_produto_id uuid;
  v_unidade_id uuid;
  v_ean text;
  v_codigo text;
  v_qtd numeric;
  v_vunit numeric;
  v_criados int := 0;
  v_vinculos int := 0;
  v_controle controle_rastreio;
  v_nome_produto text;
  v_lote_id uuid;
  v_lote_codigo text;
  v_mov_id uuid;
  v_series jsonb;
  v_serie text;
  v_lotes int := 0;
  v_series_criadas int := 0;
begin
  if not public.user_has_permission('estoque.entradas.processar') then
    raise exception 'Você não tem permissão para dar entrada de NF-e.' using errcode = '42501';
  end if;

  if p_payload->'itens' is null or jsonb_array_length(p_payload->'itens') = 0 then
    raise exception 'A NF-e não tem itens para lançar.' using errcode = '22023';
  end if;

  v_chave := nullif(regexp_replace(coalesce(p_payload->>'chave_acesso', ''), '\D', '', 'g'), '');
  if v_chave is not null and exists (select 1 from public.notas_fiscais_entrada n where n.chave_acesso = v_chave) then
    raise exception 'Esta NF-e (chave %) já foi lançada no estoque.', v_chave using errcode = '23505';
  end if;

  v_valor_total := nullif(p_payload->>'valor_total', '')::numeric;
  v_venc := coalesce(nullif(p_payload->>'data_vencimento', '')::date, current_date + 30);

  v_cnpj := nullif(regexp_replace(coalesce(p_payload->>'fornecedor_cnpj', ''), '\D', '', 'g'), '');
  if v_cnpj is not null then
    select id into v_fornecedor_id from public.fornecedores where cpf_cnpj = v_cnpj;
    if v_fornecedor_id is null then
      insert into public.fornecedores (nome, cpf_cnpj, tipo_pessoa)
      values (coalesce(nullif(p_payload->>'fornecedor_nome', ''), 'Fornecedor sem nome'), v_cnpj,
              case when length(v_cnpj) = 11 then 'PF'::pessoa_tipo else 'PJ'::pessoa_tipo end)
      returning id into v_fornecedor_id;
    end if;
  end if;

  insert into public.notas_fiscais_entrada
    (chave_acesso, numero, serie, fornecedor_id, data_emissao, valor_total, xml_original, status, processed_at)
  values
    (v_chave,
     nullif(p_payload->>'numero', ''),
     nullif(p_payload->>'serie', ''),
     v_fornecedor_id,
     nullif(p_payload->>'data_emissao', '')::timestamptz,
     v_valor_total,
     nullif(p_payload->>'xml_original', ''),
     'processada',
     now())
  returning id into v_nota_id;

  for v_item in select * from jsonb_array_elements(p_payload->'itens')
  loop
    v_qtd := coalesce(nullif(v_item->>'quantidade', '')::numeric, 0);
    v_vunit := coalesce(nullif(v_item->>'valor_unitario', '')::numeric, 0);
    v_codigo := nullif(v_item->>'codigo_produto_fornecedor', '');

    if v_qtd <= 0 then
      raise exception 'Item "%" veio com quantidade inválida (%).', coalesce(v_item->>'descricao', '?'), v_qtd
        using errcode = '22023';
    end if;

    v_produto_id := nullif(v_item->>'produto_id', '')::uuid;

    if v_produto_id is null then
      select id into v_unidade_id from public.unidades_medida
       where lower(sigla) = lower(coalesce(v_item->>'unidade', '')) limit 1;
      if v_unidade_id is null then
        select id into v_unidade_id from public.unidades_medida where sigla = 'UN' limit 1;
      end if;

      v_ean := nullif(v_item->>'ean', '');
      if v_ean is not null and exists (select 1 from public.produtos p where p.codigo_barras = v_ean) then
        v_ean := null;
      end if;

      insert into public.produtos (nome, ncm, cest, codigo_barras, unidade_id, preco_custo, preco_venda)
      values (coalesce(nullif(v_item->>'descricao', ''), 'Produto sem descrição'),
              nullif(v_item->>'ncm', ''), nullif(v_item->>'cest', ''), v_ean, v_unidade_id,
              0, v_vunit)
      returning id into v_produto_id;
      v_criados := v_criados + 1;
    else
      if not exists (select 1 from public.produtos p where p.id = v_produto_id) then
        raise exception 'Produto informado para o item "%" não existe.', coalesce(v_item->>'descricao', '?')
          using errcode = 'P0002';
      end if;
    end if;

    if v_fornecedor_id is not null and v_codigo is not null then
      insert into public.fornecedor_produto_codigos
        (fornecedor_id, codigo, produto_id, descricao_fornecedor)
      values (v_fornecedor_id, v_codigo, v_produto_id, nullif(v_item->>'descricao', ''))
      on conflict (fornecedor_id, codigo) do update set produto_id = excluded.produto_id;
      v_vinculos := v_vinculos + 1;
    end if;

    insert into public.notas_fiscais_entrada_itens
      (nota_id, produto_id, codigo_produto_fornecedor, descricao, ncm, cest, quantidade, valor_unitario, valor_total)
    values
      (v_nota_id, v_produto_id, v_codigo,
       coalesce(nullif(v_item->>'descricao', ''), 'Item sem descrição'),
       nullif(v_item->>'ncm', ''), nullif(v_item->>'cest', ''),
       v_qtd, v_vunit, coalesce(nullif(v_item->>'valor_total', '')::numeric, v_qtd * v_vunit));

    -- ------------------------------------------------------------ rastreio
    select controle, nome into v_controle, v_nome_produto
      from public.produtos where id = v_produto_id;

    v_lote_id := null;
    v_series := v_item->'series';

    if v_controle = 'lote' then
      v_lote_codigo := coalesce(
        nullif(v_item->>'lote', ''),
        'NF ' || coalesce(p_payload->>'numero', 's/n') || '/' || coalesce(p_payload->>'serie', '1'));

      select id into v_lote_id from public.lotes
       where produto_id = v_produto_id and codigo = v_lote_codigo;

      if v_lote_id is null then
        insert into public.lotes
          (produto_id, codigo, fabricacao, validade, fornecedor_id, origem_tipo, origem_id, created_by)
        values
          (v_produto_id, v_lote_codigo,
           nullif(v_item->>'fabricacao', '')::date,
           nullif(v_item->>'validade', '')::date,
           v_fornecedor_id, v_origem, v_nota_id, auth.uid())
        returning id into v_lote_id;
        v_lotes := v_lotes + 1;
      end if;

    elsif v_controle = 'serie' then
      if v_series is null or jsonb_array_length(v_series) <> v_qtd then
        raise exception '"%" é controlado por número de série: informe % número(s) de série no item (veio %).',
          v_nome_produto, v_qtd, coalesce(jsonb_array_length(v_series), 0)
          using errcode = '22023';
      end if;
    end if;

    insert into public.movimentacoes_estoque
      (produto_id, tipo, quantidade, preco_unitario, origem_tipo, origem_id, observacao, created_by, lote_id)
    values
      (v_produto_id, 'entrada', v_qtd, v_vunit, v_origem, v_nota_id,
       'NF-e ' || coalesce(p_payload->>'numero', '') || ' série ' || coalesce(p_payload->>'serie', ''),
       auth.uid(), v_lote_id)
    returning id into v_mov_id;

    if v_controle = 'serie' then
      for v_serie in select jsonb_array_elements_text(v_series)
      loop
        v_serie := trim(v_serie);
        if v_serie = '' then
          raise exception 'Número de série vazio no item "%".', v_nome_produto using errcode = '22023';
        end if;
        insert into public.numeros_serie
          (produto_id, serie, fornecedor_id, origem_tipo, origem_id,
           fabricacao, movimentacao_entrada_id, created_by)
        values
          (v_produto_id, v_serie, v_fornecedor_id, v_origem, v_nota_id,
           nullif(v_item->>'fabricacao', '')::date, v_mov_id, auth.uid());
        v_series_criadas := v_series_criadas + 1;
      end loop;
    end if;
  end loop;

  if v_fornecedor_id is not null and v_valor_total is not null and v_valor_total > 0 then
    insert into public.contas_pagar (fornecedor_id, descricao, valor, data_vencimento, origem_tipo, origem_id)
    values (v_fornecedor_id,
            'NF-e ' || coalesce(p_payload->>'numero', '') || ' série ' || coalesce(p_payload->>'serie', ''),
            v_valor_total, v_venc, v_origem, v_nota_id);
  end if;

  return jsonb_build_object(
    'nota_id', v_nota_id,
    'fornecedor_id', v_fornecedor_id,
    'produtos_criados', v_criados,
    'vinculos_aprendidos', v_vinculos,
    'lotes_criados', v_lotes,
    'series_criadas', v_series_criadas,
    'itens', jsonb_array_length(p_payload->'itens')
  );
end;
$function$;
