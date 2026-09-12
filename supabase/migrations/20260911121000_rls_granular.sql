-- Hardening 2/4 — RLS por permissão.
--
-- Antes: quase toda tabela tinha `authenticated_all` (qualquer usuário logado
-- fazia qualquer coisa) e `servicos` estava aberta até para `anon`. Agora cada
-- módulo exige a permissão correspondente para escrever, leitura exige usuário
-- ativo, e o razão de estoque é imutável (sem update/delete).

-- ---------------------------------------------------------------- estoque
drop policy if exists authenticated_all on public.produtos;
create policy produtos_select on public.produtos for select to authenticated using ((select public.usuario_ativo()));
create policy produtos_insert on public.produtos for insert to authenticated with check ((select public.user_has_permission('estoque.produtos.gerenciar')));
create policy produtos_update on public.produtos for update to authenticated using ((select public.user_has_permission('estoque.produtos.gerenciar'))) with check ((select public.user_has_permission('estoque.produtos.gerenciar')));
create policy produtos_delete on public.produtos for delete to authenticated using ((select public.user_has_permission('estoque.produtos.gerenciar')));

drop policy if exists authenticated_all on public.produto_kit_itens;
create policy kit_itens_select on public.produto_kit_itens for select to authenticated using ((select public.usuario_ativo()));
create policy kit_itens_write on public.produto_kit_itens for all to authenticated using ((select public.user_has_permission('estoque.produtos.gerenciar'))) with check ((select public.user_has_permission('estoque.produtos.gerenciar')));

drop policy if exists authenticated_all on public.categorias_produtos;
create policy categorias_produtos_select on public.categorias_produtos for select to authenticated using ((select public.usuario_ativo()));
create policy categorias_produtos_write on public.categorias_produtos for all to authenticated using ((select public.user_has_permission('estoque.produtos.gerenciar'))) with check ((select public.user_has_permission('estoque.produtos.gerenciar')));

drop policy if exists authenticated_all on public.unidades_medida;
create policy unidades_select on public.unidades_medida for select to authenticated using ((select public.usuario_ativo()));
create policy unidades_write on public.unidades_medida for all to authenticated using ((select public.user_has_permission('estoque.produtos.gerenciar'))) with check ((select public.user_has_permission('estoque.produtos.gerenciar')));

-- Razão de estoque: só insere. Correção se faz com novo lançamento.
drop policy if exists authenticated_all on public.movimentacoes_estoque;
create policy movimentacoes_select on public.movimentacoes_estoque for select to authenticated using ((select public.usuario_ativo()));
create policy movimentacoes_insert on public.movimentacoes_estoque for insert to authenticated
  with check ((select public.user_has_permission('estoque.entradas.processar')) or (select public.user_has_permission('estoque.produtos.gerenciar')));

drop policy if exists authenticated_all on public.notas_fiscais_entrada;
create policy nfe_entrada_select on public.notas_fiscais_entrada for select to authenticated using ((select public.usuario_ativo()));
create policy nfe_entrada_write on public.notas_fiscais_entrada for all to authenticated using ((select public.user_has_permission('estoque.entradas.processar'))) with check ((select public.user_has_permission('estoque.entradas.processar')));

drop policy if exists authenticated_all on public.notas_fiscais_entrada_itens;
create policy nfe_entrada_itens_select on public.notas_fiscais_entrada_itens for select to authenticated using ((select public.usuario_ativo()));
create policy nfe_entrada_itens_write on public.notas_fiscais_entrada_itens for all to authenticated using ((select public.user_has_permission('estoque.entradas.processar'))) with check ((select public.user_has_permission('estoque.entradas.processar')));

-- ---------------------------------------------------------------- cadastros
drop policy if exists authenticated_all on public.clientes;
create policy clientes_select on public.clientes for select to authenticated using ((select public.usuario_ativo()));
create policy clientes_write on public.clientes for all to authenticated using ((select public.user_has_permission('administrativo.clientes.gerenciar'))) with check ((select public.user_has_permission('administrativo.clientes.gerenciar')));

