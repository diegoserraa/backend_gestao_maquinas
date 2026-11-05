-- Módulo "Monitoramento" independente: em vez do dashboard mostrar TODA
-- máquina cadastrada (com ou sem sensor), só mostra as que foram ativadas
-- manualmente aqui (uma a uma, na tela "Adicionar máquinas" do módulo).
-- Não cria cadastro novo nenhum — reaproveita a tabela "maquinas" que já existe.
ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS monitoramento_ativo BOOLEAN NOT NULL DEFAULT false;

-- máquina que já tem telemetria de verdade chegando não deveria "desaparecer"
-- do dashboard só por causa dessa migração — nasce já ativada.
UPDATE maquinas m
SET monitoramento_ativo = true
WHERE EXISTS (SELECT 1 FROM telemetria_atual t WHERE t.maquina_id = m.id);
