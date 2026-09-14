-- Rede de segurança: `create or replace view` não preserva `security_invoker`,
-- então qualquer alteração futura nessas views pode derrubá-lo de novo e fazer
-- a leitura passar a ignorar a RLS de quem consulta. Foi o que aconteceu ao
-- recriar vw_produtos_estoque para explodir o kit — o advisor pegou como ERROR.
alter view public.vw_produtos_estoque set (security_invoker = true);
alter view public.vw_saldo_lotes set (security_invoker = true);
