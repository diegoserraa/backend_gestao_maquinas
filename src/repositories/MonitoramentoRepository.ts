import { pool } from "../database/connection";
import {
    IAlertaEstado,
    IMaquinaParametro,
    ITelemetriaAlerta,
    NivelAlerta,
} from "../interfaces/Imonitoramento";

export class MonitoramentoRepository {

    /* ---------------- PARÂMETROS ---------------- */

    async listarParametros(maquinaId: number, empresaId: string): Promise<IMaquinaParametro[]> {
        const { rows } = await pool.query(
            `SELECT * FROM maquina_parametros WHERE maquina_id = $1 AND empresa_id = $2 ORDER BY chave`,
            [maquinaId, empresaId]
        );
        return rows.map(this.mapParametro);
    }

    async upsertParametro(p: IMaquinaParametro, empresaId: string): Promise<IMaquinaParametro> {
        const { rows } = await pool.query(
            `
            INSERT INTO maquina_parametros
                (maquina_id, chave, unidade, minimo, atencao, alarme, janela_seg, abrir_os_auto, ativo, empresa_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (maquina_id, chave) DO UPDATE SET
                unidade = EXCLUDED.unidade,
                minimo = EXCLUDED.minimo,
                atencao = EXCLUDED.atencao,
                alarme = EXCLUDED.alarme,
                janela_seg = EXCLUDED.janela_seg,
                abrir_os_auto = EXCLUDED.abrir_os_auto,
                ativo = EXCLUDED.ativo,
                atualizado_em = now()
            RETURNING *
            `,
            [
                p.maquina_id, p.chave, p.unidade, p.minimo, p.atencao, p.alarme,
                p.janela_seg, p.abrir_os_auto, p.ativo, empresaId,
            ]
        );
        return this.mapParametro(rows[0]);
    }

    async removerParametro(maquinaId: number, chave: string, empresaId: string): Promise<void> {
        await pool.query(
            `DELETE FROM maquina_parametros WHERE maquina_id = $1 AND chave = $2 AND empresa_id = $3`,
            [maquinaId, chave, empresaId]
        );
    }

    /* ---------------- ESTADO ---------------- */

    async buscarEstado(maquinaId: number, chave: string): Promise<IAlertaEstado | null> {
        const { rows } = await pool.query(
            `SELECT * FROM telemetria_alerta_estado WHERE maquina_id = $1 AND chave = $2`,
            [maquinaId, chave]
        );
        if (!rows[0]) return null;
        const r = rows[0];
        return {
            maquina_id: Number(r.maquina_id),
            chave: r.chave,
            nivel: r.nivel,
            fora_desde: r.fora_desde,
            valor_pico: r.valor_pico === null ? null : Number(r.valor_pico),
            alerta_id: r.alerta_id === null ? null : Number(r.alerta_id),
        };
    }

    // interno (motor de avaliação, sem contexto de requisição) — empresa_id
    // é derivado da própria máquina, nunca vem de fora.
    async salvarEstado(e: IAlertaEstado): Promise<void> {
        await pool.query(
            `
            INSERT INTO telemetria_alerta_estado
                (maquina_id, chave, nivel, fora_desde, valor_pico, alerta_id, atualizado_em, empresa_id)
            VALUES ($1,$2,$3,$4,$5,$6, now(), (SELECT empresa_id FROM maquinas WHERE id = $1))
            ON CONFLICT (maquina_id, chave) DO UPDATE SET
                nivel = EXCLUDED.nivel,
                fora_desde = EXCLUDED.fora_desde,
                valor_pico = EXCLUDED.valor_pico,
                alerta_id = EXCLUDED.alerta_id,
                atualizado_em = now()
            `,
            [e.maquina_id, e.chave, e.nivel, e.fora_desde, e.valor_pico, e.alerta_id]
        );
    }

    /* ---------------- ALERTAS ---------------- */

    // idem: empresa_id vem da máquina, não de parâmetro externo.
    async criarAlerta(a: ITelemetriaAlerta): Promise<ITelemetriaAlerta> {
        const { rows } = await pool.query(
            `
            INSERT INTO telemetria_alertas
                (maquina_id, chave, nivel, valor, limite, status, detalhe, empresa_id)
            VALUES ($1,$2,$3,$4,$5,'aberto',$6, (SELECT empresa_id FROM maquinas WHERE id = $1))
            RETURNING *
            `,
            [a.maquina_id, a.chave, a.nivel, a.valor, a.limite, a.detalhe]
        );
        return this.mapAlerta(rows[0]);
    }

