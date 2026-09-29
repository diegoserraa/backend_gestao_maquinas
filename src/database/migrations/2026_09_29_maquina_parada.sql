-- "Máquina parada" — versão enxuta do v1: um booleano + motivo, respondido
-- só na ABERTURA da O.S. (sem tabela nova, sem múltiplas janelas por O.S.).
-- A duração é sempre calculada, nunca guardada: da data_abertura até
-- data_resolucao (se finalizada) ou data_cancelamento (se cancelada) ou
-- NOW() (se ainda aberta) — ver DashboardRepository.
-- (idempotente: pode rodar mais de uma vez)

ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS maquina_parada boolean NOT NULL DEFAULT false;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS motivo_parada text NULL;

-- consultas do KPI (contagem "paradas agora" e soma "horas no período") filtram
-- por isso o tempo todo — sem índice, vira full scan conforme a base cresce
CREATE INDEX IF NOT EXISTS idx_os_maquina_parada ON ordens_servico (empresa_id, maquina_parada) WHERE maquina_parada = true;
