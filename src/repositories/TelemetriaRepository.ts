import { pool } from "../database/connection";
import {
    FaixaHistorico,
    IPontoAgregado,
    ITelemetriaAtualComMaquina,
    ITelemetriaLeitura,
    MetricaHistorico,
} from "../interfaces/Itelemetria";

// configuração de cada "balde" de tempo do histórico agregado — espelha
// FAIXA_CFG em front-maquinas/.../monitoramentoService.ts (mesma faixa,
// mesma quantidade de pontos), só que quem agora faz o agrupamento de
// verdade é o Postgres (date_trunc + generate_series), não mais um mock.
const TZ_PADRAO = "America/Sao_Paulo";

const BUCKET_CFG: Record<
    FaixaHistorico,
    { pontos: number; passo: string; truncUnidade: string | null }
> = {
    // truncUnidade = null -> caso especial "6 horas" (ver montarFim abaixo),
    // sem equivalente direto em date_trunc
    "1h": { pontos: 24, passo: "1 hour", truncUnidade: "hour" },
    "6h": { pontos: 8, passo: "6 hours", truncUnidade: null },
    "24h": { pontos: 14, passo: "1 day", truncUnidade: "day" },
    "7d": { pontos: 10, passo: "1 week", truncUnidade: "week" },
    "30d": { pontos: 12, passo: "1 month", truncUnidade: "month" },
};

// colunas numéricas válidas de telemetria_leituras — nunca vem direto da
// query string sem passar por esta checagem (evita montar SQL com nome de
// coluna arbitrário)
const COLUNA_METRICA: Record<MetricaHistorico, string> = {
    temperatura: "temperatura",
    vibracao: "vibracao",
    horas_ligadas: "horas_ligadas",
};

// SELECT compartilhado: máquina + última telemetria + limites configurados.
const SELECT_ATUAL = `
    SELECT
        m.id            AS maquina_id,
        m.empresa_id    AS empresa_id,
        m.nome          AS maquina_nome,
        m.status        AS status,
        m.imagem_url    AS imagem_url,
        s.id            AS setor_id,
        s.nome          AS setor_nome,
        t.temperatura   AS temperatura,
        t.vibracao      AS vibracao,
        t.horas_ligadas AS horas_ligadas,
        t.atualizado_em AS atualizado_em,
        COALESCE((
            SELECT jsonb_object_agg(mp.chave, jsonb_build_object(
                'atencao', mp.atencao,
                'alarme',  mp.alarme,
                'minimo',  mp.minimo
            ))
            FROM maquina_parametros mp
            WHERE mp.maquina_id = m.id AND mp.ativo
        ), '{}'::jsonb) AS limites
    FROM maquinas m
    LEFT JOIN setores s          ON s.id = m.setor_id
    LEFT JOIN telemetria_atual t ON t.maquina_id = m.id
`;

export class TelemetriaRepository {

    async maquinaExiste(id: number): Promise<boolean> {
        const { rows } = await pool.query(
            `SELECT 1 FROM maquinas WHERE id = $1`,
            [id]
        );
        return rows.length > 0;
    }

    // maquina_id já identifica a empresa dona da leitura (dispositivo MQTT
    // não carrega tenant nenhum) — empresa_id é derivado da própria máquina.
    async salvarLeitura(leitura: ITelemetriaLeitura): Promise<ITelemetriaLeitura> {
        const { rows } = await pool.query(
            `
            INSERT INTO telemetria_leituras
                (maquina_id, temperatura, vibracao, horas_ligadas, payload_bruto, empresa_id)
            VALUES
                ($1, $2, $3, $4, $5, (SELECT empresa_id FROM maquinas WHERE id = $1))
            RETURNING id, maquina_id, temperatura, vibracao, horas_ligadas, recebido_em
            `,
            [
                leitura.maquina_id,
                leitura.temperatura,
                leitura.vibracao,
                leitura.horas_ligadas,
                leitura.payload_bruto ?? null,
            ]
        );
        return rows[0];
    }

