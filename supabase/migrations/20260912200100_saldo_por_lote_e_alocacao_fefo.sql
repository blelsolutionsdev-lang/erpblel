-- Saldo por lote sai do razão, como o saldo do produto: nada de contador.
create or replace view public.vw_saldo_lotes as
select l.id as lote_id,
       l.produto_id,
       l.codigo,
       l.fabricacao,
       l.validade,
       l.fornecedor_id,
       l.origem_tipo,
       l.origem_id,
       l.created_at,
       coalesce(sum(case m.tipo
                      when 'entrada' then m.quantidade
                      when 'saida' then -m.quantidade
                      when 'ajuste' then m.quantidade
                      else 0 end), 0) as saldo
  from public.lotes l
  left join public.movimentacoes_estoque m on m.lote_id = l.id
 group by l.id;

alter view public.vw_saldo_lotes set (security_invoker = true);

comment on view public.vw_saldo_lotes is
  'Saldo de cada lote, derivado do razão de estoque.';

-- Alocação de lote na movimentação.
--
-- Roda BEFORE INSERT de propósito: a saída sem lote informado precisa ser
-- repartida entre lotes, e repartir depois do insert deixaria no razão uma
-- linha-pai somada às filhas — o mesmo produto contado duas vezes. Aqui a
-- própria linha vira a primeira alocação e o resto entra como linhas novas.
--
-- FEFO: sai primeiro o que vence antes; sem validade, o lote mais antigo.
create or replace function public.alocar_lote_movimentacao()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_controle controle_rastreio;
  v_tipo_produto produto_tipo;
  v_nome text;
  v_delta numeric;
  v_restante numeric;
  v_lote record;
  v_usar numeric;
  v_primeiro boolean := true;
  v_saldo_lote numeric;
begin
  select controle, tipo, nome into v_controle, v_tipo_produto, v_nome
    from public.produtos where id = new.produto_id;

  -- Kit não tem saldo próprio: quem carrega lote é o componente, na cascata.
  if v_tipo_produto = 'kit' then
    return new;
  end if;

  if v_controle <> 'lote' then
    if new.lote_id is not null then
      raise exception '"%" não tem controle de lote; não aceite lote na movimentação.', v_nome
        using errcode = '22023';
    end if;
    if v_controle = 'serie' and new.quantidade <> trunc(new.quantidade) then
      raise exception '"%" é controlado por número de série: a quantidade tem que ser inteira (veio %).',
        v_nome, new.quantidade using errcode = '22023';
    end if;
    return new;
  end if;

  v_delta := case new.tipo
    when 'entrada' then new.quantidade
    when 'saida' then -new.quantidade
    when 'ajuste' then new.quantidade
    else 0
  end;

  if new.lote_id is not null then
    if not exists (select 1 from public.lotes l
                    where l.id = new.lote_id and l.produto_id = new.produto_id) then
      raise exception 'O lote informado não pertence a "%".', v_nome using errcode = '23514';
    end if;

    if v_delta < 0 then
      select saldo into v_saldo_lote from public.vw_saldo_lotes where lote_id = new.lote_id;
      if coalesce(v_saldo_lote, 0) + v_delta < 0 then
        raise exception 'Lote % de "%" tem saldo % e a movimentação pede %.',
          (select codigo from public.lotes where id = new.lote_id), v_nome,
          coalesce(v_saldo_lote, 0), abs(v_delta)
          using errcode = '23514';
      end if;
    end if;

    return new;
  end if;

  -- Sem lote informado.
  if v_delta > 0 then
    raise exception 'Entrada de "%" exige lote: o produto é controlado por lote.', v_nome
      using errcode = '23514';
  end if;

  if v_delta = 0 then
    return new;
  end if;

  v_restante := abs(v_delta);

  for v_lote in
    select s.lote_id, s.codigo, s.saldo
      from public.vw_saldo_lotes s
     where s.produto_id = new.produto_id and s.saldo > 0
     order by s.validade asc nulls last, s.created_at asc
  loop
    exit when v_restante <= 0;
    v_usar := least(v_restante, v_lote.saldo);

    if v_primeiro then
      -- A própria linha vira a primeira alocação.
      new.lote_id := v_lote.lote_id;
      new.quantidade := v_usar;
      v_primeiro := false;
    else
      insert into public.movimentacoes_estoque
        (produto_id, tipo, quantidade, preco_unitario, origem_tipo, origem_id,
         observacao, created_by, ficha_tecnica_id, lote_id)
      values
        (new.produto_id, new.tipo, v_usar, new.preco_unitario, new.origem_tipo, new.origem_id,
         new.observacao, new.created_by, new.ficha_tecnica_id, v_lote.lote_id);
    end if;

    v_restante := v_restante - v_usar;
  end loop;

  if v_restante > 0 then
    raise exception 'Saldo por lote insuficiente de "%": faltam % para completar a saída.',
      v_nome, v_restante using errcode = '23514';
  end if;

  return new;
end;
$function$;

-- Nome com "a" para rodar antes de trg_registrar_custo_saida: a quantidade
-- pode ser reescrita aqui, e o custo é gravado sobre a quantidade final.
drop trigger if exists trg_alocar_lote on public.movimentacoes_estoque;
create trigger trg_alocar_lote
  before insert on public.movimentacoes_estoque
  for each row execute function public.alocar_lote_movimentacao();
