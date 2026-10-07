import { pool } from "../database/connection";
import { IMaquinaPareamento } from "../interfaces/Ipareamento";

export class PareamentoRepository {

    async empresaDaMaquina(maquinaId: number, empresaId: string): Promise<boolean> {
        const { rows } = await pool.query(
            `SELECT 1 FROM maquinas WHERE id = $1 AND empresa_id = $2`,
            [maquinaId, empresaId]
        );
        return rows.length > 0;
    }

    /** Invalida (marca como usado) qualquer PIN ainda ativo dessa máquina — só 1 vale por vez. */
    async invalidarAtivosDaMaquina(maquinaId: number): Promise<void> {
        await pool.query(
            `UPDATE maquina_pareamentos SET usado_em = now() WHERE maquina_id = $1 AND usado_em IS NULL`,
            [maquinaId]
        );
    }

    async criar(p: {
        maquina_id: number;
        empresa_id: string;
        codigo: string;
        expira_em: Date;
    }): Promise<IMaquinaPareamento> {
        const { rows } = await pool.query(
            `INSERT INTO maquina_pareamentos (maquina_id, empresa_id, codigo, expira_em)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [p.maquina_id, p.empresa_id, p.codigo, p.expira_em]
        );
        return rows[0];
    }

    /** Busca um PIN ainda ativo (não usado, não expirado) — usado no resgate público. */
    async buscarAtivo(codigo: string): Promise<IMaquinaPareamento | null> {
        const { rows } = await pool.query(
            `SELECT * FROM maquina_pareamentos
             WHERE codigo = $1 AND usado_em IS NULL AND expira_em > now()`,
            [codigo]
        );
        return rows[0] ?? null;
    }

    async marcarUsado(id: number, macDispositivo: string | null): Promise<void> {
        await pool.query(
            `UPDATE maquina_pareamentos SET usado_em = now(), mac_dispositivo = $2 WHERE id = $1`,
            [id, macDispositivo]
        );
    }

    async nomeMaquina(maquinaId: number): Promise<string | null> {
        const { rows } = await pool.query(`SELECT nome FROM maquinas WHERE id = $1`, [maquinaId]);
        return rows[0]?.nome ?? null;
    }
}
