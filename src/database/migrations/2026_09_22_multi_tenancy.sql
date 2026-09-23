-- ============================================================
-- Multi-tenancy: tabela `empresas` + coluna empresa_id em todas
-- as tabelas existentes.
-- Rodar uma vez no SQL editor do Supabase.
--
-- Seguro rodar em banco com dados: cria uma empresa "matriz",
-- associa todas as linhas que já existem a ela e só depois torna
-- a coluna obrigatória. Todo o script é idempotente — pode rodar
-- de novo sem quebrar nada se parar no meio.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Tabela de empresas (tenants)
CREATE TABLE IF NOT EXISTS empresas (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome       TEXT NOT NULL,
    ativo      BOOLEAN NOT NULL DEFAULT true,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Empresa "matriz": recebe todos os dados que já existem hoje.
--    Só cria se ainda não existir nenhuma empresa.
INSERT INTO empresas (nome)
SELECT 'Empresa Principal'
WHERE NOT EXISTS (SELECT 1 FROM empresas);

-- 3) Coluna empresa_id em cada tabela + backfill pra empresa matriz
--    + índice. A empresa matriz é sempre "a mais antiga" (primeira
--    criada), então novas empresas cadastradas depois nunca entram
--    nesse backfill por engano.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE usuarios SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE usuarios ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios (empresa_id);

ALTER TABLE setores ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE setores SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE setores ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_setores_empresa ON setores (empresa_id);

ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE maquinas SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE maquinas ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maquinas_empresa ON maquinas (empresa_id);

ALTER TABLE parceiros ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE parceiros SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE parceiros ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parceiros_empresa ON parceiros (empresa_id);

ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE ordens_servico SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE ordens_servico ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ordens_servico_empresa ON ordens_servico (empresa_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_empresa_status ON ordens_servico (empresa_id, status);

ALTER TABLE anexos ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE anexos SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE anexos ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anexos_empresa ON anexos (empresa_id);

ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE notificacoes SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE notificacoes ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notificacoes_empresa ON notificacoes (empresa_id);

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE push_subscriptions SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE push_subscriptions ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_empresa ON push_subscriptions (empresa_id);

ALTER TABLE telemetria_leituras ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE telemetria_leituras SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE telemetria_leituras ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telemetria_leituras_empresa ON telemetria_leituras (empresa_id);

ALTER TABLE telemetria_atual ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE telemetria_atual SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE telemetria_atual ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telemetria_atual_empresa ON telemetria_atual (empresa_id);

ALTER TABLE maquina_parametros ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE maquina_parametros SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE maquina_parametros ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maquina_parametros_empresa ON maquina_parametros (empresa_id);

ALTER TABLE telemetria_alerta_estado ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE telemetria_alerta_estado SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE telemetria_alerta_estado ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telemetria_alerta_estado_empresa ON telemetria_alerta_estado (empresa_id);

ALTER TABLE telemetria_alertas ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
UPDATE telemetria_alertas SET empresa_id = (SELECT id FROM empresas ORDER BY criado_em LIMIT 1) WHERE empresa_id IS NULL;
ALTER TABLE telemetria_alertas ALTER COLUMN empresa_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telemetria_alertas_empresa ON telemetria_alertas (empresa_id);
