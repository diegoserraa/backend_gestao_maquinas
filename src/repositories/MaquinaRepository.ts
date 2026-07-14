import { pool } from "../database/connection";
import { IMaquina } from "../interfaces/Imaquina";

export class MaquinaRepository {

       async listar(): Promise<any[]> {
  const { rows } = await pool.query(`
    SELECT 
      m.*,
      s.id AS setor_id_ref,
      s.nome AS setor_nome
    FROM maquinas m
    LEFT JOIN setores s ON s.id = m.setor_id
    ORDER BY m.id
  `);

  return rows.map(({
    setor_id_ref,
    setor_nome,
    ...machine
  }) => ({
    ...machine,
    setor: setor_id_ref
      ? {
          id: setor_id_ref,
          nome: setor_nome,
        }
      : null,
  }));
}
    async atualizarQrCode(id: number, qrCode: string): Promise<void> {

        await pool.query(
            `UPDATE maquinas
            SET qr_code = $1
            WHERE id = $2
            `, [qrCode, id]
        );
    }

    async buscarPorId(id: number): Promise<IMaquina | null> {

        const { rows } = await pool.query(
            `SELECT * FROM maquinas WHERE id = $1`,
            [id]
        );

        return rows[0] ?? null;
    }

    async criar(maquina: IMaquina): Promise<IMaquina> {

        const { rows } = await pool.query(
            `
            INSERT INTO maquinas
            (
                nome,
                modelo,
                fabricante,
                ano,
                setor_id,
                status,
                intervalo_manutencao_dias
            )
            VALUES
            (
                $1,$2,$3,$4,$5,$6,$7
            )
            RETURNING *
            `,
            [
                maquina.nome,
                maquina.modelo,
                maquina.fabricante,
                maquina.ano,
                maquina.setor_id,
                maquina.status,
                maquina.intervalo_manutencao_dias
            ]
        );

        return rows[0];
    }

    async atualizar(
        id: number,
        maquina: IMaquina
    ): Promise<IMaquina | null> {

        const { rows } = await pool.query(
            `
            UPDATE maquinas
            SET
                nome = $1,
                modelo = $2,
                fabricante = $3,
                ano = $4,
                setor_id = $5,
                status = $6,
                intervalo_manutencao_dias = $7
            WHERE id = $8
            RETURNING *
            `,
            [
                maquina.nome,
                maquina.modelo,
                maquina.fabricante,
                maquina.ano,
                maquina.setor_id,
                maquina.status,
                maquina.intervalo_manutencao_dias,
                id
            ]
        );

        return rows[0] ?? null;
    }

    async excluir(id: number): Promise<void> {

        await pool.query(
            `DELETE FROM maquinas WHERE id = $1`,
            [id]
        );
    }
    async alternarStatus(id: number, status: string): Promise<IMaquina | null> {

    const { rows } = await pool.query(
        `
        UPDATE maquinas
        SET status = $1
        WHERE id = $2
        RETURNING *
        `,
        [status, id]
    );

    return rows[0] ?? null;
}
    async listarOsPorMaquina(maquinaId: number): Promise<any[]> {
    const { rows } = await pool.query(
        `
        SELECT *
        FROM ordens_servico
        WHERE maquina_id = $1
        ORDER BY id DESC
        `,
        [maquinaId]
    );

    return rows;
}
    async atualizarImagem(id: number, url: string | null): Promise<IMaquina | null> {

    const { rows } = await pool.query(
        `
        UPDATE maquinas
        SET imagem_url = $1
        WHERE id = $2
        RETURNING *
        `,
        [url, id]
    );

    return rows[0] ?? null;
}
}