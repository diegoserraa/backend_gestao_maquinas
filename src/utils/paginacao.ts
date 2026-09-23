import { Request, Response } from "express";
import { z } from "zod";

/**
 * Paginação das listagens: ?pagina=1&limite=50.
 *
 * O corpo continua sendo um array simples (o front atual segue funcionando)
 * e o total de registros vai no cabeçalho X-Total-Count. Sem parâmetros
 * vale o limite padrão — uma listagem nunca devolve a tabela inteira.
 */

export interface Pagina {
    limite: number;
    offset: number;
}

const querySchema = z.object({
    limite: z.coerce.number().int().min(1).optional(),
    pagina: z.coerce.number().int().min(1).optional(),
});

export function lerPagina(req: Request, opcoes: { padrao: number; maximo: number }): Pagina {
    const r = querySchema.safeParse(req.query);

    if (!r.success) {
        throw Object.assign(new Error("Parâmetros de paginação inválidos"), { status: 400 });
    }

    const limite = Math.min(r.data.limite ?? opcoes.padrao, opcoes.maximo);
    const pagina = r.data.pagina ?? 1;

    return { limite, offset: (pagina - 1) * limite };
}

export function responderPagina<T>(res: Response, itens: T[], total: number) {
    res.setHeader("X-Total-Count", String(total));
    return res.json(itens);
}
