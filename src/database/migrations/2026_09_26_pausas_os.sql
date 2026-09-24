-- Pausa de ordem de serviço: histórico de pausas + métricas na própria O.S.
-- (idempotente: pode rodar mais de uma vez)

-- métricas consolidadas na O.S. (leitura barata em listas, dashboards e relatórios)
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS tempo_pausado_segundos integer NOT NULL DEFAULT 0;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS pausada_em timestamp NULL;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS motivo_pausa text NULL;

-- histórico: uma linha por pausa (a aberta tem retomada_em nulo)
CREATE TABLE IF NOT EXISTS os_pausas (
    id            serial PRIMARY KEY,
    os_id         integer NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    empresa_id    uuid    NOT NULL REFERENCES empresas(id),
    motivo        text    NOT NULL,
    pausada_em    timestamp NOT NULL,
    retomada_em   timestamp NULL,
    pausada_por   integer NULL,
    retomada_por  integer NULL
);

CREATE INDEX IF NOT EXISTS idx_os_pausas_os ON os_pausas (os_id);
CREATE INDEX IF NOT EXISTS idx_os_pausas_empresa ON os_pausas (empresa_id);

-- no máximo UMA pausa aberta por O.S. (protege contra cliques duplos / requisições simultâneas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_os_pausas_aberta ON os_pausas (os_id) WHERE retomada_em IS NULL;

-- gestor não faz manutenção (não assume, não inicia, não pausa): limpa permissões antigas
DELETE FROM usuario_permissoes
WHERE permissao IN ('os.assumir', 'os.iniciar', 'os.pausar')
  AND usuario_id IN (SELECT id FROM usuarios WHERE role = 'GESTOR');
