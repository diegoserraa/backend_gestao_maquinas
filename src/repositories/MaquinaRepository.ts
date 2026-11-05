import { Pool, PoolClient } from "pg";
import { pool } from "../database/connection";
import { IMaquina, INovoVinculoExterno } from "../interfaces/Imaquina";
import { Pagina } from "../utils/paginacao";

async function transacao<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        const resultado = await fn(cliente);
        await cliente.query("COMMIT");
        return resultado;
    } catch (erro) {
        await cliente.query("ROLLBACK").catch(() => undefined);
        throw erro;
    } finally {
        cliente.release();
    }
}

export class MaquinaRepository {

       async listar(empresaId: string, { limite, offset }: Pagina): Promise<{ itens: any[]; total: number }> {
  const [lista, contagem] = await Promise.all([pool.query(`
    SELECT
      m.*,
      s.id AS setor_id_ref,
      s.nome AS setor_nome,
      v.referencia_externa,
      v.sistema_origem,
      (v.maquina_id IS NOT NULL) AS vinculo_externo
    FROM maquinas m
    LEFT JOIN setores s ON s.id = m.setor_id
    LEFT JOIN maquinas_vinculo_externo v ON v.maquina_id = m.id
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

    /**
     * "Vincular máquina do cliente" — cadastro enxuto + já marca como
     * monitorada na hora (é literalmente pra isso que ela existe). Cria a
     * linha em "maquinas" e a em "maquinas_vinculo_externo" juntas: a simples
     * presença dessa segunda linha já é o que diferencia essa máquina de um
     * cadastro normal na tela (mesmo quando a referência fica em branco).
     */
    async criarVinculoExterno(dados: INovoVinculoExterno, empresaId: string): Promise<IMaquina> {
        return transacao(async (cliente) => {
            const { rows: maquinaRows } = await cliente.query(
                `
                INSERT INTO maquinas (nome, modelo, setor_id, status, empresa_id, monitoramento_ativo)
                VALUES ($1, $2, $3, 'ativa', $4, true)
                RETURNING *
                `,
                [dados.nome, "Monitoramento (vínculo externo)", dados.setor_id, empresaId]
            );
            const maquina = maquinaRows[0];

            const { rows: vinculoRows } = await cliente.query(
                `
                INSERT INTO maquinas_vinculo_externo (maquina_id, referencia_externa, sistema_origem, observacao)
                VALUES ($1, $2, $3, $4)
                RETURNING referencia_externa, sistema_origem
                `,
                [maquina.id, dados.referencia_externa ?? null, dados.sistema_origem ?? null, dados.observacao ?? null]
            );

            return { ...maquina, ...vinculoRows[0], vinculo_externo: true };
        });
    }
    async atualizarQrCode(id: number, qrCode: string, empresaId: string): Promise<void> {

        await pool.query(
            `UPDATE maquinas
            SET qr_code = $1
            WHERE id = $2 AND empresa_id = $3
            `, [qrCode, id, empresaId]
        );
    }

    /** Dados mínimos para imprimir etiquetas (só da empresa; opcionalmente uma seleção ou um setor). */
    async listarParaEtiquetas(
        empresaId: string,
        filtro: { ids?: number[]; setorId?: number },
        limite: number
    ): Promise<{ id: number; nome: string; setor: string | null; empresa: string }[]> {
        const { rows } = await pool.query(
            `
            SELECT m.id, m.nome, s.nome AS setor, e.nome AS empresa
              FROM maquinas m
              JOIN empresas e ON e.id = m.empresa_id
              LEFT JOIN setores s ON s.id = m.setor_id AND s.empresa_id = m.empresa_id
             WHERE m.empresa_id = $1
               AND ($2::int[] IS NULL OR m.id = ANY($2::int[]))
               AND ($3::int IS NULL OR m.setor_id = $3)
             ORDER BY s.nome NULLS LAST, m.nome, m.id
             LIMIT $4
            `,
            [empresaId, filtro.ids ?? null, filtro.setorId ?? null, limite]
        );

        return rows;
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
    // ativa/desativa a máquina no módulo de Monitoramento — reaproveita o
    // cadastro que já existe, não cria registro novo nenhum
    async alternarMonitoramento(id: number, ativo: boolean, empresaId: string): Promise<IMaquina | null> {

    const { rows } = await pool.query(
        `
        UPDATE maquinas
        SET monitoramento_ativo = $1
        WHERE id = $2 AND empresa_id = $3
        RETURNING *
        `,
        [ativo, id, empresaId]
    );

    return rows[0] ?? null;
}
    async listarOsPorMaquina(maquinaId: number, empresaId: string, apenasDoUsuario: number | null = null): Promise<any[]> {
    const { rows } = await pool.query(
        `
        SELECT *,
          CASE WHEN pausada_em IS NULL THEN 0
               ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - pausada_em)))::int END AS pausa_atual_segundos
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
// "<=" (não "="): pega tudo que venceu até essa data, não só o que vence
// bem nesse dia — senão uma máquina que passa batido no dia certo (cron
// fora do ar, ou data cadastrada já no passado) nunca mais ganha O.S.
// automática. existePreventivaPendente() evita duplicar se já tiver uma aberta.
async buscarPorDataProximaManutencao(
    data: string
){

    const result = await pool.query(
        `
        SELECT *
        FROM maquinas
        WHERE proxima_manutencao <= $1
        AND status = 'ativa'
        AND empresa_id IN (SELECT id FROM empresas WHERE ativo)
        `,
        [
            data
        ]
    );


    return result.rows;

}
}