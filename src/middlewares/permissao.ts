import { NextFunction, Request, RequestHandler, Response } from "express";
import { permissaoService } from "../services/PermissaoService";
import { OrdemServicoRepository } from "../repositories/OrdemServicoRepository";
import { Ator } from "../services/PermissaoService";
import { TokenPayload } from "../types/auth";

/**
 * Depois do JWT válido, carrega o perfil do usuário (cache em memória) e:
 *  - barra usuário apagado/desativado NA HORA, mesmo com token ainda dentro da validade;
 *  - usa o papel e as permissões do banco (mudança do gestor vale no próximo clique).
 */
export async function carregarPerfil(req: Request, res: Response, next: NextFunction) {
    const perfil = await permissaoService.perfil(req.user!.id);

    if (!perfil || perfil.empresaId !== req.user!.empresa_id) {
        return res.status(401).json({ error: "Sessão inválida" });
    }

    if (!perfil.ativo) {
        return res.status(401).json({ error: "Usuário inativo" });
    }

    req.user!.role = perfil.role as TokenPayload["role"];
    req.permissoes = perfil.permissoes;

    next();
}

const negar = (res: Response, necessarias: string[]) =>
    res.status(403).json({ error: "Acesso negado", permissao_necessaria: necessarias });

/** Exige TODAS as permissões informadas. */
export const exigir =
    (...permissoes: string[]): RequestHandler =>
    (req, res, next) =>
        permissoes.every((p) => req.permissoes!.has(p)) ? next() : negar(res, permissoes);

/** Basta UMA das permissões (usado nas leituras de apoio entre telas). */
export const exigirQualquer =
    (permissoes: readonly string[]): RequestHandler =>
    (req, res, next) =>
        permissoes.some((p) => req.permissoes!.has(p)) ? next() : negar(res, [...permissoes]);

export const pode = (req: Request, permissao: string): boolean => req.permissoes!.has(permissao);

/** Quem está agindo, no formato que o serviço de permissões espera. */
export const atorDe = (req: Request): Ator => ({
    id: req.user!.id,
    role: req.user!.role,
    empresaId: req.empresaId!,
    permissoes: req.permissoes!,
});

/* ================= ordens de serviço ================= */

const osRepo = new OrdemServicoRepository();

/** Quais O.S. o usuário enxerga: todas, só as dele, ou nenhuma. */
export function escopoOS(req: Request): "todas" | "proprias" | null {
    if (pode(req, "os.ver")) return "todas";
    if (pode(req, "os.ver_proprias")) return "proprias";
    return null;
}

/** Precisa poder ver O.S. (todas ou só as próprias). */
export const exigirVerOS: RequestHandler = (req, res, next) =>
    escopoOS(req) ? next() : negar(res, ["os.ver", "os.ver_proprias"]);

/**
 * Ação sobre uma O.S. existente (iniciar/pausar/finalizar):
 * exige a permissão da ação e, sem "agir em O.S. de outros", só vale na O.S. em que o
 * usuário é o técnico responsável (e que não seja de execução externa).
 */
export const acaoEmOS =
    (permissao: string): RequestHandler =>
    async (req: Request, res: Response, next: NextFunction) => {
        if (!pode(req, permissao)) return negar(res, [permissao]);
        if (pode(req, "os.agir_em_qualquer")) return next();

        const os = await osRepo.buscarPorId(Number(req.params.id), req.empresaId!);

        // inexistente (ou de outra empresa): deixa o serviço responder "não encontrada"
        if (!os) return next();

        if (os.id_tecnico === req.user!.id && !os.execucao_externa) return next();

        return negar(res, ["os.agir_em_qualquer"]);
    };

/** Atribuir: externo, assumir pra si mesmo, ou atribuir a outro técnico — cada um com a sua permissão. */
export const permissaoAtribuir: RequestHandler = (req, res, next) => {
    const necessaria = req.body.externo
        ? "os.definir_externo"
        : req.body.id_tecnico === req.user!.id
          ? "os.assumir"
          : "os.atribuir";

    return pode(req, necessaria) ? next() : negar(res, [necessaria]);
};

