-- "Explosão de kit" era jargão de ERP e não existe mais em lugar nenhum do
-- produto: a tela chama-se Necessidade de materiais. A função acompanhou.
--
-- No projeto que já estava no ar a função nasceu como `explodir_kit` e foi
-- renomeada aqui. Num banco novo a migration 20260912190100 já cria o nome
-- final, então este passo não tem o que renomear — daí a guarda, sem a qual
-- um `supabase db push` limpo falharia procurando uma função inexistente.
do $$
begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'explodir_kit'
  ) then
    alter function public.explodir_kit(uuid, numeric)
      rename to necessidade_de_materiais;
  end if;
end $$;

-- Solicitações já gravadas com a origem antiga continuam legíveis.
update public.solicitacoes_compra
   set origem_tipo = 'necessidade_materiais'
 where origem_tipo = 'explosao_kit';
