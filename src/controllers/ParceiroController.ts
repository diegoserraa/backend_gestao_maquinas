import { Request, Response } from "express";
import { ParceiroService } from "../services/ParceiroService";

export class ParceiroController {

    private service = new ParceiroService();

    listar = async (
        req: Request,
        res: Response
    ) => {

        const parceiros =
            await this.service.listar();

        return res.json(parceiros);
    };

    buscarPorId = async (
        req: Request,
        res: Response
    ) => {

        const id = Number(req.params.id);

        const parceiro =
            await this.service.buscarPorId(id);

        return res.json(parceiro);
    };

    criar = async (
        req: Request,
        res: Response
    ) => {

        const parceiro =
            await this.service.criar(req.body);

        return res.status(201).json(parceiro);
    };

    atualizar = async (
        req: Request,
        res: Response
    ) => {

        const id = Number(req.params.id);

        const parceiro =
            await this.service.atualizar(
                id,
                req.body
            );

        return res.json(parceiro);
    };

    excluir = async (
        req: Request,
        res: Response
    ) => {

        const id = Number(req.params.id);

        await this.service.excluir(id);

        return res.sendStatus(204);
    };
}