-- Ciclo completo da OS: orçamento com aprovação, agenda (prioridade e
-- previsão de entrega), garantia com prazo e o equipamento que a OS conserta.
--
-- Antes: a OS ia de "aberta" direto para "em andamento" (não existia o passo
-- de orçar e o cliente aprovar), não tinha data prevista nem prioridade,
-- `eh_garantia` era só um marcador sem prazo, e a tabela `equipamentos` existia
-- vazia e sem tela — a sub-OS "herdava" um equipamento sempre nulo.

-- ALTER TYPE ... ADD VALUE não pode ser usado na mesma transação em que é
-- criado: por isso enum e uso ficam em migrations separadas.
alter type public.os_status add value if not exists 'orcamento' before 'em_andamento';
alter type public.os_status add value if not exists 'reprovada' after 'cancelada';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'os_prioridade') then
    create type public.os_prioridade as enum ('baixa', 'normal', 'alta', 'urgente');
  end if;
end $$;

alter table public.ordens_servico
  add column if not exists prioridade public.os_prioridade not null default 'normal',
  add column if not exists data_prevista date,
  add column if not exists orcamento_enviado_em timestamptz,
  add column if not exists aprovado_em timestamptz,
  add column if not exists aprovado_por text,
  add column if not exists reprovado_em timestamptz,
  add column if not exists motivo_reprovacao text,
  add column if not exists garantia_dias integer not null default 90,
  add column if not exists garantia_ate date;

create index if not exists idx_os_data_prevista on public.ordens_servico (data_prevista);
create index if not exists idx_os_status on public.ordens_servico (status);

alter table public.equipamentos
  add column if not exists ativo boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_equipamentos_updated_at on public.equipamentos;
create trigger trg_equipamentos_updated_at
  before update on public.equipamentos
  for each row execute function public.set_updated_at();

create index if not exists idx_equipamentos_serie on public.equipamentos (numero_serie);
