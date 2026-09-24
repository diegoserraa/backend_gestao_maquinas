import { Request, Response } from "express";
import { permissaoService } from "../services/PermissaoService";
import { catalogoParaApi } from "../permissoes/catalogo";
import { atorDe } from "../middlewares/permissao";

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

    /** Dar/retirar permissões de vários funcionários (por tipo ou por seleção). */
    emGrupo = async (req: Request, res: Response) => {
        const { simular, ...pedido } = req.body;
        const resultado = await permissaoService.aplicarEmGrupo(atorDe(req), pedido, simular === true);
        return res.json(resultado);
    };
}