    async atualizarNivelAlerta(id: number, nivel: NivelAlerta, valor: number | null): Promise<void> {
        await pool.query(
            `UPDATE telemetria_alertas SET nivel = $2, valor = COALESCE($3, valor) WHERE id = $1`,
            [id, nivel, valor]
        );
    }

    async resolverAlerta(id: number): Promise<void> {
        // fecha tanto 'aberto' quanto 'convertido' (mantém o rótulo se já virou O.S.)
        await pool.query(
            `UPDATE telemetria_alertas
             SET resolvido_em = now(),
                 status = CASE WHEN status = 'aberto' THEN 'resolvido' ELSE status END
             WHERE id = $1 AND resolvido_em IS NULL`,
            [id]
        );
    }

    async vincularOrdemServico(id: number, ordemId: number): Promise<void> {
        await pool.query(
            `UPDATE telemetria_alertas SET status = 'convertido', ordem_servico_id = $2 WHERE id = $1`,
            [id, ordemId]
        );
    }

    async listarAlertas(status: string | null, empresaId: string): Promise<any[]> {
        // status = "ativos" -> não resolvidos (aberto + convertido ainda pendente)
        const filtro =
            status === "ativos"
                ? `a.resolvido_em IS NULL AND a.status <> 'resolvido'`
                : `($2::text IS NULL OR a.status = $2)`;

        const { rows } = await pool.query(
            `
            SELECT a.*, m.nome AS maquina_nome, s.nome AS setor_nome
            FROM telemetria_alertas a
            JOIN maquinas m ON m.id = a.maquina_id
            LEFT JOIN setores s ON s.id = m.setor_id
            WHERE a.empresa_id = $1 AND ${filtro}
            ORDER BY a.aberto_em DESC
            LIMIT 300
            `,
            status === "ativos" ? [empresaId] : [empresaId, status]
        );
        return rows.map((r) => ({
            ...this.mapAlerta(r),
            maquina_nome: r.maquina_nome,
            setor_nome: r.setor_nome,
        }));
    }

    /**
     * Métricas que já cruzaram o limite mas ainda estão dentro da janela
     * de confirmação (o alerta ainda NÃO foi criado).
     */
    async listarPendentes(empresaId: string): Promise<any[]> {
        const { rows } = await pool.query(`
            SELECT
                e.maquina_id,
                e.chave,
                e.nivel,
                e.fora_desde,
                e.valor_pico,
                m.nome AS maquina_nome,
                s.nome AS setor_nome,
                COALESCE(mp.janela_seg, 120) AS janela_seg,
                CASE WHEN e.chave = 'temperatura' THEN t.temperatura
                     WHEN e.chave = 'vibracao'    THEN t.vibracao
                     ELSE NULL END AS valor_atual,
                mp.atencao, mp.alarme
            FROM telemetria_alerta_estado e
            JOIN maquinas m ON m.id = e.maquina_id
            LEFT JOIN setores s ON s.id = m.setor_id
            LEFT JOIN maquina_parametros mp
                   ON mp.maquina_id = e.maquina_id AND mp.chave = e.chave
            LEFT JOIN telemetria_atual t ON t.maquina_id = e.maquina_id
            WHERE e.fora_desde IS NOT NULL AND e.alerta_id IS NULL
              AND e.empresa_id = $1
            ORDER BY e.fora_desde ASC
        `, [empresaId]);

        return rows.map((r) => ({
            maquina_id: Number(r.maquina_id),
            maquina_nome: r.maquina_nome,
            setor_nome: r.setor_nome,
            chave: r.chave,
            nivel: r.nivel as NivelAlerta,
            fora_desde: r.fora_desde,
            janela_seg: Number(r.janela_seg),
            valor: r.valor_atual === null ? Number(r.valor_pico) : Number(r.valor_atual),
            atencao: r.atencao === null ? null : Number(r.atencao),
            alarme: r.alarme === null ? null : Number(r.alarme),
        }));
    }

