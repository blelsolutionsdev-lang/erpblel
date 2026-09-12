-- Hardening 3/4 — operações multi-passo viram RPC (uma transação só).
--
-- Antes o client fazia ~5N requisições soltas para dar entrada numa NF-e e
-- N+2 para concluir uma OS. Falha no meio deixava nota processada com estoque
-- pela metade, ou anexos órfãos sem OS concluída. Agora é tudo ou nada.

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
  v_qtd numeric;
  v_vunit numeric;
  v_criados int := 0;
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

  -- 1) fornecedor
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

  -- 2) cabeçalho da nota
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

  -- 3) itens: produto (existente ou novo), item da nota e entrada no estoque
  for v_item in select * from jsonb_array_elements(p_payload->'itens')
  loop
    v_qtd := coalesce(nullif(v_item->>'quantidade', '')::numeric, 0);
    v_vunit := coalesce(nullif(v_item->>'valor_unitario', '')::numeric, 0);

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
              v_vunit, v_vunit)
      returning id into v_produto_id;
      v_criados := v_criados + 1;
    else
      if not exists (select 1 from public.produtos p where p.id = v_produto_id) then
        raise exception 'Produto informado para o item "%" não existe.', coalesce(v_item->>'descricao', '?')
          using errcode = 'P0002';
      end if;
      update public.produtos set preco_custo = v_vunit where id = v_produto_id;
    end if;

    insert into public.notas_fiscais_entrada_itens
      (nota_id, produto_id, codigo_produto_fornecedor, descricao, ncm, cest, quantidade, valor_unitario, valor_total)
    values
      (v_nota_id, v_produto_id, nullif(v_item->>'codigo_produto_fornecedor', ''),
       coalesce(nullif(v_item->>'descricao', ''), 'Item sem descrição'),
       nullif(v_item->>'ncm', ''), nullif(v_item->>'cest', ''),
       v_qtd, v_vunit, coalesce(nullif(v_item->>'valor_total', '')::numeric, v_qtd * v_vunit));

    insert into public.movimentacoes_estoque
      (produto_id, tipo, quantidade, preco_unitario, origem_tipo, origem_id, observacao, created_by)
    values
      (v_produto_id, 'entrada', v_qtd, v_vunit, v_origem, v_nota_id,
       'NF-e ' || coalesce(p_payload->>'numero', '') || ' série ' || coalesce(p_payload->>'serie', ''),
       auth.uid());
  end loop;

  -- 4) conta a pagar do fornecedor
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
    'itens', jsonb_array_length(p_payload->'itens')
  );
end;
$function$;

revoke execute on function public.registrar_entrada_nfe(jsonb) from anon, public;
grant execute on function public.registrar_entrada_nfe(jsonb) to authenticated;

create or replace function public.concluir_os(
  p_os_id uuid,
  p_laudo text,
  p_assinatura_nome text,
  p_assinatura_path text,
  p_fotos jsonb
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_os public.ordens_servico%rowtype;
  v_foto jsonb;
begin
  select * into v_os from public.ordens_servico where id = p_os_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;

  if not (public.user_has_permission('os.editar') or v_os.tecnico_id = auth.uid()) then
    raise exception 'Você não tem permissão para concluir esta ordem de serviço.' using errcode = '42501';
  end if;

  if v_os.status in ('concluida', 'cancelada') then
    raise exception 'Esta OS já está % e não pode ser concluída de novo.', v_os.status using errcode = '22023';
  end if;

  if p_assinatura_path is null or btrim(coalesce(p_assinatura_nome, '')) = '' then
    raise exception 'Assinatura do cliente e nome de quem assinou são obrigatórios.' using errcode = '22023';
  end if;

  if p_fotos is null or jsonb_array_length(p_fotos) = 0 then
    raise exception 'Anexe pelo menos uma foto da conclusão do serviço.' using errcode = '22023';
  end if;

  for v_foto in select * from jsonb_array_elements(p_fotos)
  loop
    insert into public.os_anexos (os_id, tipo, storage_path, nome_arquivo, created_by)
    values (p_os_id, 'foto_conclusao', v_foto->>'path', nullif(v_foto->>'nome', ''), auth.uid());
  end loop;

  insert into public.os_anexos (os_id, tipo, storage_path, created_by)
  values (p_os_id, 'assinatura_cliente', p_assinatura_path, auth.uid());

  update public.ordens_servico
     set status = 'concluida',
         data_conclusao = now(),
         laudo_tecnico = nullif(p_laudo, ''),
         assinatura_cliente_nome = p_assinatura_nome,
         assinatura_cliente_url = p_assinatura_path,
         assinatura_em = now()
   where id = p_os_id;
end;
$function$;

revoke execute on function public.concluir_os(uuid, text, text, text, jsonb) from anon, public;
grant execute on function public.concluir_os(uuid, text, text, text, jsonb) to authenticated;

-- Resumo do dashboard resolvido no banco. A tela antes baixava a tabela de
-- produtos inteira e todos os títulos em aberto só para somar no navegador.
create or replace function public.resumo_dashboard()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_ver_financeiro boolean := public.user_has_permission('financeiro.gerenciar');
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
    'os_abertas', (
      select count(*) from public.ordens_servico
      where status in ('aberta', 'em_andamento', 'aguardando_peca')
    ),
    'ver_financeiro', v_ver_financeiro,
    'total_receber', case when v_ver_financeiro then (
      select coalesce(sum(valor), 0) from public.contas_receber where status in ('pendente', 'atrasado')
    ) else null end,
    'total_pagar', case when v_ver_financeiro then (
      select coalesce(sum(valor), 0) from public.contas_pagar where status in ('pendente', 'atrasado')
    ) else null end
  ) into v_resultado;

  return v_resultado;
end;
$function$;

revoke execute on function public.resumo_dashboard() from anon, public;
grant execute on function public.resumo_dashboard() to authenticated;
