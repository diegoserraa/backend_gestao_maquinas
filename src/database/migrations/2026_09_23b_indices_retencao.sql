-- Índices pra paginação de notificações e pra limpeza de telemetria antiga.
-- Idempotente. Em tabela grande em produção, rode com CREATE INDEX CONCURRENTLY
-- (fora de transação) pra não bloquear escritas.

-- sino de notificações: WHERE usuario_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_data
    ON notificacoes (usuario_id, created_at DESC);

-- retenção: DELETE ... WHERE recebido_em < (agora - N dias), sem filtrar máquina
CREATE INDEX IF NOT EXISTS idx_telemetria_leituras_recebido
    ON telemetria_leituras (recebido_em);
