import { Request, Response } from "express";
import { SetorService } from "../services/SetorService";

export class SetorController {

    private service = new SetorService();

    listar = async (req: Request, res: Response) => {
        const setores = await this.service.listar();
        return res.json(setores);
    };

    buscarPorId = async (req: Request, res: Response) => {
        const id = Number(req.params.id);

        const setor = await this.service.buscarPorId(id);

        return res.json(setor);
    };

    criar = async (req: Request, res: Response) => {
        const setor = await this.service.criar(req.body);

        return res.status(201).json(setor);
    };

    atualizar = async (req: Request, res: Response) => {
        const id = Number(req.params.id);

        const setor = await this.service.atualizar(id, req.body);

        return res.json(setor);
    };

    excluir = async (req: Request, res: Response) => {
        const id = Number(req.params.id);

        await this.service.excluir(id);

        return res.sendStatus(204);
    };
}