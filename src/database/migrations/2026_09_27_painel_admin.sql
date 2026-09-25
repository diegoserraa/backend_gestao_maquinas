-- Painel do administrador (dono do sistema): situação da empresa, último acesso e senha temporária.
-- (idempotente: pode rodar mais de uma vez)

-- por que/quando a empresa foi inativada (a coluna "ativo" já existia)
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inativada_em timestamptz NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS motivo_inativacao text NULL;

-- último login do usuário (para acompanhar o uso de cada empresa)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso timestamptz NULL;

-- gestor criado pelo painel nasce com senha temporária: precisa trocar no primeiro acesso
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS deve_trocar_senha boolean NOT NULL DEFAULT false;

-- consultas do painel (contagens por empresa)
CREATE INDEX IF NOT EXISTS idx_telemetria_atual_empresa ON telemetria_atual (empresa_id, atualizado_em);
