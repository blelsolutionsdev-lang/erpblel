-- Hardening 4/4 — permissão órfã.
--
-- `os.servicos.gerenciar` existia na tabela de permissões mas não estava ligada
-- a papel nenhum: nem admin conseguia editar o catálogo de serviços depois que
-- o RLS granular entrou.

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.nome in ('admin', 'gerente')
  and p.chave = 'os.servicos.gerenciar'
on conflict do nothing;
