import { pool } from "../database/connection";
import { IParceiro } from "../interfaces/Iparceiros";

export class ParceiroRepository {

    async listar(empresaId: string): Promise<IParceiro[]> {
        const { rows } = await pool.query(
            `SELECT * FROM parceiros WHERE empresa_id = $1 ORDER BY nome`,
            [empresaId]
        );

        return rows;
    }
    async buscarPorCnpj(cnpj: string, empresaId: string): Promise<IParceiro | null> {

    const { rows } = await pool.query(
        `SELECT * FROM parceiros WHERE cnpj = $1 AND empresa_id = $2`,
        [cnpj, empresaId]
    );

    return rows[0] ?? null;
}
    async buscarPorId(id: number, empresaId: string): Promise<IParceiro | null> {
        const { rows } = await pool.query(
            `SELECT * FROM parceiros WHERE id = $1 AND empresa_id = $2`,
            [id, empresaId]
        );

        return rows[0] ?? null;
    }

    async criar(parceiro: IParceiro, empresaId: string): Promise<IParceiro> {
        const { rows } = await pool.query(
            `
            INSERT INTO parceiros
            (
                nome,
                cnpj,
                telefone,
                email,
                observacoes,
                empresa_id
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6
            )
            RETURNING *
            `,
            [
                parceiro.nome,
                parceiro.cnpj,
                parceiro.telefone,
                parceiro.email,
                parceiro.observacoes,
                empresaId
            ]
        );

        return rows[0];
    }

    async atualizar(
        id: number,
        parceiro: IParceiro,
        empresaId: string
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
            WHERE id = $6 AND empresa_id = $7
            RETURNING *
            `,
            [
                parceiro.nome,
                parceiro.cnpj,
                parceiro.telefone,
                parceiro.email,
                parceiro.observacoes,
                id,
                empresaId
            ]
        );

        return rows[0] ?? null;
    }

    async excluir(id: number, empresaId: string): Promise<void> {
        await pool.query(
            `DELETE FROM parceiros WHERE id = $1 AND empresa_id = $2`,
            [id, empresaId]
        );
    }
}