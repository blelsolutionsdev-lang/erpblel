-- Estoque: custo médio ponderado, CMV nas saídas e de-para do código do
-- fornecedor.
--
-- Antes: preco_custo era sobrescrito pelo preço da última compra (margem e CMV
-- incalculáveis) e item de NF-e sem GTIN virava produto novo a cada nota.

-- ---------------------------------------------------------------- de-para
create table if not exists public.fornecedor_produto_codigos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  codigo text not null,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  descricao_fornecedor text,
  created_at timestamptz not null default now(),
  unique (fornecedor_id, codigo)
);

create index if not exists idx_fpc_produto on public.fornecedor_produto_codigos (produto_id);

alter table public.fornecedor_produto_codigos enable row level security;

drop policy if exists fpc_select on public.fornecedor_produto_codigos;
create policy fpc_select on public.fornecedor_produto_codigos for select to authenticated
  using ((select public.usuario_ativo()));

drop policy if exists fpc_write on public.fornecedor_produto_codigos;
create policy fpc_write on public.fornecedor_produto_codigos for all to authenticated
  using ((select public.user_has_permission('estoque.entradas.processar')) or (select public.user_has_permission('estoque.produtos.gerenciar')))
  with check ((select public.user_has_permission('estoque.entradas.processar')) or (select public.user_has_permission('estoque.produtos.gerenciar')));

comment on table public.fornecedor_produto_codigos is
  'De-para entre o código do produto no catálogo do fornecedor e o produto no ERP. É o que permite casar itens de NF-e sem GTIN sem recadastrar produto a cada compra.';

-- ---------------------------------------------------------------- custo
-- Saída sem custo informado herda o custo médio do produto no momento do
-- lançamento: é isso que torna o CMV (e a margem por OS) calculável depois.
create or replace function public.registrar_custo_saida()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.preco_unitario is null and new.tipo in ('saida', 'transferencia') then
    select preco_custo into new.preco_unitario from public.produtos where id = new.produto_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_registrar_custo_saida on public.movimentacoes_estoque;
create trigger trg_registrar_custo_saida
  before insert on public.movimentacoes_estoque
  for each row execute function public.registrar_custo_saida();

-- Entrada recalcula o custo médio ponderado em vez de sobrescrever com o
-- último preço de compra.
create or replace function public.aplicar_movimentacao_estoque()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_delta numeric;
  v_tipo_produto produto_tipo;
  v_nome text;
  v_saldo numeric;
  v_custo numeric;
  v_novo_custo numeric;
  v_item record;
  v_componentes int := 0;
begin
  select tipo, nome, estoque_atual, preco_custo
    into v_tipo_produto, v_nome, v_saldo, v_custo
    from public.produtos where id = new.produto_id;

  if v_tipo_produto = 'kit' then
    for v_item in
      select componente_produto_id, quantidade
      from public.produto_kit_itens
      where kit_produto_id = new.produto_id
    loop
      v_componentes := v_componentes + 1;
      insert into public.movimentacoes_estoque
        (produto_id, tipo, quantidade, preco_unitario, origem_tipo, origem_id, observacao, created_by)
      values
        (v_item.componente_produto_id, new.tipo, v_item.quantidade * new.quantidade, null,
         coalesce(new.origem_tipo, 'kit_baixa'), coalesce(new.origem_id, new.id),
         'Baixa em cascata do kit ' || new.produto_id, new.created_by);
    end loop;

    if v_componentes = 0 then
      raise exception 'O kit "%" não tem componentes cadastrados; movimentação de estoque impossível.', v_nome
        using errcode = '23514';
    end if;

    return new;
  end if;

  v_delta := case new.tipo
    when 'entrada' then new.quantidade
    when 'saida' then -new.quantidade
    when 'ajuste' then new.quantidade
    else 0
  end;

  if v_saldo + v_delta < 0 then
    raise exception 'Estoque insuficiente de "%": saldo % e a movimentação pede %.', v_nome, v_saldo, abs(v_delta)
      using errcode = '23514';
  end if;

  v_novo_custo := v_custo;
  if new.tipo = 'entrada' and new.preco_unitario is not null and new.quantidade > 0 then
    if v_saldo <= 0 then
      v_novo_custo := new.preco_unitario;
    else
      v_novo_custo := round(((v_saldo * v_custo) + (new.quantidade * new.preco_unitario))
                            / (v_saldo + new.quantidade), 2);
    end if;
  end if;

  update public.produtos
     set estoque_atual = estoque_atual + v_delta,
         preco_custo = v_novo_custo
   where id = new.produto_id;

  return new;
