-- A baixa em cascata passa a ler a ficha VIGENTE e a gravar, em cada linha
-- filha, de qual versão ela saiu. Com isso o histórico deixa de depender da
-- composição atual: o razão diz para sempre com o que aquele kit foi montado.
--
-- Ganha também a perda prevista (3 m de tubo com 5% consomem 3,15 m) e o
-- multinível: o componente que for kit dispara esta mesma função de novo.
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
  v_ficha_id uuid;
begin
  select tipo, nome, estoque_atual, preco_custo
    into v_tipo_produto, v_nome, v_saldo, v_custo
    from public.produtos where id = new.produto_id;

  if v_tipo_produto = 'kit' then
    select id into v_ficha_id
      from public.fichas_tecnicas
     where produto_id = new.produto_id and status = 'ativa';

    if v_ficha_id is null then
      raise exception 'O kit "%" não tem ficha técnica ativa; movimentação de estoque impossível.', v_nome
        using errcode = '23514';
    end if;

    for v_item in
      select componente_produto_id, quantidade, perda_percentual
        from public.fichas_tecnicas_itens
       where ficha_id = v_ficha_id
    loop
      v_componentes := v_componentes + 1;
      insert into public.movimentacoes_estoque
        (produto_id, tipo, quantidade, preco_unitario, origem_tipo, origem_id,
         observacao, created_by, ficha_tecnica_id)
      values
        (v_item.componente_produto_id, new.tipo,
         round(v_item.quantidade * (1 + v_item.perda_percentual / 100) * new.quantidade, 4),
         null,
         coalesce(new.origem_tipo, 'kit_baixa'), coalesce(new.origem_id, new.id),
         'Baixa em cascata de "' || v_nome || '"', new.created_by, v_ficha_id);
    end loop;

    if v_componentes = 0 then
      raise exception 'A ficha técnica ativa de "%" não tem componentes.', v_nome
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
