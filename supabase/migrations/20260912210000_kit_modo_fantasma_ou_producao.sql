-- Até aqui todo kit era fantasma: não tinha saldo próprio e, ao ser
-- movimentado, explodia nos componentes. Serve para o kit que é só uma lista de
-- peças ("kit manutenção preventiva"), e não serve para o que a empresa monta
-- antes e guarda na prateleira — esse precisa de saldo próprio.
--
-- `fantasma` continua sendo o padrão: nenhum kit já cadastrado muda de
-- comportamento.
do $$ begin
  create type public.kit_modo as enum ('fantasma', 'producao');
exception when duplicate_object then null; end $$;

alter table public.produtos
  add column if not exists kit_modo public.kit_modo not null default 'fantasma';

comment on column public.produtos.kit_modo is
  'fantasma: sem saldo próprio, explode nos componentes ao ser movimentado. producao: tem saldo próprio e só entra por ordem de produção concluída.';

-- Kit de produção tem saldo próprio: a cascata para nele.
create or replace function public.aplicar_movimentacao_estoque()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_delta numeric;
  v_tipo_produto produto_tipo;
  v_kit_modo kit_modo;
  v_nome text;
  v_saldo numeric;
  v_custo numeric;
  v_novo_custo numeric;
  v_item record;
  v_componentes int := 0;
  v_ficha_id uuid;
begin
  select tipo, kit_modo, nome, estoque_atual, preco_custo
    into v_tipo_produto, v_kit_modo, v_nome, v_saldo, v_custo
    from public.produtos where id = new.produto_id;

  if v_tipo_produto = 'kit' and v_kit_modo = 'fantasma' then
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
