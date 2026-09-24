import { pool } from "../database/connection";
import { IOrdemServico, IPausaOS } from "../interfaces/IordemServico";
import { Pagina } from "../utils/paginacao";

// Segundos da pausa em curso, medidos pelo banco (a pausa é gravada com o relógio UTC em coluna "timestamp
// sem fuso"; calcular isso no navegador dependeria do fuso). O front só soma o que passa depois de receber.
const PAUSA_ATUAL = `CASE WHEN pausada_em IS NULL THEN 0
       ELSE GREATEST(0, EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'UTC') - pausada_em)))::int END AS pausa_atual_segundos`;

// Nome de quem abriu a O.S. (só de usuário da mesma empresa) — a tela mostra o nome, não o id
const SOLICITANTE = `(SELECT u.nome FROM usuarios u
        WHERE u.id = ordens_servico.id_solicitante AND u.empresa_id = ordens_servico.empresa_id) AS solicitante_nome`;

export class OrdemServicoRepository {

  // apenasDoUsuario: só as O.S. que ele abriu ou que são dele (permissão "ver só as minhas")
  async listar(
    empresaId: string,
    { limite, offset }: Pagina,
    apenasDoUsuario: number | null = null
  ): Promise<{ itens: IOrdemServico[]; total: number }> {
    const filtro = `empresa_id = $1 AND ($2::int IS NULL OR id_solicitante = $2 OR id_tecnico = $2)`;

    const [lista, contagem] = await Promise.all([
      pool.query(
        `SELECT *, ${PAUSA_ATUAL}, ${SOLICITANTE} FROM ordens_servico WHERE ${filtro} ORDER BY id DESC LIMIT $3 OFFSET $4`,
        [empresaId, apenasDoUsuario, limite, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS n FROM ordens_servico WHERE ${filtro}`, [empresaId, apenasDoUsuario]),
    ]);
    return { itens: lista.rows, total: contagem.rows[0].n };
  }

  async buscarPorId(id: number, empresaId: string): Promise<IOrdemServico | null> {
    const { rows } = await pool.query(
      `SELECT *, ${PAUSA_ATUAL}, ${SOLICITANTE} FROM ordens_servico WHERE id = $1 AND empresa_id = $2`,
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
    VALUES ($1,$2,$3,$4,$5,COALESCE($6, NOW()),$7,$8,$9,$10,$11)
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


  // igual ao patch, mas só se a O.S. ainda estiver no status esperado (protege contra cliques duplos / concorrência)
  async patchSeStatus(
    id: number,
    empresaId: string,
    statusEsperado: string,
    campos: Partial<IOrdemServico>
  ): Promise<IOrdemServico | null> {
    const keys = Object.keys(campos);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = keys.map((k) => (campos as Record<string, unknown>)[k]);

    const { rows } = await pool.query(
      `UPDATE ordens_servico SET ${sets}
       WHERE id = $${keys.length + 1} AND empresa_id = $${keys.length + 2} AND status = $${keys.length + 3}
       RETURNING *`,
      [...values, id, empresaId, statusEsperado]
    );
    return rows[0] ?? null;
  }

  /* ================= pausas ================= */

  async abrirPausa(osId: number, empresaId: string, motivo: string, usuarioId: number, em: string): Promise<void> {
    await pool.query(
      `INSERT INTO os_pausas (os_id, empresa_id, motivo, pausada_em, pausada_por) VALUES ($1,$2,$3,$4,$5)`,
      [osId, empresaId, motivo, em, usuarioId]
    );
  }

  async fecharPausa(osId: number, empresaId: string, usuarioId: number | null, em: string): Promise<void> {
    await pool.query(
      `UPDATE os_pausas SET retomada_em = $3, retomada_por = $4
       WHERE os_id = $1 AND empresa_id = $2 AND retomada_em IS NULL`,
      [osId, empresaId, em, usuarioId]
    );
  }

  // Segundos da pausa em curso, medidos pelo próprio banco. A pausa é gravada com o relógio UTC em coluna
  // "timestamp sem fuso"; ler isso em JS o interpretaria como horário local e a conta sairia errada.
  async segundosDaPausaEmCurso(osId: number, empresaId: string): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COALESCE(GREATEST(0, EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'UTC') - pausada_em)))::int, 0) AS segundos
         FROM ordens_servico
        WHERE id = $1 AND empresa_id = $2`,
      [osId, empresaId]
    );
    return rows[0]?.segundos ?? 0;
  }

  async listarPausas(osId: number, empresaId: string): Promise<IPausaOS[]> {
    const { rows } = await pool.query(
      `SELECT p.id, p.os_id, p.motivo, p.pausada_em, p.retomada_em,
              p.pausada_por, up.nome AS pausada_por_nome,
              p.retomada_por, ur.nome AS retomada_por_nome,
              CASE WHEN p.retomada_em IS NULL THEN NULL
                   ELSE EXTRACT(EPOCH FROM (p.retomada_em - p.pausada_em))::int END AS duracao_segundos
         FROM os_pausas p
         LEFT JOIN usuarios up ON up.id = p.pausada_por
         LEFT JOIN usuarios ur ON ur.id = p.retomada_por
        WHERE p.os_id = $1 AND p.empresa_id = $2
        ORDER BY p.pausada_em ASC, p.id ASC`,
      [osId, empresaId]
    );
    return rows;
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
        'EM_ANDAMENTO',
        'PAUSADA'
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
        tempo_pausado_segundos,

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
        ) - COALESCE(tempo_pausado_segundos, 0)
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
      ) AS tempo_atendimento_segundos,


      /* =========================
         TEMPO PAUSADO
         Soma das pausas de todas as O.S. da máquina
         (inclui a pausa em curso)
      ========================= */

      (
        SELECT COALESCE(SUM(tempo_pausado_segundos), 0)
        FROM ordens_servico
        WHERE maquina_id = $1
          AND empresa_id = $2
      ) AS tempo_pausado_segundos,

      (
        SELECT COUNT(*)
        FROM ordens_servico
        WHERE maquina_id = $1
          AND empresa_id = $2
          AND status = 'PAUSADA'
      ) AS os_pausadas


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

    tempoPausadoSegundos: Number(row.tempo_pausado_segundos ?? 0),
    osPausadas: Number(row.os_pausadas ?? 0),
  };
}
}
