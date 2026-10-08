-- Corrige o bug de "horário aparece 3h errado": várias colunas de data
-- ficaram como `timestamp SEM fuso horário` (diferente do resto do banco,
-- que corretamente usa `timestamp WITH time zone`). O app conecta com
-- `timezone=America/Sao_Paulo` na sessão (src/database/connection.ts), e
-- o SQL NOW() respeita isso certinho — mas quando o código em
-- OrdemServicoService.ts grava `new Date().toISOString()` (uma string já
-- com 'Z'/UTC) numa coluna sem fuso, o Postgres guarda os dígitos crus
-- sem converter, e a releitura reinterpreta esses dígitos como se fossem
-- horário de Brasília — descasando em exatos 3 horas (o fuso do Brasil).
--
-- A correção estrutural é parar de ter coluna "sem fuso" pra datas que
-- representam um instante (igual todo o resto do schema já faz).
--
-- USING ... AT TIME ZONE 'America/Sao_Paulo': reinterpreta cada valor já
-- gravado exatamente como a aplicação já vinha lendo (mesma conversão que
-- o driver pg aplica na leitura hoje) — não muda o que já está sendo
-- exibido pra dado existente, só fecha a ambiguidade daqui pra frente.
ALTER TABLE ordens_servico
    ALTER COLUMN data_abertura           TYPE timestamptz USING data_abertura           AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN data_atribuicao         TYPE timestamptz USING data_atribuicao         AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN data_cancelamento       TYPE timestamptz USING data_cancelamento       AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN data_inicio_atendimento TYPE timestamptz USING data_inicio_atendimento AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN data_resolucao          TYPE timestamptz USING data_resolucao          AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN pausada_em              TYPE timestamptz USING pausada_em              AT TIME ZONE 'America/Sao_Paulo';

ALTER TABLE ordens_servico
    ALTER COLUMN data_abertura SET DEFAULT now();

ALTER TABLE os_pausas
    ALTER COLUMN pausada_em  TYPE timestamptz USING pausada_em  AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN retomada_em TYPE timestamptz USING retomada_em AT TIME ZONE 'America/Sao_Paulo';

ALTER TABLE anexos
    ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE maquinas
    ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE notificacoes
    ALTER COLUMN created_at    TYPE timestamptz USING created_at    AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN data_exclusao TYPE timestamptz USING data_exclusao AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE parceiros
    ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE push_subscriptions
    ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE setores
    ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE usuarios
    ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'America/Sao_Paulo',
    ALTER COLUMN created_at SET DEFAULT now();
