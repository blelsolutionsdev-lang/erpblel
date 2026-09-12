-- RPCs do ciclo da OS: enviar/aprovar/reprovar orçamento, concluir com prazo de
-- garantia, abrir sub-OS de garantia dentro do prazo e estornar o cancelamento.
--
-- Antes: cancelar uma OS já concluída não devolvia as peças ao estoque nem
-- cancelava o título gerado, e a garantia não tinha data-limite nenhuma.

create or replace function public.enviar_orcamento_os(p_os_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_os public.ordens_servico%rowtype;
begin
  select * into v_os from public.ordens_servico where id = p_os_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  if not (public.user_has_permission('os.editar') or v_os.tecnico_id = auth.uid()) then
    raise exception 'Você não tem permissão para orçar esta OS.' using errcode = '42501';
  end if;
  -- Reprovada volta a ser orçável: cliente renegocia e o orçamento é reenviado.
  if v_os.status not in ('aberta', 'orcamento', 'aguardando_peca', 'reprovada') then
    raise exception 'Só dá para enviar orçamento de uma OS aberta ou reprovada.' using errcode = '22023';
  end if;
  if coalesce(v_os.valor_total, 0) <= 0 then
    raise exception 'Lance ao menos um item antes de enviar o orçamento.' using errcode = '22023';
  end if;

  update public.ordens_servico
     set status = 'orcamento',
         orcamento_enviado_em = now(),
         aprovado_em = null, aprovado_por = null,
         reprovado_em = null, motivo_reprovacao = null
   where id = p_os_id;
end;
$function$;

create or replace function public.aprovar_orcamento_os(p_os_id uuid, p_aprovado_por text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_os public.ordens_servico%rowtype;
begin
  select * into v_os from public.ordens_servico where id = p_os_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  if not (public.user_has_permission('os.editar') or v_os.tecnico_id = auth.uid()) then
    raise exception 'Você não tem permissão para aprovar este orçamento.' using errcode = '42501';
  end if;
  if v_os.status <> 'orcamento' then
    raise exception 'Esta OS não está aguardando aprovação.' using errcode = '22023';
  end if;
  if btrim(coalesce(p_aprovado_por, '')) = '' then
    raise exception 'Informe quem aprovou o orçamento.' using errcode = '22023';
  end if;

  update public.ordens_servico
     set status = 'em_andamento',
         aprovado_em = now(),
         aprovado_por = p_aprovado_por,
         reprovado_em = null,
         motivo_reprovacao = null
   where id = p_os_id;
end;
$function$;

create or replace function public.reprovar_orcamento_os(p_os_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_os public.ordens_servico%rowtype;
begin
  select * into v_os from public.ordens_servico where id = p_os_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  if not (public.user_has_permission('os.editar') or v_os.tecnico_id = auth.uid()) then
    raise exception 'Você não tem permissão para reprovar este orçamento.' using errcode = '42501';
  end if;
  if v_os.status <> 'orcamento' then
    raise exception 'Esta OS não está aguardando aprovação.' using errcode = '22023';
  end if;

  update public.ordens_servico
     set status = 'reprovada',
         reprovado_em = now(),
         motivo_reprovacao = nullif(p_motivo, ''),
         aprovado_em = null,
         aprovado_por = null
   where id = p_os_id;
end;
$function$;

-- Conclusão passa a carimbar a data-limite da garantia e a recusar orçamento
-- ainda não aprovado.
create or replace function public.concluir_os(
  p_os_id uuid,
  p_laudo text,
  p_assinatura_nome text,
  p_assinatura_path text,
  p_fotos jsonb
) returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_os public.ordens_servico%rowtype;
  v_foto jsonb;
begin
  select * into v_os from public.ordens_servico where id = p_os_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;

  if not (public.user_has_permission('os.editar') or v_os.tecnico_id = auth.uid()) then
    raise exception 'Você não tem permissão para concluir esta ordem de serviço.' using errcode = '42501';
  end if;

  if v_os.status in ('concluida', 'cancelada', 'reprovada') then
    raise exception 'Esta OS já está % e não pode ser concluída de novo.', v_os.status using errcode = '22023';
  end if;

  if v_os.status = 'orcamento' then
    raise exception 'Este orçamento ainda não foi aprovado pelo cliente.' using errcode = '22023';
  end if;

  if p_assinatura_path is null or btrim(coalesce(p_assinatura_nome, '')) = '' then
    raise exception 'Assinatura do cliente e nome de quem assinou são obrigatórios.' using errcode = '22023';
  end if;

  if p_fotos is null or jsonb_array_length(p_fotos) = 0 then
    raise exception 'Anexe pelo menos uma foto da conclusão do serviço.' using errcode = '22023';
  end if;

  for v_foto in select * from jsonb_array_elements(p_fotos)
  loop
    insert into public.os_anexos (os_id, tipo, storage_path, nome_arquivo, created_by)
    values (p_os_id, 'foto_conclusao', v_foto->>'path', nullif(v_foto->>'nome', ''), auth.uid());
  end loop;

  insert into public.os_anexos (os_id, tipo, storage_path, created_by)
  values (p_os_id, 'assinatura_cliente', p_assinatura_path, auth.uid());

  update public.ordens_servico
     set status = 'concluida',
         data_conclusao = now(),
         laudo_tecnico = nullif(p_laudo, ''),
         assinatura_cliente_nome = p_assinatura_nome,
         assinatura_cliente_url = p_assinatura_path,
         assinatura_em = now(),
         garantia_ate = (current_date + coalesce(garantia_dias, 90))
   where id = p_os_id;
end;
$function$;

create or replace function public.abrir_sub_os_garantia(p_os_id uuid, p_problema text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_os public.ordens_servico%rowtype;
  v_nova uuid;
begin
  if not public.user_has_permission('os.criar') then
    raise exception 'Você não tem permissão para abrir ordens de serviço.' using errcode = '42501';
  end if;

  select * into v_os from public.ordens_servico where id = p_os_id;
  if not found then
    raise exception 'OS de origem não encontrada.' using errcode = 'P0002';
  end if;

  if v_os.status <> 'concluida' then
    raise exception 'Só OS concluída gera retorno em garantia.' using errcode = '22023';
  end if;

  if btrim(coalesce(p_problema, '')) = '' then
    raise exception 'Descreva o problema relatado do retorno em garantia.' using errcode = '22023';
  end if;

  -- Garantia com prazo de verdade: fora da janela, o retorno não entra como
  -- garantia (vira OS normal, cobrada).
  if v_os.garantia_ate is not null and v_os.garantia_ate < current_date then
    raise exception 'A garantia da OS #% venceu em %.', v_os.numero, to_char(v_os.garantia_ate, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  insert into public.ordens_servico
    (cliente_id, equipamento_id, tecnico_id, problema_relatado, os_origem_id, eh_garantia, prioridade, garantia_dias)
  values
    (v_os.cliente_id, v_os.equipamento_id, v_os.tecnico_id, p_problema, v_os.id, true, 'alta', v_os.garantia_dias)
  returning id into v_nova;

  return v_nova;
end;
$function$;

-- Cancelar uma OS concluída desfaz o que a conclusão fez.
create or replace function public.estornar_os_cancelada()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_mov record;
begin
  if new.status <> 'cancelada' or old.status is not distinct from 'cancelada' then
    return new;
  end if;

  if not exists (
    select 1 from public.movimentacoes_estoque
     where origem_tipo = 'os_estorno' and origem_id = new.id
  ) then
    for v_mov in
      select produto_id, sum(quantidade) as quantidade
        from public.movimentacoes_estoque
       where origem_tipo = 'os_baixa' and origem_id = new.id
       group by produto_id
    loop
      insert into public.movimentacoes_estoque
        (produto_id, tipo, quantidade, origem_tipo, origem_id, observacao, created_by)
      values
        (v_mov.produto_id, 'entrada', v_mov.quantidade, 'os_estorno', new.id,
         'Estorno do cancelamento da OS #' || new.numero, auth.uid());
    end loop;
  end if;

  -- Só cancela o título se ninguém chegou a pagar.
  if new.conta_receber_id is not null then
    update public.contas_receber
       set status = 'cancelado'
     where id = new.conta_receber_id
       and status <> 'pago'
       and valor_pago = 0;
  end if;

  return new;
end;
$function$;

revoke execute on function public.estornar_os_cancelada() from anon, authenticated, public;

drop trigger if exists trg_os_estornar_cancelada on public.ordens_servico;
create trigger trg_os_estornar_cancelada
  after update on public.ordens_servico
  for each row execute function public.estornar_os_cancelada();

revoke execute on function public.enviar_orcamento_os(uuid) from anon, public;
revoke execute on function public.aprovar_orcamento_os(uuid, text) from anon, public;
revoke execute on function public.reprovar_orcamento_os(uuid, text) from anon, public;
revoke execute on function public.abrir_sub_os_garantia(uuid, text) from anon, public;

grant execute on function public.enviar_orcamento_os(uuid) to authenticated;
grant execute on function public.aprovar_orcamento_os(uuid, text) to authenticated;
grant execute on function public.reprovar_orcamento_os(uuid, text) to authenticated;
grant execute on function public.abrir_sub_os_garantia(uuid, text) to authenticated;
