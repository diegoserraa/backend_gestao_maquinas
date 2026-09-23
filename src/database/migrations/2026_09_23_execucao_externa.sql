-- Técnico externo deixa de ser um usuário "falso" (id fixo) e passa a ser
-- uma marca na própria O.S. Funciona igual pra qualquer empresa, sem seed.
-- Idempotente: pode rodar mais de uma vez.

BEGIN;

ALTER TABLE ordens_servico
    ADD COLUMN IF NOT EXISTS execucao_externa boolean NOT NULL DEFAULT false;

-- O.S. antigas atribuídas ao usuário-placeholder viram execução externa
-- (id_tecnico volta a ficar vazio, já que não existe técnico de fato).
UPDATE ordens_servico os
SET execucao_externa = true,
    id_tecnico = NULL
FROM usuarios u
WHERE u.id = os.id_tecnico
  AND u.email = 'tecnico.externo@sistema.local';

COMMIT;
