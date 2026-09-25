-- Trocar a senha encerra as outras sessões: o token carrega a versão da sessão do usuário (sv) e
-- só vale enquanto ela for igual à do banco. Trocar a senha incrementa a versão.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS versao_sessao integer NOT NULL DEFAULT 0;
