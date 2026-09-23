import { NextFunction, Request, Response } from "express";
import { Role } from "../enums/Role";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";

/**
 * Quem pode fazer o quê nas O.S. (mesmas regras que o front já aplica —
 * antes só o front escondia os botões, a API aceitava qualquer papel):
 *  - ADMIN/GESTOR: tudo;
 *  - TECNICO: assumir uma O.S. pra si, e iniciar/pausar/finalizar a que é dele;
 *  - OPERADOR: só abre O.S. e consulta.
 */

const repo = new OrdemServicoRepository();

const negar = (res: Response) => res.status(403).json({ error: "Acesso negado" });

const ehGestor = (role: string) => role === Role.ADMIN || role === Role.GESTOR;

/** Gestor, ou o técnico que é o responsável pela O.S. (e não é execução externa). */
export async function gestorOuResponsavel(req: Request, res: Response, next: NextFunction) {
    const { id, role } = req.user!;

    if (ehGestor(role)) return next();

    if (role === Role.TECNICO) {
        const os = await repo.buscarPorId(Number(req.params.id), req.empresaId!);

        // O.S. inexistente (ou de outra empresa): deixa o serviço responder "não encontrada"
        if (!os) return next();

        if (os.id_tecnico === id && !os.execucao_externa) return next();
    }

    return negar(res);
}

/** Atribuir: gestor atribui a qualquer um; técnico só assume pra si mesmo. Externo é só do gestor. */
export function permissaoAtribuir(req: Request, res: Response, next: NextFunction) {
    const { id, role } = req.user!;

    if (ehGestor(role)) return next();

    if (role === Role.TECNICO && !req.body.externo && req.body.id_tecnico === id) return next();

    return negar(res);
}
