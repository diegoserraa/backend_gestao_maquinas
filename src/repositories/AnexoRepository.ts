import { pool } from "../database/connection";
import { IAnexo } from "../interfaces/Ianexo";

export class AnexoRepository {
    async criar(anexo: IAnexo, empresaId: string): Promise<IAnexo> {
        const { rows } = await pool.query(
            `
            INSERT INTO anexos
            (
                maquina_id,
                ordem_servico_id,
                nome_arquivo,
                caminho_arquivo,
                url_arquivo,
                tipo_arquivo,
                origem,
                empresa_id
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING *
            `,
            [
                anexo.maquina_id,
                anexo.ordem_servico_id,
                anexo.nome_arquivo,
                anexo.caminho_arquivo,
                anexo.url_arquivo,
                anexo.tipo_arquivo,
                anexo.origem,
                empresaId
            ]
        );

        return rows[0];
    }

    async listarPorMaquina(maquinaId: number, empresaId: string) {
        const { rows } = await pool.query(
            `
            SELECT *
            FROM anexos
            WHERE maquina_id = $1 AND empresa_id = $2
            ORDER BY created_at DESC
            `,
            [maquinaId, empresaId]
        );

        return rows;
    }

    async listarPorOS(osId: number, empresaId: string) {
        const { rows } = await pool.query(
            `
            SELECT *
            FROM anexos
            WHERE ordem_servico_id = $1 AND empresa_id = $2
            ORDER BY created_at DESC
            `,
            [osId, empresaId]
        );

        return rows;
    }

    async buscarPorId(id: number, empresaId: string) {
        const { rows } = await pool.query(
            `
            SELECT *
            FROM anexos
            WHERE id = $1 AND empresa_id = $2
            `,
            [id, empresaId]
        );

        return rows[0] ?? null;
    }

    async excluir(id: number, empresaId: string) {
        await pool.query(
            `
            DELETE FROM anexos
            WHERE id = $1 AND empresa_id = $2
            `,
            [id, empresaId]
        );
    }
}