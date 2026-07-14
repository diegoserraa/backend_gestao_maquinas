import { pool } from "../database/connection";
import { IAnexo } from "../interfaces/Ianexo";

export class AnexoRepository {
    async criar(anexo: IAnexo): Promise<IAnexo> {
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
                origem
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7)
            RETURNING *
            `,
            [
                anexo.maquina_id,
                anexo.ordem_servico_id,
                anexo.nome_arquivo,
                anexo.caminho_arquivo,
                anexo.url_arquivo,
                anexo.tipo_arquivo,
                anexo.origem
            ]
        );

        return rows[0];
    }

    async listarPorMaquina(maquinaId: number) {
        const { rows } = await pool.query(
            `
            SELECT *
            FROM anexos
            WHERE maquina_id = $1
            ORDER BY created_at DESC
            `,
            [maquinaId]
        );

        return rows;
    }

    async listarPorOS(osId: number) {
        const { rows } = await pool.query(
            `
            SELECT *
            FROM anexos
            WHERE ordem_servico_id = $1
            ORDER BY created_at DESC
            `,
            [osId]
        );

        return rows;
    }

    async buscarPorId(id: number) {
        const { rows } = await pool.query(
            `
            SELECT *
            FROM anexos
            WHERE id = $1
            `,
            [id]
        );

        return rows[0] ?? null;
    }

    async excluir(id: number) {
        await pool.query(
            `
            DELETE FROM anexos
            WHERE id = $1
            `,
            [id]
        );
    }
}