    async upsertAtual(leitura: ITelemetriaLeitura): Promise<void> {
        await pool.query(
            `
            INSERT INTO telemetria_atual
                (maquina_id, temperatura, vibracao, horas_ligadas, atualizado_em, empresa_id)
            VALUES
                ($1, $2, $3, $4, now(), (SELECT empresa_id FROM maquinas WHERE id = $1))
            ON CONFLICT (maquina_id) DO UPDATE SET
                temperatura   = EXCLUDED.temperatura,
                vibracao      = EXCLUDED.vibracao,
                horas_ligadas = EXCLUDED.horas_ligadas,
                atualizado_em = now()
            `,
            [
                leitura.maquina_id,
                leitura.temperatura,
                leitura.vibracao,
                leitura.horas_ligadas,
            ]
        );
    }

    /**
     * Todas as máquinas + a última telemetria (quando houver) + limites.
     * payload_bruto NÃO é exposto aqui de propósito.
     */
    async listarAtual(empresaId: string): Promise<ITelemetriaAtualComMaquina[]> {
        // módulo "Monitoramento" independente do cadastro de máquinas: só
        // mostra quem foi ativado manualmente (ver MaquinaRepository.alternarMonitoramento)
        const { rows } = await pool.query(
            `${SELECT_ATUAL} WHERE m.empresa_id = $1 AND m.monitoramento_ativo ORDER BY m.nome`,
            [empresaId]
        );
        return rows.map(this.normalizar);
    }

    // empresaId opcional: o ingest do MQTT (sem contexto de requisição) usa
    // isso só pra devolver a leitura recém-gravada pro broadcast do
    // WebSocket, sem precisar filtrar por empresa nesse ponto.
    async buscarAtualPorMaquina(
        maquinaId: number,
        empresaId?: string
    ): Promise<ITelemetriaAtualComMaquina | null> {
        const { rows } = await pool.query(
            empresaId
                ? `${SELECT_ATUAL} WHERE m.id = $1 AND m.empresa_id = $2`
                : `${SELECT_ATUAL} WHERE m.id = $1`,
            empresaId ? [maquinaId, empresaId] : [maquinaId]
        );
        return rows[0] ? this.normalizar(rows[0]) : null;
    }

    async listarHistorico(
        maquinaId: number,
        desde: Date | null,
        limite: number,
        empresaId: string
    ): Promise<ITelemetriaLeitura[]> {
        const { rows } = await pool.query(
            `
            SELECT id, maquina_id, temperatura, vibracao, horas_ligadas, recebido_em
            FROM telemetria_leituras
            WHERE maquina_id = $1
              AND empresa_id = $4
              AND ($2::timestamptz IS NULL OR recebido_em >= $2)
            ORDER BY recebido_em DESC
            LIMIT $3
            `,
            [maquinaId, desde, limite, empresaId]
        );

        return rows.map((r) => ({
            ...r,
            temperatura: r.temperatura === null ? null : Number(r.temperatura),
            vibracao: r.vibracao === null ? null : Number(r.vibracao),
            horas_ligadas:
                r.horas_ligadas === null ? null : Number(r.horas_ligadas),
        }));
    }

