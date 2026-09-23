-- ============================================================
-- Corrige restrições de unicidade que ficaram globais (uma só
-- por banco inteiro) quando deveriam ser por empresa — sequela
-- direta da migration de multi-tenancy: sem isso, a segunda
-- empresa cadastrada nunca consegue usar um nome de setor ou
-- CNPJ de parceiro que a primeira empresa já usou.
--
-- Rodar uma vez no SQL editor do Supabase, depois da migration
-- 2026_09_22_multi_tenancy.sql.
-- ============================================================

-- 1) Setores: nome só precisa ser único DENTRO da mesma empresa
ALTER TABLE setores DROP CONSTRAINT IF EXISTS setores_nome_key;
CREATE UNIQUE INDEX IF NOT EXISTS setores_empresa_nome_key
    ON setores (empresa_id, nome);

-- 2) Parceiros: mesma lógica pro CNPJ — duas empresas diferentes
--    podem cadastrar o mesmo fornecedor/parceiro externo.
ALTER TABLE parceiros DROP CONSTRAINT IF EXISTS parceiros_cnpj_unique;
CREATE UNIQUE INDEX IF NOT EXISTS parceiros_empresa_cnpj_key
    ON parceiros (empresa_id, cnpj);
