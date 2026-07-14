import { pool } from "../database/connection";
import { ISetor } from "../interfaces/Isetor";

export class SetorRepository {

    async listar(): Promise<ISetor[]> {
        const { rows } = await pool.query(
            `SELECT * FROM setores ORDER BY id`
        );

        return rows;
    }

    async buscarPorId(id: number): Promise<ISetor | null> {
        const { rows } = await pool.query(
            `SELECT * FROM setores WHERE id = $1`,
            [id]
        );

        return rows[0] ?? null;
    }

    async criar(setor: ISetor): Promise<ISetor> {
        const { rows } = await pool.query(
            `
            INSERT INTO setores (nome, descricao)
            VALUES ($1, $2)
            RETURNING *
            `,
            [setor.nome, setor.descricao]
        );

        return rows[0];
    }

    async atualizar(id: number, setor: ISetor): Promise<ISetor | null> {
        const { rows } = await pool.query(
            `
            UPDATE setores
            SET nome = $1,
                descricao = $2
            WHERE id = $3
            RETURNING *
            `,
            [setor.nome, setor.descricao, id]
        );

        return rows[0] ?? null;
    }

    async excluir(id: number): Promise<void> {
        await pool.query(
            `DELETE FROM setores WHERE id = $1`,
            [id]
        );
    }
}