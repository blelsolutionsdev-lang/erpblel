-- Migra a composição existente para a versão 1 de cada ficha, já ativa.
-- Nada é apagado: `produto_kit_itens` continua na base como registro do que
-- havia antes; só deixa de ser lida e escrita.
do $$
declare
  v_kit record;
  v_ficha_id uuid;
  v_custo numeric;
begin
  for v_kit in
    select p.id, p.created_at
      from public.produtos p
     where p.tipo = 'kit'
       and exists (select 1 from public.produto_kit_itens k where k.kit_produto_id = p.id)
       and not exists (select 1 from public.fichas_tecnicas f where f.produto_id = p.id)
  loop
    insert into public.fichas_tecnicas
      (produto_id, versao, status, vigencia_inicio, observacao)
    values
      (v_kit.id, 1, 'ativa', v_kit.created_at::date,
       'Versão 1 migrada da composição de kit anterior ao controle de versões.')
    returning id into v_ficha_id;

    insert into public.fichas_tecnicas_itens (ficha_id, componente_produto_id, quantidade)
    select v_ficha_id, k.componente_produto_id, k.quantidade
      from public.produto_kit_itens k
     where k.kit_produto_id = v_kit.id;

    select coalesce(sum(i.quantidade * p.preco_custo), 0)
      into v_custo
      from public.fichas_tecnicas_itens i
      join public.produtos p on p.id = i.componente_produto_id
     where i.ficha_id = v_ficha_id;

    update public.fichas_tecnicas
       set custo_calculado = round(v_custo, 2), custo_calculado_em = now()
     where id = v_ficha_id;
  end loop;
end $$;

comment on table public.produto_kit_itens is
  'OBSOLETA desde a ficha técnica versionada. Mantida só como registro histórico: a composição vigente vive em fichas_tecnicas/fichas_tecnicas_itens.';