drop policy if exists authenticated_all on public.equipamentos;
create policy equipamentos_select on public.equipamentos for select to authenticated using ((select public.usuario_ativo()));
create policy equipamentos_write on public.equipamentos for all to authenticated
  using ((select public.user_has_permission('administrativo.clientes.gerenciar')) or (select public.user_has_permission('os.criar')))
  with check ((select public.user_has_permission('administrativo.clientes.gerenciar')) or (select public.user_has_permission('os.criar')));

-- Entrada de NF-e cadastra fornecedor novo a partir do CNPJ da nota.
drop policy if exists authenticated_all on public.fornecedores;
create policy fornecedores_select on public.fornecedores for select to authenticated using ((select public.usuario_ativo()));
create policy fornecedores_write on public.fornecedores for all to authenticated
  using ((select public.user_has_permission('administrativo.fornecedores.gerenciar')) or (select public.user_has_permission('estoque.entradas.processar')))
  with check ((select public.user_has_permission('administrativo.fornecedores.gerenciar')) or (select public.user_has_permission('estoque.entradas.processar')));

-- ---------------------------------------------------------------- financeiro
drop policy if exists authenticated_all on public.contas_pagar;
create policy contas_pagar_select on public.contas_pagar for select to authenticated using ((select public.usuario_ativo()));
create policy contas_pagar_write on public.contas_pagar for all to authenticated using ((select public.user_has_permission('financeiro.gerenciar'))) with check ((select public.user_has_permission('financeiro.gerenciar')));

drop policy if exists authenticated_all on public.contas_receber;
create policy contas_receber_select on public.contas_receber for select to authenticated using ((select public.usuario_ativo()));
create policy contas_receber_write on public.contas_receber for all to authenticated using ((select public.user_has_permission('financeiro.gerenciar'))) with check ((select public.user_has_permission('financeiro.gerenciar')));

drop policy if exists authenticated_all on public.caixa_movimentacoes;
create policy caixa_select on public.caixa_movimentacoes for select to authenticated using ((select public.usuario_ativo()));
create policy caixa_write on public.caixa_movimentacoes for all to authenticated using ((select public.user_has_permission('financeiro.gerenciar'))) with check ((select public.user_has_permission('financeiro.gerenciar')));

drop policy if exists authenticated_all on public.categorias_financeiras;
create policy categorias_financeiras_select on public.categorias_financeiras for select to authenticated using ((select public.usuario_ativo()));
create policy categorias_financeiras_write on public.categorias_financeiras for all to authenticated using ((select public.user_has_permission('financeiro.gerenciar'))) with check ((select public.user_has_permission('financeiro.gerenciar')));

-- ---------------------------------------------------------------- serviços e fiscal
-- A policy antiga de `servicos` valia para `public`: o catálogo (e os preços)
-- estava legível e gravável por qualquer um com a chave anônima.
drop policy if exists authenticated_all on public.servicos;
create policy servicos_select on public.servicos for select to authenticated using ((select public.usuario_ativo()));
create policy servicos_write on public.servicos for all to authenticated using ((select public.user_has_permission('os.servicos.gerenciar'))) with check ((select public.user_has_permission('os.servicos.gerenciar')));

drop policy if exists authenticated_all on public.notas_fiscais_saida;
create policy nfce_saida_select on public.notas_fiscais_saida for select to authenticated using ((select public.usuario_ativo()));
create policy nfce_saida_write on public.notas_fiscais_saida for all to authenticated using ((select public.user_has_permission('fiscal.gerenciar'))) with check ((select public.user_has_permission('fiscal.gerenciar')));

