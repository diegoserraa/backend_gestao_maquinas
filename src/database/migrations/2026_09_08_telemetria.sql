-- ============================================================
-- Telemetria dos ESP32 (temperatura, vibração, horas ligadas)
-- Rodar uma vez no SQL editor do Supabase / psql.
-- ============================================================

-- Histórico completo (uma linha por mensagem MQTT recebida)
CREATE TABLE IF NOT EXISTS telemetria_leituras (
    id              BIGSERIAL PRIMARY KEY,
    maquina_id      INTEGER NOT NULL
                        REFERENCES maquinas(id) ON DELETE CASCADE,
    temperatura     NUMERIC(10, 2),
    vibracao        NUMERIC(10, 3),
    horas_ligadas   NUMERIC(12, 2),
    payload_bruto   JSONB,
    recebido_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetria_leituras_maquina_data
    ON telemetria_leituras (maquina_id, recebido_em DESC);

-- Snapshot: última leitura de cada máquina (leitura rápida do painel)
CREATE TABLE IF NOT EXISTS telemetria_atual (
    maquina_id      INTEGER PRIMARY KEY
                        REFERENCES maquinas(id) ON DELETE CASCADE,
    temperatura     NUMERIC(10, 2),
    vibracao        NUMERIC(10, 3),
    horas_ligadas   NUMERIC(12, 2),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
