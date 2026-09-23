import { pool } from "../database/connection";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "retencao-telemetria" });

export const RETENCAO_PADRAO_DIAS = 90;
const RETENCAO_MINIMA_DIAS = 7;
const LOTE_PADRAO = 5000;

/** Lê TELEMETRIA_RETENCAO_DIAS: inválido vira o padrão; nunca menos que o mínimo (evita apagar tudo por engano). */
export function lerRetencaoDias(valor?: string): number {
    const n = Number(valor);

    if (!valor || !Number.isFinite(n)) return RETENCAO_PADRAO_DIAS;

    return Math.max(Math.floor(n), RETENCAO_MINIMA_DIAS);
}

export class RetencaoTelemetriaService {

    /**
     * Apaga leituras brutas mais antigas que `dias`, em lotes (não trava o
     * banco nem estoura memória numa tabela grande). Não mexe em telemetria_atual
     * nem nos alertas. `empresaIds` restringe a limpeza (usado nos testes).
     * Devolve quantas linhas foram apagadas.
     */
    async limparLeituras(
        dias: number,
        opcoes: { empresaIds?: string[]; lote?: number } = {}
    ): Promise<number> {
        const lote = opcoes.lote ?? LOTE_PADRAO;
        let total = 0;

        for (;;) {
            const { rowCount } = await pool.query(
                `
                DELETE FROM telemetria_leituras
                WHERE id IN (
                    SELECT id
                    FROM telemetria_leituras
                    WHERE recebido_em < now() - make_interval(days => $1)
                      AND ($2::uuid[] IS NULL OR empresa_id = ANY($2::uuid[]))
                    LIMIT $3
                )
                `,
                [dias, opcoes.empresaIds ?? null, lote]
            );

            const apagadas = rowCount ?? 0;
            total += apagadas;

            if (apagadas < lote) break;
        }

        log.info({ dias, apagadas: total }, "retenção de telemetria executada");

        return total;
    }
}
