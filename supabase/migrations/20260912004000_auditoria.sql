-- Trilha de auditoria das tabelas sensíveis: quem mudou, quando e o quê.
-- Antes nada disso era registrado — não dava para saber quem alterou um preço,
-- um desconto ou o papel de um usuário.

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text not null,
  acao text not null,
  alterado_por uuid,
  alterado_em timestamptz not null default now(),
  mudancas jsonb not null default '{}'::jsonb
);

create index if not exists idx_auditoria_registro on public.auditoria (tabela, registro_id, alterado_em desc);
create index if not exists idx_auditoria_data on public.auditoria (alterado_em desc);

alter table public.auditoria enable row level security;

-- Só leitura, e só para quem administra usuários. A escrita é exclusiva do
-- gatilho (security definer): ninguém insere nem apaga pela API.
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria for select to authenticated
  using ((select public.user_has_permission('administrativo.usuarios.gerenciar')));

comment on table public.auditoria is
  'Trilha de alterações das tabelas sensíveis. Escrita só por gatilho (security definer); ninguém insere nem apaga pela API.';

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_mudancas jsonb := '{}'::jsonb;
  v_chave text;
  v_id text;
begin
  if TG_OP = 'DELETE' then
    v_old := to_jsonb(old);
    v_id := coalesce(v_old->>'id', '?');
    insert into public.auditoria (tabela, registro_id, acao, alterado_por, mudancas)
    values (TG_TABLE_NAME, v_id, 'DELETE', auth.uid(), jsonb_build_object('antes', v_old));
    return old;
  end if;

  v_new := to_jsonb(new);
  v_id := coalesce(v_new->>'id', '?');

  if TG_OP = 'INSERT' then
    insert into public.auditoria (tabela, registro_id, acao, alterado_por, mudancas)
    values (TG_TABLE_NAME, v_id, 'INSERT', auth.uid(), jsonb_build_object('depois', v_new));
    return new;
  end if;

  v_old := to_jsonb(old);

  -- Guarda só o que mudou: auditoria de linha inteira fica ilegível e pesada.
  for v_chave in select jsonb_object_keys(v_new)
  loop
    if v_chave not in ('updated_at') and (v_new->v_chave) is distinct from (v_old->v_chave) then
      v_mudancas := v_mudancas || jsonb_build_object(
        v_chave, jsonb_build_object('de', v_old->v_chave, 'para', v_new->v_chave)
      );
    end if;
  end loop;

  if v_mudancas = '{}'::jsonb then
    return new;
  end if;

  insert into public.auditoria (tabela, registro_id, acao, alterado_por, mudancas)
  values (TG_TABLE_NAME, v_id, 'UPDATE', auth.uid(), v_mudancas);

  return new;
end;
$function$;

revoke execute on function public.registrar_auditoria() from anon, authenticated, public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ordens_servico', 'ordens_servico_itens', 'produtos', 'servicos',
    'contas_receber', 'contas_pagar', 'profiles', 'role_permissions',
    'user_permissions', 'clientes', 'fornecedores'
  ]
  loop
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format(
      'create trigger trg_auditoria after insert or update or delete on public.%I
         for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- Sem a FK o PostgREST não resolve o embed `autor:profiles(...)` e a tela de
-- auditoria volta vazia mesmo com registros na tabela.
alter table public.auditoria
  add constraint auditoria_alterado_por_fkey
  foreign key (alterado_por) references public.profiles(id) on delete set null;

create index if not exists idx_auditoria_autor on public.auditoria (alterado_por);
