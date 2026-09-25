import { Request, Response } from "express";
import { EmpresaAdminService } from "../services/EmpresaAdminService";

export class EmpresaAdminController {

    private service = new EmpresaAdminService();

    listar = async (_req: Request, res: Response) => res.json(await this.service.listar());

    detalhar = async (req: Request, res: Response) => res.json(await this.service.detalhar(String(req.params.id)));

    criar = async (req: Request, res: Response) =>
        res.status(201).json(await this.service.criar(req.body, req.user!.id));

    atualizar = async (req: Request, res: Response) =>
        res.json(await this.service.atualizar(String(req.params.id), req.body, req.user!.id));

    definirSituacao = async (req: Request, res: Response) => {
        const { ativo, motivo } = req.body;

        return res.json(
            await this.service.definirSituacao(String(req.params.id), ativo, motivo, {
                usuarioId: req.user!.id,
                empresaId: req.empresaId!,
            })
        );
    };
}