    /**
     * Histórico agregado por balde de tempo (date_trunc + AVG/MIN/MAX),
     * pro gráfico principal de monitoramento. Sempre devolve `pontos`
     * baldes consecutivos terminando no balde atual (alinhados ao
     * calendário de America/Sao_Paulo), mesmo quando não há leitura
     * nenhuma em algum deles (vem com media/minimo/maximo = null).
     *
     * horas_ligadas é um contador crescente (não uma métrica que oscila),
     * então usa MAX em vez de AVG/MIN — representa "valor do horímetro
     * no fim daquele balde", sem banda de mín/máx.
     */
    async listarHistoricoAgregado(
        maquinaId: number,
        faixa: FaixaHistorico,
        metrica: MetricaHistorico,
        empresaId: string
    ): Promise<IPontoAgregado[]> {
        const cfg = BUCKET_CFG[faixa];
        const coluna = COLUNA_METRICA[metrica];
        const isHorimetro = metrica === "horas_ligadas";
        const aggMedia = isHorimetro ? "MAX" : "AVG";
        const aggMin = isHorimetro ? "MAX" : "MIN";
        const aggMax = isHorimetro ? "MAX" : "MAX";

        // "fim" = início do balde mais recente que já fechou (ou está em
        // andamento) — p.ex. faixa "24h" (1 balde = 1 dia) com agora =
        // 14:32 -> fim = meia-noite de hoje, no fuso de TZ_PADRAO.
        const fimExpr = cfg.truncUnidade
            ? `date_trunc('${cfg.truncUnidade}', now() AT TIME ZONE $3) AT TIME ZONE $3`
            : // caso especial "6 horas": trunca o dia e desce pro múltiplo de 6h
              `(date_trunc('day', now() AT TIME ZONE $3)
                  + floor(extract(hour from now() AT TIME ZONE $3) / 6) * interval '6 hours'
               ) AT TIME ZONE $3`;

        const { rows } = await pool.query(
            `
            WITH limites AS (
                SELECT ${fimExpr} AS fim
            ),
            serie AS (
                SELECT generate_series(
                    (SELECT fim FROM limites) - ($4::interval * ($5::int - 1)),
                    (SELECT fim FROM limites),
                    $4::interval
                ) AS bucket_start
            )
            SELECT
                s.bucket_start                  AS instante,
                ${aggMedia}(t.${coluna})         AS media,
                ${aggMin}(t.${coluna})           AS minimo,
                ${aggMax}(t.${coluna})           AS maximo
            FROM serie s
            LEFT JOIN telemetria_leituras t
                ON t.maquina_id = $1
               AND t.empresa_id = $2
               AND t.recebido_em >= s.bucket_start
               AND t.recebido_em < s.bucket_start + $4::interval
            GROUP BY s.bucket_start
            ORDER BY s.bucket_start
            `,
            [maquinaId, empresaId, TZ_PADRAO, cfg.passo, cfg.pontos]
        );

        return rows.map((r) => ({
            instante: r.instante,
            media: r.media === null ? null : Number(r.media),
            minimo: r.minimo === null ? null : Number(r.minimo),
            maximo: r.maximo === null ? null : Number(r.maximo),
        }));
    }

