-- A ficha versionada permite submontados (multinível), então o que antes era
-- resolvido pela trava grosseira `impedir_kit_de_kit` passa a ser detecção de
-- ciclo de verdade: o componente não pode conter, direta ou indiretamente, o
-- próprio produto.
create or replace function public.impedir_ciclo_ficha()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v_produto uuid;
begin
  select produto_id into v_produto from public.fichas_tecnicas where id = new.ficha_id;

  if v_produto = new.componente_produto_id then
    raise exception 'Um produto não pode ser componente da própria ficha técnica.'
      using errcode = '23514';
  end if;

  if exists (
    with recursive descendentes as (
      select new.componente_produto_id as produto_id, 1 as nivel
      union all
      select i.componente_produto_id, d.nivel + 1
        from descendentes d
        join public.fichas_tecnicas f
          on f.produto_id = d.produto_id and f.status <> 'encerrada'
        join public.fichas_tecnicas_itens i on i.ficha_id = f.id
       where d.nivel < 20
    )
    select 1 from descendentes where produto_id = v_produto
  ) then
    raise exception 'Ciclo na ficha técnica: "%" já contém, direta ou indiretamente, este produto.',
      (select nome from public.produtos where id = new.componente_produto_id)
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_impedir_ciclo_ficha on public.fichas_tecnicas_itens;
create trigger trg_impedir_ciclo_ficha
  before insert or update on public.fichas_tecnicas_itens
  for each row execute function public.impedir_ciclo_ficha();

-- Alterar a ficha era a única operação crítica sem rastro: `produto_kit_itens`
-- não tinha trigger de auditoria.
drop trigger if exists trg_auditoria on public.fichas_tecnicas;
create trigger trg_auditoria
  after insert or update or delete on public.fichas_tecnicas
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_auditoria on public.fichas_tecnicas_itens;
create trigger trg_auditoria
  after insert or update or delete on public.fichas_tecnicas_itens
  for each row execute function public.registrar_auditoria();

-- Rastro no razão de estoque: cada baixa em cascata registra de qual VERSÃO da
-- ficha ela saiu. É isto que torna o histórico reconstruível depois que a ficha
-- muda.
alter table public.movimentacoes_estoque
  add column if not exists ficha_tecnica_id uuid references public.fichas_tecnicas(id) on delete set null;

create index if not exists idx_movimentacoes_ficha
  on public.movimentacoes_estoque (ficha_tecnica_id);

comment on column public.movimentacoes_estoque.ficha_tecnica_id is
  'Versão da ficha técnica que originou esta baixa em cascata. Null em movimentações que não vieram de explosão de kit.';
