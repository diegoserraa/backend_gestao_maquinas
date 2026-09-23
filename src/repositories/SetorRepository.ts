import { pool } from "../database/connection";
import { ISetor } from "../interfaces/Isetor";

export class SetorRepository {

    async listar(empresaId: string): Promise<ISetor[]> {
        const { rows } = await pool.query(
            `SELECT * FROM setores WHERE empresa_id = $1 ORDER BY id`,
            [empresaId]
        );

        return rows;
    }

    async buscarPorId(id: number, empresaId: string): Promise<ISetor | null> {
        const { rows } = await pool.query(
            `SELECT * FROM setores WHERE id = $1 AND empresa_id = $2`,
            [id, empresaId]
        );

        return rows[0] ?? null;
    }

    async criar(setor: ISetor, empresaId: string): Promise<ISetor> {
        const { rows } = await pool.query(
            `
            INSERT INTO setores (nome, descricao, empresa_id)
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [setor.nome, setor.descricao, empresaId]
        );

        return rows[0];
    }

    async atualizar(id: number, setor: ISetor, empresaId: string): Promise<ISetor | null> {
        const { rows } = await pool.query(
            `
            UPDATE setores
            SET nome = $1,
                descricao = $2
            WHERE id = $3 AND empresa_id = $4
            RETURNING *
            `,
            [setor.nome, setor.descricao, id, empresaId]
        );

        return rows[0] ?? null;
    }

    async excluir(id: number, empresaId: string): Promise<void> {
        await pool.query(
            `DELETE FROM setores WHERE id = $1 AND empresa_id = $2`,
            [id, empresaId]
        );
    }
}