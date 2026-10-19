import { pool } from "../database/connection";
import { IPlanoManutencao, IPlanoVencido } from "../interfaces/Iplanomanutencao";

export class PlanoManutencaoRepository {

    async listarPorMaquina(maquinaId: number, empresaId: string): Promise<IPlanoManutencao[]> {
        const { rows } = await pool.query(
            `SELECT * FROM planos_manutencao_preventiva
             WHERE maquina_id = $1 AND empresa_id = $2
             ORDER BY criado_em ASC`,
            [maquinaId, empresaId]
        );
        return rows;
    }

    async buscarPorId(id: number, empresaId: string): Promise<IPlanoManutencao | null> {
        const { rows } = await pool.query(
            `SELECT * FROM planos_manutencao_preventiva WHERE id = $1 AND empresa_id = $2`,
            [id, empresaId]
        );
        return rows[0] ?? null;
    }

    async criar(plano: IPlanoManutencao, empresaId: string): Promise<IPlanoManutencao> {
        const { rows } = await pool.query(
            `INSERT INTO planos_manutencao_preventiva
                (maquina_id, empresa_id, descricao, tipo_gatilho, intervalo_dias, intervalo_horas, proxima_data, horas_referencia, ultima_manutencao, ativo)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING *`,
            [
                plano.maquina_id,
                empresaId,
                plano.descricao,
                plano.tipo_gatilho,
                plano.intervalo_dias ?? null,
                plano.intervalo_horas ?? null,
                plano.proxima_data ?? null,
                plano.horas_referencia ?? null,
                plano.ultima_manutencao ?? null,
                plano.ativo ?? true,
            ]
        );
        return rows[0];
    }

    async atualizar(id: number, plano: Partial<IPlanoManutencao>, empresaId: string): Promise<IPlanoManutencao | null> {
        const existente = await this.buscarPorId(id, empresaId);
        if (!existente) return null;

        const { rows } = await pool.query(
            `UPDATE planos_manutencao_preventiva
             SET descricao = $1, tipo_gatilho = $2, intervalo_dias = $3, intervalo_horas = $4,
                 proxima_data = $5, horas_referencia = $6, ultima_manutencao = $7, ativo = $8, atualizado_em = now()
             WHERE id = $9 AND empresa_id = $10
             RETURNING *`,
            [
                plano.descricao ?? existente.descricao,
                plano.tipo_gatilho ?? existente.tipo_gatilho,
                plano.intervalo_dias ?? existente.intervalo_dias ?? null,
                plano.intervalo_horas ?? existente.intervalo_horas ?? null,
                plano.proxima_data ?? existente.proxima_data ?? null,
                plano.horas_referencia ?? existente.horas_referencia ?? null,
                plano.ultima_manutencao ?? existente.ultima_manutencao ?? null,
                plano.ativo ?? existente.ativo,
                id,
                empresaId,
            ]
        );
        return rows[0];
    }

    async excluir(id: number, empresaId: string): Promise<boolean> {
        const { rowCount } = await pool.query(
            `DELETE FROM planos_manutencao_preventiva WHERE id = $1 AND empresa_id = $2`,
            [id, empresaId]
        );
        return (rowCount ?? 0) > 0;
    }

    /** Horímetro atual da máquina (telemetria_atual) — usado pra calcular o
     * ponto de partida de um plano por horas, e pra saber se já venceu.
     * Só conta se a leitura for recente (7 dias): um valor de meses atrás,
     * de quando um sensor foi testado ali uma vez e nunca mais mandou nada,
     * não significa que a máquina "tem sensor" de verdade hoje. */
    async horasAtuais(maquinaId: number): Promise<number | null> {
        const { rows } = await pool.query(
            `SELECT horas_ligadas FROM telemetria_atual
             WHERE maquina_id = $1 AND atualizado_em > now() - interval '7 days'`,
            [maquinaId]
        );
        return rows[0]?.horas_ligadas ?? null;
    }

    /** Varredura global (todas as empresas) — cada linha carrega seu próprio
     * empresa_id, igual o mesmo padrão já usado pra preventiva legada. */
    async buscarVencidosPorDias(dataHoje: string): Promise<IPlanoVencido[]> {
        const { rows } = await pool.query(
            `SELECT p.*, m.nome AS maquina_nome
             FROM planos_manutencao_preventiva p
             JOIN maquinas m ON m.id = p.maquina_id
             WHERE p.ativo
               AND p.tipo_gatilho = 'DIAS'
               AND p.proxima_data <= $1
               AND m.status = 'ativa'
               AND m.empresa_id IN (SELECT id FROM empresas WHERE ativo)`,
            [dataHoje]
        );
        return rows;
    }

    async buscarVencidosPorHoras(): Promise<IPlanoVencido[]> {
        const { rows } = await pool.query(
            `SELECT p.*, m.nome AS maquina_nome
             FROM planos_manutencao_preventiva p
             JOIN maquinas m ON m.id = p.maquina_id
             JOIN telemetria_atual t ON t.maquina_id = p.maquina_id
             WHERE p.ativo
               AND p.tipo_gatilho = 'HORAS'
               AND t.atualizado_em > now() - interval '7 days'
               AND t.horas_ligadas >= COALESCE(p.horas_referencia, 0) + p.intervalo_horas
               AND m.status = 'ativa'
               AND m.empresa_id IN (SELECT id FROM empresas WHERE ativo)`
        );
        return rows;
    }

    /** Depois que a O.S. gerada por este plano é finalizada: reinicia a
     * contagem a partir de agora (dias: hoje + intervalo; horas: horímetro
     * atual da máquina). */
    async avancar(id: number, empresaId: string, horasAtuais: number | null): Promise<void> {
        await pool.query(
            `UPDATE planos_manutencao_preventiva
             SET proxima_data = CASE WHEN tipo_gatilho = 'DIAS' THEN (CURRENT_DATE + (intervalo_dias || ' days')::interval)::date ELSE proxima_data END,
                 horas_referencia = CASE WHEN tipo_gatilho = 'HORAS' THEN COALESCE($3, horas_referencia) ELSE horas_referencia END,
                 ultima_manutencao = CURRENT_DATE,
                 atualizado_em = now()
             WHERE id = $1 AND empresa_id = $2`,
            [id, empresaId, horasAtuais]
        );
    }
}
