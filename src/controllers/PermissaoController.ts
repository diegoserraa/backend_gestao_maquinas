import { Request, Response } from "express";
import { permissaoService } from "../services/PermissaoService";
import { catalogoParaApi } from "../permissoes/catalogo";
import { atorDe } from "../middlewares/permissao";
import { auditoriaQuerySchema } from "../schemas/permissao";
import { invalido } from "../utils/erros";

export class PermissaoController {

    /** Módulos, ações, rótulos, dependências e padrões por tipo — o front monta a tela a partir disto. */
    catalogo = async (_req: Request, res: Response) => {
        return res.json(catalogoParaApi());
    };

    /** O que o usuário logado pode (o front usa pra montar menus e botões). */
    eu = async (req: Request, res: Response) => {
        return res.json({
            usuario: { id: req.user!.id, role: req.user!.role },
            permissoes: [...req.permissoes!],
        });
    };

    consultar = async (req: Request, res: Response) => {
        const dados = await permissaoService.consultar(atorDe(req), Number(req.params.id));
        return res.json(dados);
    };

    definir = async (req: Request, res: Response) => {
        const resultado = await permissaoService.definir(atorDe(req), Number(req.params.id), req.body.permissoes);
        return res.json(resultado);
    };

    restaurarPadrao = async (req: Request, res: Response) => {
        const resultado = await permissaoService.restaurarPadrao(atorDe(req), Number(req.params.id));
        return res.json(resultado);
    };

    auditoria = async (req: Request, res: Response) => {
        const q = auditoriaQuerySchema.safeParse(req.query);
        if (!q.success) throw invalido("Parâmetros inválidos");

        const registros = await permissaoService.auditoria(atorDe(req), q.data.limite ?? 50, q.data.usuario);
        return res.json(registros);
    };
}
