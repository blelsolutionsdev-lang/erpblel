-- Senha provisória deixa de virar senha definitiva.
--
-- A Edge Function admin-users marca a flag ao criar um usuário ou resetar a
-- senha; o app bloqueia a navegação até a troca e limpa a flag depois.

alter table public.profiles
  add column if not exists deve_trocar_senha boolean not null default false;
