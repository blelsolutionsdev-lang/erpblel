-- Abrir uma nova versão sempre copiando a vigente: editar a ficha em uso passa
-- a ser impossível, e é isso que preserva o histórico.
create or replace function public.criar_versao_ficha(
  p_produto_id uuid,
  p_copiar_da_ativa boolean default true,
  p_observacao text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_tipo produto_tipo;
  v_nome text;
  v_versao integer;
  v_ficha_id uuid;
  v_origem uuid;
begin
  if not public.user_has_permission('estoque.produtos.gerenciar') then
    raise exception 'Você não tem permissão para editar fichas técnicas.' using errcode = '42501';
  end if;

  select tipo, nome into v_tipo, v_nome from public.produtos where id = p_produto_id;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;
  if v_tipo <> 'kit' then
    raise exception 'Só produtos do tipo kit têm ficha técnica. "%" é um produto simples.', v_nome
      using errcode = '22023';
  end if;

  if exists (select 1 from public.fichas_tecnicas
              where produto_id = p_produto_id and status = 'rascunho') then
    raise exception 'Já existe um rascunho aberto para "%". Ative ou descarte antes de abrir outro.', v_nome
      using errcode = '23505';
  end if;

  select coalesce(max(versao), 0) + 1 into v_versao
    from public.fichas_tecnicas where produto_id = p_produto_id;

  insert into public.fichas_tecnicas (produto_id, versao, status, observacao, criada_por)
  values (p_produto_id, v_versao, 'rascunho', nullif(p_observacao, ''), auth.uid())
  returning id into v_ficha_id;

  if p_copiar_da_ativa then
    select id into v_origem from public.fichas_tecnicas
     where produto_id = p_produto_id and status = 'ativa';

    if v_origem is not null then
      insert into public.fichas_tecnicas_itens
        (ficha_id, componente_produto_id, quantidade, perda_percentual, observacao)
      select v_ficha_id, componente_produto_id, quantidade, perda_percentual, observacao
        from public.fichas_tecnicas_itens where ficha_id = v_origem;
    end if;
  end if;

  return v_ficha_id;
end;
$function$;

revoke execute on function public.criar_versao_ficha(uuid, boolean, text) from anon, public;
grant execute on function public.criar_versao_ficha(uuid, boolean, text) to authenticated;

-- Ativar encerra a vigente e congela o custo do dia.
create or replace function public.ativar_ficha_tecnica(p_ficha_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_produto_id uuid;
  v_status ficha_status;
  v_versao integer;
  v_itens integer;
  v_custo numeric;
  v_anterior integer;
begin
  if not public.user_has_permission('estoque.produtos.gerenciar') then
    raise exception 'Você não tem permissão para ativar fichas técnicas.' using errcode = '42501';
  end if;

  select produto_id, status, versao into v_produto_id, v_status, v_versao
    from public.fichas_tecnicas where id = p_ficha_id for update;
  if not found then
    raise exception 'Ficha técnica não encontrada.' using errcode = 'P0002';
  end if;
  if v_status <> 'rascunho' then
    raise exception 'Só um rascunho pode ser ativado; esta ficha está %.', v_status using errcode = '22023';
  end if;

  select count(*) into v_itens from public.fichas_tecnicas_itens where ficha_id = p_ficha_id;
  if v_itens = 0 then
    raise exception 'A ficha não tem nenhum componente.' using errcode = '22023';
  end if;

  -- Componente que também é kit entra pelo custo da própria ficha vigente.
  select round(coalesce(sum(
           i.quantidade * (1 + i.perda_percentual / 100)
           * case when c.tipo = 'kit'
                  then coalesce((select f2.custo_calculado from public.fichas_tecnicas f2
                                  where f2.produto_id = c.id and f2.status = 'ativa'), 0)
                  else c.preco_custo end
         ), 0), 2)
    into v_custo
    from public.fichas_tecnicas_itens i
    join public.produtos c on c.id = i.componente_produto_id
   where i.ficha_id = p_ficha_id;

  update public.fichas_tecnicas
     set status = 'encerrada', vigencia_fim = current_date
   where produto_id = v_produto_id and status = 'ativa'
  returning versao into v_anterior;

  update public.fichas_tecnicas
     set status = 'ativa',
         vigencia_inicio = current_date,
         vigencia_fim = null,
         custo_calculado = v_custo,
         custo_calculado_em = now()
   where id = p_ficha_id;

  return jsonb_build_object(
    'ficha_id', p_ficha_id,
    'versao', v_versao,
    'versao_encerrada', v_anterior,
    'itens', v_itens,
    'custo_calculado', v_custo
  );
end;
$function$;

revoke execute on function public.ativar_ficha_tecnica(uuid) from anon, public;
grant execute on function public.ativar_ficha_tecnica(uuid) to authenticated;
