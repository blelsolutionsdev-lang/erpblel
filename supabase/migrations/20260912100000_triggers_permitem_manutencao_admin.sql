-- Os gatilhos de proteção só reconheciam `service_role` como "não é usuário
-- final". Qualquer manutenção feita como dono do banco (migration, rotina
-- administrativa ou até um ON DELETE SET NULL disparado por chave estrangeira)
-- caía na regra de usuário comum e era recusada — apareceu ao limpar os
-- registros de teste, quando apagar um título tentou zerar conta_receber_id na
-- OS e o gatilho barrou. A checagem passa a valer só para quem entra pela API
-- com sessão de usuário.

create or replace function public.restringir_edicao_os()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or public.user_has_permission('os.editar') then
    return new;
  end if;

  if old.tecnico_id is distinct from auth.uid() then
    raise exception 'Você não tem permissão para editar esta ordem de serviço.'
      using errcode = '42501';
  end if;

  new.cliente_id := old.cliente_id;
  new.equipamento_id := old.equipamento_id;
  new.tecnico_id := old.tecnico_id;
  new.problema_relatado := old.problema_relatado;
  new.numero := old.numero;
  new.os_origem_id := old.os_origem_id;
  new.eh_garantia := old.eh_garantia;
  new.data_abertura := old.data_abertura;
  new.created_at := old.created_at;

  return new;
end;
$function$;

create or replace function public.impedir_auto_promocao()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or public.user_has_permission('administrativo.usuarios.gerenciar') then
    return new;
  end if;

  if new.role_id is distinct from old.role_id then
    raise exception 'Você não tem permissão para alterar o papel de um usuário.'
      using errcode = '42501';
  end if;

  if new.ativo is distinct from old.ativo then
    raise exception 'Você não tem permissão para ativar/desativar usuários.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