    // usado tanto no fluxo REST (empresaId sempre passado -> confirma dono
    // antes de resolver/converter em O.S.) quanto internamente pelo motor
    // de avaliação (sem empresaId, já opera só sobre a própria máquina).
    async buscarAlerta(id: number, empresaId?: string): Promise<ITelemetriaAlerta | null> {
        const { rows } = await pool.query(
            empresaId
                ? `SELECT * FROM telemetria_alertas WHERE id = $1 AND empresa_id = $2`
                : `SELECT * FROM telemetria_alertas WHERE id = $1`,
            empresaId ? [id, empresaId] : [id]
        );
        return rows[0] ? this.mapAlerta(rows[0]) : null;
    }

    /* ---------------- SEM SINAL (cron) ---------------- */

    // varredura global de propósito (todas as empresas) — cada linha já
    // carrega seu empresa_id pra quem chamar notificar/broadcast certo.
    async maquinasSemSinal(minutos: number): Promise<{ maquina_id: number; nome: string; empresa_id: string }[]> {
        const { rows } = await pool.query(
            `
            SELECT m.id AS maquina_id, m.nome, m.empresa_id
            FROM maquinas m
            LEFT JOIN telemetria_atual t ON t.maquina_id = m.id
            WHERE t.atualizado_em IS NOT NULL
              AND t.atualizado_em < now() - ($1 || ' minutes')::interval
              AND NOT EXISTS (
                  SELECT 1 FROM telemetria_alertas a
                  WHERE a.maquina_id = m.id AND a.chave = 'sinal'
                    AND a.resolvido_em IS NULL
              )
            `,
            [minutos]
        );
        return rows.map((r) => ({ maquina_id: Number(r.maquina_id), nome: r.nome, empresa_id: r.empresa_id }));
    }

    async resolverAlertasSemSinal(maquinaId: number): Promise<void> {
        await pool.query(
            `UPDATE telemetria_alertas SET status='resolvido', resolvido_em=now()
             WHERE maquina_id = $1 AND chave = 'sinal' AND status = 'aberto'`,
            [maquinaId]
        );
    }

    /* ---------------- helpers de gente p/ notificar ---------------- */

    async idsGestoresETecnicos(empresaId: string): Promise<{ gestores: number[]; tecnicos: number[] }> {
        const { rows } = await pool.query(
            `SELECT id, role FROM usuarios WHERE role IN ('GESTOR', 'ADMIN', 'TECNICO') AND ativo = true AND empresa_id = $1`,
            [empresaId]
        );
        return {
            gestores: rows.filter((r) => r.role === "GESTOR" || r.role === "ADMIN").map((r) => Number(r.id)),
            tecnicos: rows.filter((r) => r.role === "TECNICO").map((r) => Number(r.id)),
        };
    }

    async nomeMaquina(maquinaId: number): Promise<string> {
        const { rows } = await pool.query(`SELECT nome FROM maquinas WHERE id = $1`, [maquinaId]);
        return rows[0]?.nome ?? `#${maquinaId}`;
    }

    /** Usado pelo motor de avaliação (MQTT, sem contexto de requisição). */
    async empresaDaMaquina(maquinaId: number): Promise<string | null> {
        const { rows } = await pool.query(`SELECT empresa_id FROM maquinas WHERE id = $1`, [maquinaId]);
        return rows[0]?.empresa_id ?? null;
    }

    /* ---------------- mappers ---------------- */

    private mapParametro = (r: any): IMaquinaParametro => ({
        id: Number(r.id),
        maquina_id: Number(r.maquina_id),
        chave: r.chave,
        unidade: r.unidade,
        minimo: r.minimo === null ? null : Number(r.minimo),
        atencao: r.atencao === null ? null : Number(r.atencao),
        alarme: r.alarme === null ? null : Number(r.alarme),
        janela_seg: Number(r.janela_seg),
        abrir_os_auto: r.abrir_os_auto,
        ativo: r.ativo,
    });

    private mapAlerta = (r: any): ITelemetriaAlerta => ({
        id: Number(r.id),
        empresa_id: r.empresa_id,
        maquina_id: Number(r.maquina_id),
        chave: r.chave,
        nivel: r.nivel,
        valor: r.valor === null ? null : Number(r.valor),
        limite: r.limite === null ? null : Number(r.limite),
        status: r.status,
        ordem_servico_id: r.ordem_servico_id === null ? null : Number(r.ordem_servico_id),
        detalhe: r.detalhe,
        aberto_em: r.aberto_em,
        resolvido_em: r.resolvido_em,
    });
}