    /**
     * Relatório do módulo de Monitoramento: leituras cruas de um período
     * (uma máquina ou todas, igual o filtro vier) + um resumo calculado
     * sobre o período INTEIRO (não só as linhas devolvidas — ver "limite").
     * "horas trabalhadas" só sai preenchido com uma máquina só selecionada:
     * horímetros de máquinas diferentes não têm o que somar entre si.
     */
    async listarRelatorio(params: {
        empresaId: string;
        maquinaId: number | null;
        desde: Date | null;
        ate: Date | null;
        limite: number;
    }): Promise<{ leituras: any[]; resumo: any; porDia: any[]; totalNoPeriodo: number }> {
        const { empresaId, maquinaId, desde, ate, limite } = params;

        const condicoes = `
            t.empresa_id = $1
            AND ($2::int IS NULL OR t.maquina_id = $2)
            AND ($3::timestamptz IS NULL OR t.recebido_em >= $3)
            AND ($4::timestamptz IS NULL OR t.recebido_em <= $4)
        `;

        const [leiturasRes, resumoRes, porDiaRes] = await Promise.all([
            pool.query(
                `
                SELECT t.id, t.maquina_id, m.nome AS maquina_nome,
                       t.temperatura, t.vibracao, t.horas_ligadas, t.recebido_em,
                       lim.limites
                FROM telemetria_leituras t
                JOIN maquinas m ON m.id = t.maquina_id
                LEFT JOIN LATERAL (
                    SELECT jsonb_object_agg(mp.chave, jsonb_build_object(
                        'atencao', mp.atencao,
                        'alarme',  mp.alarme,
                        'minimo',  mp.minimo
                    )) AS limites
                    FROM maquina_parametros mp
                    WHERE mp.maquina_id = m.id AND mp.ativo
                ) lim ON true
                WHERE ${condicoes}
                ORDER BY t.recebido_em DESC
                LIMIT $5
                `,
                [empresaId, maquinaId, desde, ate, limite]
            ),
            pool.query(
                `
                SELECT
                    COUNT(*)::int                AS total,
                    MIN(t.recebido_em)            AS periodo_desde,
                    MAX(t.recebido_em)             AS periodo_ate,
                    AVG(t.temperatura)            AS temp_media,
                    MIN(t.temperatura)            AS temp_min,
                    MAX(t.temperatura)            AS temp_max,
                    AVG(t.vibracao)               AS vib_media,
                    MIN(t.vibracao)               AS vib_min,
                    MAX(t.vibracao)               AS vib_max,
                    MIN(t.horas_ligadas)          AS horas_min,
                    MAX(t.horas_ligadas)          AS horas_max
                FROM telemetria_leituras t
                WHERE ${condicoes}
                `,
                [empresaId, maquinaId, desde, ate]
            ),
            // por dia, pro gráfico de tendência — sempre sobre o período
            // inteiro (nunca cortado pelo "limite" da lista crua acima)
            pool.query(
                `
                SELECT
                    date_trunc('day', t.recebido_em AT TIME ZONE 'America/Sao_Paulo') AS dia,
                    COUNT(*)::int     AS leituras,
                    AVG(t.temperatura) AS temp_media,
                    AVG(t.vibracao)    AS vib_media
                FROM telemetria_leituras t
                WHERE ${condicoes}
                GROUP BY 1
                ORDER BY 1
                `,
                [empresaId, maquinaId, desde, ate]
            ),
        ]);

        const num = (v: any) => (v === null || v === undefined ? null : Number(v));
        const r = resumoRes.rows[0];

        const leituras = leiturasRes.rows.map((row) => ({
            ...row,
            temperatura: num(row.temperatura),
            vibracao: num(row.vibracao),
            horas_ligadas: num(row.horas_ligadas),
            limites: this.normalizarLimites(row.limites),
        }));

        const totalNoPeriodo = Number(r?.total ?? 0);
        const horasMin = num(r?.horas_min);
        const horasMax = num(r?.horas_max);

        const resumo = {
            total_leituras: totalNoPeriodo,
            periodo_desde: r?.periodo_desde ?? null,
            periodo_ate: r?.periodo_ate ?? null,
            temperatura: { media: num(r?.temp_media), minimo: num(r?.temp_min), maximo: num(r?.temp_max) },
            vibracao: { media: num(r?.vib_media), minimo: num(r?.vib_min), maximo: num(r?.vib_max) },
            horas:
                maquinaId != null
                    ? { inicio: horasMin, fim: horasMax, trabalhadas: horasMin != null && horasMax != null ? horasMax - horasMin : null }
                    : null,
        };

        const porDia = porDiaRes.rows.map((row) => ({
            dia: row.dia,
            leituras: Number(row.leituras),
            temperatura: num(row.temp_media),
            vibracao: num(row.vib_media),
        }));

        return { leituras, resumo, porDia, totalNoPeriodo };
    }

    // limites configurados (maquina_parametros) vêm da query como jsonb cru —
    // usado tanto na telemetria atual quanto nas leituras do relatório
    private normalizarLimites(bruto: any): Record<string, { atencao: number | null; alarme: number | null; minimo: number | null }> {
        const limites: Record<string, { atencao: number | null; alarme: number | null; minimo: number | null }> = {};
        for (const [chave, v] of Object.entries<any>(bruto ?? {})) {
            limites[chave] = {
                atencao: v?.atencao === null || v?.atencao === undefined ? null : Number(v.atencao),
                alarme: v?.alarme === null || v?.alarme === undefined ? null : Number(v.alarme),
                minimo: v?.minimo === null || v?.minimo === undefined ? null : Number(v.minimo),
            };
        }
        return limites;
    }

    // pg devolve NUMERIC como string — convertemos para number
    private normalizar = (r: any): ITelemetriaAtualComMaquina => {
        const limites = this.normalizarLimites(r.limites);

        return {
            maquina_id: Number(r.maquina_id),
            empresa_id: r.empresa_id,
            maquina_nome: r.maquina_nome ?? null,
            imagem_url: r.imagem_url ?? null,
            setor_id: r.setor_id === null ? null : Number(r.setor_id),
            setor_nome: r.setor_nome ?? null,
            status: r.status ?? null,
            temperatura: r.temperatura === null ? null : Number(r.temperatura),
            vibracao: r.vibracao === null ? null : Number(r.vibracao),
            horas_ligadas:
                r.horas_ligadas === null ? null : Number(r.horas_ligadas),
            atualizado_em: r.atualizado_em ?? null,
            limites,
        };
    };
}
