import { pool } from "../database/connection";
import { IOrdemServico } from "../interfaces/IordemServico";

export class OrdemServicoRepository {

  async listar(): Promise<IOrdemServico[]> {
    const { rows } = await pool.query(
      `SELECT * FROM ordens_servico ORDER BY id DESC`
    );
    return rows;
  }

  async buscarPorId(id: number): Promise<IOrdemServico | null> {
    const { rows } = await pool.query(
      `SELECT * FROM ordens_servico WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async criar(os: IOrdemServico): Promise<IOrdemServico> {
    const { rows } = await pool.query(
      `
      INSERT INTO ordens_servico (
        maquina_id, descricao, status, tipo_manutencao,
        resolucao, data_abertura, data_resolucao,
        prioridade, id_tecnico, id_solicitante
      )
      VALUES ($1,$2,$3,$4,$5, NOW(), $6,$7,$8,$9)
      RETURNING *
      `,
      [
        os.maquina_id,
        os.descricao,
        os.status ?? "ABERTA",
        os.tipo_manutencao,
        os.resolucao ?? null,
        os.data_resolucao ?? null,
        os.prioridade,
        os.id_tecnico ?? null,
        os.id_solicitante ?? null,
      ]
    );
    return rows[0];
  }

  async atualizar(id: number, os: IOrdemServico): Promise<IOrdemServico | null> {
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
      WHERE id = $15
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
      ]
    );
    return rows[0] ?? null;
  }

  // patch cirúrgico — só atualiza os campos passados
  async patch(id: number, campos: Partial<IOrdemServico>): Promise<IOrdemServico | null> {
    const keys = Object.keys(campos);
    if (keys.length === 0) return this.buscarPorId(id);

    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = keys.map((k) => (campos as Record<string, unknown>)[k]);

    const { rows } = await pool.query(
      `UPDATE ordens_servico SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );
    return rows[0] ?? null;
  }

  async excluir(id: number): Promise<void> {
    await pool.query(`DELETE FROM ordens_servico WHERE id = $1`, [id]);
  }
}
