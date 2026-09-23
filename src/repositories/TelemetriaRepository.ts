import { pool } from "../database/connection";
import {
    ITelemetriaAtualComMaquina,
    ITelemetriaLeitura,
} from "../interfaces/Itelemetria";

// SELECT compartilhado: máquina + última telemetria + limites configurados.
const SELECT_ATUAL = `
    SELECT
        m.id            AS maquina_id,
        m.empresa_id    AS empresa_id,
        m.nome          AS maquina_nome,
        m.status        AS status,
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
        const { rows } = await pool.query(
            `${SELECT_ATUAL} WHERE m.empresa_id = $1 ORDER BY m.nome`,
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

    // pg devolve NUMERIC como string — convertemos para number
    private normalizar = (r: any): ITelemetriaAtualComMaquina => {
        const limitesBrutos = r.limites ?? {};
        const limites: ITelemetriaAtualComMaquina["limites"] = {};
        for (const [chave, v] of Object.entries<any>(limitesBrutos)) {
            limites[chave] = {
                atencao: v?.atencao === null || v?.atencao === undefined ? null : Number(v.atencao),
                alarme: v?.alarme === null || v?.alarme === undefined ? null : Number(v.alarme),
                minimo: v?.minimo === null || v?.minimo === undefined ? null : Number(v.minimo),
            };
        }

        return {
            maquina_id: Number(r.maquina_id),
            empresa_id: r.empresa_id,
            maquina_nome: r.maquina_nome ?? null,
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