-- Guarda o token da Focus NFE: leitura também é restrita.
drop policy if exists authenticated_all on public.configuracoes_fiscais;
create policy config_fiscais_select on public.configuracoes_fiscais for select to authenticated using ((select public.user_has_permission('fiscal.gerenciar')));
create policy config_fiscais_write on public.configuracoes_fiscais for all to authenticated using ((select public.user_has_permission('fiscal.gerenciar'))) with check ((select public.user_has_permission('fiscal.gerenciar')));

-- ---------------------------------------------------------------- OS
-- Itens só mudam enquanto a OS está aberta, e só pelo técnico dela ou por quem
-- tem os.editar.
drop policy if exists authenticated_all on public.ordens_servico_itens;

create policy os_itens_select on public.ordens_servico_itens for select to authenticated using ((select public.usuario_ativo()));

create policy os_itens_insert on public.ordens_servico_itens for insert to authenticated
  with check (exists (
    select 1 from public.ordens_servico os
    where os.id = os_id
      and os.status not in ('concluida', 'cancelada')
      and ((select public.user_has_permission('os.editar')) or os.tecnico_id = (select auth.uid()))
  ));

create policy os_itens_update on public.ordens_servico_itens for update to authenticated
  using (exists (
    select 1 from public.ordens_servico os
    where os.id = os_id
      and os.status not in ('concluida', 'cancelada')
      and ((select public.user_has_permission('os.editar')) or os.tecnico_id = (select auth.uid()))
  ));

create policy os_itens_delete on public.ordens_servico_itens for delete to authenticated
  using (exists (
    select 1 from public.ordens_servico os
    where os.id = os_id
      and os.status not in ('concluida', 'cancelada')
      and ((select public.user_has_permission('os.editar')) or os.tecnico_id = (select auth.uid()))
  ));

drop policy if exists authenticated_all on public.os_anexos;

create policy os_anexos_select on public.os_anexos for select to authenticated using ((select public.usuario_ativo()));

create policy os_anexos_insert on public.os_anexos for insert to authenticated
  with check (exists (
    select 1 from public.ordens_servico os
    where os.id = os_id
      and ((select public.user_has_permission('os.editar')) or os.tecnico_id = (select auth.uid()))
  ));

create policy os_anexos_delete on public.os_anexos for delete to authenticated
  using ((select public.user_has_permission('os.editar')));

-- ---------------------------------------------------------------- perfis/papéis
drop policy if exists profiles_select_all on public.profiles;
-- O próprio usuário sempre lê o próprio perfil (é assim que o app descobre que
-- foi desativado e força logout); os demais perfis, só usuário ativo.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.usuario_ativo()));

drop policy if exists os_select_all on public.ordens_servico;
create policy os_select on public.ordens_servico for select to authenticated using ((select public.usuario_ativo()));

drop policy if exists roles_select_all on public.roles;
create policy roles_select on public.roles for select to authenticated using ((select public.usuario_ativo()));

drop policy if exists permissions_select_all on public.permissions;
create policy permissions_select on public.permissions for select to authenticated using ((select public.usuario_ativo()));

drop policy if exists role_permissions_select_all on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated using ((select public.usuario_ativo()));

drop policy if exists user_permissions_select_all on public.user_permissions;
create policy user_permissions_select on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.user_has_permission('administrativo.usuarios.gerenciar')));

-- Leitura do financeiro também é restrita: um técnico não precisa ver os
-- títulos a pagar/receber da empresa.
drop policy if exists contas_pagar_select on public.contas_pagar;
create policy contas_pagar_select on public.contas_pagar for select to authenticated
  using ((select public.user_has_permission('financeiro.gerenciar')));

drop policy if exists contas_receber_select on public.contas_receber;
create policy contas_receber_select on public.contas_receber for select to authenticated
  using ((select public.user_has_permission('financeiro.gerenciar')));

drop policy if exists caixa_select on public.caixa_movimentacoes;
create policy caixa_select on public.caixa_movimentacoes for select to authenticated
  using ((select public.user_has_permission('financeiro.gerenciar')));
