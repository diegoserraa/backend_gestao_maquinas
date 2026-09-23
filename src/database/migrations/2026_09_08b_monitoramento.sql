-- ============================================================
-- Parâmetros de monitoramento por máquina + rotina de alertas
-- Rodar uma vez no SQL editor do Supabase.
-- ============================================================

-- 1) Parâmetros configuráveis por máquina (lista, não colunas fixas).
--    chave: 'temperatura', 'vibracao', ... (amanhã: 'corrente', 'pressao'...)
--    campos NULL = "usa o padrão" (default global/setor — v2).
CREATE TABLE IF NOT EXISTS maquina_parametros (
    id             BIGSERIAL PRIMARY KEY,
    maquina_id     INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
    chave          TEXT    NOT NULL,
    unidade        TEXT,
    minimo         NUMERIC,                        -- opcional (limite de baixo)
    atencao        NUMERIC,                        -- >= => ATENÇÃO
    alarme         NUMERIC,                        -- >= => ALARME (crítico)
    janela_seg     INTEGER NOT NULL DEFAULT 120,   -- tempo fora do limite p/ confirmar
    abrir_os_auto  BOOLEAN NOT NULL DEFAULT false, -- abre O.S. sozinha (padrão: não)
    ativo          BOOLEAN NOT NULL DEFAULT true,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (maquina_id, chave)
);
CREATE INDEX IF NOT EXISTS idx_maquina_parametros_maquina
    ON maquina_parametros (maquina_id);

-- 2) Estado da avaliação por máquina+métrica (desde quando está fora).
CREATE TABLE IF NOT EXISTS telemetria_alerta_estado (
    maquina_id     INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
    chave          TEXT    NOT NULL,
    nivel          TEXT    NOT NULL DEFAULT 'normal',   -- normal|atencao|critico
    fora_desde     TIMESTAMPTZ,
    valor_pico     NUMERIC,
    alerta_id      BIGINT,
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (maquina_id, chave)
);

-- 3) Alertas (abertos / resolvidos / convertidos em O.S.)
CREATE TABLE IF NOT EXISTS telemetria_alertas (
    id                BIGSERIAL PRIMARY KEY,
    maquina_id        INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
    chave             TEXT    NOT NULL,
    nivel             TEXT    NOT NULL,              -- atencao|critico|sem_sinal
    valor             NUMERIC,
    limite            NUMERIC,
    status            TEXT    NOT NULL DEFAULT 'aberto', -- aberto|resolvido|convertido
    ordem_servico_id  INTEGER REFERENCES ordens_servico(id) ON DELETE SET NULL,
    detalhe           TEXT,
    aberto_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolvido_em      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_telemetria_alertas_abertos
    ON telemetria_alertas (status, maquina_id);

-- 4) Semear parâmetros padrão para as máquinas que já existem.
INSERT INTO maquina_parametros (maquina_id, chave, unidade, atencao, alarme, janela_seg)
SELECT m.id, 'temperatura', 'C', 60, 80, 120 FROM maquinas m
ON CONFLICT (maquina_id, chave) DO NOTHING;

INSERT INTO maquina_parametros (maquina_id, chave, unidade, atencao, alarme, janela_seg)
SELECT m.id, 'vibracao', 'mm/s', 4.5, 7, 120 FROM maquinas m
ON CONFLICT (maquina_id, chave) DO NOTHING;
