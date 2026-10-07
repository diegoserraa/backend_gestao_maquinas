-- Evita dois alertas 'aberto' simultâneos pra mesma (máquina, métrica).
--
-- A proteção contra corrida (duas leituras quase juntas confirmando o
-- mesmo alerta ao mesmo tempo) era só em memória, dentro do processo
-- (fila por máquina em MonitoramentoService) — não protege contra duas
-- avaliações rodando em paralelo em processos diferentes (ex.: durante
-- um redeploy com overlap momentâneo de instâncias). Índice único
-- parcial: garante no banco que só existe 1 linha 'aberto' por
-- (maquina_id, chave) por vez, sem impedir o histórico de alertas já
-- resolvidos/convertidos pra essa mesma combinação.
CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetria_alertas_aberto_unico
    ON telemetria_alertas (maquina_id, chave)
    WHERE status = 'aberto';
