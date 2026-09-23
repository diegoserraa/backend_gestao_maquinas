import { NextFunction, Request, RequestHandler, Response, Router } from "express";
import { ZodType } from "zod";

/**
 * Valida (e limpa) o corpo da requisição com um schema zod.
 * - dado inválido: responde 400 com a lista de campos com problema;
 * - dado válido: req.body passa a ser só o que o schema conhece (campos
 *   extras, como um empresa_id forjado, são descartados).
 */
export function validarBody(schema: ZodType): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        const resultado = schema.safeParse(req.body ?? {});

        if (!resultado.success) {
            return res.status(400).json({
                message: "Dados inválidos",
                erros: resultado.error.issues.map((i) => ({
                    campo: i.path.join("."),
                    mensagem: i.message,
                })),
            });
        }

        req.body = resultado.data;
        next();
    };
}

const PARAMS_NUMERICOS = ["id", "maquinaId", "usuario_id"];
const MAX_INT4 = 2147483647;

/** Garante que :id, :maquinaId e :usuario_id são inteiros positivos (senão 400, e não erro de banco). */
export function protegerParamsNumericos(router: Router): void {
    for (const nome of PARAMS_NUMERICOS) {
        router.param(nome, (_req, res, next, valor) => {
            const n = Number(valor);

            if (!/^\d{1,10}$/.test(String(valor)) || n < 1 || n > MAX_INT4) {
                return res.status(400).json({ message: `${nome} inválido` });
            }

            next();
        });
    }
}
