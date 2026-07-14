import { pool } from "../database/connection";
import { IParceiro } from "../interfaces/Iparceiros";

export class ParceiroRepository {

    async listar(): Promise<IParceiro[]> {
        const { rows } = await pool.query(
            `SELECT * FROM parceiros ORDER BY nome`
        );

        return rows;
    }
    async buscarPorCnpj(cnpj: string): Promise<IParceiro | null> {

    const { rows } = await pool.query(
        `SELECT * FROM parceiros WHERE cnpj = $1`,
        [cnpj]
    );

    return rows[0] ?? null;
}
    async buscarPorId(id: number): Promise<IParceiro | null> {
        const { rows } = await pool.query(
            `SELECT * FROM parceiros WHERE id = $1`,
            [id]
        );

        return rows[0] ?? null;
    }

    async criar(parceiro: IParceiro): Promise<IParceiro> {
        const { rows } = await pool.query(
            `
            INSERT INTO parceiros
            (
                nome,
                cnpj,
                telefone,
                email,
                observacoes
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5
            )
            RETURNING *
            `,
            [
                parceiro.nome,
                parceiro.cnpj,
                parceiro.telefone,
                parceiro.email,
                parceiro.observacoes
            ]
        );

        return rows[0];
    }

    async atualizar(
        id: number,
        parceiro: IParceiro
    ): Promise<IParceiro | null> {

        const { rows } = await pool.query(
            `
            UPDATE parceiros
            SET
                nome = $1,
                cnpj = $2,
                telefone = $3,
                email = $4,
                observacoes = $5
            WHERE id = $6
            RETURNING *
            `,
            [
                parceiro.nome,
                parceiro.cnpj,
                parceiro.telefone,
                parceiro.email,
                parceiro.observacoes,
                id
            ]
        );

        return rows[0] ?? null;
    }

    async excluir(id: number): Promise<void> {
        await pool.query(
            `DELETE FROM parceiros WHERE id = $1`,
            [id]
        );
    }
}