-- Pareamento de dispositivo (ESP32) com uma máquina, sem precisar editar
-- firmware/regravar a placa pra cada equipamento novo. Fluxo:
--   1) usuário logado gera um código curto (PIN) pra uma máquina na tela;
--   2) a placa, na primeira configuração (sem WiFi/máquina salvos), digita
--      esse PIN na telinha dela e resgata via endpoint público;
--   3) o PIN expira rápido e só vale uma vez.
CREATE TABLE IF NOT EXISTS maquina_pareamentos (
    id              SERIAL PRIMARY KEY,
    maquina_id      INTEGER NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE,
    empresa_id      UUID NOT NULL REFERENCES empresas(id),
    codigo          TEXT NOT NULL,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em       TIMESTAMPTZ NOT NULL,
    usado_em        TIMESTAMPTZ,
    mac_dispositivo TEXT
);

-- busca pelo código só entre os ainda não usados (resgate) — não precisa
-- ser único pra sempre, só enquanto estiver ativo (pode repetir depois de
-- expirado/usado, o WHERE já exclui esses da combinação)
CREATE UNIQUE INDEX IF NOT EXISTS idx_maquina_pareamentos_codigo_ativo
    ON maquina_pareamentos (codigo) WHERE usado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_maquina_pareamentos_maquina
    ON maquina_pareamentos (maquina_id);
