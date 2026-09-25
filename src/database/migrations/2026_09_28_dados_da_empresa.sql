-- Dados cadastrais e comerciais da empresa (identificação e cobrança) + auditoria das ações do administrador.
-- (idempotente: pode rodar mais de uma vez)

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS razao_social    text NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cnpj            varchar(14) NULL;
-- cliente sem CNPJ (MEI/pessoa física): exige observação explicando
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS sem_cnpj        boolean NOT NULL DEFAULT false;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS telefone        varchar(20) NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS email_cobranca  text NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cidade          text NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS uf              char(2) NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS plano           varchar(20) NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inicio_contrato date NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS observacoes     text NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS criada_por      integer NULL;

-- um CNPJ só pode pertencer a uma empresa (o banco garante, mesmo se duas criações chegarem juntas)
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_cnpj ON empresas (cnpj) WHERE cnpj IS NOT NULL;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone varchar(20) NULL;

-- quem fez o quê no painel do administrador (criar, editar, inativar, reativar)
CREATE TABLE IF NOT EXISTS auditoria_admin (
    id          bigserial PRIMARY KEY,
    admin_id    integer NOT NULL,
    acao        text NOT NULL,
    empresa_id  uuid NULL,
    detalhes    jsonb NULL,
    criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_admin_empresa ON auditoria_admin (empresa_id, criado_em);
