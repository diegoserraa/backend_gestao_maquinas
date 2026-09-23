import { pool } from "../database/connection";
import { IOrdemServico } from "../interfaces/IordemServico";

export class OrdemServicoRepository {

  async listar(empresaId: string): Promise<IOrdemServico[]> {
    const { rows } = await pool.query(
      `SELECT * FROM ordens_servico WHERE empresa_id = $1 ORDER BY id DESC`,
      [empresaId]
    );
    return rows;
  }

  async buscarPorId(id: number, empresaId: string): Promise<IOrdemServico | null> {
    const { rows } = await pool.query(
      `SELECT * FROM ordens_servico WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return rows[0] ?? null;
  }

  async criar(os: IOrdemServico, empresaId: string): Promise<IOrdemServico> {
  const { rows } = await pool.query(
    `
    INSERT INTO ordens_servico (
      maquina_id,
      descricao,
      status,
      tipo_manutencao,
      resolucao,
      data_abertura,
      data_resolucao,
      prioridade,
      id_tecnico,
      id_solicitante,
      empresa_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
    `,
    [
      os.maquina_id,
      os.descricao,
      os.status ?? "ABERTA",
      os.tipo_manutencao,
      os.resolucao ?? null,
      os.data_abertura, // <-- aqui
      os.data_resolucao ?? null,
      os.prioridade,
      os.id_tecnico ?? null,
      os.id_solicitante ?? null,
      empresaId,
    ]
  );

  return rows[0];
}

  async atualizar(id: number, os: IOrdemServico, empresaId: string): Promise<IOrdemServico | null> {
    const { rows } = await pool.query(
      `
      UPDATE ordens_servico SET
        maquina_id              = $1,
        descricao               = $2,
        status                  = $3,
        tipo_manutencao         = $4,
        resolucao               = $5,
        data_resolucao          = $6,
        prioridade              = $7,
        id_tecnico              = $8,
        id_solicitante          = $9,
        data_atribuicao         = $10,
        id_atribuido_por        = $11,
        data_inicio_atendimento = $12,
        motivo_cancelamento     = $13,
        data_cancelamento       = $14
      WHERE id = $15 AND empresa_id = $16
      RETURNING *
      `,
      [
        os.maquina_id,
        os.descricao,
        os.status,
        os.tipo_manutencao,
        os.resolucao ?? null,
        os.data_resolucao ?? null,
        os.prioridade,
        os.id_tecnico ?? null,
        os.id_solicitante ?? null,
        os.data_atribuicao ?? null,
        os.id_atribuido_por ?? null,
        os.data_inicio_atendimento ?? null,
        os.motivo_cancelamento ?? null,
        os.data_cancelamento ?? null,
        id,
        empresaId,
      ]
    );
    return rows[0] ?? null;
  }

  // patch cirúrgico — só atualiza os campos passados
  async patch(id: number, campos: Partial<IOrdemServico>, empresaId: string): Promise<IOrdemServico | null> {
    const keys = Object.keys(campos);
    if (keys.length === 0) return this.buscarPorId(id, empresaId);

    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = keys.map((k) => (campos as Record<string, unknown>)[k]);

    const { rows } = await pool.query(
      `UPDATE ordens_servico SET ${sets} WHERE id = $${keys.length + 1} AND empresa_id = $${keys.length + 2} RETURNING *`,
      [...values, id, empresaId]
    );
    return rows[0] ?? null;
  }


  async excluir(id: number, empresaId: string): Promise<void> {
    await pool.query(`DELETE FROM ordens_servico WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  }
  async existePreventivaPendente(
    maquinaId:number,
    empresaId: string
):Promise<boolean>{


    const result = await pool.query(
    `
    SELECT id
    FROM ordens_servico
    WHERE maquina_id = $1
    AND empresa_id = $2
    AND tipo_manutencao = 'PREVENTIVA'
    AND status IN (
        'ABERTA',
        'ATRIBUIDA',
        'EM_ANDAMENTO'
    )
    LIMIT 1
    `,
    [
        maquinaId,
        empresaId
    ]);


    return result.rows.length > 0;

}
async indicadoresPorMaquina(maquinaId: number, empresaId: string) {
  const { rows } = await pool.query(
    `
    WITH ordens_corretivas AS (
      SELECT
        id,
        data_abertura,
        data_inicio_atendimento,
        data_resolucao,

        LAG(data_resolucao) OVER (
          ORDER BY data_abertura
        ) AS resolucao_anterior

      FROM ordens_servico

      WHERE maquina_id = $1
        AND empresa_id = $2
        AND tipo_manutencao = 'CORRETIVA'
        AND status = 'FINALIZADA'
        AND data_abertura IS NOT NULL
        AND data_inicio_atendimento IS NOT NULL
        AND data_resolucao IS NOT NULL
        AND data_inicio_atendimento >= data_abertura
        AND data_resolucao >= data_inicio_atendimento
    )

    SELECT

      /* =========================
         OS ABERTAS
      ========================= */

      (
        SELECT COUNT(*)
        FROM ordens_servico
        WHERE maquina_id = $1
          AND empresa_id = $2
          AND status = 'ABERTA'
      ) AS os_abertas,


      /* =========================
         MTTR
         Início do atendimento
         → resolução
      ========================= */

      AVG(
        EXTRACT(
          EPOCH FROM (
            data_resolucao - data_inicio_atendimento
          )
        )
      ) AS mttr_segundos,


      /* =========================
         MTBF
         Resolução da falha anterior
         → abertura da próxima falha
      ========================= */

      AVG(
        EXTRACT(
          EPOCH FROM (
            data_abertura - resolucao_anterior
          )
        )
      ) FILTER (
        WHERE resolucao_anterior IS NOT NULL
          AND data_abertura >= resolucao_anterior
      ) AS mtbf_segundos,


      /* =========================
         TEMPO MÉDIO DE ATENDIMENTO
         Abertura
         → início do atendimento
      ========================= */

      (
        SELECT AVG(
          EXTRACT(
            EPOCH FROM (
              data_inicio_atendimento - data_abertura
            )
          )
        )
        FROM ordens_servico
        WHERE maquina_id = $1
          AND empresa_id = $2
          AND data_inicio_atendimento IS NOT NULL
          AND data_abertura IS NOT NULL
          AND data_inicio_atendimento >= data_abertura
      ) AS tempo_atendimento_segundos


    FROM ordens_corretivas;
    `,
    [maquinaId, empresaId]
  );

  const row = rows[0];

  return {
    osAbertas: Number(row.os_abertas),

    mttrSegundos:
      row.mttr_segundos !== null
        ? Number(row.mttr_segundos)
        : null,

    mtbfSegundos:
      row.mtbf_segundos !== null
        ? Number(row.mtbf_segundos)
        : null,

    tempoAtendimentoSegundos:
      row.tempo_atendimento_segundos !== null
        ? Number(row.tempo_atendimento_segundos)
        : null,
  };
}
}
