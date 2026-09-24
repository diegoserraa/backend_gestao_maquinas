import { Pool } from "pg";
import { pool } from "../database/connection";
import { IMaquina } from "../interfaces/Imaquina";
import { Pagina } from "../utils/paginacao";

export class MaquinaRepository {

       async listar(empresaId: string, { limite, offset }: Pagina): Promise<{ itens: any[]; total: number }> {
  const [lista, contagem] = await Promise.all([pool.query(`
    SELECT
      m.*,
      s.id AS setor_id_ref,
      s.nome AS setor_nome
    FROM maquinas m
    LEFT JOIN setores s ON s.id = m.setor_id
    WHERE m.empresa_id = $1
    ORDER BY m.id
    LIMIT $2 OFFSET $3
  `, [empresaId, limite, offset]),
  pool.query(`SELECT COUNT(*)::int AS n FROM maquinas WHERE empresa_id = $1`, [empresaId])]);

  const itens = lista.rows.map(({
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

  return { itens, total: contagem.rows[0].n };
}
    async atualizarQrCode(id: number, qrCode: string, empresaId: string): Promise<void> {

        await pool.query(
            `UPDATE maquinas
            SET qr_code = $1
            WHERE id = $2 AND empresa_id = $3
            `, [qrCode, id, empresaId]
        );
    }

    async buscarPorId(id: number, empresaId: string): Promise<IMaquina | null> {

        const { rows } = await pool.query(
            `SELECT * FROM maquinas WHERE id = $1 AND empresa_id = $2`,
            [id, empresaId]
        );

        return rows[0] ?? null;
    }

    async criar(maquina: IMaquina, empresaId: string): Promise<IMaquina> {

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
                intervalo_manutencao_dias,
                ultima_manutencao,
                proxima_manutencao,
                empresa_id
            )
            VALUES
            (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
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
                maquina.intervalo_manutencao_dias,
                maquina.ultima_manutencao,
                maquina.proxima_manutencao,
                empresaId
            ]
        );

        return rows[0];
    }

    async atualizar(
        id: number,
        maquina: IMaquina,
        empresaId: string
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
                intervalo_manutencao_dias = $7,
                ultima_manutencao = $8,
                proxima_manutencao = $9
            WHERE id = $10 AND empresa_id = $11
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
                maquina.ultima_manutencao,
                maquina.proxima_manutencao,
                id,
                empresaId
            ]
        );

        return rows[0] ?? null;
    }
    async registrarPreventiva(
    id: number,
    ultimaManutencao: Date,
    proximaManutencao: Date,
    empresaId: string
): Promise<IMaquina | null> {

    const { rows } = await pool.query(
        `
        UPDATE maquinas
        SET
            ultima_manutencao = $1,
            proxima_manutencao = $2
        WHERE id = $3 AND empresa_id = $4
        RETURNING *
        `,
        [
            ultimaManutencao,
            proximaManutencao,
            id,
            empresaId
        ]
    );

    return rows[0] ?? null;
}

    async excluir(id: number, empresaId: string): Promise<void> {

        await pool.query(
            `DELETE FROM maquinas WHERE id = $1 AND empresa_id = $2`,
            [id, empresaId]
        );
    }
    async alternarStatus(id: number, status: string, empresaId: string): Promise<IMaquina | null> {

    const { rows } = await pool.query(
        `
        UPDATE maquinas
        SET status = $1
        WHERE id = $2 AND empresa_id = $3
        RETURNING *
        `,
        [status, id, empresaId]
    );

    return rows[0] ?? null;
}
    async listarOsPorMaquina(maquinaId: number, empresaId: string, apenasDoUsuario: number | null = null): Promise<any[]> {
    const { rows } = await pool.query(
        `
        SELECT *
        FROM ordens_servico
        WHERE maquina_id = $1 AND empresa_id = $2
          AND ($3::int IS NULL OR id_solicitante = $3 OR id_tecnico = $3)
        ORDER BY id DESC
        `,
        [maquinaId, empresaId, apenasDoUsuario]
    );

    return rows;
}
    async atualizarImagem(id: number, url: string | null, empresaId: string): Promise<IMaquina | null> {

    const { rows } = await pool.query(
        `
        UPDATE maquinas
        SET imagem_url = $1
        WHERE id = $2 AND empresa_id = $3
        RETURNING *
        `,
        [url, id, empresaId]
    );

    return rows[0] ?? null;
}
// Usada pelo cron de manutenção preventiva, que roda sem contexto de
// requisição — varre TODAS as empresas de propósito (sem filtro), e cada
// linha retornada já carrega seu próprio empresa_id pra quem chamar usar.
async buscarPorDataProximaManutencao(
    data: string
){

    const result = await pool.query(
        `
        SELECT *
        FROM maquinas
        WHERE proxima_manutencao = $1
        AND status = 'ativa'
        `,
        [
            data
        ]
    );


    return result.rows;

}
}