end;
$function$;

-- ---------------------------------------------------------------- sugestão
create or replace function public.sugerir_produtos_nfe(p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_cnpj text;
  v_fornecedor_id uuid;
  v_item jsonb;
  v_produto_id uuid;
  v_origem text;
  v_saida jsonb := '[]'::jsonb;
  v_ean text;
  v_codigo text;
begin
  if not public.user_has_permission('estoque.entradas.processar') then
    raise exception 'Você não tem permissão para dar entrada de NF-e.' using errcode = '42501';
  end if;

  v_cnpj := nullif(regexp_replace(coalesce(p_payload->>'fornecedor_cnpj', ''), '\D', '', 'g'), '');
  if v_cnpj is not null then
    select id into v_fornecedor_id from public.fornecedores where cpf_cnpj = v_cnpj;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'itens', '[]'::jsonb))
  loop
    v_produto_id := null;
    v_origem := null;
    v_ean := nullif(v_item->>'ean', '');
    v_codigo := nullif(v_item->>'codigo_produto_fornecedor', '');

    -- 1) de-para do fornecedor: o mais confiável para quem não manda GTIN
    if v_fornecedor_id is not null and v_codigo is not null then
      select produto_id into v_produto_id
        from public.fornecedor_produto_codigos
       where fornecedor_id = v_fornecedor_id and codigo = v_codigo;
      if v_produto_id is not null then v_origem := 'codigo_fornecedor'; end if;
    end if;

    -- 2) código de barras (GTIN)
    if v_produto_id is null and v_ean is not null then
      select id into v_produto_id from public.produtos where codigo_barras = v_ean;
      if v_produto_id is not null then v_origem := 'gtin'; end if;
    end if;

    -- 3) descrição idêntica, só como sugestão para o usuário confirmar
    if v_produto_id is null then
      select id into v_produto_id from public.produtos
       where lower(btrim(nome)) = lower(btrim(coalesce(v_item->>'descricao', '')))
       limit 1;
      if v_produto_id is not null then v_origem := 'descricao'; end if;
    end if;

    v_saida := v_saida || jsonb_build_array(jsonb_build_object(
      'numero_item', v_item->>'numero_item',
      'codigo_produto_fornecedor', v_codigo,
      'produto_id', v_produto_id,
      'origem', v_origem
    ));
  end loop;

  return jsonb_build_object('fornecedor_id', v_fornecedor_id, 'itens', v_saida);
end;
$function$;

revoke execute on function public.sugerir_produtos_nfe(jsonb) from anon, public;
grant execute on function public.sugerir_produtos_nfe(jsonb) to authenticated;

-- A entrada de NF-e passa a aprender o de-para e a não mexer no preco_custo
-- (o custo médio é recalculado pelo gatilho da movimentação).
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
      -- preco_custo não é mais sobrescrito aqui: o custo médio ponderado é
      -- recalculado pelo gatilho da movimentação de entrada.
    end if;

    -- Aprende o de-para: a próxima nota deste fornecedor já casa sozinha,
    -- mesmo sem GTIN.
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

    insert into public.movimentacoes_estoque
      (produto_id, tipo, quantidade, preco_unitario, origem_tipo, origem_id, observacao, created_by)
    values
      (v_produto_id, 'entrada', v_qtd, v_vunit, v_origem, v_nota_id,
       'NF-e ' || coalesce(p_payload->>'numero', '') || ' série ' || coalesce(p_payload->>'serie', ''),
       auth.uid());
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
    'itens', jsonb_array_length(p_payload->'itens')
  );
end;
$function$;
