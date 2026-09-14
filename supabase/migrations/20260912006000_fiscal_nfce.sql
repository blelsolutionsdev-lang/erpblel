-- Fiscal: dados da empresa emitente e emissão de NFC-e a partir da OS.
-- A tabela de configuração existia vazia e notas_fiscais_saida nunca recebia
-- nenhuma linha.

alter table public.configuracoes_fiscais
  add column if not exists cnpj text,
  add column if not exists razao_social text,
  add column if not exists nome_fantasia text,
  add column if not exists inscricao_estadual text,
  add column if not exists regime_tributario smallint not null default 1,
  add column if not exists cfop_padrao text not null default '5102',
  add column if not exists csosn_padrao text not null default '102',
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists bairro text,
  add column if not exists municipio text,
  add column if not exists codigo_municipio text,
  add column if not exists uf text,
  add column if not exists cep text,
  add column if not exists telefone text;

comment on column public.configuracoes_fiscais.regime_tributario is
  '1 = Simples Nacional, 2 = Simples excesso de sublimite, 3 = Regime Normal (CRT da NF-e)';

alter table public.notas_fiscais_saida
  add column if not exists ambiente public.ambiente_fiscal not null default 'homologacao',
  add column if not exists emitida_por uuid references public.profiles(id) on delete set null;

