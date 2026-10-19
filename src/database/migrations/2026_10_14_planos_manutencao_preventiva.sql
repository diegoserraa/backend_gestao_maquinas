-- ============================================================
-- Planos de manutenção preventiva: várias regras independentes por
-- máquina (ex.: "troca de óleo" a cada 90 dias + "verificar correias"
-- a cada 500h), cada uma gerando sua própria O.S. e avançando sozinha.
--
-- Isto é ADITIVO: o campo antigo (maquinas.intervalo_manutencao_dias)
-- continua funcionando exatamente como antes para quem já usa — os
-- planos daqui são um mecanismo a mais, não uma migração/substituição.
-- ============================================================

CREATE TABLE IF NOT EXISTS planos_manutencao_preventiva (
    id                  SERIAL PRIMARY KEY,
    maquina_id          INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
    empresa_id          UUID NOT NULL REFERENCES empresas(id),

    descricao           TEXT NOT NULL,

    -- 'DIAS': vence por calendário (serve pra semanal/mensal/trimestral/etc,
    --         é só um número de dias diferente). 'HORAS': vence por tempo
    --         de operação real (precisa de sensor/horímetro na máquina).
    tipo_gatilho        TEXT NOT NULL CHECK (tipo_gatilho IN ('DIAS', 'HORAS')),

    intervalo_dias      INTEGER,
    intervalo_horas     NUMERIC(12, 2),

    proxima_data        DATE,            -- usado quando tipo_gatilho = 'DIAS'
    horas_referencia    NUMERIC(12, 2),  -- horímetro na última execução, quando tipo_gatilho = 'HORAS'

    ativo               BOOLEAN NOT NULL DEFAULT true,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planos_manutencao_maquina ON planos_manutencao_preventiva (maquina_id);
CREATE INDEX IF NOT EXISTS idx_planos_manutencao_vencimento_dias
    ON planos_manutencao_preventiva (proxima_data)
    WHERE ativo AND tipo_gatilho = 'DIAS';

-- amarra a O.S. gerada ao plano que a originou, pra saber qual plano
-- avançar quando ela for finalizada (NULL = O.S. preventiva manual/legada,
-- continua usando o campo único da máquina como já fazia antes)
ALTER TABLE ordens_servico
    ADD COLUMN IF NOT EXISTS plano_manutencao_id INTEGER REFERENCES planos_manutencao_preventiva(id);
