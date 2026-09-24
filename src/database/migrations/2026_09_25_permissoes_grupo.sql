-- Permissões em grupo + limpeza do que saiu do catálogo.
-- Idempotente: pode rodar mais de uma vez.

BEGIN;

-- true = o gestor ajustou este funcionário individualmente (painel "Permissões" da linha).
-- Ajuste individual TEM PRIORIDADE: as alterações em grupo (por tipo ou por seleção)
-- não mexem em quem tem ajuste individual.
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS permissoes_personalizadas boolean NOT NULL DEFAULT false;

-- Funcionalidades que não existem na tela foram retiradas do catálogo
-- (editar/excluir/pausar/mudar prioridade de O.S.).
DELETE FROM usuario_permissoes
WHERE permissao IN ('os.editar', 'os.excluir', 'os.pausar', 'os.alterar_prioridade');

COMMIT;