-- Monta o payload da NFC-e a partir da OS concluída e reserva o número da
-- série. A emissão é feita pela Edge Function focus-nfe-emitir.
create or replace function public.preparar_nfce_os(p_os_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_cfg public.configuracoes_fiscais%rowtype;
  v_os public.ordens_servico%rowtype;
  v_cliente public.clientes%rowtype;
  v_nota_id uuid;
  v_numero bigint;
  v_itens jsonb;
begin
  if not public.user_has_permission('fiscal.gerenciar') then
    raise exception 'Você não tem permissão para emitir notas.' using errcode = '42501';
  end if;

  select * into v_cfg from public.configuracoes_fiscais where ativo order by created_at limit 1;
  if v_cfg.id is null then
    raise exception 'Configure os dados fiscais da empresa antes de emitir (Fiscal → Configuração).'
      using errcode = '22023';
  end if;
  if coalesce(btrim(v_cfg.cnpj), '') = '' or coalesce(btrim(v_cfg.razao_social), '') = '' then
    raise exception 'A configuração fiscal está incompleta: informe ao menos CNPJ e razão social.'
      using errcode = '22023';
  end if;

  select * into v_os from public.ordens_servico where id = p_os_id;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  if v_os.status <> 'concluida' then
    raise exception 'Só OS concluída gera NFC-e.' using errcode = '22023';
  end if;
  if exists (select 1 from public.notas_fiscais_saida where os_id = p_os_id and status in ('pendente', 'autorizada')) then
    raise exception 'Esta OS já tem NFC-e em processamento ou autorizada.' using errcode = '23505';
  end if;

  select * into v_cliente from public.clientes where id = v_os.cliente_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'numero_item', row_number() over (order by i.created_at),
           'codigo_produto', coalesce(p.sku, left(i.produto_id::text, 8), 'SERV'),
           'descricao', i.descricao,
           'codigo_ncm', coalesce(p.ncm, '00000000'),
           'cfop', v_cfg.cfop_padrao,
           'unidade_comercial', coalesce(u.sigla, 'UN'),
           'quantidade_comercial', i.quantidade,
           'valor_unitario_comercial', i.valor_unitario,
           'valor_bruto', i.valor_total,
           'icms_situacao_tributaria', v_cfg.csosn_padrao,
           'icms_origem', coalesce(p.origem_mercadoria, 0)
         ) order by i.created_at), '[]'::jsonb)
    into v_itens
    from public.ordens_servico_itens i
    left join public.produtos p on p.id = i.produto_id
    left join public.unidades_medida u on u.id = p.unidade_id
   where i.os_id = p_os_id;

  if v_itens = '[]'::jsonb then
    raise exception 'A OS não tem itens para compor a nota.' using errcode = '22023';
  end if;

  -- Reserva o número da série de forma atômica.
  update public.configuracoes_fiscais
     set proximo_numero = proximo_numero + 1
   where id = v_cfg.id
  returning proximo_numero - 1 into v_numero;

  insert into public.notas_fiscais_saida
    (numero, serie, cliente_id, os_id, valor_total, status, ambiente, emitida_por, focus_nfe_ref)
  values
    (v_numero, v_cfg.serie, v_os.cliente_id, p_os_id, v_os.valor_total, 'pendente', v_cfg.ambiente, auth.uid(),
     'os-' || v_os.numero || '-' || v_numero)
  returning id into v_nota_id;

  return jsonb_build_object(
    'nota_id', v_nota_id,
    'ref', 'os-' || v_os.numero || '-' || v_numero,
    'ambiente', v_cfg.ambiente,
    'payload', jsonb_build_object(
      'natureza_operacao', 'Venda de mercadoria e prestacao de servico',
      'data_emissao', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
      'presenca_comprador', '1',
      'modalidade_frete', '9',
      'local_destino', '1',
      'cnpj_emitente', regexp_replace(v_cfg.cnpj, '\D', '', 'g'),
      'nome_emitente', v_cfg.razao_social,
      'nome_fantasia_emitente', v_cfg.nome_fantasia,
      'inscricao_estadual_emitente', v_cfg.inscricao_estadual,
      'regime_tributario_emitente', v_cfg.regime_tributario,
      'logradouro_emitente', v_cfg.logradouro,
      'numero_emitente', v_cfg.numero,
      'bairro_emitente', v_cfg.bairro,
      'municipio_emitente', v_cfg.municipio,
      'codigo_municipio_emitente', v_cfg.codigo_municipio,
      'uf_emitente', v_cfg.uf,
      'cep_emitente', regexp_replace(coalesce(v_cfg.cep, ''), '\D', '', 'g'),
      'telefone_emitente', v_cfg.telefone,
      'serie', v_cfg.serie,
      'numero', v_numero,
      'nome_destinatario', v_cliente.nome,
      'cpf_destinatario', case when v_cliente.tipo_pessoa = 'PF'
                               then nullif(regexp_replace(coalesce(v_cliente.cpf_cnpj, ''), '\D', '', 'g'), '') end,
      'cnpj_destinatario', case when v_cliente.tipo_pessoa = 'PJ'
                                then nullif(regexp_replace(coalesce(v_cliente.cpf_cnpj, ''), '\D', '', 'g'), '') end,
      'valor_produtos', v_os.valor_total,
      'valor_total', v_os.valor_total,
      'valor_desconto', v_os.valor_desconto,
      'items', v_itens
    )
  );
end;
$function$;

create or replace function public.registrar_retorno_nfce(
  p_nota_id uuid,
  p_status text,
  p_chave text default null,
  p_xml_url text default null,
  p_danfe_url text default null,
  p_erro text default null
) returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.user_has_permission('fiscal.gerenciar') then
    raise exception 'Você não tem permissão para emitir notas.' using errcode = '42501';
  end if;

  update public.notas_fiscais_saida
     set status = p_status::nfce_status,
         chave_acesso = coalesce(nullif(p_chave, ''), chave_acesso),
         xml_url = coalesce(nullif(p_xml_url, ''), xml_url),
         danfe_url = coalesce(nullif(p_danfe_url, ''), danfe_url),
         erro_mensagem = nullif(p_erro, ''),
         autorizada_at = case when p_status = 'autorizada' then now() else autorizada_at end
   where id = p_nota_id;
end;
$function$;

revoke execute on function public.preparar_nfce_os(uuid) from anon, public;
revoke execute on function public.registrar_retorno_nfce(uuid, text, text, text, text, text) from anon, public;

grant execute on function public.preparar_nfce_os(uuid) to authenticated;
grant execute on function public.registrar_retorno_nfce(uuid, text, text, text, text, text) to authenticated;
