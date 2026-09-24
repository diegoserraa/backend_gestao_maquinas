-- Permissões por funcionário (por empresa).
-- Idempotente: pode rodar mais de uma vez.
--
-- Cada usuário (exceto ADMIN, que tem tudo) tem sua própria lista de permissões
-- "modulo.acao". O tipo (GESTOR/TECNICO/OPERADOR) só define o ponto de partida.
-- Usuários que já existem começam sem linhas e com permissoes_inicializadas = false:
-- na primeira requisição o backend aplica o padrão do tipo (migração "preguiçosa",
-- igual ao comportamento que eles já tinham).

BEGIN;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS permissoes_inicializadas boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS usuario_permissoes (
    usuario_id   integer     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    permissao    text        NOT NULL,
    empresa_id   uuid        NOT NULL REFERENCES empresas(id),
    concedida_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, permissao)
);

CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_empresa
    ON usuario_permissoes (empresa_id);

-- Quem mudou a permissão de quem, e como ficou (antes/depois).
CREATE TABLE IF NOT EXISTS auditoria_permissoes (
    id             bigserial   PRIMARY KEY,
    empresa_id     uuid        NOT NULL REFERENCES empresas(id),
    alterado_por   integer     REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_alvo   integer     REFERENCES usuarios(id) ON DELETE SET NULL,
    acao           text        NOT NULL,
    antes          jsonb       NOT NULL,
    depois         jsonb       NOT NULL,
    criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_permissoes_empresa_data
    ON auditoria_permissoes (empresa_id, criado_em DESC);

COMMIT;
